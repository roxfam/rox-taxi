"""Day-of reminders: at 12:00 AM Nassau, guests get email + SMS for today's
booking and owners get one SMS + email listing every booking for the day."""
from typing import Optional
import asyncio
import html as _html
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, Request, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

import secrets_store

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
               f"{' from ' + pickup if pickup else ''}. Ref {b['id']}. {pay_line}Reply YES to confirm. Track: {track}")
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
        try:
            await run_unconfirmed_alert()
        except Exception as e:  # noqa: BLE001
            log.warning("unconfirmed alert tick err: %s", e)
        await asyncio.sleep(120)


UNCONFIRMED_ALERT_HOUR = 9


async def run_unconfirmed_alert(force: bool = False) -> Optional[dict]:
    """9 AM Nassau: SMS owners today's reminded guests who haven't replied YES. Skips if none."""
    now_local = datetime.now(NASSAU)
    today = now_local.date().isoformat()
    if not force:
        if now_local.hour < UNCONFIRMED_ALERT_HOUR:
            return None
        cfg = await _db.site_config.find_one({"_id": "main"}) or {}
        if cfg.get("unconfirmed_alert_last_date") == today:
            return None
        await _db.site_config.update_one({"_id": "main"}, {"$set": {"unconfirmed_alert_last_date": today}}, upsert=True)
    pending = [b for b in await todays_bookings()
               if b.get("customer_phone") and not b.get("guest_confirmed_at")]
    result = {"date": today, "count": len(pending), "sms_sent": False}
    if pending:
        from notifications import send_owner_sms  # noqa: PLC0415
        lines = [f"{_time(b)} · {b.get('customer_name') or 'guest'} · {b.get('customer_phone')} · {b['id']}"
                 for b in pending]
        body = f"Rox: {len(pending)} guest(s) today haven't replied YES:\n" + "\n".join(lines)
        r = await asyncio.to_thread(send_owner_sms, body[:1500], "booking", True)
        result["sms_sent"] = bool(r.get("sent"))
    await _db.cron_runs.update_one({"kind": "unconfirmed_alert"},
                                   {"$set": {"last_run_at": _now_iso(), "last_result": result}}, upsert=True)
    return result


@router.get("/admin/dayof-reminders/preview")
async def admin_dayof_preview(_: str = Depends(_admin_dep)):
    bookings = await todays_bookings()
    run = await _db.cron_runs.find_one({"kind": "dayof_reminders"}, {"_id": 0}) or {}
    return {
        "schedule": "Daily at 12:00 AM Nassau time",
        "today": [{"id": b["id"], "time": _time(b), "item_name": b.get("item_name"),
                   "customer_name": b.get("customer_name"),
                   "confirmed": bool(b.get("guest_confirmed_at")),
                   "reminded": bool(b.get("dayof_reminder_sent_at"))} for b in bookings],
        "last_run": run,
    }


@router.post("/admin/dayof-reminders/send-now")
async def admin_dayof_send_now(_: str = Depends(_admin_dep)):
    """Re-sends the owner list; guests already reminded today are skipped."""
    return await run_dayof(force_owner=True)


# ─── Inbound guest SMS (Twilio Messaging webhook) ──────────────────────────
YES_WORDS = {"yes", "y", "yes!", "yep", "yeah", "confirm", "confirmed", "ok", "okay"}


def _digits(p) -> str:
    return "".join(c for c in str(p or "") if c.isdigit())[-10:]


def _twiml(msg: str = "") -> Response:
    body = f"<Message>{_html.escape(msg)}</Message>" if msg else ""
    return Response(f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>',
                    media_type="application/xml")


def _valid_twilio(request: Request, params: dict) -> bool:
    from twilio.request_validator import RequestValidator  # noqa: PLC0415
    token = (secrets_store.get_secret("TWILIO_AUTH_TOKEN", "") or "").strip()
    sig = request.headers.get("X-Twilio-Signature", "")
    if not token or not sig:
        return False
    v = RequestValidator(token)
    urls = {f"{_site_url()}{request.url.path}", str(request.url),
            str(request.url).replace("http://", "https://", 1)}
    return any(v.validate(u, params, sig) for u in urls)


