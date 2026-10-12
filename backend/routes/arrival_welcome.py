"""Arrival welcome text (9 AM Nassau on arrival date) and departure thank-you (10 AM on leaving date)."""
import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

log = logging.getLogger(__name__)
_db = None
NASSAU = ZoneInfo("America/Nassau")
SEND_HOUR = 9
CONTACT = "+1 (242) 432-2587"


def configure(*, db):
    global _db
    _db = db


def _body(name: str, hotel: str) -> str:
    first = (name or "").split(" ")[0] or "there"
    stay = f" Enjoy your stay at {hotel}!" if hotel else ""
    return (f"Welcome to The Bahamas, {first}! 🌴 This is Rox Taxi & Tours. Need a ride, tour or beach day? "
            f"Call or WhatsApp us 24/7 at {CONTACT}.{stay} Reply STOP to opt out.")


async def run_once(now: datetime = None) -> int:
    from notifications import send_sms  # noqa: PLC0415
    now = now or datetime.now(NASSAU)
    if now.hour < SEND_HOUR:
        return 0
    today = now.date().isoformat()
    q = {"profile.travel_from": today, "profile.phone": {"$nin": [None, ""]}, "arrival_text_for": {"$ne": today}}
    sent = 0
    async for u in _db.users.find(q, {"user_id": 1, "name": 1, "profile": 1}).limit(200):
        claim = await _db.users.update_one({"user_id": u["user_id"], "arrival_text_for": {"$ne": today}},
                                           {"$set": {"arrival_text_for": today, "arrival_text_at": now.isoformat()}})
        if not claim.modified_count:
            continue
        p = u.get("profile") or {}
        try:
            res = await asyncio.to_thread(send_sms, p["phone"], _body(u.get("name"), p.get("hotel") or ""))
            ok = bool((res or {}).get("sent"))
        except Exception as e:  # noqa: BLE001
            log.warning("arrival text err: %s", e)
            ok = False
        await _db.users.update_one({"user_id": u["user_id"]}, {"$set": {"arrival_text_ok": ok}})
        sent += int(ok)
    return sent


async def _review_url() -> str:
    import os  # noqa: PLC0415
    cfg = await _db.site_config.find_one({"_id": "main"}, {"google_review_url": 1}) or {}
    return cfg.get("google_review_url") or os.environ.get("GOOGLE_REVIEW_URL") or "https://g.page/r/CYy0V1JN5XwtEAI/review"


async def _grant_return_discount(u: dict, now: datetime) -> None:
    """10% off next booking, 12 months. Keeps an unused discount that is still valid."""
    wd = u.get("welcome_discount") or {}
    if wd.get("status") == "available" and (not wd.get("expires_at") or wd["expires_at"] > now.isoformat()):
        return
    await _db.users.update_one({"user_id": u["user_id"]}, {"$set": {"welcome_discount": {
        "pct": 10, "status": "available", "source": "return_visit", "granted_at": now.isoformat(),
        "expires_at": (now + timedelta(days=365)).isoformat()}}})


def _thanks_body(name: str, review_url: str, site: str) -> str:
    first = (name or "").split(" ")[0] or "there"
    return (f"Thank you for visiting The Bahamas with Rox, {first}! Safe travels home 🌴 "
            f"Enjoyed your trip? A quick review means the world to us: {review_url} "
            f"Next time, 10% off your next booking is already on your account (valid 12 months). "
            f"Just sign in and book: {site} Reply STOP to opt out.")


async def run_departure_once(now: datetime = None) -> int:
    from notifications import send_sms  # noqa: PLC0415
    from routes.payment_digest import _site_url  # noqa: PLC0415
    now = now or datetime.now(NASSAU)
    if now.hour < SEND_HOUR + 1:
        return 0
    today = now.date().isoformat()
    q = {"profile.travel_to": today, "profile.phone": {"$nin": [None, ""]}, "departure_text_for": {"$ne": today}}
    review_url, site = await _review_url(), _site_url()
    sent = 0
    async for u in _db.users.find(q, {"user_id": 1, "name": 1, "profile": 1, "welcome_discount": 1}).limit(200):
        claim = await _db.users.update_one({"user_id": u["user_id"], "departure_text_for": {"$ne": today}},
                                           {"$set": {"departure_text_for": today, "departure_text_at": now.isoformat()}})
        if not claim.modified_count:
            continue
        await _grant_return_discount(u, now)
        try:
            res = await asyncio.to_thread(send_sms, u["profile"]["phone"], _thanks_body(u.get("name"), review_url, site))
            ok = bool((res or {}).get("sent"))
        except Exception as e:  # noqa: BLE001
            log.warning("departure text err: %s", e)
            ok = False
        await _db.users.update_one({"user_id": u["user_id"]}, {"$set": {"departure_text_ok": ok}})
        sent += int(ok)
    return sent


async def arrival_loop() -> None:
    while True:
        try:
            await run_once()
            await run_departure_once()
        except Exception as e:  # noqa: BLE001
            log.warning("arrival tick err: %s", e)
        await asyncio.sleep(900)
