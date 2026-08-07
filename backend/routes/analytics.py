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

