"""Welcome-offer email on signup + 3-day reminder if the 10% is still unused."""
import asyncio
import html as _html
import logging
from datetime import datetime, timedelta, timezone

from routes.payment_digest import _site_url

log = logging.getLogger(__name__)
_db = None
REMINDER_AFTER_DAYS = 3


def configure(*, db):
    global _db
    _db = db


def _email_html(name: str, reminder: bool) -> str:
    url = f"{_site_url()}/taxi"
    hi = _html.escape(name.split(" ")[0]) if name else "there"
    lead = ("Just a friendly reminder — your 10% welcome discount is still waiting for you."
            if reminder else
            "Welcome to Rox Taxi &amp; Tours! As a thank-you for joining, your next ride or tour is 10% off.")
    return f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0F172A">
  <div style="background:#0B3B5C;color:#fff;padding:24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:22px">Your 10% off is waiting</h1>
  </div>
  <div style="border:1px solid #E2E8F0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
    <p>Hi {hi},</p>
    <p>{lead}</p>
    <p>The discount is already on your account and applies automatically at checkout when you're signed in — no code needed. Limited-time offer.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="{url}" style="background:#E86A3C;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:bold">Book Now</a>
    </p>
    <p style="color:#64748B;font-size:12px">See you in Nassau &amp; Paradise Island!</p>
  </div>
</div>"""


def _send(email: str, name: str, reminder: bool) -> bool:
    from notifications import send_email  # noqa: PLC0415
    subject = "Reminder: your 10% off is still waiting" if reminder else "Welcome! Your 10% off is waiting"
    text = f"Your 10% welcome discount applies automatically at checkout. Book now: {_site_url()}/taxi"
    try:
        res = send_email(email, subject, _email_html(name, reminder), text=text, category="info")
        return bool((res or {}).get("sent"))
    except Exception as e:  # noqa: BLE001
        log.warning("welcome email err: %s", e)
        return False


async def send_welcome(user_id: str) -> None:
    u = await _db.users.find_one({"user_id": user_id}, {"email": 1, "name": 1})
    if not u:
        return
    ok = await asyncio.to_thread(_send, u["email"], u.get("name") or "", False)
    await _db.users.update_one({"user_id": user_id}, {"$set": {
        "welcome_email_sent_at": datetime.now(timezone.utc).isoformat(), "welcome_email_ok": ok}})


async def run_reminders() -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=REMINDER_AFTER_DAYS)).isoformat()
    q = {"welcome_discount.status": "available", "welcome_email_sent_at": {"$lte": cutoff},
         "welcome_reminder_sent_at": {"$exists": False}}
    sent = 0
    async for u in _db.users.find(q, {"user_id": 1, "email": 1, "name": 1}).limit(50):
        claim = await _db.users.update_one(
            {"user_id": u["user_id"], "welcome_reminder_sent_at": {"$exists": False}},
            {"$set": {"welcome_reminder_sent_at": datetime.now(timezone.utc).isoformat()}})
        if claim.modified_count and await asyncio.to_thread(_send, u["email"], u.get("name") or "", True):
            sent += 1
    return sent


async def reminder_loop() -> None:
    while True:
        try:
            await run_reminders()
        except Exception as e:  # noqa: BLE001
            log.warning("welcome reminder tick err: %s", e)
        await asyncio.sleep(900)
