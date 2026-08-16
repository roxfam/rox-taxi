"""Admin router — booking management, catalog CRUD, deposits, notifications.

Wired up by server.py via `configure()` + `include_router()`. Follows the same
factory-configure pattern as routes/payments.py to keep imports one-directional
and avoid circular deps.
"""
from typing import Optional, Dict, Any, List
from pathlib import Path
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Header, UploadFile, File, Body, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field


# ---- shared state populated by server.py ------------------------------------
_db = None
_now_iso = None
_clean = None
_require_admin = None
_notify_fn = None
_attempt_deposit_refund = None
_upload_dir: Path = Path("/tmp")


def configure(*, db, now_iso, clean, require_admin, notify_fn, attempt_deposit_refund, upload_dir):
    """Called once at app startup."""
    global _db, _now_iso, _clean, _require_admin, _notify_fn, _attempt_deposit_refund, _upload_dir
    _db = db
    _now_iso = now_iso
    _clean = clean
    _require_admin = require_admin
    _notify_fn = notify_fn
    _attempt_deposit_refund = attempt_deposit_refund
    _upload_dir = upload_dir


router = APIRouter()


# Placeholder Depends target — swapped for the real `_require_admin` at
# runtime by `configure()` in this same module. Using a real function
# (rather than a lambda) so FastAPI can introspect the Authorization
# header dependency correctly.
def _require_admin_placeholder(authorization: Optional[str] = Header(None)):
    return _require_admin(authorization) if callable(_require_admin) else None



# ═══ Payments panel + Content panel endpoints ═════════════════════════════
# Added for the /admin/manage "Payments" and "Content" tabs. Kept in this
# module so all admin surface area stays under one router.

@router.get("/admin/payments")
async def list_payments(_: str = Depends(_require_admin_placeholder)):
    """Aggregate ALL payments across Stripe, PayPal, and Zelle for the admin
    Payments panel. Zelle bookings live in `bookings` (they never write a
    `payment_transactions` row), so we merge both sources and normalise the
    shape. Returns latest first, plus revenue totals."""
    txs = await _db.payment_transactions.find({}).sort("created_at", -1).to_list(500)
    zelle_bookings = await _db.bookings.find({"payment_method": "zelle"}).sort("created_at", -1).to_list(500)

    rows = []
    for t in txs:
        b = await _db.bookings.find_one({"id": t.get("booking_id")}) if t.get("booking_id") else None
        rows.append({
            "id": t.get("session_id") or t.get("_id"),
            "provider": t.get("provider") or "stripe",
            "booking_id": t.get("booking_id"),
            "amount": float(t.get("amount") or 0),
            "currency": (t.get("currency") or "usd").upper(),
            "status": t.get("payment_status") or t.get("status") or "pending",
            "created_at": t.get("created_at"),
            "customer_name": (b or {}).get("customer_name"),
            "customer_email": (b or {}).get("customer_email"),
            "item_name": (b or {}).get("item_name"),
        })
    seen_bids = {r["booking_id"] for r in rows if r["booking_id"]}
    for b in zelle_bookings:
        if b.get("id") in seen_bids:
            continue
        rows.append({
            "id": f"zelle-{b['id']}",
            "provider": "zelle",
            "booking_id": b.get("id"),
            "amount": float(b.get("total") or 0),
            "currency": "USD",
            "status": b.get("payment_status") or "pending",
            "created_at": b.get("created_at"),
            "customer_name": b.get("customer_name"),
            "customer_email": b.get("customer_email"),
            "item_name": b.get("item_name"),
        })
    rows.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    day_ago  = (now - timedelta(days=1)).isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()
    paid = [r for r in rows if str(r["status"]).lower() == "paid"]
    def _sum(gt): return round(sum(r["amount"] for r in paid if (r.get("created_at") or "") >= gt), 2)
    totals = {
        "paid_count": len(paid),
        "today_usd":  _sum(day_ago),
        "week_usd":   _sum(week_ago),
        "month_usd":  _sum(month_ago),
        "total_usd":  round(sum(r["amount"] for r in paid), 2),
    }
    return {"rows": rows, "totals": totals}


class ZelleMark(BaseModel):
    booking_id: str


@router.post("/admin/payments/zelle-mark-paid")
async def mark_zelle_paid(req: ZelleMark, admin: str = Depends(_require_admin_placeholder)):
    """Manually mark a Zelle-paid booking as received. Updates booking status,
    logs a payment record, and fires customer + owner notifications."""
    b = await _db.bookings.find_one({"id": req.booking_id.upper()})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("payment_status") == "paid":
        return {"ok": True, "already_paid": True, "booking_id": b["id"]}
    now = _now_iso()
    await _db.bookings.update_one(
        {"id": b["id"]},
        {"$set": {"payment_status": "paid", "status": "confirmed", "updated_at": now}},
    )
    await _db.payment_transactions.insert_one({
        "session_id": f"zelle-{b['id']}",
        "provider": "zelle",
        "booking_id": b["id"],
        "amount": float(b.get("total") or 0),
        "currency": "usd",
        "status": "completed",
        "payment_status": "paid",
        "created_at": now,
        "updated_at": now,
    })
    fresh = await _db.bookings.find_one({"id": b["id"]})
    try:
        prefs = await _db.site_config.find_one({"_id": "main"}) or {}
        _notify_fn(_clean(dict(fresh)), prefs)
        from notifications import notify_owner_payment_received
        notify_owner_payment_received(_clean(dict(fresh)), provider="zelle")
    except Exception as e:  # noqa: BLE001
        logging.warning("notify err: %s", e)
    return {"ok": True, "booking_id": b["id"], "payment_status": "paid"}


