"""Cruise ship schedule, bundle deals, monthly admin report and return-trip reminder texts."""
import asyncio
import logging
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

router = APIRouter()
_db = None
_require_admin = None
_site = "https://roxtaxi.com"
log = logging.getLogger(__name__)
NASSAU = timezone(timedelta(hours=-5))
CASINO_ID = "casino-wait-30"


def configure(*, db, require_admin, public_base_url: Optional[str] = None):
    global _db, _require_admin, _site
    _db, _require_admin = db, require_admin
    if public_base_url:
        _site = public_base_url.rstrip("/")


async def _admin(request: Request, authorization: Optional[str] = Header(None),
                 x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token")):
    return await _require_admin(request, authorization, x_csrf_token)


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ── Cruise ships ─────────────────────────────────────────────
class ShipIn(BaseModel):
    ship_name: str = Field(..., min_length=2, max_length=80)
    cruise_line: str = Field("", max_length=60)
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    arrive: str = Field("", max_length=8)
    depart: str = Field("", max_length=8)
    all_aboard: str = Field("", max_length=8)
    berth: str = Field("", max_length=40)


@router.get("/cruise-ships")
async def list_ships(days: int = 14):
    today = datetime.now(NASSAU).date()
    end = today + timedelta(days=max(1, min(days, 60)))
    q = {"date": {"$gte": today.isoformat(), "$lte": end.isoformat()}}
    return [_clean(s) async for s in _db.cruise_ships.find(q).sort([("date", 1), ("arrive", 1)])]


@router.get("/admin/cruise-ships")
async def admin_ships(_=Depends(_admin)):
    since = (datetime.now(NASSAU).date() - timedelta(days=7)).isoformat()
    return [_clean(s) async for s in _db.cruise_ships.find({"date": {"$gte": since}}).sort([("date", 1), ("arrive", 1)])]


@router.post("/admin/cruise-ships")
async def add_ship(body: ShipIn, _=Depends(_admin)):
    doc = {"id": uuid.uuid4().hex[:10], **body.model_dump()}
    await _db.cruise_ships.insert_one(dict(doc))
    asyncio.create_task(_ship_day_offer(doc))
    return doc


def _ship_key(name: str) -> str:
    return " ".join((name or "").lower().replace("the ", "").split())


async def _ship_day_offer(ship: dict) -> int:
    """Text past guests who sailed on this ship (one text per phone per ship-day)."""
    key = _ship_key(ship["ship_name"])
    today = datetime.now(timezone.utc).isoformat()
    phones = {}
    async for b in _db.bookings.find({"cruise_ship": {"$nin": [None, ""]}, "customer_phone": {"$nin": [None, ""]},
                                       "booking_date": {"$lt": today}, "status": {"$ne": "cancelled"}}):
        if _ship_key(b["cruise_ship"]) == key:
            phones[b["customer_phone"]] = b.get("customer_name") or "there"
    from notifications import send_sms  # noqa: PLC0415
    day = datetime.strptime(ship["date"], "%Y-%m-%d").strftime("%a %b %-d")
    sent = 0
    for phone, name in phones.items():
        tag = f"{key}|{ship['date']}|{phone}"
        try:
            await _db.ship_offers_sent.insert_one({"_id": tag, "at": today})
        except Exception:  # noqa: BLE001
            continue
        send_sms(phone, (f"Rox Taxi: Hi {name.split()[0]}, {ship['ship_name']} is back in Nassau on {day}! "
                         f"Sailing again? Book a shore trip that gets you back before all aboard: {_site}/cruise-schedule. Reply STOP to opt out.")[:320])
        sent += 1
    await _db.cruise_ships.update_one({"id": ship["id"]}, {"$set": {"offer_texts_sent": sent}})
    return sent


@router.delete("/admin/cruise-ships/{sid}")
async def del_ship(sid: str, _=Depends(_admin)):
    await _db.cruise_ships.delete_one({"id": sid})
    return {"ok": True}


# ── Bundle deals ─────────────────────────────────────────────
class BundleIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: str = Field("", max_length=300)
    includes: List[str] = Field(default_factory=list, max_length=8)
    regular_price: float = Field(..., gt=0)
    bundle_price: float = Field(..., gt=0)
    image_url: str = Field("", max_length=500)
    active: bool = True


@router.get("/bundles")
async def list_bundles():
    return [_clean(b) async for b in _db.bundles.find({"active": True}).sort("bundle_price", 1)]


@router.get("/admin/bundles")
async def admin_bundles(_=Depends(_admin)):
    return [_clean(b) async for b in _db.bundles.find({}).sort("bundle_price", 1)]


@router.post("/admin/bundles")
async def add_bundle(body: BundleIn, _=Depends(_admin)):
    if body.bundle_price >= body.regular_price:
        raise HTTPException(400, "Bundle price must be lower than the regular price")
    doc = {"id": uuid.uuid4().hex[:10], **body.model_dump()}
    await _db.bundles.insert_one(dict(doc))
    return doc


@router.put("/admin/bundles/{bid}")
async def update_bundle(bid: str, body: BundleIn, _=Depends(_admin)):
    if body.bundle_price >= body.regular_price:
        raise HTTPException(400, "Bundle price must be lower than the regular price")
    res = await _db.bundles.update_one({"id": bid}, {"$set": body.model_dump()})
    if not res.matched_count:
        raise HTTPException(404, "Bundle not found")
    return {"id": bid, **body.model_dump()}


@router.post("/admin/bundles/upload")
async def upload_bundle_photo(file: UploadFile = File(...), _=Depends(_admin)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    ct = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}.get(ext)
    if not ct:
        raise HTTPException(400, "Use a JPG, PNG or WebP photo")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Photo must be 10MB or smaller")
    from storage import put_object  # noqa: PLC0415
    name = f"bundle-{uuid.uuid4().hex[:10]}.{ext}"
    if not put_object(name, content, ct):
        raise HTTPException(503, "Storage unavailable, try again in a moment")
    return {"url": f"/api/uploads/{name}"}


@router.delete("/admin/bundles/{bid}")
async def del_bundle(bid: str, _=Depends(_admin)):
    await _db.bundles.delete_one({"id": bid})
    return {"ok": True}


class BundleBookIn(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=80)
    customer_email: str = Field(..., pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=120)
    customer_phone: str = Field(..., min_length=7, max_length=24)
    booking_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    pickup_location: str = Field("", max_length=120)
    cruise_ship: str = Field("", max_length=60)
    notes: str = Field("", max_length=500)


@router.post("/bundles/{bid}/book")
async def book_bundle(bid: str, body: BundleBookIn):
    b = await _db.bundles.find_one({"id": bid, "active": True})
    if not b:
        raise HTTPException(404, "This deal is no longer available")
    if body.booking_date < datetime.now(NASSAU).date().isoformat():
        raise HTTPException(400, "Pick today or a future date")
    base = round(float(b["bundle_price"]), 2)
    vat = round(base * 0.10, 2)
    now = datetime.now(timezone.utc).isoformat()
    booking = {
        "id": "BND-" + uuid.uuid4().hex[:7].upper(), "service_type": "bundle", "item_id": b["id"], "item_name": b["name"],
        "bundle_includes": b.get("includes") or [], **body.model_dump(), "booking_date": f"{body.booking_date}T09:00:00-05:00",
        "passengers": 1, "price": base, "subtotal_before_tax": base, "vat_pct": 0.10, "vat_amount": vat,
        "total": round(base + vat, 2), "payment_method": "stripe", "payment_status": "pending",
        "status": "pending_payment", "created_at": now, "updated_at": now,
    }
    await _db.bookings.insert_one(dict(booking))
    try:
        from notifications import send_owner_sms  # noqa: PLC0415
        send_owner_sms(f"Rox: new bundle booking {booking['id']} — {b['name']} for {body.customer_name} on {body.booking_date} (awaiting payment).")
    except Exception as e:  # noqa: BLE001
        log.warning("bundle owner sms err: %s", e)
    return {"booking_id": booking["id"], "total": booking["total"], "vat_amount": vat}


# ── Monthly report ───────────────────────────────────────────
def _month_range(month: str):
    start = datetime.strptime(month, "%Y-%m").replace(tzinfo=NASSAU)
    nxt = (start + timedelta(days=32)).replace(day=1)
    return start.astimezone(timezone.utc).isoformat(), nxt.astimezone(timezone.utc).isoformat()


@router.get("/admin/analytics/monthly-report")
async def monthly_report(month: Optional[str] = None, _=Depends(_admin)):
    month = month or datetime.now(NASSAU).strftime("%Y-%m")
    try:
        lo, hi = _month_range(month)
    except ValueError:
        raise HTTPException(400, "Month must be YYYY-MM")
    q = {"created_at": {"$gte": lo, "$lt": hi}, "payment_status": "paid", "status": {"$ne": "cancelled"}}
    by_service = defaultdict(lambda: {"count": 0, "revenue": 0.0})
    tours, weekdays, emails = Counter(), Counter(), set()
    tour_rev = defaultdict(float)
    revenue = casino_addon = casino_ext = casino_min = 0.0
    count = 0
    async for b in _db.bookings.find(q):
        total = float(b.get("total") or 0)
        count += 1
        revenue += total
        st = b.get("service_type") or "other"
        by_service[st]["count"] += 1
        by_service[st]["revenue"] += total
        if st == "tour":
            tours[b.get("item_name") or "Tour"] += 1
            tour_rev[b.get("item_name") or "Tour"] += total
        try:
            weekdays[datetime.fromisoformat(b.get("booking_date")).astimezone(NASSAU).strftime("%A")] += 1
        except (TypeError, ValueError):
            pass
        if b.get("customer_email"):
            emails.add(b["customer_email"].lower())
        for a in b.get("addons_selected") or []:
            if a.get("id") == CASINO_ID:
                casino_addon += float(a.get("fee") or a.get("price") or 0)
        for x in b.get("casino_extensions") or []:
            casino_ext += float(x.get("amount") or 0)
        casino_min += float(b.get("casino_waited_minutes") or 0)
    repeat = 0
    for e in emails:
        if await _db.bookings.count_documents({"customer_email": {"$regex": f"^{e}$", "$options": "i"}, "payment_status": "paid"}) > 1:
            repeat += 1
    return {
        "month": month, "paid_bookings": count, "revenue": round(revenue, 2),
        "avg_ticket": round(revenue / count, 2) if count else 0,
        "by_service": {k: {"count": v["count"], "revenue": round(v["revenue"], 2)} for k, v in by_service.items()},
        "top_tours": [{"name": n, "count": c, "revenue": round(tour_rev[n], 2)} for n, c in tours.most_common(5)],
        "busiest_days": [{"day": d, "count": c} for d, c in weekdays.most_common(7)],
        "casino": {"addon_income": round(casino_addon, 2), "extension_income": round(casino_ext, 2),
                   "total_income": round(casino_addon + casino_ext, 2), "waited_minutes": int(casino_min)},
        "guests": {"unique": len(emails), "repeat": repeat},
    }


# ── Return-trip reminder ─────────────────────────────────────
class ReturnCfg(BaseModel):
    enabled: bool
    hours_after: float = Field(..., ge=0.5, le=12)


async def _return_cfg() -> dict:
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    return {"enabled": bool(cfg.get("return_reminder_enabled", True)),
            "hours_after": float(cfg.get("return_reminder_hours", 3))}


@router.get("/admin/return-reminder")
async def get_return_cfg(_=Depends(_admin)):
    cfg = await _return_cfg()
    cfg["sent_last_30d"] = await _db.bookings.count_documents(
        {"return_reminder_sent_at": {"$gte": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()}})
    return cfg


@router.put("/admin/return-reminder")
async def set_return_cfg(body: ReturnCfg, _=Depends(_admin)):
    await _db.site_config.update_one({"_id": "main"}, {"$set": {
        "return_reminder_enabled": body.enabled, "return_reminder_hours": body.hours_after}}, upsert=True)
    return body.model_dump()


def _return_msg(b: dict) -> str:
    first = (b.get("customer_name") or "there").split()[0]
    where = b.get("dropoff_location") or "your stop"
    return (f"Rox Taxi: Hi {first}, need a ride back from {where}? Book in a minute at {_site}/taxi "
            f"or WhatsApp us at +1 242 432 2587.")[:300]


async def send_due_return_reminders() -> int:
    cfg = await _return_cfg()
    if not cfg["enabled"]:
        return 0
    now = datetime.now(timezone.utc)
    latest = now - timedelta(hours=cfg["hours_after"])
    q = {"service_type": "taxi", "round_trip": {"$ne": True}, "status": {"$in": ["confirmed", "en_route", "completed"]},
         "customer_phone": {"$nin": [None, ""]}, "return_reminder_sent_at": None,
         "booking_date": {"$lte": latest.isoformat(), "$gte": (latest - timedelta(hours=3)).isoformat()}}
    from notifications import send_sms  # noqa: PLC0415
    sent = 0
    async for b in _db.bookings.find(q).limit(50):
        claim = await _db.bookings.update_one({"id": b["id"], "return_reminder_sent_at": None},
                                              {"$set": {"return_reminder_sent_at": now.isoformat()}})
        if claim.modified_count:
            send_sms(b["customer_phone"], _return_msg(b))
            sent += 1
    return sent


async def return_reminder_loop():
    while True:
        try:
            await send_due_return_reminders()
        except Exception as e:  # noqa: BLE001
            log.warning("return reminder loop err: %s", e)
        await asyncio.sleep(300)
