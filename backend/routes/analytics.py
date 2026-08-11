"""Analytics router — visitor tracking + admin reports.

Endpoints:
    POST /visitors/log      — public beacon: called by the frontend on every route change
    GET  /admin/visitors    — admin: paginated + sortable + filterable visitor log
    GET  /admin/visitors/summary — admin: top pages, countries, referrers for the header

IP → location lookup uses ip-api.com (free, no key, 45 req/min). Results
are cached per-IP in the `visitor_geo_cache` collection so we call the
upstream at most once per unique IP per week.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


_log = logging.getLogger("rox.analytics")

_db = None
_now_iso: Callable = lambda: ""
_clean: Callable = lambda x: x
_require_admin: Callable = lambda: None


def configure(**kw):
    g = globals()
    for k, v in kw.items():
        g["_" + k] = v


router = APIRouter()


def _require_admin_dep(authorization: Optional[str] = Header(None)):
    return _require_admin(authorization) if callable(_require_admin) else None


def _require():
    return Depends(_require_admin_dep)


class VisitorBeacon(BaseModel):
    path: str = Field(..., max_length=500)
    referrer: str = Field("", max_length=500)
    session_id: str = Field("", max_length=64)


def _client_ip(request: Request) -> str:
    # Trust X-Forwarded-For behind Nginx / Cloudflare
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


async def _lookup_geo(ip: str) -> Dict[str, str]:
    """Cached IP → country/city lookup via ip-api.com. Cache TTL: 7 days."""
    if not ip or ip.startswith(("127.", "10.", "192.168.", "172.16.", "::1")):
        return {"country": "Local", "city": "", "region": "", "isp": ""}
    cached = await _db.visitor_geo_cache.find_one({"_id": ip})
    if cached:
        exp = cached.get("expires_at", "")
        if exp and datetime.fromisoformat(exp) > datetime.now(timezone.utc):
            return cached.get("geo") or {}
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"http://ip-api.com/json/{ip}?fields=status,country,regionName,city,isp")
        if r.status_code == 200 and r.json().get("status") == "success":
            data = r.json()
            geo = {
                "country": data.get("country", ""),
                "region": data.get("regionName", ""),
                "city": data.get("city", ""),
                "isp": data.get("isp", ""),
            }
            expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            await _db.visitor_geo_cache.update_one(
                {"_id": ip},
                {"$set": {"geo": geo, "expires_at": expires}},
                upsert=True,
            )
            return geo
    except Exception as e:  # noqa: BLE001
        _log.warning("geo lookup failed for %s: %s", ip, e)
    return {"country": "Unknown", "city": "", "region": "", "isp": ""}


@router.post("/visitors/log")
async def log_visit(beacon: VisitorBeacon, request: Request):
    """Public beacon — frontend calls this on every route change. Never
    blocks the frontend: geo lookup runs in the background."""
    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")[:400]
    ts = _now_iso()
    doc = {
        "path": beacon.path[:500],
        "referrer": beacon.referrer[:500],
        "session_id": beacon.session_id[:64],
        "ip": ip,
        "user_agent": ua,
        "device": "mobile" if "Mobile" in ua or "Android" in ua or "iPhone" in ua else "desktop",
        "ts": ts,
        # geo fields are patched in by the background task below
        "country": None, "city": None, "region": None,
    }
    result = await _db.visitor_events.insert_one(doc)
    event_id = str(result.inserted_id)

    # Fire geo lookup in the background — never block the beacon response.
    async def _patch_geo():
        geo = await _lookup_geo(ip)
        await _db.visitor_events.update_one(
            {"_id": result.inserted_id},
            {"$set": {"country": geo.get("country"), "city": geo.get("city"),
                      "region": geo.get("region"), "isp": geo.get("isp")}},
        )
    try:
        asyncio.create_task(_patch_geo())
    except Exception:  # noqa: BLE001
        pass

    return {"ok": True, "id": event_id}


@router.get("/admin/visitors")
async def list_visitors(
    _admin: str = _require(),
    sort: str = Query("ts", pattern="^(ts|path|country|city|device)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    country: Optional[str] = None,
    path_contains: Optional[str] = None,
    hours: Optional[int] = Query(None, ge=1, le=720),
):
    """Paginated + sortable visitor log. Filters: country, path substring,
    last N hours. Sort keys: ts, path, country, city, device."""
    query: Dict[str, Any] = {}
    if country:
        query["country"] = country
    if path_contains:
        query["path"] = {"$regex": path_contains, "$options": "i"}
    if hours:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        query["ts"] = {"$gte": cutoff}
    direction = -1 if order == "desc" else 1
    total = await _db.visitor_events.count_documents(query)
    docs = await _db.visitor_events.find(query).sort(sort, direction).skip(skip).limit(limit).to_list(limit)
    rows = []
    for d in docs:
        d.pop("_id", None)
        rows.append(d)
    return {"total": total, "limit": limit, "skip": skip, "sort": sort, "order": order, "rows": rows}


@router.get("/admin/visitors/summary")
async def visitors_summary(_admin: str = _require(), hours: int = Query(24, ge=1, le=720)):
    """Header stats for the admin visitors panel: totals + top lists."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    q = {"ts": {"$gte": cutoff}}
    total = await _db.visitor_events.count_documents(q)
    unique_sessions = len(await _db.visitor_events.distinct("session_id", q))
    unique_ips = len(await _db.visitor_events.distinct("ip", q))

    async def _top(field: str, n: int = 10):
        pipe = [
            {"$match": q},
            {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": n},
        ]
        out = []
        async for r in _db.visitor_events.aggregate(pipe):
            out.append({"value": r["_id"] or "—", "count": r["count"]})
        return out

    return {
        "window_hours": hours,
        "total_visits": total,
        "unique_sessions": unique_sessions,
        "unique_ips": unique_ips,
        "top_paths": await _top("path"),
        "top_countries": await _top("country", 15),
        "top_referrers": await _top("referrer"),
        "top_devices": await _top("device", 5),
    }



@router.get("/admin/analytics/signup-countries")
async def signup_countries(_admin: str = _require()):
    """Fraud-watch map data — every country a customer has signed up from,
    ranked by count with first / latest signup dates and an ISO alpha-3
    code so the frontend can render each country as a pin on a world map.

    Legacy users (pre-tracking) are stamped `signup_country = "Legacy"`
    and excluded from the map — they'd otherwise dominate the totals and
    hide the actual signal.
    """
    try:
        import pycountry  # local import — analytics is lazy
    except ImportError:  # noqa: BLE001
        pycountry = None

    pipeline = [
        {"$match": {
            "signup_country": {"$exists": True, "$nin": ["", "Unknown", "Legacy"]},
        }},
        {"$group": {
            "_id": "$signup_country",
            "count": {"$sum": 1},
            "first_seen": {"$min": "$created_at"},
            "last_seen": {"$max": "$created_at"},
            "latest_email": {"$last": "$email"},
            "sample_city": {"$first": "$signup_city"},
        }},
        {"$sort": {"count": -1}},
    ]

    def _iso3(name: str) -> Optional[str]:
        if not pycountry or not name:
            return None
        try:
            # First try exact lookup, then fuzzy fallback for common variants
            c = pycountry.countries.get(name=name)
            if c:
                return c.alpha_3
            c = pycountry.countries.get(common_name=name)
            if c:
                return c.alpha_3
            matches = pycountry.countries.search_fuzzy(name)
            return matches[0].alpha_3 if matches else None
        except (LookupError, Exception):  # noqa: BLE001
            return None

    rows = []
    total = 0
    async for r in _db.users.aggregate(pipeline):
        country = r["_id"]
        rows.append({
            "country": country,
            "iso3": _iso3(country),
            "count": int(r.get("count") or 0),
            "first_seen": (r.get("first_seen") or "")[:10],
            "last_seen": (r.get("last_seen") or "")[:10],
            "latest_email": r.get("latest_email") or "",
            "sample_city": r.get("sample_city") or "",
        })
        total += int(r.get("count") or 0)

    legacy_count = await _db.users.count_documents({"signup_country": "Legacy"})
    unknown_count = await _db.users.count_documents({
        "signup_country": {"$in": ["Unknown", ""]},
    })

    # Overlay active freezes onto each row so the frontend can badge them.
    now_iso = datetime.now(timezone.utc).isoformat()
    freezes = {}
    try:
        async for f in _db.country_freezes.find({"frozen_until": {"$gt": now_iso}}):
            freezes[f.get("country", "")] = {
                "frozen_until": f.get("frozen_until"),
                "reason": f.get("reason") or "",
            }
    except Exception:  # noqa: BLE001
        pass
    for r in rows:
        fr = freezes.get(r["country"])
        r["frozen_until"] = fr.get("frozen_until") if fr else None
        r["freeze_reason"] = fr.get("reason") if fr else ""

    return {
        "rows": rows,
        "total_signups_tracked": total,
        "unique_countries": len(rows),
        "legacy_users": legacy_count,
        "unknown_country_users": unknown_count,
    }


@router.get("/admin/analytics/taxi-addon")
async def taxi_addon_analytics(_admin: str = _require(), days: int = Query(30, ge=1, le=365)):
    """Attach-rate + revenue for the optional taxi add-on upsell.

    Returns totals for the trailing `days` window plus a per-day sparkline
    so admin can eyeball whether the upsell is landing after copy tweaks.
    Only counts paid tour bookings — reservations that never converted are
    excluded so the attach rate reflects real revenue, not intent.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    base_q = {
        "service_type": "tour",
        "status": {"$ne": "cancelled"},
        "created_at": {"$gte": cutoff},
    }
    total_tour_bookings = await _db.bookings.count_documents(base_q)
    addon_q = {**base_q, "taxi_addon_fee": {"$gt": 0}}
    addon_bookings = await _db.bookings.count_documents(addon_q)

    # Sum addon revenue across matching bookings.
    revenue_pipe = [
        {"$match": addon_q},
        {"$group": {"_id": None, "revenue": {"$sum": "$taxi_addon_fee"}}},
    ]
    revenue = 0.0
    async for r in _db.bookings.aggregate(revenue_pipe):
        revenue = float(r.get("revenue") or 0)

    # Per-day timeseries — group by ISO date (YYYY-MM-DD) using $substr on
    # `created_at`. Works because we store ISO strings, not BSON dates.
    daily_pipe = [
        {"$match": base_q},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},
            "tours": {"$sum": 1},
            "addons": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$taxi_addon_fee", 0]}, 0]}, 1, 0]}},
            "revenue": {"$sum": {"$ifNull": ["$taxi_addon_fee", 0]}},
        }},
        {"$sort": {"_id": 1}},
    ]
    daily = []
    async for r in _db.bookings.aggregate(daily_pipe):
        daily.append({
            "date": r["_id"],
            "tours": r["tours"],
            "addons": r["addons"],
            "revenue": round(float(r.get("revenue") or 0), 2),
        })

    # Top 5 tours by attach rate (min 3 bookings to avoid noise).
    per_tour_pipe = [
        {"$match": base_q},
        {"$group": {
            "_id": "$item_name",
            "tours": {"$sum": 1},
            "addons": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$taxi_addon_fee", 0]}, 0]}, 1, 0]}},
            "revenue": {"$sum": {"$ifNull": ["$taxi_addon_fee", 0]}},
        }},
        {"$sort": {"revenue": -1}},
        {"$limit": 5},
    ]
    by_tour = []
    async for r in _db.bookings.aggregate(per_tour_pipe):
        tours = int(r["tours"])
        addons = int(r["addons"])
        by_tour.append({
            "name": r["_id"] or "—",
            "tours": tours,
            "addons": addons,
            "revenue": round(float(r.get("revenue") or 0), 2),
            "attach_rate": round(100 * addons / max(1, tours), 1),
        })

    # A/B variant breakdown — only counts bookings where the tour had A/B
    # enabled at booking time (i.e. `taxi_addon_variant` was recorded).
    ab_pipe = [
        {"$match": {**base_q, "taxi_addon_variant": {"$in": ["A", "B"]}}},
        {"$group": {
            "_id": "$taxi_addon_variant",
            "tours": {"$sum": 1},
            "addons": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$taxi_addon_fee", 0]}, 0]}, 1, 0]}},
            "revenue": {"$sum": {"$ifNull": ["$taxi_addon_fee", 0]}},
        }},
    ]
    ab_rows = {}
    async for r in _db.bookings.aggregate(ab_pipe):
        tours = int(r["tours"])
        addons = int(r["addons"])
        ab_rows[r["_id"]] = {
            "impressions": tours,
            "addons": addons,
            "revenue": round(float(r.get("revenue") or 0), 2),
            "attach_rate": round(100 * addons / max(1, tours), 1),
        }
    ab = None
    if ab_rows:
        a = ab_rows.get("A", {"impressions": 0, "addons": 0, "revenue": 0, "attach_rate": 0})
        b = ab_rows.get("B", {"impressions": 0, "addons": 0, "revenue": 0, "attach_rate": 0})
        min_impressions = min(a["impressions"], b["impressions"])
        winner = None
        # Need at least 20 impressions on the weaker arm before declaring
        # anything — otherwise the "winner" flips wildly on 1-2 bookings.
        if min_impressions >= 20 and a["attach_rate"] != b["attach_rate"]:
            winner = "A" if a["attach_rate"] > b["attach_rate"] else "B"
        ab = {
            "A": a,
            "B": b,
            "winner": winner,
            "significant": winner is not None,
            "min_impressions_needed": max(0, 20 - min_impressions),
        }

    attach_rate = round(100 * addon_bookings / max(1, total_tour_bookings), 1)
    return {
        "window_days": days,
        "total_tour_bookings": total_tour_bookings,
        "addon_bookings": addon_bookings,
        "attach_rate": attach_rate,
        "addon_revenue": round(revenue, 2),
        "daily": daily,
        "by_tour": by_tour,
        "ab": ab,
    }


_DEFAULT_BLACKOUT_PRESETS = [
    "Hurricane", "Maintenance", "Insurance renewal", "Sold", "Detailing", "Rented offline",
]


@router.get("/admin/analytics/blackout-reasons")
async def blackout_reason_analytics(_admin: str = _require(), year: Optional[int] = Query(None)):
    """Aggregate rentals.blackout_reasons across the fleet by reason string.

    Returns per-reason: how many blocked days, how many vehicles affected,
    and the vehicle with the most days in that bucket. `year` filters the
    date keys to a single ISO year (e.g. 2026). When omitted, aggregates
    every stored blackout date across the fleet.

    Days with no reason land in the "(no reason)" bucket so admins can see
    how much of the fleet's unavailable time is undocumented.
    """
    year_prefix = f"{year:04d}-" if year else None
    presets: list = _DEFAULT_BLACKOUT_PRESETS
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    if isinstance(cfg.get("blackout_reason_presets"), list) and cfg["blackout_reason_presets"]:
        presets = [str(x).strip() for x in cfg["blackout_reason_presets"] if str(x).strip()]

    buckets: Dict[str, Dict[str, Any]] = {}
    total_days = 0
    total_revenue_lost = 0.0
    total_vehicles = 0
    async for r in _db.rentals.find({}, {"id": 1, "name": 1, "price": 1, "blackout_dates": 1, "blackout_reasons": 1}):
        dates = r.get("blackout_dates") or []
        reasons = r.get("blackout_reasons") or {}
        if year_prefix:
            dates = [d for d in dates if isinstance(d, str) and d.startswith(year_prefix)]
        if not dates:
            continue
        total_vehicles += 1
        daily_rate = float(r.get("price") or 0.0)
        # Per-rental per-reason count
        per: Dict[str, int] = {}
        for d in dates:
            key = (reasons.get(d) or "").strip() or "(no reason)"
            per[key] = per.get(key, 0) + 1
        for reason, days in per.items():
            revenue_lost = round(days * daily_rate, 2)
            total_days += days
            total_revenue_lost += revenue_lost
            bucket = buckets.setdefault(reason, {
                "reason": reason,
                "days": 0,
                "revenue_lost": 0.0,
                "vehicles": 0,
                "top_vehicle": {"name": r.get("name"), "days": days, "revenue_lost": revenue_lost},
            })
            bucket["days"] += days
            bucket["revenue_lost"] = round(bucket["revenue_lost"] + revenue_lost, 2)
            bucket["vehicles"] += 1
            # Rank by revenue lost (not days) so a cheap car with 200 days
            # doesn't outrank a luxury van with 40 days — the dollar impact
            # is what matters.
            if revenue_lost > bucket["top_vehicle"]["revenue_lost"]:
                bucket["top_vehicle"] = {"name": r.get("name"), "days": days, "revenue_lost": revenue_lost}

    rows = sorted(buckets.values(), key=lambda x: (-x["revenue_lost"], -x["days"], x["reason"].lower()))

    # Distinct years present across the whole fleet's blackout_dates —
    # powers the year selector dropdown in the admin card so admins can
    # scroll through prior years without editing URLs. Always includes the
    # current calendar year so the picker never shows an empty list.
    years_set = set()
    async for r in _db.rentals.find({}, {"blackout_dates": 1}):
        for d in (r.get("blackout_dates") or []):
            if isinstance(d, str) and len(d) >= 4 and d[:4].isdigit():
                years_set.add(int(d[:4]))
    years_set.add(datetime.now(timezone.utc).year)
    available_years = sorted(years_set, reverse=True)

    # Per-reason trendline data — for every bucket returned above, roll
    # up its days/revenue across ALL available years so the sparkline
    # under each breakdown row can flag "Maintenance is creeping up"
    # before it becomes the biggest bucket. Sparse years get zero entries.
    trend_years = sorted(years_set)
    if trend_years and rows:
        # Second pass: same aggregation but grouped by year.
        yearly: Dict[int, Dict[str, Dict[str, float]]] = {y: {} for y in trend_years}
        async for r in _db.rentals.find({}, {"price": 1, "blackout_dates": 1, "blackout_reasons": 1}):
            dates = r.get("blackout_dates") or []
            reasons = r.get("blackout_reasons") or {}
            daily_rate = float(r.get("price") or 0.0)
            for d in dates:
                if not (isinstance(d, str) and len(d) >= 4 and d[:4].isdigit()):
                    continue
                y = int(d[:4])
                if y not in yearly:
                    continue
                reason_key = (reasons.get(d) or "").strip() or "(no reason)"
                slot = yearly[y].setdefault(reason_key, {"days": 0, "revenue_lost": 0.0})
                slot["days"] += 1
                slot["revenue_lost"] += daily_rate
        for row in rows:
            row["trend"] = [
                {
                    "year": y,
                    "days": int(yearly[y].get(row["reason"], {"days": 0})["days"]),
                    "revenue_lost": round(yearly[y].get(row["reason"], {"revenue_lost": 0.0})["revenue_lost"], 2),
                }
                for y in trend_years
            ]

    # Year-over-year delta — only compute when the caller asked for a
    # specific year (otherwise "prev year" is meaningless). We reuse the
    # same aggregation on the previous year and diff the totals.
    prev_year_revenue = None
    prev_year_days = None
    yoy_delta_pct = None
    if year:
        prev_prefix = f"{year - 1:04d}-"
        prev_days_total = 0
        prev_rev_total = 0.0
        async for r in _db.rentals.find({}, {"blackout_dates": 1, "price": 1}):
            dates = [d for d in (r.get("blackout_dates") or []) if isinstance(d, str) and d.startswith(prev_prefix)]
            if not dates:
                continue
            prev_days_total += len(dates)
            prev_rev_total += len(dates) * float(r.get("price") or 0.0)
        prev_year_revenue = round(prev_rev_total, 2)
        prev_year_days = prev_days_total
        if prev_year_revenue > 0:
            yoy_delta_pct = round(100 * (total_revenue_lost - prev_year_revenue) / prev_year_revenue, 1)

    return {
        "year": year,
        "total_days_blocked": total_days,
        "total_revenue_lost": round(total_revenue_lost, 2),
        "total_vehicles": total_vehicles,
        "prev_year": (year - 1) if year else None,
        "prev_year_days_blocked": prev_year_days,
        "prev_year_revenue_lost": prev_year_revenue,
        "yoy_delta_pct": yoy_delta_pct,
        "available_years": available_years,
        "presets": presets,
        "rows": rows,
    }


@router.get("/admin/analytics/blackout-reasons/pdf")
async def blackout_reasons_pdf(_admin: str = _require(), year: Optional[int] = Query(None)):
    """Insurance-ready branded PDF of the downtime-by-reason matrix.

    Renders the same rows × years matrix the CSV export builds, framed by
    the site's brand logo (from site_config.logo_url), the export date,
    fleet totals, and a per-row breakdown. Streamed inline so the admin's
    click triggers a browser save-as dialog.
    """
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage,
    )
    import io as _io
    import urllib.request

    # Reuse the existing aggregator so PDF + JSON never drift out of sync.
    payload = await blackout_reason_analytics(_admin=_admin, year=year)  # noqa: SLF001
    rows = payload.get("rows") or []
    trend_years = payload.get("available_years") or []
    trend_years = sorted(trend_years)

    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    brand = cfg.get("brand_name") or "Rox Taxi & Tours"
    logo_url = cfg.get("logo_url") or ""

    buf = _io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.5 * inch, rightMargin=0.5 * inch,
        topMargin=0.5 * inch, bottomMargin=0.5 * inch,
        title="Fleet Downtime Report",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Brand", fontName="Helvetica-Bold", fontSize=18, textColor=colors.HexColor("#0B3B5C")))
    styles.add(ParagraphStyle(name="H2", fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor("#B91C1C"), spaceAfter=8))
    styles.add(ParagraphStyle(name="Body", fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#0B3B5C")))
    styles.add(ParagraphStyle(name="Muted", fontName="Helvetica-Oblique", fontSize=9, textColor=colors.HexColor("#64748B")))

    story = []
    # Header: logo (if fetchable) + brand name + report date
    header_cells = []
    if logo_url:
        try:
            src = logo_url if logo_url.startswith("http") else f"http://localhost:8001{logo_url}"
            with urllib.request.urlopen(src, timeout=3) as r:
                logo_bytes = r.read()
            logo_img = RLImage(_io.BytesIO(logo_bytes), width=1.1 * inch, height=1.1 * inch, kind="proportional")
            header_cells.append(logo_img)
        except Exception:  # noqa: BLE001
            header_cells.append(Paragraph("", styles["Body"]))
    else:
        header_cells.append(Paragraph("", styles["Body"]))
    today = datetime.now(timezone.utc).strftime("%B %d, %Y")
    header_cells.append(Paragraph(
        f"<font size=18 color='#0B3B5C'><b>{brand}</b></font><br/>"
        f"<font size=12 color='#64748B'>Fleet Downtime Report</font><br/>"
        f"<font size=9 color='#94a3b8'>Generated {today} · {'Year: ' + str(year) if year else 'All years'}</font>",
        styles["Body"],
    ))
    header_tbl = Table([header_cells], colWidths=[1.3 * inch, 6.0 * inch])
    header_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story.append(header_tbl)
    story.append(Spacer(1, 12))

    # Summary strip
    total_days = payload.get("total_days_blocked", 0)
    total_rev = payload.get("total_revenue_lost", 0.0)
    vehicles = payload.get("total_vehicles", 0)
    yoy = payload.get("yoy_delta_pct")
    yoy_str = ""
    if yoy is not None:
        arrow = "↑" if yoy > 0 else ("↓" if yoy < 0 else "→")
        tone = "#B91C1C" if yoy > 0 else ("#059669" if yoy < 0 else "#64748B")
        yoy_str = f"<br/><font size=9 color='{tone}'>{arrow} {abs(yoy):.1f}% vs {payload.get('prev_year')}</font>"
    summary = Table([[
        Paragraph(f"<b>Revenue lost</b><br/><font size=14 color='#B91C1C'><b>${total_rev:,.2f}</b></font>{yoy_str}", styles["Body"]),
        Paragraph(f"<b>Days blocked</b><br/><font size=14>{total_days}</font>", styles["Body"]),
        Paragraph(f"<b>Vehicles affected</b><br/><font size=14>{vehicles}</font>", styles["Body"]),
    ]], colWidths=[2.4 * inch, 2.4 * inch, 2.4 * inch])
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FBF7EF")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(summary)
    story.append(Spacer(1, 18))

    # Matrix: Reason × Year (days + $) + Totals row
    if rows and trend_years:
        header = ["Reason"] + [f"{y}\ndays" for y in trend_years] + [f"{y}\n$" for y in trend_years] + ["Total\ndays", "Total\n$"]
        body_rows = []
        for r in rows:
            trend = r.get("trend") or []
            trend_by_year = {t["year"]: t for t in trend}
            days_cells = [str(trend_by_year.get(y, {"days": 0})["days"]) for y in trend_years]
            rev_cells = [f"${trend_by_year.get(y, {'revenue_lost': 0}).get('revenue_lost', 0):,.2f}" for y in trend_years]
            body_rows.append([r["reason"], *days_cells, *rev_cells, str(r["days"]), f"${r['revenue_lost']:,.2f}"])
        # Totals row
        tot_days_per = [sum((next((t["days"] for t in (r.get("trend") or []) if t["year"] == y), 0)) for r in rows) for y in trend_years]
        tot_rev_per = [sum((next((t["revenue_lost"] for t in (r.get("trend") or []) if t["year"] == y), 0)) for r in rows) for y in trend_years]
        tot_days_cells = [str(x) for x in tot_days_per]
        tot_rev_cells = [f"${x:,.2f}" for x in tot_rev_per]
        body_rows.append(["TOTAL", *tot_days_cells, *tot_rev_cells, str(sum(tot_days_per)), f"${sum(tot_rev_per):,.2f}"])

        table_data = [header] + body_rows
        col_widths = [1.6 * inch] + [0.55 * inch] * len(trend_years) + [0.8 * inch] * len(trend_years) + [0.6 * inch, 0.9 * inch]
        matrix = Table(table_data, colWidths=col_widths, repeatRows=1)
        matrix.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B3B5C")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("ALIGN", (0, 0), (0, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F8FAFC")]),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FEF2F2")),
            ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#B91C1C")),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(Paragraph("Downtime breakdown", styles["H2"]))
        story.append(matrix)
    else:
        story.append(Paragraph("No blackout dates on record for this window.", styles["Muted"]))
    story.append(Spacer(1, 18))
    story.append(Paragraph(
        "Revenue lost calculated as: blocked days × each vehicle's daily rental rate. "
        "Days without a recorded reason land in the (no reason) bucket.",
        styles["Muted"],
    ))

    doc.build(story)
    buf.seek(0)
    filename = f"downtime-report_{year or 'all'}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