@router.post("/admin/payments/{payment_id}/refund")
async def refund_payment(payment_id: str, admin: str = Depends(_require_admin_placeholder)):
    """Trigger a full refund for a Stripe or PayPal transaction. Refunds
    are dispatched via the shared `_attempt_deposit_refund` helper (already
    wired to both providers via `configure()`)."""
    tx = await _db.payment_transactions.find_one({"session_id": payment_id})
    if not tx:
        raise HTTPException(404, "Payment not found")
    booking = await _db.bookings.find_one({"id": tx.get("booking_id")})
    if not booking:
        raise HTTPException(404, "Related booking not found")
    result = await _attempt_deposit_refund(booking, reason="Admin-initiated refund via Payments panel")
    await _db.payment_transactions.update_one(
        {"session_id": payment_id},
        {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": _now_iso(), "refund_info": result}},
    )
    return {"ok": True, "payment_id": payment_id, "refund": result}


# ─── Bulk blackout for maintenance / hurricane / insurance days ───────
# Pick a date range + optional category filter → every matching rental
# gets the range added to (or removed from) its `blackout_dates` array.

class BulkBlackoutRequest(BaseModel):
    start_date: str  # YYYY-MM-DD inclusive
    end_date: str    # YYYY-MM-DD inclusive
    category: Optional[str] = None    # e.g. "compact" — filters rentals by exact match
    rental_ids: Optional[List[str]] = None  # explicit override; ignores category if set
    action: str = "add"  # "add" or "remove"
    reason: Optional[str] = None


@router.post("/admin/rentals/{rental_id}/blackout-reasons-bulk")
async def set_blackout_reasons_bulk(
    rental_id: str,
    payload: dict = Body(...),
    _: str = Depends(_require_admin_placeholder),
):
    """Set (or clear) the same reason across many blackout dates at once.

    Used by the collapsed-range chips in the Edit modal so admins can
    edit one reason and have every day in the visual range pick it up.
    Body: { "dates": ["YYYY-MM-DD", ...], "reason": "…" } — empty reason
    clears the reasons instead of setting them.
    """
    dates = payload.get("dates") or []
    if not isinstance(dates, list) or not dates:
        raise HTTPException(400, "dates must be a non-empty list")
    for d in dates:
        if not isinstance(d, str) or len(d) != 10 or d[4] != "-" or d[7] != "-":
            raise HTTPException(400, f"invalid ISO date: {d}")
    reason = (payload.get("reason") or "").strip()

    rental = await _db.rentals.find_one({"id": rental_id})
    if not rental:
        raise HTTPException(404, "Rental not found")
    blocked = set(rental.get("blackout_dates") or [])
    missing = [d for d in dates if d not in blocked]
    if missing:
        raise HTTPException(400, f"not in blackout list: {missing[:3]}{'…' if len(missing) > 3 else ''}")

    if reason:
        await _db.rentals.update_one(
            {"id": rental_id},
            {"$set": {f"blackout_reasons.{d}": reason for d in dates}},
        )
    else:
        await _db.rentals.update_one(
            {"id": rental_id},
            {"$unset": {f"blackout_reasons.{d}": "" for d in dates}},
        )
    return {"ok": True, "rental_id": rental_id, "dates": dates, "reason": reason or None}


@router.post("/admin/rentals/{rental_id}/blackout-reason")
async def set_blackout_reason(
    rental_id: str,
    payload: dict = Body(...),
    _: str = Depends(_require_admin_placeholder),
):
    """Set (or clear) the audit-note reason for a single blackout date on
    one rental. Enables inline reason edits from the Edit-vehicle modal
    without forcing admins to unblock + re-block just to fix a typo.

    Body: { "date": "YYYY-MM-DD", "reason": "…" }  # empty reason ⇒ clear
    """
    date = (payload.get("date") or "").strip()
    if not date or len(date) != 10 or date[4] != "-" or date[7] != "-":
        raise HTTPException(400, "date must be an ISO YYYY-MM-DD string")
    reason = (payload.get("reason") or "").strip()

    rental = await _db.rentals.find_one({"id": rental_id})
    if not rental:
        raise HTTPException(404, "Rental not found")
    # Only allow reasons on dates that are actually blocked — prevents
    # ghost reasons on unblocked days.
    if date not in (rental.get("blackout_dates") or []):
        raise HTTPException(400, f"{date} is not in this vehicle's blackout list")

    if reason:
        await _db.rentals.update_one({"id": rental_id}, {"$set": {f"blackout_reasons.{date}": reason}})
    else:
        await _db.rentals.update_one({"id": rental_id}, {"$unset": {f"blackout_reasons.{date}": ""}})
    return {"ok": True, "rental_id": rental_id, "date": date, "reason": reason or None}


@router.post("/admin/rentals/bulk-blackout")
async def rentals_bulk_blackout(req: BulkBlackoutRequest, _: str = Depends(_require_admin_placeholder)):
    from datetime import date, timedelta as _td
    try:
        start = date.fromisoformat(req.start_date)
        end = date.fromisoformat(req.end_date)
    except Exception as e:
        raise HTTPException(400, f"Invalid date: {e}") from e
    if end < start:
        raise HTTPException(400, "end_date must be on or after start_date")
    if (end - start).days > 365:
        raise HTTPException(400, "Range too large (max 365 days per bulk action)")

    dates = [(start + _td(days=i)).isoformat() for i in range((end - start).days + 1)]
    action = (req.action or "add").lower()
    if action not in {"add", "remove"}:
        raise HTTPException(400, "action must be 'add' or 'remove'")

    # Build filter — explicit ids win; else category equality; else all rentals.
    match: dict = {}
    if req.rental_ids:
        match["id"] = {"$in": req.rental_ids}
    elif req.category:
        # Category on rentals is stored on the `body`/`category` field varies;
        # match both to keep the UX forgiving.
        match["$or"] = [{"category": req.category}, {"body": req.category}]

    rentals = await _db.rentals.find(match).to_list(500)
    if not rentals:
        return {"ok": True, "affected": 0, "dates": dates, "action": action, "note": "No matching rentals."}

    update: dict = {}
    if action == "add":
        update["$addToSet"] = {"blackout_dates": {"$each": dates}}
        # Also stamp the reason (audit note) against every date in the range
        # so admins can hover a blocked date later and see WHY. Stored as a
        # `blackout_reasons` map on each rental keyed by ISO date.
        if req.reason and (req.reason or "").strip():
            update["$set"] = {
                f"blackout_reasons.{d}": (req.reason or "").strip()
                for d in dates
            }
    else:
        update["$pull"] = {"blackout_dates": {"$in": dates}}
        # Wipe the associated reasons so unblocked days don't leave orphan
        # audit notes behind. `$unset` uses dotted keys just like the $set
        # in the add-branch above.
        update["$unset"] = {f"blackout_reasons.{d}": "" for d in dates}
    result = await _db.rentals.update_many({"id": {"$in": [r["id"] for r in rentals]}}, update)

    return {
        "ok": True,
        "affected": result.modified_count,
        "target_count": len(rentals),
        "dates": dates,
        "action": action,
        "reason": req.reason,
    }


# ─── Website content panel ─────────────────────────────────────────────
class ContentUpdate(BaseModel):
    hero_taglines: Optional[List[str]] = None
    about_copy: Optional[str] = None
    cancellation_policy_text: Optional[str] = None
    faq: Optional[List[Dict[str, str]]] = None  # [{q, a}, ...]


@router.get("/admin/content")
async def get_content(admin: str = Depends(_require_admin_placeholder)):
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    return cfg.get("content") or {
        "hero_taglines": [],
        "about_copy": "",
        "cancellation_policy_text": "Cancel 48+ hours before service to receive a refund minus a 15% cancellation fee. Within 48 hours: non-refundable.",
        "faq": [],
    }


@router.patch("/admin/content")
async def update_content(patch: ContentUpdate, admin: str = Depends(_require_admin_placeholder)):
    updates = {k: v for k, v in patch.dict(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    content = cfg.get("content") or {}
    content.update(updates)
    await _db.site_config.update_one({"_id": "main"}, {"$set": {"content": content, "updated_at": _now_iso()}}, upsert=True)
    return content


# ═══ end Payments + Content panel endpoints ═══════════════════════════════


# ---- request models ---------------------------------------------------------
class BookingStatusUpdate(BaseModel):
    status: str


class DepositUpdate(BaseModel):
    status: str  # 'released' | 'forfeited' | 'held'
    reason: Optional[str] = None
    auto_refund: bool = True


class ItemUpsert(BaseModel):
    name: str
    description: str
    price: float
    duration: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    seats: Optional[int] = None
    active: bool = True
    # Rental-specific fields — surfaced on rental cards.
    year: Optional[int] = None
    make: Optional[str] = None
    model: Optional[str] = None
    color: Optional[str] = None
    body: Optional[str] = None
    # Taxi-specific
    route: Optional[str] = None
    # Tour-specific
    location: Optional[str] = None
    featured: Optional[bool] = None
    # Optional external booking link — surfaces a "Book on official site ↗"
    # secondary CTA on the public tour card. Useful for excursions run by
    # third-party operators (Atlantis Aquaventure, Blue Lagoon, etc.).
    external_booking_url: Optional[str] = None
    # Per-vehicle blackout dates (rentals only). Each entry is a YYYY-MM-DD
    # string; booking creation refuses any day in this list, blocking the car
    # while it's in maintenance / already reserved by an offline customer.
    blackout_dates: Optional[List[str]] = None
    # ── Per-person tour pricing (kids/toddlers) ──────────────────────────
    # When child_price > 0 the booking modal shows Adults / Kids / Toddlers
    # inputs and totals as (adults × price) + (kids × child_price). Toddlers
    # under `child_free_under` ride free; kids up to `child_age_max` pay the
    # child rate. Only relevant for kind="tours".
    child_price: Optional[float] = None
    child_age_max: Optional[int] = None
    child_free_under: Optional[int] = None
    # ── Optional taxi add-on (tours only) ────────────────────────────────
    # Per-tour toggle to offer round-trip taxi as an optional add-on at
    # checkout. When `taxi_addon_forced` is true the fee is auto-included
    # (no guest choice); otherwise the guest sees a checkbox.
    # `taxi_addon_price_mode`: "flat" (price applied once) or "per_person"
    # (price × total passengers).
    taxi_addon_enabled: Optional[bool] = None
    taxi_addon_price: Optional[float] = None
    taxi_addon_price_mode: Optional[str] = None  # "flat" | "per_person"
    taxi_addon_forced: Optional[bool] = None
    taxi_addon_label: Optional[str] = None
    # A/B test — when `taxi_addon_ab_enabled` is True the booking flow rolls
    # a 50/50 coin per session and shows either `taxi_addon_label` (variant A)
    # or `taxi_addon_label_b` (variant B). The chosen variant is recorded on
    # the booking so the analytics dashboard can pick the winner.
    taxi_addon_ab_enabled: Optional[bool] = None
    taxi_addon_label_b: Optional[str] = None


class HomeSlideUpsert(BaseModel):
    title: str
    subtitle: Optional[str] = ""
    image_url: str
    order: int = 0
    active: bool = True
    # Optional external booking / info link surfaced as a per-slide CTA on
    # the home hero. Empty string hides the CTA.
    link_url: Optional[str] = None
    link_label: Optional[str] = None


class PriceUpdate(BaseModel):
    price: float
    reason: Optional[str] = None


class SiteConfigUpdate(BaseModel):
    zelle_email: Optional[str] = None
    zelle_phone: Optional[str] = None
    facebook_url: Optional[str] = None
    messenger_url: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    paypal_me_url: Optional[str] = None
    tripadvisor_url: Optional[str] = None
    google_reviews_url: Optional[str] = None
    logo_url: Optional[str] = None
    notify_email_enabled: Optional[bool] = None
    notify_sms_enabled: Optional[bool] = None
    # Global master switch — when False, the per-tour taxi add-on is hidden
    # everywhere on the booking flow (per-tour toggle is still respected but
    # requires this master switch to actually surface the option).
    taxi_addon_master_enabled: Optional[bool] = None
    # Admin-editable preset list of common blackout reasons (Hurricane,
    # Maintenance, Insurance renewal, Sold, Detailing…) surfaced as a
    # datalist on the inline reason editor so staff don't have to retype
    # the same string across dozens of ranges.
    blackout_reason_presets: Optional[list] = None
    # ─── Search-engine verification codes (SEO) ──────────────────────
    # Pasted by the owner from each webmaster console. Injected as
    # <meta name="…" content="…"> by frontend/src/components/SeoVerification.jsx.
    google_verification: Optional[str] = None
    bing_verification: Optional[str] = None
    yandex_verification: Optional[str] = None
    pinterest_verification: Optional[str] = None
    facebook_verification: Optional[str] = None
    norton_verification: Optional[str] = None
    # ─── Google Places API (real-reviews auto-sync) ──────────────────
    # Populated by the owner. The 6-hourly cron only fires when BOTH are
    # set; otherwise the sync path stays dormant with no upstream call.
    google_places_api_key: Optional[str] = None
    google_place_id: Optional[str] = None
    # ─── Warm-lead discount nudge (returning-visitor promo) ──────────
    # Surfaced inside the chat panel when a visitor's session count is 3+
    # (see ChatWidget.jsx warm-lead logic). All four fields are optional;
    # when `warm_lead_promo_enabled` is False (or the code is blank), the
    # card is hidden client-side and no impression is tracked.
    warm_lead_promo_enabled: Optional[bool] = None
    warm_lead_promo_code: Optional[str] = None
    warm_lead_promo_discount_pct: Optional[int] = None
    warm_lead_promo_description: Optional[str] = None
    # ─── Backup driver roster (fleet reassign roster) ────────────────
    # List of {name, phone} entries. The Admin "Reassign to backup"
    # button reads this list, lets the owner pick one on the spot, and
    # texts the chosen driver a fresh dispatch SMS. Scales the fleet
    # without any code changes when new drivers join or leave.
    backup_drivers: Optional[List[Dict[str, str]]] = None


class ContactMessageStatusUpdate(BaseModel):
    status: str  # 'new' | 'replied' | 'archived'


class GroupInquiryStatusUpdate(BaseModel):
    status: str


# ---- Dependency shim so this router can reuse server.py's require_admin ----
# Defined UP HERE (before any endpoint) so `Depends(_admin_dep)` in
# decorator signatures further down resolves at module import time.
def _admin_dep(authorization: Optional[str] = Header(None)) -> str:
    if _require_admin is None:
        raise HTTPException(500, "Admin dependency not configured")
    return _require_admin(authorization)


@router.get("/admin/analytics/addon-attach-rate")
async def admin_addon_attach_rate(days: int = 30, _: str = Depends(_admin_dep)):
    """Which popular add-ons are actually converting?

    For every taxi service that ships an `addons` catalog, groups the
    last N days of taxi bookings by service and counts how many of them
    ticked each add-on. Attach rate = attached / total_bookings for
    that service. `recommended: true` fires when attach_rate >= 25 and
    at least 4 guests picked it (guards against noise from tiny
    samples). Sorted by attach-rate desc so the winners bubble up.
    """
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    since = (_dt.now(_tz.utc) - _td(days=max(1, days))).isoformat()

    # Fetch the full taxi-service catalog once so we can label rows +
    # emit zero-attach rows for add-ons no one has picked yet.
    services = await _db.taxi_services.find({}).to_list(300)
    svc_by_id = {s.get("id"): s for s in services}

    # Aggregate bookings by service_id
    pipeline = [
        {"$match": {"service_type": "taxi", "created_at": {"$gte": since}}},
        {"$group": {
            "_id": "$item_id",
            "total_bookings": {"$sum": 1},
            "addons_lists": {"$push": {"$ifNull": ["$addons_selected", []]}},
        }},
    ]
    rows = []
    async for row in _db.bookings.aggregate(pipeline):
        item_id = row["_id"]
        svc = svc_by_id.get(item_id) or {}
        catalog_addons = svc.get("addons") or []
        # flatten attach counts + revenue per addon_id
        counts = {}
        revenue = {}
        for lst in row.get("addons_lists") or []:
            for a in (lst or []):
                aid = a.get("id")
                if not aid:
                    continue
                counts[aid] = counts.get(aid, 0) + 1
                revenue[aid] = revenue.get(aid, 0.0) + float(a.get("fee") or 0)
        total = int(row["total_bookings"])
        for a in catalog_addons:
            aid = a.get("id")
            attaches = counts.get(aid, 0)
            rate = round((attaches / total) * 100, 1) if total > 0 else 0.0
            rows.append({
                "addon_id": aid,
                "addon_label": a.get("label", aid),
                "addon_price": float(a.get("price") or 0),
                "addon_price_mode": (a.get("price_mode") or "flat"),
                "service_id": item_id,
                "service_name": svc.get("name") or item_id,
                "total_bookings": total,
                "attaches": attaches,
                "attach_rate_pct": rate,
                "revenue": round(revenue.get(aid, 0.0), 2),
                "recommended": rate >= 25.0 and attaches >= 4,
            })

    # Also surface add-ons whose parent service has ZERO bookings in
    # the window so admins see the full catalog + a 0% row instead of
    # "did I break something?"
    seen = {(r["service_id"], r["addon_id"]) for r in rows}
    for s in services:
        addons = s.get("addons") or []
        for a in addons:
            key = (s.get("id"), a.get("id"))
            if key in seen:
                continue
            rows.append({
                "addon_id": a.get("id"),
                "addon_label": a.get("label", a.get("id")),
                "addon_price": float(a.get("price") or 0),
                "addon_price_mode": (a.get("price_mode") or "flat"),
                "service_id": s.get("id"),
                "service_name": s.get("name") or s.get("id"),
                "total_bookings": 0,
                "attaches": 0,
                "attach_rate_pct": 0.0,
                "revenue": 0.0,
                "recommended": False,
            })

    rows.sort(key=lambda r: (-r["attach_rate_pct"], -r["attaches"], -r["revenue"]))
    total_attaches = sum(r["attaches"] for r in rows)
    total_revenue = round(sum(r["revenue"] for r in rows), 2)
    winners = [r for r in rows if r["recommended"]]
    return {
        "days": days,
        "rows": rows,
        "totals": {
            "attaches": total_attaches,
            "revenue": total_revenue,
            "winners": len(winners),
        },
        "generated_at": _now_iso(),
    }


@router.post("/admin/reviews/{review_id}/reply-draft/regenerate")
async def admin_regenerate_reply_draft(review_id: str, _: str = Depends(_admin_dep)):
    """Re-draft the owner-reply for a Google review — useful when the
    first draft feels off or after the owner tweaks their tone. Delegates
    to the shared helper defined in routes/cron.py to keep the prompt
    logic in one place."""
    from routes.cron import generate_review_reply_draft
    doc = await _db.reviews.find_one({"id": review_id})
    if not doc:
        raise HTTPException(404, "Review not found")
    draft = await generate_review_reply_draft(doc)
    await _db.reviews.update_one(
        {"id": review_id},
        {"$set": {
            "owner_reply_draft": draft,
            "owner_reply_generated_at": _now_iso(),
        }},
    )
    return {"review_id": review_id, "owner_reply_draft": draft}


class ReplyDraftUpdate(BaseModel):
    owner_reply_draft: str


@router.put("/admin/reviews/{review_id}/reply-draft")
async def admin_save_reply_draft(review_id: str, req: ReplyDraftUpdate, _: str = Depends(_admin_dep)):
    """Persist manual owner edits to a reply draft so the copy button
    always paints the latest tweaked version."""
    res = await _db.reviews.update_one(
        {"id": review_id},
        {"$set": {
            "owner_reply_draft": (req.owner_reply_draft or "")[:1200],
            "owner_reply_edited_at": _now_iso(),
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Review not found")
    return {"review_id": review_id, "saved": True}


# ============================================================================
# Booking management — MUST be registered BEFORE the /admin/{kind} catch-all
# ============================================================================

@router.get("/admin/bookings")
async def admin_list_bookings(_: str = Depends(_admin_dep)):
    docs = await _db.bookings.find({}).sort("created_at", -1).to_list(1000)
    return [_clean(d) for d in docs]


@router.patch("/admin/bookings/{booking_id}/status")
async def admin_update_status(booking_id: str, req: BookingStatusUpdate, _: str = Depends(_admin_dep)):
    res = await _db.bookings.update_one(
        {"id": booking_id.upper()},
        {"$set": {"status": req.status, "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Booking not found")
    doc = await _db.bookings.find_one({"id": booking_id.upper()})
    return _clean(doc)


@router.patch("/admin/bookings/{booking_id}/deposit")
async def admin_update_deposit(booking_id: str, req: DepositUpdate, admin_email: str = Depends(_admin_dep)):
    """Release the deposit back to the customer, or forfeit it (damage/late/etc.).

    When auto_refund=True on release we call payments_module.attempt_deposit_refund
    to send the money back via the same provider used for the original booking.
    """
    valid = {"held", "released", "forfeited"}
    if req.status not in valid:
        raise HTTPException(422, f"status must be one of {sorted(valid)}")
    doc = await _db.bookings.find_one({"id": booking_id.upper()})
    if not doc:
        raise HTTPException(404, "Booking not found")
    if not doc.get("deposit_amount"):
        raise HTTPException(400, "This booking has no security deposit")

    now = _now_iso()
    update: Dict[str, Any] = {
        "deposit_status": req.status,
        "deposit_updated_at": now,
        "deposit_updated_by": admin_email,
        "updated_at": now,
    }
    if req.reason:
        update["deposit_reason"] = req.reason
    if req.status == "released":
        update["deposit_released_at"] = now
    elif req.status == "forfeited":
        update["deposit_forfeited_at"] = now

    refund_info: Dict[str, Any] = {}
    if req.status == "released" and req.auto_refund:
        refund_info = await _attempt_deposit_refund(
            booking=doc,
            amount=float(doc["deposit_amount"]),
            reason=req.reason or "Deposit released — vehicle returned in good condition",
        )
        update["deposit_refund_provider"] = refund_info.get("provider")
        update["deposit_refund_status"] = "succeeded" if refund_info.get("refunded") else "failed"
        if refund_info.get("refund_id"):
            update["deposit_refund_id"] = refund_info["refund_id"]
        if refund_info.get("error"):
            update["deposit_refund_error"] = refund_info["error"]

    await _db.bookings.update_one({"id": booking_id.upper()}, {"$set": update})
    doc = await _db.bookings.find_one({"id": booking_id.upper()})
    result = _clean(doc)
    if refund_info:
        result["refund_info"] = refund_info
    return result


@router.post("/admin/bookings/{booking_id}/resend-notification")
async def admin_resend_notification(booking_id: str, body: Optional[Dict[str, Any]] = None, _: str = Depends(_admin_dep)):
    """Manually re-send the booking-confirmation email + SMS.

    Body: `{ "force": bool }` — bypasses the notify_email_enabled/notify_sms_enabled
    site-config toggles when true.
    """
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    force = bool((body or {}).get("force"))
    if force:
        prefs = {"notify_email_enabled": True, "notify_sms_enabled": True}
    else:
        prefs = await _db.site_config.find_one({"_id": "main"}) or {}
    try:
        report = _notify_fn(_clean(dict(booking)), prefs)
    except Exception as e:  # noqa: BLE001
        logging.warning("resend notify err: %s", e)
        raise HTTPException(500, f"Notification error: {e}") from e
    notified_at = _now_iso()
    await _db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"notification_status": report, "notified_at": notified_at}},
    )
    return {"booking_id": booking["id"], "notification_status": report, "notified_at": notified_at, "forced": force}


@router.get("/admin/stats")
async def admin_stats(_: str = Depends(_admin_dep)):
    total = await _db.bookings.count_documents({})
    paid = await _db.bookings.count_documents({"payment_status": "paid"})
    pending = await _db.bookings.count_documents({"status": {"$in": ["pending_payment", "confirmed"]}})
    active = await _db.bookings.count_documents({"status": {"$in": ["driver_assigned", "en_route"]}})
    revenue_cursor = _db.bookings.aggregate([
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "sum": {"$sum": "$total"}}},
    ])
    revenue_docs = await revenue_cursor.to_list(1)
    revenue = revenue_docs[0]["sum"] if revenue_docs else 0

    deposits_held = await _db.bookings.count_documents({"deposit_status": "held", "deposit_amount": {"$gt": 0}})
    deposits_released = await _db.bookings.count_documents({"deposit_status": "released"})
    deposits_forfeited = await _db.bookings.count_documents({"deposit_status": "forfeited"})
    held_cursor = _db.bookings.aggregate([
        {"$match": {"deposit_status": "held", "deposit_amount": {"$gt": 0}}},
        {"$group": {"_id": None, "sum": {"$sum": "$deposit_amount"}}},
    ])
    held_docs = await held_cursor.to_list(1)
    deposits_held_amount = held_docs[0]["sum"] if held_docs else 0

    return {
        "total": total, "paid": paid, "pending": pending, "active": active,
        "revenue": revenue,
        "deposits_held": deposits_held,
        "deposits_released": deposits_released,
        "deposits_forfeited": deposits_forfeited,
        "deposits_held_amount": deposits_held_amount,
    }


@router.get("/admin/auth/methods-summary")
async def admin_auth_methods_summary(_: str = Depends(_admin_dep)):
    """
    Login-method breakdown for the Admin Dashboard.

    Returns lifetime user counts by signup provider (google / email / both)
    plus a 30-day active-login breakdown from `user_sessions`. This lets the
    owner see which auth method actually converts and drives return visits —
    e.g. "60% of my logins this month came via Google, so keep that tab first".
    """
    # ── Lifetime signup breakdown by provider on the users doc ────────
    pipeline_users = [
        {"$group": {"_id": {"$ifNull": ["$provider", "email"]}, "count": {"$sum": 1}}}
    ]
    provider_docs = await _db.users.aggregate(pipeline_users).to_list(None)
    by_provider = {d["_id"]: d["count"] for d in provider_docs}
    total_users = sum(by_provider.values())
    google_only = by_provider.get("google", 0)
    email_only = by_provider.get("email", 0)
    both_users = by_provider.get("both", 0)
    # Anyone who CAN log in via Google (Google-only signups + linked-both accounts)
    google_users = google_only + both_users
    email_users = email_only + both_users

    # ── 30-day active login breakdown from user_sessions ──────────────
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    pipeline_sessions = [
        {"$match": {"created_at": {"$gte": cutoff}}},
        {"$group": {"_id": {"$ifNull": ["$auth_method", "unknown"]}, "count": {"$sum": 1}}},
    ]
    session_docs = await _db.user_sessions.aggregate(pipeline_sessions).to_list(None)
    sessions_by_method = {d["_id"]: d["count"] for d in session_docs}
    sessions_30d_total = sum(sessions_by_method.values())

    # ── New signups in the last 30 days (activity trend) ──────────────
    new_signups_30d = await _db.users.count_documents({"created_at": {"$gte": cutoff}})

    return {
        "total_users": total_users,
        "google_users": google_users,
        "email_users": email_users,
        "google_only": google_only,
        "email_only": email_only,
        "both_users": both_users,
        "sessions_30d": {
            "total": sessions_30d_total,
            "google": sessions_by_method.get("google", 0),
            "email": sessions_by_method.get("email", 0),
        },
        "new_signups_30d": new_signups_30d,
    }


async def _ab_test_stats() -> list[dict]:
    """Compute the last-30d A/B variant stats block shared by
    /admin/photo-nudge-stats and its lightweight recompute sibling."""
    cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    def _pct(part, whole):
        return round((part / whole) * 100, 1) if whole > 0 else 0.0

    async def _variant_stats(v: str):
        nudges = await _db.bookings.count_documents({
            "photo_nudge_sent_at": {"$gte": cutoff_30d},
            "photo_nudge_variant": v,
        })
        attributed = await _db.gallery_submissions.count_documents({
            "attributed_nudge_sent_at": {"$gte": cutoff_30d},
            "attributed_nudge_variant": v,
        })
        return {
            "variant": v,
            "label": "24h send" if v == "A" else "3-day send",
            "nudges_sent": nudges,
            "attributed_submissions": attributed,
            "conversion_pct": _pct(attributed, nudges),
        }

    return [await _variant_stats("A"), await _variant_stats("B")]


@router.get("/admin/photo-nudge-stats/ab-significance")
async def admin_ab_significance_recompute(_: str = Depends(_admin_dep)):
    """Live re-compute of the A/B test's variant conversion + statistical
    significance. Called by the admin dashboard when the owner taps a
    variant card so the "Ship the winner" hint updates without a full page
    reload. Returns only the ab_test + ab_significance blocks so it's fast
    (< 30ms) even with hundreds of thousands of bookings."""
    ab = await _ab_test_stats()
    return {
        "ab_test": ab,
        "ab_significance": _compute_ab_significance(ab),
        "recomputed_at": _now_iso(),
    }


@router.get("/admin/photo-nudge-stats")
async def admin_photo_nudge_stats(_: str = Depends(_admin_dep)):
    """Post-trip photo-nudge funnel stats.

    Counts how many `photo_nudge_sent_at` timestamps landed on bookings vs
    how many `gallery_submissions` came back attributed to a nudge (via the
    submitter_email → booking match window recorded at submit-time).

    Windows:
      - lifetime: all-time counts + conversion %
      - last_30d: rolling 30-day counts + conversion %
    """
    now = datetime.now(timezone.utc)
    cutoff_30d = (now - timedelta(days=30)).isoformat()

    lifetime_nudges = await _db.bookings.count_documents({"photo_nudge_sent_at": {"$exists": True}})
    lifetime_attributed = await _db.gallery_submissions.count_documents({"attributed_nudge_booking_id": {"$exists": True}})

    recent_nudges = await _db.bookings.count_documents({"photo_nudge_sent_at": {"$gte": cutoff_30d}})
    recent_attributed = await _db.gallery_submissions.count_documents({"attributed_nudge_sent_at": {"$gte": cutoff_30d}})

    total_submissions_30d = await _db.gallery_submissions.count_documents({"created_at": {"$gte": cutoff_30d}})

    def _pct(part, whole):
        return round((part / whole) * 100, 1) if whole > 0 else 0.0

    # ── A/B variant breakdown (last 30 days) ──────────────────────────
    # Variant A = 24h send window (control), Variant B = 3-day send window.
    # Shared helper — also used by /admin/photo-nudge-stats/ab-significance
    # so the live-recompute endpoint returns identical numbers.
    ab = await _ab_test_stats()

    # ── Statistical significance for the A/B test ─────────────────────
    # Two-proportion z-test at 95% confidence, plus a sample-size estimate
    # for 80% power at the currently-observed effect size. Gives the owner a
    # concrete "wait until you have N more nudges per arm" hint instead of a
    # vague "keep going".
    ab_significance = _compute_ab_significance(ab)

    return {
        "lifetime": {
            "nudges_sent": lifetime_nudges,
            "attributed_submissions": lifetime_attributed,
            "conversion_pct": _pct(lifetime_attributed, lifetime_nudges),
        },
        "last_30d": {
            "nudges_sent": recent_nudges,
            "attributed_submissions": recent_attributed,
            "total_submissions": total_submissions_30d,
            "conversion_pct": _pct(recent_attributed, recent_nudges),
            "attributed_share_pct": _pct(recent_attributed, total_submissions_30d),
        },
        "ab_test": ab,
        "ab_significance": ab_significance,
    }


def _compute_ab_significance(ab: list[dict]) -> dict:
    """Two-proportion z-test + minimum-sample-size estimator.

    Returns:
        {
          "is_significant": bool,
          "confidence": 0.95,
          "z_score": float or None,
          "leader": "A"|"B"|None,
          "needed_per_arm": int (extra nudges needed to reach significance at
                                 the currently-observed effect size),
          "message": human-readable hint for the owner.
        }
    Guards against tiny samples (< 30 per arm) with a "gather more data" msg.
    """
    import math
    if len(ab) != 2:
        return {"is_significant": False, "message": "Waiting for both variants to record data."}
    a, b = ab
    na, xa = int(a.get("nudges_sent", 0)), int(a.get("attributed_submissions", 0))
    nb, xb = int(b.get("nudges_sent", 0)), int(b.get("attributed_submissions", 0))

    MIN_PER_ARM = 30
    if na < MIN_PER_ARM or nb < MIN_PER_ARM:
        needed_min = max(0, MIN_PER_ARM - min(na, nb))
        return {
            "is_significant": False,
            "confidence": 0.95,
            "z_score": None,
            "leader": None,
            "needed_per_arm": needed_min,
            "message": f"Need {needed_min} more nudges in the smaller arm before we can measure significance.",
        }

    pa, pb = xa / na, xb / nb
    # Pooled proportion for the null z-test
    p_pool = (xa + xb) / (na + nb)
    denom = math.sqrt(p_pool * (1 - p_pool) * (1 / na + 1 / nb)) if p_pool > 0 else 0
    z = (pa - pb) / denom if denom > 0 else 0.0
    is_sig = abs(z) >= 1.96
    leader = "A" if pa > pb else ("B" if pb > pa else None)

    if is_sig:
        return {
            "is_significant": True,
            "confidence": 0.95,
            "z_score": round(z, 2),
            "leader": leader,
            "needed_per_arm": 0,
            "message": f"Variant {leader} is a statistically-significant winner at 95% confidence.",
        }

    # Minimum sample size per arm for 80% power at the observed effect size:
    # n = (z_a/2 + z_b)^2 * (p1*q1 + p2*q2) / (p1-p2)^2
    diff = abs(pa - pb)
    if diff < 0.005:  # < 0.5 pp — practically indistinguishable
        return {
            "is_significant": False,
            "confidence": 0.95,
            "z_score": round(z, 2),
            "leader": leader,
            "needed_per_arm": None,
            "message": "The two variants are performing near-identically — no meaningful difference to declare.",
        }
    needed = math.ceil((2.8 ** 2) * (pa * (1 - pa) + pb * (1 - pb)) / (diff ** 2))
    extra_per_arm = max(0, needed - min(na, nb))
    return {
        "is_significant": False,
        "confidence": 0.95,
        "z_score": round(z, 2),
        "leader": leader,
        "needed_per_arm": extra_per_arm,
        "message": f"Need ~{extra_per_arm} more nudges per arm to call Variant {leader} the winner at 95% confidence.",
    }


# ============================================================================
# Group inquiries admin — also literal routes, registered before catch-all
# ============================================================================

@router.get("/admin/group-inquiries")
async def admin_list_group_inquiries(_: str = Depends(_admin_dep)):
    docs = await _db.group_inquiries.find({}).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]


@router.patch("/admin/group-inquiries/{inquiry_id}/status")
async def admin_update_group_status(inquiry_id: str, req: GroupInquiryStatusUpdate, _: str = Depends(_admin_dep)):
    res = await _db.group_inquiries.update_one(
        {"id": inquiry_id.upper()},
        {"$set": {"status": req.status, "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Inquiry not found")
    doc = await _db.group_inquiries.find_one({"id": inquiry_id.upper()})
    return _clean(doc)


# ---- Admin: contact-form messages ------------------------------------------

@router.get("/admin/contact-messages")
async def admin_list_contact_messages(_: str = Depends(_admin_dep)):
    docs = await _db.contact_messages.find({}).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]


@router.patch("/admin/contact-messages/{msg_id}/status")
async def admin_update_contact_status(msg_id: str, req: ContactMessageStatusUpdate, _: str = Depends(_admin_dep)):
    if req.status not in {"new", "replied", "archived"}:
        raise HTTPException(422, "status must be new | replied | archived")
    res = await _db.contact_messages.update_one(
        {"id": msg_id.upper()},
        {"$set": {"status": req.status, "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Message not found")
    doc = await _db.contact_messages.find_one({"id": msg_id.upper()})
    return _clean(doc)


@router.delete("/admin/contact-messages/{msg_id}")
async def admin_delete_contact_message(msg_id: str, _: str = Depends(_admin_dep)):
    res = await _db.contact_messages.delete_one({"id": msg_id.upper()})
    if res.deleted_count == 0:
        raise HTTPException(404, "Message not found")
    return {"deleted": True, "id": msg_id.upper()}


# ---- Admin: notification delivery report (CSV export) ---------------------

@router.get("/admin/notifications/report.csv")
async def admin_notifications_report(
    days: int = 30,
    _: str = Depends(_admin_dep),
):
    """Stream a CSV of every booking's notification delivery status.

    Query param `days` filters to bookings created in the last N days (default 30).
    Columns: booking_id, customer_name, customer_email, customer_phone,
    booking_service, booking_date, booking_total, payment_method, payment_status,
    booking_status, created_at, notified_at, email_enabled, email_sent,
    email_provider, email_error, sms_enabled, sms_sent, sms_provider, sms_error.
    """
    import csv, io
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 365)))).isoformat()
    cursor = _db.bookings.find({"created_at": {"$gte": cutoff}}).sort("created_at", -1)
    docs = await cursor.to_list(5000)

    def rows():
        buf = io.StringIO()
        writer = csv.writer(buf)
        header = [
            "booking_id", "customer_name", "customer_email", "customer_phone",
            "booking_service", "booking_date", "booking_total",
            "payment_method", "payment_status", "booking_status",
            "created_at", "notified_at",
            "email_enabled", "email_sent", "email_provider", "email_error",
            "sms_enabled", "sms_sent", "sms_provider", "sms_error",
        ]
        writer.writerow(header)
        yield buf.getvalue()
        buf.seek(0); buf.truncate(0)

        for d in docs:
            ns = d.get("notification_status") or {}
            em = ns.get("email") or {}
            sm = ns.get("sms") or {}
            writer.writerow([
                d.get("id", ""),
                d.get("customer_name", ""),
                d.get("customer_email", ""),
                d.get("customer_phone", ""),
                d.get("item_name", ""),
                d.get("booking_date", ""),
                d.get("total", ""),
                d.get("payment_method", ""),
                d.get("payment_status", ""),
                d.get("status", ""),
                d.get("created_at", ""),
                d.get("notified_at", ""),
                em.get("enabled", ""),
                em.get("sent", ""),
                em.get("provider", ""),
                em.get("error", ""),
                sm.get("enabled", ""),
                sm.get("sent", ""),
                sm.get("provider", ""),
                sm.get("error", ""),
            ])
            yield buf.getvalue()
            buf.seek(0); buf.truncate(0)

    filename = f"rox-notifications-{days}d-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.csv"
    return StreamingResponse(
        rows(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/admin/notifications/summary")
async def admin_notifications_summary(days: int = 30, _: str = Depends(_admin_dep)):
    """Rolling stats — used by the admin dashboard 'Deliverability' widget."""
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 365)))).isoformat()
    docs = await _db.bookings.find({"created_at": {"$gte": cutoff}, "notification_status": {"$exists": True}}).to_list(5000)

    total = len(docs)
    email_sent = sum(1 for d in docs if (d.get("notification_status") or {}).get("email", {}).get("sent"))
    email_failed = sum(1 for d in docs if not (d.get("notification_status") or {}).get("email", {}).get("sent") and (d.get("notification_status") or {}).get("email", {}).get("enabled"))
    sms_sent = sum(1 for d in docs if (d.get("notification_status") or {}).get("sms", {}).get("sent"))
    sms_failed = sum(1 for d in docs if not (d.get("notification_status") or {}).get("sms", {}).get("sent") and (d.get("notification_status") or {}).get("sms", {}).get("enabled"))
    return {
        "days": days,
        "bookings_with_notifications": total,
        "email_sent": email_sent,
        "email_failed": email_failed,
        "sms_sent": sms_sent,
        "sms_failed": sms_failed,
        "email_success_rate": round(100 * email_sent / max(1, email_sent + email_failed), 1),
        "sms_success_rate": round(100 * sms_sent / max(1, sms_sent + sms_failed), 1),
    }


