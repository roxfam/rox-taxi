"""Day-of reminders: at 12:00 AM Nassau, guests get email + SMS for today's
booking and owners get one SMS + email listing every booking for the day."""
from typing import Optional
import asyncio
import html as _html
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, Request

from routes.payment_digest import NASSAU, _admin_emails, _site_url

INACTIVE = ["cancelled", "completed", "no_show"]

_db = None
_require_admin = None
_now_iso = None

router = APIRouter()
log = logging.getLogger("rox.dayof")


def configure(*, db, require_admin, now_iso):
    global _db, _require_admin, _now_iso  # noqa: PLW0603
    _db = db
    _require_admin = require_admin
    _now_iso = now_iso


async def _admin_dep(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
):
    return await _require_admin(request, authorization, x_csrf_token)


def _local_dt(raw) -> Optional[datetime]:
    """Naive booking dates are entered as Nassau local time."""
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return dt.replace(tzinfo=NASSAU) if dt.tzinfo is None else dt.astimezone(NASSAU)


async def todays_bookings() -> list:
    today = datetime.now(NASSAU).date()
    out = []
    async for b in _db.bookings.find({"status": {"$nin": INACTIVE}}, {"_id": 0}):
        dt = _local_dt(b.get("booking_date"))
        if dt and dt.date() == today:
            b["_local"] = dt
            out.append(b)
    out.sort(key=lambda x: x["_local"])
    return out


def _time(b) -> str:
    return b["_local"].strftime("%-I:%M %p")


def _guest_reminder(b: dict) -> dict:
    from notifications import send_email, send_sms  # noqa: PLC0415
    first = (b.get("customer_name") or "there").split(" ")[0] or "there"
    item = b.get("item_name") or "your Rox booking"
    pickup = b.get("pickup_location") or ""
    track = f"{_site_url()}/track?id={b['id']}"
    unpaid = (b.get("payment_status") or "") not in ("paid", "refunded")
    pay_line = f"Balance due — pay here: {_site_url()}/pay/{b['id']}\n" if unpaid else ""
    report = {"email": {"sent": False}, "sms": {"sent": False}}
    if b.get("customer_email"):
        e = _html.escape
        pay_html = (f'<a href="{_site_url()}/pay/{b["id"]}" style="display:block;margin-top:10px;background:#E86A3C;color:#fff;'
                    f'text-decoration:none;text-align:center;font-weight:700;padding:12px;border-radius:999px;">Pay balance →</a>'
                    if unpaid else "")
        html = f"""<!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;">
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;background:#FAF9F6;">
<div style="background:linear-gradient(135deg,#0B3B5C,#132a4a);padding:30px;color:#fff;">
<div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#D4A94A;font-weight:800;">Today's the day</div>
<h1 style="font-family:Georgia,serif;margin:10px 0 0;font-size:26px;">{e(first)}, see you today at {_time(b)}!</h1></div>
<div style="padding:22px 30px;"><div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;">
<div style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#64748B;font-weight:700;">Booking {b['id']}</div>
<div style="color:#0B3B5C;font-size:17px;font-weight:700;margin-top:4px;">{e(item)}</div>
<div style="color:#64748B;font-size:13px;margin-top:6px;">{_time(b)}{' · ' + e(pickup) if pickup else ''}</div></div>
<a href="{track}" style="display:block;margin-top:16px;background:#0B3B5C;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:12px;border-radius:999px;">Track your driver →</a>
{pay_html}
<p style="color:#64748B;font-size:11px;text-align:center;margin-top:12px;">Need a change? WhatsApp +1 (242) 432-2587.</p></div></div></body></html>"""
        text = (f"Hi {first}, reminder: {item} is TODAY at {_time(b)}"
                f"{' from ' + pickup if pickup else ''}. Booking {b['id']}.\n{pay_line}Track: {track}")
        report["email"] = send_email(b["customer_email"], f"Today at {_time(b)}: {item} · {b['id']}",
                                     html, text, category="confirmation")
    if b.get("customer_phone"):
        sms = (f"Rox: Hi {first}! Reminder — {item} is today at {_time(b)}"
               f"{' from ' + pickup if pickup else ''}. Ref {b['id']}. {pay_line}Track: {track}")
        report["sms"] = send_sms(b["customer_phone"], sms[:600])
    return report


