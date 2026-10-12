"""Arrival welcome text: 9 AM Nassau on the guest's signup arrival date, one SMS per arrival."""
import asyncio
import logging
from datetime import datetime
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


async def arrival_loop() -> None:
    while True:
        try:
            await run_once()
        except Exception as e:  # noqa: BLE001
            log.warning("arrival tick err: %s", e)
        await asyncio.sleep(900)