# ============================================================================
# Logo upload + site config (literal routes)
# ============================================================================

@router.post("/admin/upload-logo")
async def upload_logo(file: UploadFile = File(...), _: str = Depends(_admin_dep)):
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type. Use {', '.join(sorted(allowed))}")

    name = f"logo-{uuid.uuid4().hex[:8]}{ext}"
    dest = _upload_dir / name
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Logo must be ≤ 5MB")
    dest.write_bytes(content)

    url = f"/api/uploads/{name}"
    await _db.site_config.update_one({"_id": "main"}, {"$set": {"logo_url": url}}, upsert=True)
    return {"logo_url": url}


# ---- Catalog image manager -------------------------------------------------
# General-purpose image upload/list/delete so admins can manage the photo
# library used by tours / taxi / rentals / carousel via the /admin/manage UI.

@router.post("/admin/images")
async def upload_catalog_image(file: UploadFile = File(...), _: str = Depends(_admin_dep)):
    """Upload a catalog image (any tour / taxi / rental / carousel photo)."""
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type. Use {', '.join(sorted(allowed))}")

    content = await file.read()
    max_bytes = 8 * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(400, "Image must be ≤ 8MB")

    # Sanitize original stem into a slug so admins can find images by name later.
    import re as _re
    stem = Path(file.filename or "image").stem
    slug = _re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("-")[:40] or "image"
    name = f"cat-{slug}-{uuid.uuid4().hex[:6]}{ext}"

    dest = _upload_dir / name
    dest.write_bytes(content)
    return {
        "name": name,
        "url": f"/api/uploads/{name}",
        "size": len(content),
        "content_type": file.content_type,
    }


