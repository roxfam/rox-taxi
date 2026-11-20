"""Send trip sheets (no prices) to drivers, plus pickup reminder nudges (night before, 1 h, 15 min)."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from phone_utils import Phone

NASSAU = ZoneInfo("America/Nassau")
ACTIVE = ["confirmed", "driver_assigned", "en_route"]
_db = None
_require_admin = None
_now_iso = None
router = APIRouter()
log = logging.getLogger("rox.driver")


def configure(*, db, require_admin, now_iso):
    global _db, _require_admin, _now_iso  # noqa: PLW0603
    _db, _require_admin, _now_iso = db, require_admin, now_iso


async def _admin_dep(request: Request, authorization: Optional[str] = Header(None),
                     x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token")):
    return await _require_admin(request, authorization, x_csrf_token)


def _when(b: dict) -> Optional[datetime]:
    try:
        t = datetime.fromisoformat(str(b.get("booking_date") or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    return t.replace(tzinfo=NASSAU) if t.tzinfo is None else t


def trip_sheet(b: dict, header: str) -> str:
    t = _when(b)
    when = t.astimezone(NASSAU).strftime("%a %b %d, %I:%M %p") if t else str(b.get("booking_date") or "")
    route = " -> ".join(p for p in [b.get("pickup_location"), *(b.get("stops") or []), b.get("dropoff_location")] if p)
    extras = [f"{b.get('passengers') or 1} pax"]
    if b.get("extra_luggage"):
        extras.append(f"{b['extra_luggage']} extra bags")
    if b.get("car_seats"):
        extras.append(f"{b['car_seats']} baby seat(s)")
    lines = [header, f"#{b['id']} {b.get('item_name') or ''}", f"Pickup: {when}"]
    if b.get("admin_saturday"):
        lines.insert(1, "** SATURDAY - ADMIN BOOKED (special trip) **")
    if b.get("admin_blackout"):
        lines.insert(1, "** HOLIDAY/BLACKOUT DAY - ADMIN APPROVED **")
    if b.get("dropoff_time"):
        try:
            drop = datetime.strptime(b["dropoff_time"], "%H:%M").strftime("%I:%M %p").lstrip("0")
        except ValueError:
            drop = b["dropoff_time"]
        lines.append(f"Drop-off time: {drop}")
    if route:
        lines.append(f"Route: {route}")
    lines.append(f"Guest: {b.get('customer_name') or ''} {b.get('customer_phone') or ''}".strip())
    lines.append(" · ".join(extras))
    if b.get("flight_number"):
        lines.append(f"Flight: {b['flight_number']}")
    if b.get("notes"):
        lines.append(f"Notes: {str(b['notes'])[:160]}")
    return "\n".join(lines)


async def _deliver(b: dict, body: str) -> dict:
    from notifications import send_sms, notify_owner_activity  # noqa: PLC0415
    if b.get("driver_phone"):
        r = await asyncio.to_thread(send_sms, b["driver_phone"], body[:900])
        return {"to": "driver", "sent": bool(r.get("sent")), "error": r.get("error")}
    r = await asyncio.to_thread(notify_owner_activity, "driver_dispatch", body[:900])
    return {"to": "admin", "sent": True, "detail": r}


class SendToDriver(BaseModel):
    driver_name: Optional[str] = Field(None, max_length=64)
    driver_phone: Optional[Phone] = Field(None, max_length=32)


@router.get("/admin/drivers")
async def admin_drivers(_admin=Depends(_admin_dep)):
    cfg = await _db.site_config.find_one({"_id": "main"}, {"backup_drivers": 1}) or {}
    return [{"name": d.get("name"), "phone": d.get("phone")} for d in (cfg.get("backup_drivers") or []) if d.get("phone")]


@router.post("/admin/bookings/{booking_id}/send-to-driver")
async def send_to_driver(booking_id: str, req: SendToDriver, admin=Depends(_admin_dep)):
    b = await _db.bookings.find_one({"id": booking_id.upper()}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    upd = {"driver_sent_at": _now_iso(), "updated_at": _now_iso()}
    if req.driver_phone and req.driver_phone.strip():
        upd.update({"driver_phone": req.driver_phone.strip(), "driver_name": (req.driver_name or "").strip() or "Driver",
                    "assigned_driver": (req.driver_name or "").strip() or "Driver", "driver_nudges": []})
        if b.get("status") == "confirmed":
            upd["status"] = "driver_assigned"
    b.update(upd)
    res = await _deliver(b, trip_sheet(b, "ROX TRIP" if b.get("driver_phone") else "ROX TRIP (no driver picked)"))
    await _db.bookings.update_one({"id": b["id"]}, {"$set": upd, "$push": {"driver_dispatch_log": {"at": _now_iso(), "by": admin, **res}}})
    return res


async def run_driver_nudges() -> int:
    now = datetime.now(timezone.utc)
    today = now.astimezone(NASSAU).date()
    days = "|".join(d.isoformat() for d in (today, today + timedelta(days=1)))
    sent = 0
    async for b in _db.bookings.find({"status": {"$in": ACTIVE}, "service_type": {"$ne": "rental"},
                                      "booking_date": {"$regex": f"^({days})"}}, {"_id": 0}):
        t = _when(b)
        if not t or now >= t:
            continue
        done = set(b.get("driver_nudges") or [])
        night = datetime.combine(t.astimezone(NASSAU).date() - timedelta(days=1), datetime.min.time(), NASSAU).replace(hour=20)
        plan = [("night", night, "TOMORROW'S PICKUP"), ("1h", t - timedelta(hours=1), "PICKUP IN 1 HOUR"),
                ("15m", t - timedelta(minutes=15), "PICKUP IN 15 MIN")]
        for key, due, head in plan:
            if key in done or now < due or (key == "night" and now >= t - timedelta(hours=1)) or (key == "1h" and now >= t - timedelta(minutes=15)):
                continue
            await _deliver(b, trip_sheet(b, f"REMINDER: {head}"))
            await _db.bookings.update_one({"id": b["id"]}, {"$addToSet": {"driver_nudges": key}})
            sent += 1
            break
    return sent


async def driver_nudge_loop() -> None:
    await asyncio.sleep(30)
    while True:
        try:
            await run_driver_nudges()
        except Exception as e:  # noqa: BLE001
            log.warning("driver nudge tick err: %s", e)
        await asyncio.sleep(60)