async def _match_booking(phone: str) -> Optional[dict]:
    key = _digits(phone)
    if len(key) < 7:
        return None
    today = datetime.now(NASSAU).date()
    best = None
    async for b in _db.bookings.find({"status": {"$nin": INACTIVE}, "customer_phone": {"$exists": True}}, {"_id": 0}):
        if _digits(b.get("customer_phone")) != key:
            continue
        dt = _local_dt(b.get("booking_date"))
        if not dt or dt.date() < today:
            continue
        if best is None or dt < best[0]:
            best = (dt, b)
    return best[1] if best else None


@router.post("/webhooks/twilio/sms")
async def twilio_inbound_sms(request: Request):
    form = await request.form()
    params = {k: v for k, v in form.items()}
    if not _valid_twilio(request, params):
        log.warning("twilio inbound: bad signature")
        return Response(status_code=403)
    from_num = params.get("From", "")
    text = (params.get("Body") or "").strip()
    b = await _match_booking(from_num)
    from notifications import send_owner_sms  # noqa: PLC0415
    await _db.inbound_sms.insert_one({"from": from_num, "body": text[:1000], "direction": "in",
                                      "phone_key": _digits(from_num), "read": False,
                                      "booking_id": (b or {}).get("id"),
                                      "customer_name": (b or {}).get("customer_name"),
                                      "received_at": _now_iso()})
    if b and text.lower().strip(" .!") in YES_WORDS | {w.strip("!") for w in YES_WORDS}:
        await _db.bookings.update_one(
            {"id": b["id"]},
            {"$set": {"guest_confirmed_at": _now_iso(), "guest_confirmed_via": "sms"}},
        )
        await asyncio.to_thread(
            send_owner_sms,
            f"Rox: {b.get('customer_name', 'Guest')} CONFIRMED {b['id']} ({b.get('item_name', '')}) by text.",
            "booking",
        )
        return _twiml(f"Thanks! Your Rox booking {b['id']} is confirmed. See you soon!")
    who = f"{b.get('customer_name', 'Guest')} ({b['id']})" if b else from_num
    await asyncio.to_thread(send_owner_sms, f"Rox: text from {who}: {text[:300]}", "booking")
    return _twiml()


# ─── Admin guest-text inbox ─────────────────────────────────────────────────────────────
@router.get("/admin/guest-sms/inbox")
async def admin_sms_inbox(_: str = Depends(_admin_dep)):
    threads: dict = {}
    async for m in _db.inbound_sms.find({}, {"_id": 0}).sort("received_at", -1).limit(2000):
        key = m.get("phone_key") or _digits(m.get("from"))
        t = threads.setdefault(key, {"phone_key": key, "phone": m.get("from") if m.get("direction", "in") == "in" else m.get("to"),
                                     "last_body": m.get("body"), "last_at": m.get("received_at"),
                                     "last_direction": m.get("direction", "in"), "unread": 0,
                                     "booking_id": None, "customer_name": None})
        if m.get("direction", "in") == "in":
            t["phone"] = t["phone"] or m.get("from")
            if not m.get("read"):
                t["unread"] += 1
        t["booking_id"] = t["booking_id"] or m.get("booking_id")
        t["customer_name"] = t["customer_name"] or m.get("customer_name")
    return {"threads": list(threads.values()),
            "unread_total": sum(t["unread"] for t in threads.values())}


@router.get("/admin/guest-sms/thread/{phone_key}")
async def admin_sms_thread(phone_key: str, _: str = Depends(_admin_dep)):
    msgs = await _db.inbound_sms.find({"$or": [{"phone_key": phone_key}, {"from": {"$regex": f"{phone_key}$"}}]},
                                      {"_id": 0}).sort("received_at", 1).to_list(500)
    await _db.inbound_sms.update_many({"phone_key": phone_key, "read": False}, {"$set": {"read": True}})
    return {"phone_key": phone_key, "messages": msgs}


class SmsReply(BaseModel):
    to: str
    body: str


# ─── Admin booking edit + manual guest confirm ───────────────────────────────────────────────────────────
class BookingEdit(BaseModel):
    customer_name: Optional[str] = Field(None, max_length=120)
    customer_email: Optional[str] = Field(None, max_length=200)
    customer_phone: Optional[str] = Field(None, max_length=40)
    booking_date: Optional[str] = Field(None, max_length=40)
    pickup_location: Optional[str] = Field(None, max_length=300)
    dropoff_location: Optional[str] = Field(None, max_length=300)
    passengers: Optional[int] = Field(None, ge=1, le=60)
    notes: Optional[str] = Field(None, max_length=2000)
    total: Optional[float] = Field(None, ge=0, le=100000)
    notify_guest: bool = True