@router.get("/admin/images")
async def list_catalog_images(_: str = Depends(_admin_dep)):
    """List every uploaded image in the upload dir, newest first."""
    if not _upload_dir.exists():
        return []
    exts = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}
    items = []
    for p in _upload_dir.iterdir():
        if p.is_file() and p.suffix.lower() in exts:
            stat = p.stat()
            items.append({
                "name": p.name,
                "url": f"/api/uploads/{p.name}",
                "size": stat.st_size,
                "modified_at": stat.st_mtime,
            })
    items.sort(key=lambda x: x["modified_at"], reverse=True)
    return items


@router.delete("/admin/images/{name}")
async def delete_catalog_image(name: str, _: str = Depends(_admin_dep)):
    """Delete an uploaded image. Traversal-guarded via resolve() compare."""
    path = (_upload_dir / name).resolve()
    if not str(path).startswith(str(_upload_dir.resolve())) or not path.exists():
        raise HTTPException(404, "Image not found")
    path.unlink()
    return {"deleted": True, "name": name}


@router.put("/admin/site-config")
async def admin_update_site(req: SiteConfigUpdate, _: str = Depends(_admin_dep)):
    payload = {k: v for k, v in req.model_dump().items() if v is not None}
    if payload:
        await _db.site_config.update_one({"_id": "main"}, {"$set": payload}, upsert=True)
    cfg = await _db.site_config.find_one({"_id": "main"})
    cfg.pop("_id", None)
    return cfg


