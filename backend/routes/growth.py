"""Cruise ship schedule, bundle deals, monthly admin report and return-trip reminder texts."""
import asyncio
import hashlib
import hmac
import html
import logging
import os
import re
import uuid
from urllib.parse import quote
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
    booking_date: str = Field("", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    pickup_location: str = Field("", max_length=120)
    cruise_ship: str = Field("", max_length=60)
    notes: str = Field("", max_length=500)
    is_gift: bool = False
    gift_recipient_name: str = Field("", max_length=80)
    gift_recipient_email: str = Field("", max_length=120)
    gift_message: str = Field("", max_length=400)
    gift_send_on: str = Field("", pattern=r"^(\d{4}-\d{2}-\d{2})?$")


@router.post("/bundles/{bid}/book")
async def book_bundle(bid: str, body: BundleBookIn):
    b = await _db.bundles.find_one({"id": bid, "active": True})
    if not b:
        raise HTTPException(404, "This deal is no longer available")
    if body.is_gift:
        if len(body.gift_recipient_name.strip()) < 2 or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", body.gift_recipient_email.strip()):
            raise HTTPException(400, "Add the friend's name and a valid email")
    elif not body.booking_date:
        raise HTTPException(400, "Pick a date")
    if body.booking_date and body.booking_date < datetime.now(NASSAU).date().isoformat():
        raise HTTPException(400, "Pick today or a future date")
    if body.gift_send_on and body.gift_send_on < datetime.now(NASSAU).date().isoformat():
        raise HTTPException(400, "The gift email date must be today or later")
    base = round(float(b["bundle_price"]), 2)
    vat = round(base * 0.10, 2)
    now = datetime.now(timezone.utc).isoformat()
    booking = {
        "id": "BND-" + uuid.uuid4().hex[:7].upper(), "service_type": "bundle", "item_id": b["id"], "item_name": b["name"],
        "bundle_includes": b.get("includes") or [], **body.model_dump(), "booking_date": f"{body.booking_date}T09:00:00-05:00" if body.booking_date else None,
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


def _esc(s: str) -> str:
    return html.escape(s or "").replace("\n", "<br>")


async def send_bundle_gift(b: dict) -> bool:
    """After payment (or on the chosen delivery day): email the friend their gift (once)."""
    if b.get("gift_send_on") and b["gift_send_on"] > datetime.now(NASSAU).date().isoformat():
        return False
    claim = await _db.bookings.update_one({"id": b["id"], "is_gift": True, "gift_sent_at": None},
                                          {"$set": {"gift_sent_at": datetime.now(timezone.utc).isoformat()}})
    if not claim.modified_count:
        return False
    from notifications import send_email  # noqa: PLC0415
    to, giver = b["gift_recipient_name"].split()[0], b.get("customer_name", "A friend")
    items = "".join(f"<li style='margin:4px 0'>{_esc(i)}</li>" for i in b.get("bundle_includes") or [])
    msg = f"<blockquote style='margin:20px 0;padding:16px 20px;background:#FBF7EF;border-left:4px solid #D4A94A;font-style:italic;color:#0B3B5C'>“{_esc(b.get('gift_message'))}”<br><span style='font-style:normal;font-size:13px;color:#64748B'>— {_esc(giver)}</span></blockquote>" if b.get("gift_message") else ""
    when = f"<p>Planned date: <b>{b['booking_date'][:10]}</b></p>" if b.get("booking_date") else "<p>Choose any date that suits you using the button below.</p>"
    link = f"{_site}/gift-schedule?id={b['id']}&t={_gift_token(b['id'])}"
    body = (f"<div style='font-family:Georgia,serif;max-width:560px;margin:auto;color:#0B3B5C'>"
            f"<p style='letter-spacing:3px;font-size:11px;color:#D4A94A;text-transform:uppercase'>A gift from {_esc(giver)}</p>"
            f"<h1 style='font-size:30px;margin:8px 0'>Hi {_esc(to)}, you've been gifted {_esc(b['item_name'])}!</h1>{msg}"
            f"<p style='font-family:Arial;font-size:14px'>What's included:</p><ul style='font-family:Arial;font-size:14px'>{items}</ul>"
            f"<div style='font-family:Arial;font-size:14px'>{when}<p>Gift reference: <b>{b['id']}</b></p>"
            f"<p><a href='{link}' style='display:inline-block;background:#0B3B5C;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold'>Pick your date &amp; pickup</a></p>"
            f"<p><a href='https://wa.me/12424322587?text={quote('Hi Rox! I received gift ' + b['id'] + ' and have a question.')}' "
            f"style='color:#25D366;font-weight:bold'>Questions? WhatsApp us</a></p>"
            f"<p style='color:#64748B'>Or call +1 242 432 2587. Rox Taxi &amp; Tours, Nassau, Bahamas.</p></div></div>")
    try:
        send_email(b["gift_recipient_email"], f"{giver} sent you a Bahamas gift: {b['item_name']}", body, category="confirmation")
    except Exception as e:  # noqa: BLE001
        log.warning("bundle gift email err: %s", e)
    return True


def _gift_token(bid: str) -> str:
    secret = (os.environ.get("BOOKING_LINK_SECRET") or os.environ.get("WEBHOOK_CRON_SECRET") or "rox-gift").strip()
    return hmac.new(secret.encode(), f"bundle-gift:{bid}".encode(), hashlib.sha256).hexdigest()[:16]


async def _gift(bid: str, t: str) -> dict:
    if not hmac.compare_digest(_gift_token(bid), t or ""):
        raise HTTPException(401, "This gift link isn't valid")
    b = await _db.bookings.find_one({"id": bid, "is_gift": True, "payment_status": "paid"})
    if not b:
        raise HTTPException(404, "Gift not found")
    return b


def _gift_info(b: dict) -> dict:
    return {"id": b["id"], "item_name": b.get("item_name"), "includes": b.get("bundle_includes") or [],
            "from_name": b.get("customer_name"), "to_name": b.get("gift_recipient_name"), "message": b.get("gift_message"),
            "booking_date": b.get("booking_date"), "pickup_location": b.get("pickup_location"),
            "scheduled": bool(b.get("gift_scheduled_at"))}


@router.get("/gifts/{bid}")
async def gift_info(bid: str, t: str):
    return _gift_info(await _gift(bid, t))


class GiftScheduleIn(BaseModel):
    t: str
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    pickup_location: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=7, max_length=24)
    cruise_ship: str = Field("", max_length=60)


@router.post("/gifts/{bid}/schedule")
async def gift_schedule(bid: str, body: GiftScheduleIn):
    b = await _gift(bid, body.t)
    if b.get("gift_scheduled_at"):
        raise HTTPException(400, "Already scheduled — message us on WhatsApp to change it")
    if body.date < datetime.now(NASSAU).date().isoformat():
        raise HTTPException(400, "Pick today or a future date")
    upd = {"booking_date": f"{body.date}T{body.time}:00-05:00", "pickup_location": body.pickup_location,
           "gift_recipient_phone": body.phone, "cruise_ship": body.cruise_ship or b.get("cruise_ship", ""),
           "gift_scheduled_at": datetime.now(timezone.utc).isoformat()}
    await _db.bookings.update_one({"id": b["id"]}, {"$set": upd})
    try:
        from notifications import send_owner_sms  # noqa: PLC0415
        send_owner_sms(f"Rox: gift {b['id']} ({b.get('item_name')}) scheduled by {b.get('gift_recipient_name')} for {body.date} {body.time}, pickup {body.pickup_location}, phone {body.phone}.")
    except Exception as e:  # noqa: BLE001
        log.warning("gift schedule sms err: %s", e)
    return _gift_info({**b, **upd})


async def send_gift_reminders() -> int:
    """Friend hasn't picked a date a week after the gift email → one reminder email."""
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    from notifications import send_email  # noqa: PLC0415
    n = 0
    async for b in _db.bookings.find({"is_gift": True, "payment_status": "paid", "gift_sent_at": {"$lte": week_ago},
                                       "gift_scheduled_at": None, "gift_reminder_sent_at": None,
                                       "status": {"$ne": "cancelled"}}).limit(50):
        claim = await _db.bookings.update_one({"id": b["id"], "gift_reminder_sent_at": None},
                                              {"$set": {"gift_reminder_sent_at": datetime.now(timezone.utc).isoformat()}})
        if not claim.modified_count:
            continue
        link = f"{_site}/gift-schedule?id={b['id']}&t={_gift_token(b['id'])}"
        to, giver = b["gift_recipient_name"].split()[0], b.get("customer_name", "A friend")
        body = (f"<div style='font-family:Georgia,serif;max-width:560px;margin:auto;color:#0B3B5C'>"
                f"<p style='letter-spacing:3px;font-size:11px;color:#D4A94A;text-transform:uppercase'>Your gift is waiting</p>"
                f"<h1 style='font-size:28px;margin:8px 0'>Hi {_esc(to)}, don't forget your {_esc(b['item_name'])}!</h1>"
                f"<p style='font-family:Arial;font-size:14px'>{_esc(giver)} sent you this Bahamas gift. Pick a date and pickup whenever you're ready — it takes a minute.</p>"
                f"<p><a href='{link}' style='display:inline-block;background:#0B3B5C;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold;font-family:Arial'>Pick your date &amp; pickup</a></p>"
                f"<p style='font-family:Arial;font-size:13px;color:#64748B'>Gift reference {b['id']} · Questions? WhatsApp +1 242 432 2587.</p></div>")
        try:
            send_email(b["gift_recipient_email"], f"Reminder: your gift from {giver} is waiting", body, category="confirmation")
            n += 1
        except Exception as e:  # noqa: BLE001
            log.warning("gift reminder err: %s", e)
    return n


class TipIn(BaseModel):
    tip_amount: float = Field(..., ge=0, le=500)


@router.post("/bookings/{bid}/tip")
async def set_booking_tip(bid: str, body: TipIn):
    """Guest picks a driver tip on the pay page before paying (manual bookings)."""
    b = await _db.bookings.find_one({"id": bid})
    if not b or not b.get("tip_enabled"):
        raise HTTPException(404, "Tips aren't available for this booking")
    if b.get("payment_status") == "paid" or b.get("status") == "cancelled":
        raise HTTPException(400, "This booking can't be changed")
    old = float(b.get("tip_amount") or 0)
    tip = round(body.tip_amount, 2)
    total = round(float(b.get("total") or 0) - old + tip, 2)
    await _db.bookings.update_one({"id": bid}, {"$set": {"tip_amount": tip, "total": total,
                                                        "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"tip_amount": tip, "total": total}


async def send_due_gifts() -> int:
    now = datetime.now(NASSAU)
    if now.hour < 8:
        return 0
    await send_gift_reminders()
    n = 0
    async for b in _db.bookings.find({"is_gift": True, "payment_status": "paid", "gift_sent_at": None,
                                       "gift_send_on": {"$lte": now.date().isoformat(), "$nin": [None, ""]}}).limit(50):
        n += int(await send_bundle_gift(b))
    return n


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


# ── Home Reserve box (QuickBookWidget) settings ────────────────────────────────
class QuickbookCfg(BaseModel):
    rotate_seconds: int = Field(10, ge=0, le=120)
    featured: dict = Field(default_factory=dict)


async def _qb_cfg() -> dict:
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    feat = cfg.get("quickbook_featured") or {}
    return {"rotate_seconds": int(cfg.get("quickbook_rotate_seconds", 10)),
            "featured": {k: list(feat.get(k) or []) for k in ("taxi", "tours", "rentals")}}


@router.get("/quickbook-config")
async def quickbook_config():
    return await _qb_cfg()


@router.put("/admin/quickbook-config")
async def set_quickbook_config(body: QuickbookCfg, _=Depends(_admin)):
    if body.rotate_seconds and body.rotate_seconds < 3:
        raise HTTPException(400, "Use 0 (off) or at least 3 seconds")
    feat = {k: [str(i)[:80] for i in (body.featured.get(k) or [])][:12] for k in ("taxi", "tours", "rentals")}
    await _db.site_config.update_one({"_id": "main"}, {"$set": {
        "quickbook_rotate_seconds": body.rotate_seconds, "quickbook_featured": feat}}, upsert=True)
    return await _qb_cfg()


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


def _owner_call(message: str) -> int:
    """Ring every owner number with a spoken alarm (Twilio Voice)."""
    from notifications import _owner_sms_numbers, get_secret  # noqa: PLC0415
    sid, token, from_num = (get_secret(k, "").strip() for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"))
    if not (sid and token and from_num):
        return 0
    from twilio.rest import Client  # noqa: PLC0415
    say = html.escape(message)
    twiml = f"<Response><Say voice='alice'>{say}</Say><Pause length='1'/><Say voice='alice'>{say}</Say></Response>"
    n = 0
    for num in _owner_sms_numbers():
        try:
            Client(sid, token).calls.create(to=num, from_=from_num, twiml=twiml)
            n += 1
        except Exception as e:  # noqa: BLE001
            log.warning("owner alarm call err: %s", e)
    return n


def _pickup_dt(b: dict) -> Optional[datetime]:
    from zoneinfo import ZoneInfo  # noqa: PLC0415
    try:
        dt = datetime.fromisoformat(str(b.get("booking_date") or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.replace(tzinfo=ZoneInfo("America/Nassau")) if dt.tzinfo is None else dt


def _is_early_airport(b: dict, pick: datetime) -> Optional[str]:
    from zoneinfo import ZoneInfo  # noqa: PLC0415
    from server import _is_airport_bound  # noqa: PLC0415
    if not _is_airport_bound(b):
        return None
    if pick.astimezone(ZoneInfo("America/Nassau")).hour < 7:
        return "before 7 AM"
    try:
        created = datetime.fromisoformat(str(b.get("created_at")).replace("Z", "+00:00"))
        if (pick - created).total_seconds() < 12 * 3600:
            return "booked under 12 hours ahead"
    except ValueError:
        pass
    return None


async def send_early_airport_alarms() -> int:
    """Owner alarms for early airport trips: new short-notice alert, 9 PM night-before text, 90-min text + call."""
    from zoneinfo import ZoneInfo  # noqa: PLC0415
    from notifications import send_owner_sms  # noqa: PLC0415
    nas = ZoneInfo("America/Nassau")
    now = datetime.now(timezone.utc)
    now_local = now.astimezone(nas)
    fired = 0
    async for b in _db.bookings.find({"status": {"$nin": ["cancelled", "completed", "no_show", "pending_payment"]},
                                       "booking_date": {"$nin": [None, ""]}, "owner_alarm_done": {"$ne": True}}):
        pick = _pickup_dt(b)
        if not pick or pick < now - timedelta(minutes=10) or pick > now + timedelta(hours=36):
            continue
        why = _is_early_airport(b, pick)
        if not why:
            continue
        local = pick.astimezone(nas)
        when = local.strftime("%a %-I:%M %p")
        info = (f"{b.get('customer_name', 'Guest')} · {b.get('pickup_location') or '?'} → {b.get('dropoff_location') or b.get('item_name', '')} "
                f"· {b.get('passengers', 1)} pax · booking {b['id']}")
        mins = (pick - now).total_seconds() / 60
        stages = []
        if why.startswith("booked") and not b.get("owner_alarm_new_at"):
            stages.append(("owner_alarm_new_at", f"⏰ ROX ALERT — SHORT-NOTICE AIRPORT RIDE {when}: {info}", True))
        night_before = local.date() == (now_local + timedelta(days=1)).date() and now_local.hour >= 21
        if local.hour < 7 and (night_before or mins <= 10 * 60) and not b.get("owner_alarm_night_at"):
            stages.append(("owner_alarm_night_at", f"⏰ ROX ALERT — EARLY AIRPORT RIDE TOMORROW {when}: {info}. Set your alarm!", False))
        if mins <= 90 and not b.get("owner_alarm_90_at"):
            stages.append(("owner_alarm_90_at", f"⏰ ROX ALARM — AIRPORT PICKUP IN {int(mins)} MIN ({when}): {info}", True))
        for field, msg, call in stages:
            claim = await _db.bookings.update_one({"id": b["id"], field: None}, {"$set": {field: now.isoformat()}})
            if not claim.modified_count:
                continue
            send_owner_sms(msg[:600], kind="booking", force_priority=True)
            if call:
                spoken = f"Rox Taxi alarm. Airport pickup {when} for {b.get('customer_name', 'a guest')} at {b.get('pickup_location') or 'the pickup point'}. Booking {' '.join(b['id'])}."
                await asyncio.to_thread(_owner_call, spoken)
            fired += 1
        if b.get("owner_alarm_90_at") or any(s[0] == "owner_alarm_90_at" for s in stages):
            await _db.bookings.update_one({"id": b["id"]}, {"$set": {"owner_alarm_done": True}})
    return fired


async def return_reminder_loop():
    while True:
        try:
            await send_due_return_reminders()
            await send_due_gifts()
            await send_early_airport_alarms()
        except Exception as e:  # noqa: BLE001
            log.warning("return reminder loop err: %s", e)
        await asyncio.sleep(300)