NOTIFY_FIELDS = {"booking_date": "Date & time", "pickup_location": "Pickup", "dropoff_location": "Drop-off"}


def _change_notice(b: dict, changed: list) -> dict:
    """Email + SMS the guest that their date/time/pickup changed."""
    from notifications import send_email, send_sms  # noqa: PLC0415
    first = (b.get("customer_name") or "there").split(" ")[0] or "there"
    item = b.get("item_name") or "your Rox booking"
    dt = _local_dt(b.get("booking_date"))
    when = dt.strftime("%a %b %-d at %-I:%M %p") if dt else ""
    pickup = b.get("pickup_location") or ""
    dropoff = b.get("dropoff_location") or ""
    what = ", ".join(NOTIFY_FIELDS[c].lower() for c in changed)
    track = f"{_site_url()}/track?id={b['id']}"
    report = {"email": {"sent": False}, "sms": {"sent": False}, "changed": changed}
    if b.get("customer_email"):
        e = _html.escape
        rows = "".join(
            f'<tr><td style="padding:6px 0;color:#64748B;font-size:12px;">{lbl}</td>'
            f'<td style="padding:6px 0;color:#0B3B5C;font-weight:700;text-align:right;">{e(val)}</td></tr>'
            for lbl, val in (("Date & time", when), ("Pickup", pickup), ("Drop-off", dropoff)) if val)
        html = f"""<!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;">
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;background:#FAF9F6;">
<div style="background:linear-gradient(135deg,#0B3B5C,#132a4a);padding:30px;color:#fff;">
<div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#D4A94A;font-weight:800;">Booking updated</div>
<h1 style="font-family:Georgia,serif;margin:10px 0 0;font-size:24px;">{e(first)}, we've updated your {e(what)}.</h1></div>
<div style="padding:22px 30px;"><div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;">
<div style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#64748B;font-weight:700;">Booking {b['id']}</div>
<div style="color:#0B3B5C;font-size:17px;font-weight:700;margin:4px 0 10px;">{e(item)}</div>
<table style="width:100%;border-collapse:collapse;">{rows}</table></div>
<a href="{track}" style="display:block;margin-top:16px;background:#0B3B5C;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:12px;border-radius:999px;">View your booking →</a>
<p style="color:#64748B;font-size:11px;text-align:center;margin-top:12px;">Something not right? WhatsApp +1 (242) 432-2587.</p></div></div></body></html>"""
        text = (f"Hi {first}, we've updated your {what} for {item} (booking {b['id']}).\n"
                f"{'When: ' + when + chr(10) if when else ''}{'Pickup: ' + pickup + chr(10) if pickup else ''}"
                f"View: {track}")
        report["email"] = send_email(b["customer_email"], f"Updated: your Rox booking {b['id']}", html, text,
                                     category="confirmation")
    if b.get("customer_phone"):
        sms = (f"Rox: Hi {first}, your booking {b['id']} was updated — "
               f"{when}{' from ' + pickup if pickup else ''}. Reply YES to confirm. {track}")
        report["sms"] = send_sms(b["customer_phone"], sms[:600])
    return report


@router.patch("/admin/bookings/{booking_id}/details")
async def admin_edit_booking(booking_id: str, req: BookingEdit, admin: str = Depends(_admin_dep)):
    b = await _db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    changes = {k: v for k, v in req.model_dump(exclude_none=True).items() if k != "notify_guest"}
    if "booking_date" in changes and not _local_dt(changes["booking_date"]):
        raise HTTPException(400, "Invalid date/time")
    if "total" in changes:
        amount = round(changes.pop("total"), 2)
        changes["total_price" if ("total_price" in b and "total" not in b) else "total"] = amount
    diff = {k: {"from": b.get(k), "to": v} for k, v in changes.items() if b.get(k) != v}
    if not diff:
        return {"updated": False, "booking": b}
    update = {"$set": changes, "$push": {"edit_history": {"at": _now_iso(), "by": admin, "changes": diff}}}
    if "booking_date" in diff:
        update["$unset"] = {"dayof_reminder_sent_at": ""}
    await _db.bookings.update_one({"id": booking_id}, update)
    fresh = await _db.bookings.find_one({"id": booking_id}, {"_id": 0})
    notice = None
    notify_changed = [k for k in NOTIFY_FIELDS if k in diff]
    if req.notify_guest and notify_changed and fresh.get("status") not in INACTIVE:
        notice = await asyncio.to_thread(_change_notice, fresh, notify_changed)
        await _db.bookings.update_one({"id": booking_id}, {"$set": {"change_notice_last": {"at": _now_iso(), **notice}}})
    return {"updated": True, "changed": list(diff), "booking": fresh,
            "guest_notified": bool(notice and (notice["email"].get("sent") or notice["sms"].get("sent")))}