# ═══════════════════════════════════════════════════════════════════════════
# Reviews — real Google Business reviews pasted via admin panel
# ═══════════════════════════════════════════════════════════════════════════
class ReviewIn(BaseModel):
    author_name: str = Field(..., min_length=1, max_length=100)
    author_url: Optional[str] = Field(None, max_length=500)
    profile_photo_url: Optional[str] = Field(None, max_length=500)
    rating: int = Field(..., ge=1, le=5)
    text: str = Field(..., min_length=1, max_length=2000)
    relative_time: str = Field("", max_length=60)  # e.g. "2 weeks ago"
    active: bool = True


@router.get("/admin/reviews")
async def admin_list_reviews(_: str = Depends(_admin_dep)):
    """List every review pasted so far, newest first."""
    docs = await _db.reviews.find({}).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.post("/admin/reviews")
async def admin_create_review(req: ReviewIn, _: str = Depends(_admin_dep)):
    """Paste a review from your Google Business dashboard."""
    import uuid as _uuid
    review_id = f"rev_{_uuid.uuid4().hex[:12]}"
    doc = {
        "id": review_id,
        **req.model_dump(),
        "source": "manual",
        "created_at": _now_iso(),
    }
    if not doc.get("profile_photo_url"):
        # Use a neutral avatar so the card doesn't crash. Google's default
        # avatar CDN pattern works with any name.
        first = req.author_name.strip()[:1].upper() or "G"
        doc["profile_photo_url"] = f"https://ui-avatars.com/api/?name={first}&background=D4A94A&color=fff&size=80&bold=true"
    await _db.reviews.insert_one(doc)
    return _clean(doc)