async def send_guest_reminders(bookings: list) -> int:
    sent = 0
    for b in bookings:
        claimed = await _db.bookings.update_one(
            {"id": b["id"], "dayof_reminder_sent_at": {"$exists": False}},
            {"$set": {"dayof_reminder_sent_at": _now_iso()}},
        )
        if not claimed.modified_count:
            continue
        try:
            report = await asyncio.to_thread(_guest_reminder, b)
            await _db.bookings.update_one({"id": b["id"]}, {"$set": {"dayof_reminder_result": report}})
            sent += 1
        except Exception as e:  # noqa: BLE001
            log.warning("dayof guest reminder %s err: %s", b.get("id"), e)
    return sent


def _owner_lines(bookings: list) -> list:
    return [f"{_time(b)} · {b.get('item_name', '')} · {(b.get('customer_name') or 'guest')} "
            f"({b.get('passengers', 1)} pax) · {b['id']}"
            f"{'' if (b.get('payment_status') in ('paid', 'refunded')) else ' · UNPAID'}"
            for b in bookings]


async def send_owner_list(bookings: list) -> dict:
    from notifications import send_email, send_owner_sms  # noqa: PLC0415
    day = datetime.now(NASSAU).strftime("%a %b %-d")
    lines = _owner_lines(bookings)
    sms = f"Rox today {day}: {len(bookings)} booking(s)\n" + ("\n".join(lines) if lines else "No bookings today.")
    rows = "".join(f'<li style="padding:6px 0;border-bottom:1px solid #E2E8F0;">{_html.escape(x)}</li>' for x in lines)
    html = (f'<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;">'
            f'<div style="background:#0B3B5C;color:#fff;padding:22px;"><div style="font-size:10px;letter-spacing:.3em;'
            f'color:#D4A94A;font-weight:800;text-transform:uppercase;">Today\'s bookings</div>'
            f'<h1 style="font-family:Georgia,serif;margin:6px 0 0;font-size:22px;">{day} · {len(bookings)} booking(s)</h1></div>'
            f'<ul style="list-style:none;padding:16px 22px;margin:0;font-size:14px;color:#0B3B5C;">'
            f'{rows or "<li>No bookings today.</li>"}</ul>'
            f'<p style="padding:0 22px;font-size:12px;color:#64748B;">Dashboard: {_site_url()}/admin</p></div>')
    emails = []
    for e in _admin_emails():
        r = await asyncio.to_thread(send_email, e, f"Rox today {day} · {len(bookings)} booking(s)", html, sms, category="admin")
        emails.append({"to": e, "sent": bool(r.get("sent")), "error": r.get("error")})
    sms_r = await asyncio.to_thread(send_owner_sms, sms[:1500], "booking", True)
    return {"count": len(bookings), "emails": emails, "sms_sent": bool(sms_r.get("sent")), "sms_error": sms_r.get("error")}


async def run_dayof(force_owner: bool = False) -> Optional[dict]:
    today = datetime.now(NASSAU).date().isoformat()
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    if not force_owner and cfg.get("dayof_last_date") == today:
        return None
    await _db.site_config.update_one({"_id": "main"}, {"$set": {"dayof_last_date": today}}, upsert=True)
    bookings = await todays_bookings()
    guests = await send_guest_reminders(bookings)
    if not bookings:
        owner = {"count": 0, "emails": [], "sms_sent": False, "sms_error": None, "skipped": "no bookings today"}
    else:
        owner = await send_owner_list(bookings)
    result = {"date": today, "guest_reminders_sent": guests, **owner}
    await _db.cron_runs.update_one({"kind": "dayof_reminders"},
                                   {"$set": {"last_run_at": _now_iso(), "last_result": result}}, upsert=True)
    return result


async def dayof_loop() -> None:
    while True:
        try:
            await run_dayof()
        except Exception as e:  # noqa: BLE001
            log.warning("dayof tick err: %s", e)
        await asyncio.sleep(120)


@router.get("/admin/dayof-reminders/preview")
async def admin_dayof_preview(_: str = Depends(_admin_dep)):
    bookings = await todays_bookings()
    run = await _db.cron_runs.find_one({"kind": "dayof_reminders"}, {"_id": 0}) or {}
    return {
        "schedule": "Daily at 12:00 AM Nassau time",
        "today": [{"id": b["id"], "time": _time(b), "item_name": b.get("item_name"),
                   "customer_name": b.get("customer_name"),
                   "reminded": bool(b.get("dayof_reminder_sent_at"))} for b in bookings],
        "last_run": run,
    }


@router.post("/admin/dayof-reminders/send-now")
async def admin_dayof_send_now(_: str = Depends(_admin_dep)):
    """Re-sends the owner list; guests already reminded today are skipped."""
    return await run_dayof(force_owner=True)