class GuestConfirm(BaseModel):
    confirmed: bool = True


class ManualBooking(BaseModel):
    service_type: str = Field(..., pattern="^(taxi|tour|rental|cable_beach|other)$")
    item_id: Optional[str] = Field(None, max_length=80)
    item_name: str = Field(..., min_length=1, max_length=200)
    customer_name: str = Field(..., min_length=1, max_length=120)
    customer_email: Optional[str] = Field(None, max_length=200)
    customer_phone: Optional[str] = Field(None, max_length=40)
    booking_date: str = Field(..., max_length=40)
    pickup_location: Optional[str] = Field(None, max_length=300)
    dropoff_location: Optional[str] = Field(None, max_length=300)
    passengers: int = Field(1, ge=1, le=60)
    flight_number: Optional[str] = Field(None, max_length=12)
    notes: Optional[str] = Field(None, max_length=2000)
    total: float = Field(..., ge=0, le=100000)
    payment: str = Field("unpaid", pattern="^(unpaid|cash|zelle|card_offline)$")
    send_confirmation: bool = True
    send_pay_link: bool = False


@router.post("/admin/bookings/manual")
async def admin_create_booking(req: ManualBooking, admin: str = Depends(_admin_dep)):
    import uuid  # noqa: PLC0415
    if not _local_dt(req.booking_date):
        raise HTTPException(400, "Invalid date/time")
    if (req.send_confirmation or req.send_pay_link) and not (req.customer_email or "").strip():
        raise HTTPException(400, "Guest email is required to send a confirmation or pay link")
    paid = req.payment != "unpaid"
    doc = {k: v for k, v in req.model_dump().items() if k not in ("payment", "send_confirmation", "send_pay_link")}
    doc.update({
        "id": str(uuid.uuid4())[:8].upper(),
        "item_id": req.item_id or "",
        "price": req.total,
        "status": "confirmed",
        "payment_method": "stripe" if req.payment == "unpaid" else req.payment,
        "payment_status": "paid" if paid else "pending",
        "paid_at": _now_iso() if paid else None,
        "source": "admin_manual",
        "created_by": admin,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "status_history": [{"status": "confirmed", "at": _now_iso(), "by": admin, "note": "Created by admin"}],
    })
    await _db.bookings.insert_one(dict(doc))
    doc.pop("_id", None)
    report = {}
    from notifications import notify_booking_confirmed  # noqa: PLC0415
    if req.send_confirmation:
        report["confirmation"] = await asyncio.to_thread(notify_booking_confirmed, dict(doc), {})
    if req.send_pay_link and not paid:
        from routes.admin import admin_send_payment_email, SendPaymentEmailRequest  # noqa: PLC0415
        try:
            report["pay_link"] = await admin_send_payment_email(doc["id"], SendPaymentEmailRequest(), admin)
        except HTTPException as he:
            report["pay_link"] = {"sent": False, "error": he.detail}
    return {"created": True, "booking": doc, "report": report}


class BookingCancel(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)
    notify_guest: bool = True
    refund: bool = False
    refund_amount: Optional[float] = Field(None, gt=0, le=100000)


async def _paid_card_tx(booking_id: str) -> Optional[dict]:
    return await _db.payment_transactions.find_one(
        {"booking_id": booking_id, "payment_status": "paid", "session_id": {"$nin": [None, ""]},
         "provider": {"$nin": ["zelle", "cash"]}},
        sort=[("updated_at", -1)],
    )