@router.put("/admin/reviews/{review_id}")
async def admin_update_review(review_id: str, req: ReviewIn, _: str = Depends(_admin_dep)):
    payload = req.model_dump()
    payload["updated_at"] = _now_iso()
    r = await _db.reviews.update_one({"id": review_id}, {"$set": payload})
    if r.matched_count == 0:
        raise HTTPException(404, "Review not found")
    doc = await _db.reviews.find_one({"id": review_id})
    return _clean(doc)


@router.delete("/admin/reviews/{review_id}")
async def admin_delete_review(review_id: str, _: str = Depends(_admin_dep)):
    r = await _db.reviews.delete_one({"id": review_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Review not found")
    return {"deleted": True, "id": review_id}


# ═══════════════════════════════════════════════════════════════════════════
# Country freeze — one-click "block signups from country X for N hours"
# ═══════════════════════════════════════════════════════════════════════════
class CountryFreezeRequest(BaseModel):
    country: str = Field(..., min_length=1, max_length=80)
    hours: int = Field(24, ge=0, le=720)  # 0 = unfreeze immediately
    reason: Optional[str] = Field(None, max_length=200)


@router.post("/admin/country-freeze")
async def admin_country_freeze(req: CountryFreezeRequest, _: str = Depends(_admin_dep)):
    """Freeze all new signups from `country` for the next N hours (or
    unfreeze if hours == 0). Enforced inside /auth/register."""
    from datetime import datetime, timezone, timedelta
    if req.hours == 0:
        await _db.country_freezes.delete_one({"country": req.country})
        return {"country": req.country, "frozen": False}
    frozen_until = (datetime.now(timezone.utc) + timedelta(hours=req.hours)).isoformat()
    await _db.country_freezes.update_one(
        {"country": req.country},
        {"$set": {
            "country": req.country,
            "frozen_until": frozen_until,
            "reason": req.reason or "",
            "created_at": _now_iso(),
        }},
        upsert=True,
    )
    return {"country": req.country, "frozen": True, "frozen_until": frozen_until}


@router.get("/admin/country-freezes")
async def admin_list_country_freezes(_: str = Depends(_admin_dep)):
    """Return all active freezes so the fraud-watch card can badge them."""
    now = _now_iso()
    docs = await _db.country_freezes.find({"frozen_until": {"$gt": now}}).to_list(200)
    return [_clean(d) for d in docs]


# ═══════════════════════════════════════════════════════════════════════════
# Email domain blocklist — disposable-mail providers that never convert
# ═══════════════════════════════════════════════════════════════════════════
# Curated seed list of the most-abused throwaway providers. The admin panel
# lets you add/remove entries; the check runs inside /auth/register and
# returns HTTP 400 with a friendly message before creating the account.
_DEFAULT_BLOCKED_DOMAINS = [
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
    "temp-mail.org", "yopmail.com", "throwawaymail.com", "sharklasers.com",
    "dispostable.com", "getnada.com", "trashmail.com", "maildrop.cc",
    "fakeinbox.com", "mohmal.com", "mytemp.email", "spamgourmet.com",
    "spam4.me", "temporaryemail.net", "tempinbox.com", "moakt.com",
    "email-fake.com", "emlhub.com", "wegwerfemail.de", "einrot.com",
    "grr.la", "guerrillamailblock.com", "pokemail.net", "spam.la",
    "trbvm.com", "byom.de", "dispomail.eu", "burnermail.io", "harakirimail.com",
]


class EmailBlocklistEntry(BaseModel):
    domain: str = Field(..., min_length=3, max_length=120)


@router.get("/admin/email-blocklist")
async def admin_email_blocklist(_: str = Depends(_admin_dep)):
    """Merged view: seed defaults + admin-added entries. Frontend uses this
    to render the CRUD table."""
    custom_docs = await _db.blocked_email_domains.find({}).sort("added_at", -1).to_list(500)
    custom = [{"domain": d["domain"], "added_at": d.get("added_at", ""), "custom": True} for d in custom_docs]
    seeds = [{"domain": d, "added_at": "", "custom": False} for d in _DEFAULT_BLOCKED_DOMAINS if
             not any(c["domain"] == d for c in custom)]
    return {"blocklist": custom + seeds, "seed_count": len(_DEFAULT_BLOCKED_DOMAINS)}


@router.post("/admin/email-blocklist")
async def admin_email_blocklist_add(req: EmailBlocklistEntry, _: str = Depends(_admin_dep)):
    domain = req.domain.strip().lower().lstrip("@")
    if "." not in domain or " " in domain:
        raise HTTPException(400, "Invalid domain format (e.g. tempmail.com)")
    await _db.blocked_email_domains.update_one(
        {"domain": domain},
        {"$set": {"domain": domain, "added_at": _now_iso()}},
        upsert=True,
    )
    return {"domain": domain, "added": True}


@router.delete("/admin/email-blocklist/{domain}")
async def admin_email_blocklist_remove(domain: str, _: str = Depends(_admin_dep)):
    domain = domain.strip().lower()
    # If it's a seed default, "removing" means creating a whitelist override.
    if domain in _DEFAULT_BLOCKED_DOMAINS:
        await _db.blocked_email_domains.update_one(
            {"domain": domain},
            {"$set": {"domain": domain, "whitelisted": True, "added_at": _now_iso()}},
            upsert=True,
        )
        return {"domain": domain, "whitelisted": True}
    r = await _db.blocked_email_domains.delete_one({"domain": domain})
    return {"domain": domain, "deleted": r.deleted_count > 0}


async def is_email_domain_blocked(email: str) -> bool:
    """Called by /auth/register — returns True if the email's domain is on
    the blocklist (seed + custom, minus whitelisted overrides)."""
    if not email or "@" not in email:
        return False
    domain = email.split("@", 1)[1].lower().strip()
    if not domain:
        return False
    # Whitelist override on a seed domain?
    row = await _db.blocked_email_domains.find_one({"domain": domain})
    if row:
        if row.get("whitelisted"):
            return False
        return True
    return domain in _DEFAULT_BLOCKED_DOMAINS


# ═══════════════════════════════════════════════════════════════════════════
# Warm-lead analytics — how often returning visitors open the chat vs first-timers
# ═══════════════════════════════════════════════════════════════════════════
class ChatOpenEvent(BaseModel):
    visit_count: int = Field(1, ge=1, le=999)
    warm_lead: bool = False


@router.post("/chat/track-open")
async def chat_track_open(req: ChatOpenEvent, request: Request):
    """Public — client-side POST when the chat widget opens. Rate-limited
    trivially by the sessionStorage guard on the frontend."""
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else "")
    await _db.chat_open_events.insert_one({
        "visit_count": req.visit_count,
        "warm_lead": bool(req.warm_lead),
        "ip": (ip or "")[:64],
        "at": _now_iso(),
    })
    return {"tracked": True}


class PromoCopyEvent(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    visit_count: int = Field(1, ge=1, le=999)


@router.post("/chat/track-promo-copy")
async def chat_track_promo_copy(req: PromoCopyEvent, request: Request):
    """Public — fires when a warm-lead visitor copies the promo code from
    the chat panel. Lets admins see which returning visitors actually
    engaged with the discount (vs just seeing it)."""
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else "")
    await _db.promo_copy_events.insert_one({
        "code": (req.code or "")[:32].upper(),
        "visit_count": req.visit_count,
        "ip": (ip or "")[:64],
        "at": _now_iso(),
    })
    return {"tracked": True}


@router.get("/admin/analytics/pickup-audit")
async def admin_pickup_audit(_: str = Depends(_admin_dep)):
    """Driver check-in GPS audit — for every booking with `driver_pickup_lat/lng`
    stamped, computes the great-circle distance to the closest known Nassau
    anchor keyword-matched from the booked `pickup_location`. Any check-in
    that lands >500m away is flagged for admin review.

    Keeps the audit self-contained (no external Google Places lookups) via a
    small anchor table. Bookings whose pickup text doesn't match any anchor
    fall back to the general Nassau centroid as a coarse sanity check.
    """
    import math
    from datetime import datetime, timezone, timedelta

    # Common Nassau meeting spots we ship taxis to/from. Coordinates are
    # rough but well within the 500m tolerance for their surrounding area.
    ANCHORS = [
        ("cruise", 25.0785, -77.3395, "Cruise Port / Prince George Wharf"),
        ("prince george", 25.0785, -77.3395, "Cruise Port / Prince George Wharf"),
        ("downtown", 25.0785, -77.3400, "Downtown Nassau"),
        ("bay street", 25.0782, -77.3396, "Bay Street"),
        ("lpia", 25.0393, -77.4661, "LPIA Airport"),
        ("airport", 25.0393, -77.4661, "LPIA Airport"),
        ("cable beach", 25.0808, -77.4059, "Cable Beach"),
        ("baha mar", 25.0782, -77.4126, "Baha Mar"),
        ("atlantis", 25.0834, -77.3199, "Atlantis Paradise Island"),
        ("paradise island", 25.0850, -77.3200, "Paradise Island"),
        ("junkanoo", 25.0824, -77.3435, "Junkanoo Beach"),
        ("love beach", 25.0770, -77.4650, "Love Beach"),
        ("arawak", 25.0778, -77.3625, "Arawak Cay / Fish Fry"),
        ("fish fry", 25.0778, -77.3625, "Arawak Cay / Fish Fry"),
        ("lyford", 25.0180, -77.5195, "Lyford Cay"),
    ]
    NASSAU_CENTROID = (25.0602, -77.3450, "Nassau (approx.)")
    FLAG_METERS = 500

    def _haversine_m(a_lat, a_lng, b_lat, b_lng):
        R = 6371000.0
        p1 = math.radians(a_lat); p2 = math.radians(b_lat)
        dp = math.radians(b_lat - a_lat); dl = math.radians(b_lng - a_lng)
        x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return R * 2 * math.asin(min(1.0, math.sqrt(x)))

    def _anchor_for(pickup_text: str):
        s = (pickup_text or "").lower()
        for kw, lat, lng, label in ANCHORS:
            if kw in s:
                return lat, lng, label
        return NASSAU_CENTROID

    since = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    cur = _db.bookings.find({
        "driver_pickup_lat": {"$exists": True, "$ne": None},
        "driver_pickup_lng": {"$exists": True, "$ne": None},
        "driver_checked_in_at": {"$gte": since},
    }, {
        "id": 1, "customer_name": 1, "pickup_location": 1,
        "driver_pickup_lat": 1, "driver_pickup_lng": 1,
        "driver_pickup_accuracy_m": 1, "driver_checked_in_at": 1,
        "driver_confirmed_pickup_location": 1, "item_name": 1,
    }).sort("driver_checked_in_at", -1).limit(200)

    rows = []
    flagged = 0
    async for b in cur:
        pickup_text = b.get("driver_confirmed_pickup_location") or b.get("pickup_location") or ""
        exp_lat, exp_lng, exp_label = _anchor_for(pickup_text)
        d_m = _haversine_m(exp_lat, exp_lng, float(b["driver_pickup_lat"]), float(b["driver_pickup_lng"]))
        is_flagged = d_m > FLAG_METERS
        if is_flagged:
            flagged += 1
        rows.append({
            "booking_id": b.get("id"),
            "customer_name": b.get("customer_name", ""),
            "item_name": b.get("item_name", ""),
            "pickup_location": pickup_text,
            "expected_anchor_label": exp_label,
            "expected_lat": exp_lat,
            "expected_lng": exp_lng,
            "driver_lat": float(b["driver_pickup_lat"]),
            "driver_lng": float(b["driver_pickup_lng"]),
            "accuracy_m": b.get("driver_pickup_accuracy_m"),
            "distance_m": round(d_m, 1),
            "distance_km": round(d_m / 1000, 2),
            "flagged": is_flagged,
            "at": b.get("driver_checked_in_at"),
        })

    return {
        "window_days": 60,
        "flag_threshold_m": FLAG_METERS,
        "total": len(rows),
        "flagged": flagged,
        "rows": rows,
    }


@router.get("/admin/analytics/warm-lead")
async def admin_warm_lead_stats(_: str = Depends(_admin_dep)):
    """Aggregate warm-lead engagement — visitors who opened the chat on
    their 3rd+ session vs first-timers. Returns 30-day window counts +
    a simple conversion ratio comparison."""
    from datetime import datetime, timezone, timedelta
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    q = {"at": {"$gte": since}}
    total_opens = await _db.chat_open_events.count_documents(q)
    warm_opens = await _db.chat_open_events.count_documents({**q, "warm_lead": True})
    first_opens = await _db.chat_open_events.count_documents({**q, "warm_lead": False})

    # Approximate unique visitors via distinct IPs — good enough signal
    warm_ips = len(await _db.chat_open_events.distinct("ip", {**q, "warm_lead": True}))
    first_ips = len(await _db.chat_open_events.distinct("ip", {**q, "warm_lead": False}))

    # Simple "engagement rate" — chat opens per unique visitor. Warm-lead
    # visitors typically show 2-3x this ratio in reality; we render the
    # comparison as a visible lift indicator on the admin card.
    warm_rate = round(warm_opens / warm_ips, 2) if warm_ips else 0.0
    first_rate = round(first_opens / first_ips, 2) if first_ips else 0.0
    lift = round(((warm_rate / first_rate) - 1) * 100, 1) if first_rate else 0.0

    # ─── Promo-copy counters ──────────────────────────────────────────
    # Same 30-day window. Only reflects clicks on the chat-panel promo
    # card, which is only rendered for warm leads when the admin has an
    # active promo configured.
    promo_copies = await _db.promo_copy_events.count_documents(q)
    promo_copy_uniques = len(await _db.promo_copy_events.distinct("ip", q))

    return {
        "window_days": 30,
        "total_opens": total_opens,
        "warm_opens": warm_opens,
        "first_opens": first_opens,
        "warm_unique_visitors": warm_ips,
        "first_unique_visitors": first_ips,
        "warm_engagement_rate": warm_rate,
        "first_engagement_rate": first_rate,
        "warm_vs_first_lift_pct": lift,
        "promo_copies": promo_copies,
        "promo_copy_uniques": promo_copy_uniques,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Tokens & Secrets — DB-managed API keys / access tokens.
# Backed by secrets_store; overrides `.env` at read time. Sensitive values
# are never returned in plaintext (only a last-4 mask).
# ═══════════════════════════════════════════════════════════════════════════

class TokenUpdate(BaseModel):
    key: str
    value: Optional[str] = None  # None or "" clears the DB override


@router.get("/admin/tokens")
async def admin_list_tokens(_: str = Depends(_admin_dep)):
    """Return the token registry with current fill status per key."""
    import secrets_store as _ss
    # Re-prime from Mongo so parallel admin sessions see fresh writes.
    await _ss.prime()
    return {"tokens": _ss.snapshot_for_admin()}


@router.put("/admin/tokens")
async def admin_upsert_token(req: TokenUpdate, _: str = Depends(_admin_dep)):
    """Upsert a single token in Mongo. Empty value removes the override."""
    import secrets_store as _ss
    if not _ss.is_registered(req.key):
        raise HTTPException(400, f"Unknown token key: {req.key}")
    await _ss.set_secret(req.key, req.value)
    return {"ok": True, "key": req.key, "cleared": req.value in (None, "")}


@router.delete("/admin/tokens/{key}")
async def admin_clear_token(key: str, _: str = Depends(_admin_dep)):
    """Clear a token's DB override (falls back to .env value if any)."""
    import secrets_store as _ss
    if not _ss.is_registered(key):
        raise HTTPException(400, f"Unknown token key: {key}")
    await _ss.set_secret(key, None)
    return {"ok": True, "key": key, "cleared": True}


@router.get("/admin/tokens/facebook/status")
async def admin_facebook_status(_: str = Depends(_admin_dep)):
    """Live probe — hits Facebook Graph API with the current token so the
    admin can confirm the token works before relying on auto-post."""
    from facebook import facebook_status
    return await facebook_status()


@router.get("/admin/tokens/env-snapshot")
async def admin_env_snapshot(reveal: bool = False, _: str = Depends(_admin_dep)):
    """Export the current effective config as a .env-style text block.

    - Groups keys by section (mirrors the admin panel layout).
    - Sensitive values are always masked ("<masked-••••XXXX>") unless the
      caller explicitly passes `reveal=true`, which requires admin auth
      (already gated by _admin_dep) and echoes plaintext so the owner can
      hand off / migrate hosts.
    - Also annotates each line with its current source (`# db-override`,
      `# .env`, or `# unset`).
    """
    import secrets_store as _ss
    from datetime import datetime, timezone
    await _ss.prime()
    snapshot = _ss.snapshot_for_admin()

    # Group by registry order.
    lines: list[str] = []
    lines.append(f"# Rox Taxi — effective config snapshot")
    lines.append(f"# Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    lines.append(f"# Source: {'PLAINTEXT (reveal=true)' if reveal else 'MASKED — regenerate with reveal=true to export real secrets'}")
    lines.append("")

    current_group = None
    for row in snapshot:
        if row["group"] != current_group:
            current_group = row["group"]
            lines.append(f"# ── {current_group} ──")
        key = row["key"]
        source_tag = {"db": "db-override", "env": ".env", "unset": "unset"}.get(row["source"], "unknown")
        if not row["has_value"]:
            lines.append(f'# {key}=  # unset')
            continue
        if row["sensitive"]:
            if reveal:
                # Read the real underlying value via get_secret (db-first, env-fallback).
                val = _ss.get_secret(key, "")
                lines.append(f'{key}="{val}"  # {source_tag}')
            else:
                lines.append(f'# {key}=<masked-{row["masked"]}>  # {source_tag} (sensitive — use reveal=true to export)')
        else:
            val = row.get("value") or _ss.get_secret(key, "")
            lines.append(f'{key}="{val}"  # {source_tag}')
        # blank line between visually-related groups is handled by the group header

    text = "\n".join(lines) + "\n"
    return {"generated_at": datetime.now(timezone.utc).isoformat(), "reveal": reveal, "text": text}


# ---- Home hero slides CRUD ------------------------------------------------
# Registered BEFORE the parameterized /admin/{kind} catch-all so FastAPI
# routes /admin/home-slides literally instead of shadowing to kind="home-slides".
@router.get("/admin/home-slides")
async def admin_list_slides(_: str = Depends(_admin_dep)):
    docs = await _db.home_slides.find({}).sort("order", 1).to_list(100)
    return [_clean(d) for d in docs]


@router.post("/admin/home-slides")
async def admin_create_slide(slide: HomeSlideUpsert, _: str = Depends(_admin_dep)):
    doc = slide.model_dump()
    doc["id"] = f"slide-{uuid.uuid4().hex[:8]}"
    doc["created_at"] = _now_iso()
    await _db.home_slides.insert_one(doc)
    return _clean(doc)


@router.put("/admin/home-slides/{sid}")
async def admin_update_slide(sid: str, slide: HomeSlideUpsert, _: str = Depends(_admin_dep)):
    payload = slide.model_dump()
    payload["updated_at"] = _now_iso()
    res = await _db.home_slides.update_one({"id": sid}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(404, "Slide not found")
    doc = await _db.home_slides.find_one({"id": sid})
    return _clean(doc)


@router.delete("/admin/home-slides/{sid}")
async def admin_delete_slide(sid: str, _: str = Depends(_admin_dep)):
    res = await _db.home_slides.delete_one({"id": sid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Slide not found")
    return {"deleted": True}


# ============================================================================
# Catalog CRUD (catch-all patterns — registered LAST so specific routes win)
# ============================================================================

def _coll_by_kind(kind: str):
    return {"tours": _db.tours, "taxi_services": _db.taxi_services, "rentals": _db.rentals}.get(kind)


@router.post("/admin/{kind}")
async def admin_create_item(kind: str, item: ItemUpsert, admin_email: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    doc = {k: v for k, v in item.model_dump().items() if v is not None}
    doc["id"] = f"{kind[:3]}-{uuid.uuid4().hex[:8]}"
    doc["created_at"] = _now_iso()
    # Seed an initial price_history entry so audit trail starts from birth.
    doc["price_history"] = [{
        "old_price": None,
        "new_price": float(item.price),
        "reason": "Item created",
        "changed_by": admin_email,
        "changed_at": _now_iso(),
    }]
    await coll.insert_one(doc)
    return _clean(doc)


@router.get("/admin/{kind}")
async def admin_list_items(kind: str, _: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    docs = await coll.find({}).to_list(500)
    return [_clean(d) for d in docs]


@router.put("/admin/{kind}/{item_id}")
async def admin_update_item(kind: str, item_id: str, item: ItemUpsert, admin_email: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    existing = await coll.find_one({"id": item_id})
    if not existing:
        raise HTTPException(404, "Item not found")

    payload = {k: v for k, v in item.model_dump().items() if v is not None}
    payload["updated_at"] = _now_iso()

    # If price changed via the full-form save, log the change in price_history.
    update_ops: Dict[str, Any] = {"$set": payload}
    old_price = float(existing.get("price") or 0)
    new_price = float(item.price)
    if abs(old_price - new_price) > 0.001:
        update_ops["$push"] = {"price_history": {
            "old_price": old_price,
            "new_price": new_price,
            "reason": "Edited via full form",
            "changed_by": admin_email,
            "changed_at": _now_iso(),
        }}
    await coll.update_one({"id": item_id}, update_ops)
    doc = await coll.find_one({"id": item_id})
    return _clean(doc)


@router.patch("/admin/{kind}/{item_id}/price")
async def admin_update_price(kind: str, item_id: str, req: PriceUpdate, admin_email: str = Depends(_admin_dep)):
    """Dedicated price-change endpoint that appends to price_history.

    Kept separate from the full PUT so the admin UI can offer a lightweight
    'change price + reason' flow without re-sending the entire item payload.
    """
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    if req.price is None or req.price <= 0:
        raise HTTPException(422, "Price must be a positive number")
    doc = await coll.find_one({"id": item_id})
    if not doc:
        raise HTTPException(404, "Item not found")

    old_price = float(doc.get("price") or 0)
    new_price = float(req.price)
    if abs(old_price - new_price) < 0.001:
        raise HTTPException(400, "New price is identical to the current price")

    entry = {
        "old_price": old_price,
        "new_price": new_price,
        "reason": (req.reason or "").strip() or "No reason provided",
        "changed_by": admin_email,
        "changed_at": _now_iso(),
    }
    await coll.update_one(
        {"id": item_id},
        {
            "$set": {"price": new_price, "updated_at": _now_iso()},
            "$push": {"price_history": entry},
        },
    )
    doc = await coll.find_one({"id": item_id})
    return _clean(doc)


@router.get("/admin/{kind}/{item_id}/price-history")
async def admin_price_history(kind: str, item_id: str, _: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    doc = await coll.find_one({"id": item_id})
    if not doc:
        raise HTTPException(404, "Item not found")
    history = list(doc.get("price_history") or [])
    history.sort(key=lambda h: h.get("changed_at") or "", reverse=True)
    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "current_price": doc.get("price"),
        "history": history,
    }


@router.delete("/admin/{kind}/{item_id}")
async def admin_delete_item(kind: str, item_id: str, _: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    res = await coll.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Item not found")
    return {"deleted": True}