@router.get("/admin/bookings/{booking_id}/refundable")
async def admin_booking_refundable(booking_id: str, _: str = Depends(_admin_dep)):
    b = await _db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    tx = await _paid_card_tx(booking_id) if b.get("payment_status") == "paid" else None
    total = float(b.get("total") or b.get("total_price") or (tx or {}).get("amount") or 0)
    remaining = round(max(0.0, total - float(b.get("refunded_amount") or 0)), 2)
    return {"refundable": bool(tx) and remaining >= 0.01, "amount": remaining,
            "provider": (tx or {}).get("provider") or ("stripe" if tx else None)}


def _cancel_notice(b: dict, reason: str) -> dict:
    from notifications import send_email, send_sms  # noqa: PLC0415
    first = (b.get("customer_name") or "there").split(" ")[0] or "there"
    item = b.get("item_name") or "your Rox booking"
    why = f" Reason: {reason}." if reason else ""
    report = {"email": {"sent": False}, "sms": {"sent": False}}
    if b.get("customer_email"):
        e = _html.escape
        html = (f'<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;background:#FAF9F6;">'
                f'<div style="background:#0B3B5C;color:#fff;padding:28px;"><div style="font-size:10px;letter-spacing:.3em;'
                f'text-transform:uppercase;color:#D4A94A;font-weight:800;">Booking cancelled</div>'
                f'<h1 style="font-family:Georgia,serif;margin:10px 0 0;font-size:24px;">{e(first)}, your booking {b["id"]} was cancelled.</h1></div>'
                f'<div style="padding:22px 28px;color:#0B3B5C;font-size:14px;"><p><strong>{e(item)}</strong></p>'
                f'{"<p>" + e(reason) + "</p>" if reason else ""}'
                f'<p style="color:#64748B;font-size:12px;">Questions or want to rebook? WhatsApp +1 (242) 432-2587 or reply to this email.</p></div></div>')
        text = f"Hi {first}, your Rox booking {b['id']} ({item}) was cancelled.{why} Questions? WhatsApp +1 (242) 432-2587."
        report["email"] = send_email(b["customer_email"], f"Cancelled: Rox booking {b['id']}", html, text, category="confirmation")
    if b.get("customer_phone"):
        report["sms"] = send_sms(b["customer_phone"],
                                 f"Rox: Hi {first}, booking {b['id']} ({item}) was cancelled.{why} Questions? WhatsApp +1 (242) 432-2587"[:600])
    return report


@router.post("/admin/bookings/{booking_id}/cancel")
async def admin_cancel_booking(booking_id: str, req: BookingCancel, admin: str = Depends(_admin_dep)):
    b = await _db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") == "cancelled":
        return {"cancelled": True, "already": True, "guest_notified": False}
    reason = (req.reason or "").strip()
    await _db.bookings.update_one({"id": booking_id}, {
        "$set": {"status": "cancelled", "cancelled_at": _now_iso(), "cancelled_by": admin,
                 "cancel_reason": reason, "updated_at": _now_iso()},
        "$push": {"status_history": {"status": "cancelled", "at": _now_iso(), "by": admin, "note": reason}},
    })
    notice = None
    if req.notify_guest:
        notice = await asyncio.to_thread(_cancel_notice, b, reason)
        await _db.bookings.update_one({"id": booking_id}, {"$set": {"cancel_notice": notice}})
    refund = None
    if req.refund:
        tx = await _paid_card_tx(booking_id) if b.get("payment_status") == "paid" else None
        if not tx:
            refund = {"ok": False, "error": "No card payment found to refund"}
        else:
            from routes.admin import refund_payment  # noqa: PLC0415
            try:
                body = {"reason": reason or "Booking cancelled"}
                if req.refund_amount:
                    body["amount"] = round(req.refund_amount, 2)
                refund = await refund_payment(tx["session_id"], body, admin=admin)
            except HTTPException as he:
                refund = {"ok": False, "error": he.detail}
    return {"cancelled": True,
            "guest_notified": bool(notice and (notice["email"].get("sent") or notice["sms"].get("sent"))),
            "refund": refund}


@router.delete("/admin/bookings/{booking_id}")
async def admin_delete_booking(booking_id: str, admin: str = Depends(_admin_dep)):
    """Removes the booking from the list; a copy is archived in `bookings_deleted`."""
    b = await _db.bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Booking not found")
    b.pop("_id", None)
    await _db.bookings_deleted.insert_one({**b, "deleted_at": _now_iso(), "deleted_by": admin})
    await _db.bookings.delete_one({"id": booking_id})
    return {"deleted": True, "id": booking_id}


@router.get("/admin/bookings-deleted")
async def admin_deleted_bookings(_: str = Depends(_admin_dep)):
    docs = await _db.bookings_deleted.find({}, {"_id": 0}).sort("deleted_at", -1).to_list(200)
    return [{k: d.get(k) for k in ("id", "customer_name", "item_name", "booking_date", "total", "total_price",
                                  "status", "payment_status", "deleted_at", "deleted_by")} for d in docs]


@router.post("/admin/bookings-deleted/{booking_id}/restore")
async def admin_restore_booking(booking_id: str, admin: str = Depends(_admin_dep)):
    d = await _db.bookings_deleted.find_one({"id": booking_id}, sort=[("deleted_at", -1)])
    if not d:
        raise HTTPException(404, "Not in recently deleted")
    if await _db.bookings.find_one({"id": booking_id}, {"_id": 1}):
        raise HTTPException(409, "A booking with this ID already exists")
    archive_id = d.pop("_id")
    d.pop("deleted_at", None)
    d.pop("deleted_by", None)
    d["restored_at"] = _now_iso()
    d["restored_by"] = admin
    await _db.bookings.insert_one(d)
    await _db.bookings_deleted.delete_one({"_id": archive_id})
    return {"restored": True, "id": booking_id}


@router.post("/admin/bookings/{booking_id}/guest-confirm")
async def admin_guest_confirm(booking_id: str, req: GuestConfirm, admin: str = Depends(_admin_dep)):
    upd = ({"$set": {"guest_confirmed_at": _now_iso(), "guest_confirmed_via": f"admin:{admin}"}}
           if req.confirmed else {"$unset": {"guest_confirmed_at": "", "guest_confirmed_via": ""}})
    r = await _db.bookings.update_one({"id": booking_id}, upd)
    if not r.matched_count:
        raise HTTPException(404, "Booking not found")
    return {"confirmed": req.confirmed}


DEFAULT_QUICK_REPLIES = [
    "Hi {first}, your driver is on the way!",
    "See you at the lobby, {first}.",
    "Your driver has arrived and is waiting outside.",
    "Running about 10 minutes late — thanks for your patience!",
    "Thanks {first}! You're all confirmed.",
]


class QuickReplies(BaseModel):
    templates: list[str]


@router.get("/admin/guest-sms/templates")
async def admin_sms_templates(_: str = Depends(_admin_dep)):
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    return {"templates": cfg.get("sms_quick_replies") or DEFAULT_QUICK_REPLIES}


@router.put("/admin/guest-sms/templates")
async def admin_sms_templates_save(req: QuickReplies, _: str = Depends(_admin_dep)):
    cleaned = [t.strip()[:300] for t in req.templates if t and t.strip()][:20]
    await _db.site_config.update_one({"_id": "main"}, {"$set": {"sms_quick_replies": cleaned}}, upsert=True)
    return {"templates": cleaned or DEFAULT_QUICK_REPLIES}


@router.post("/admin/guest-sms/reply")
async def admin_sms_reply(req: SmsReply, admin: str = Depends(_admin_dep)):
    text = req.body.strip()
    if not text:
        raise HTTPException(400, "Message is empty")
    from notifications import send_sms  # noqa: PLC0415
    r = await asyncio.to_thread(send_sms, req.to.strip(), text[:1000])
    if not r.get("sent"):
        raise HTTPException(502, f"SMS failed: {r.get('error') or 'unknown'}")
    key = _digits(req.to)
    last = await _db.inbound_sms.find_one({"phone_key": key, "booking_id": {"$ne": None}}, sort=[("received_at", -1)]) or {}
    doc = {"to": req.to.strip(), "body": text[:1000], "direction": "out", "phone_key": key, "read": True,
           "booking_id": last.get("booking_id"), "customer_name": last.get("customer_name"),
           "sent_by": admin, "received_at": _now_iso()}
    await _db.inbound_sms.insert_one(dict(doc))
    return {"sent": True, "message": doc}
