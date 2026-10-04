"""Secondary contacts router — opt-in CC list for a booking.

A lead planner (bride, corporate admin) can add trusted secondary
contacts (maid of honor, hotel concierge, event coordinator) who
receive the same balance-due, paid-in-full, and schedule-change
emails. Each secondary contact must click a one-tap confirm link
BEFORE we start CCing them — US CAN-SPAM & EU PECR compliance.

Collection: embedded on `bookings` as `secondary_contacts: [{...}]`
    { id, name, email, role, consent, consent_at, token, added_at }

Endpoints:
    POST   /admin/bookings/{id}/secondary-contacts       — add
    DELETE /admin/bookings/{id}/secondary-contacts/{cid} — remove
    GET    /secondary-contacts/confirm                   — opt-in link
    GET    /secondary-contacts/unsubscribe               — one-tap off
"""
import hmac
import hashlib
import os
import uuid
from typing import Any, Callable, Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr, Field


_db = None
_now_iso: Callable = lambda: ""
_clean: Callable = lambda x: x
_require_admin: Callable = None


def configure(*, db, now_iso: Callable, clean: Callable, require_admin: Callable) -> None:
    global _db, _now_iso, _clean, _require_admin
    _db, _now_iso, _clean, _require_admin = db, now_iso, clean, require_admin


router = APIRouter()


def _secret() -> bytes:
    return (
        os.environ.get("BOOKING_LINK_SECRET")
        or os.environ.get("WEBHOOK_CRON_SECRET")
        or "rox-cc-fallback"
    ).encode()


def _make_cc_token(booking_id: str, cid: str, action: str) -> str:
    """HMAC token tied to the booking + contact + action (confirm/unsub)."""
    msg = f"cc:{action}:{booking_id}:{cid}".encode()
    return hmac.new(_secret(), msg, hashlib.sha256).hexdigest()[:20]


async def _admin_dep(request: Request):
    return await _require_admin(
        request,
        request.headers.get("authorization"),
        request.headers.get("x-csrf-token") or request.headers.get("X-CSRF-Token"),
    )


class SecondaryContactIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    email: EmailStr
    role: Optional[str] = Field(None, max_length=60)


def _opt_in_html(booking_id: str, contact: dict, confirm_url: str, unsub_url: str) -> str:
    booking_disp = booking_id
    first = (contact.get("name") or "there").split(" ")[0]
    role = contact.get("role") or "trusted contact"
    return f"""
    <!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
      <div style="max-width:520px;margin:0 auto;background:#FAF9F6;">
        <div style="background:linear-gradient(135deg,#0B3B5C,#132a4a);padding:32px;color:#fff;">
          <div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#D4A94A;font-weight:800;">Rox Taxi · Trip CC invite</div>
          <h1 style="font-family:Georgia,serif;color:#fff;margin:12px 0 4px;font-size:26px;">Hi {first}, you're invited to a booking's updates.</h1>
          <p style="color:rgba(255,255,255,.75);font-size:14px;margin:8px 0 0;">The lead planner for booking <strong style="color:#D4A94A;">{booking_disp}</strong> added you as a <strong>{role}</strong> and asked us to keep you looped in on balance reminders, final confirmations, and any schedule changes.</p>
        </div>
        <div style="padding:28px 32px;">
          <p style="color:#0B3B5C;font-size:14px;line-height:1.5;">We only start emailing you after you confirm — one tap below. You can unsubscribe at any time from any future email.</p>
          <a href="{confirm_url}" style="display:block;background:#E86A3C;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:14px 20px;border-radius:999px;font-size:14px;margin-top:16px;">Confirm &amp; keep me updated →</a>
          <p style="color:#94A3B8;font-size:11px;margin:14px 0 0;text-align:center;">
            Didn't expect this? Just ignore the email — we won't contact you again.<br/>
            <a href="{unsub_url}" style="color:#94A3B8;text-decoration:underline;">Decline forever</a>
          </p>
        </div>
      </div>
    </body></html>
    """


@router.post("/admin/bookings/{booking_id}/secondary-contacts")
async def admin_add_secondary(
    booking_id: str, body: SecondaryContactIn, _: str = Depends(_admin_dep),
):
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    existing = booking.get("secondary_contacts") or []
    if any((c.get("email") or "").lower() == body.email.lower() for c in existing):
        raise HTTPException(409, "That email is already on this booking's CC list.")
    if len(existing) >= 10:
        raise HTTPException(400, "Maximum of 10 secondary contacts per booking.")

    cid = uuid.uuid4().hex[:10]
    contact = {
        "id": cid,
        "name": body.name,
        "email": str(body.email).lower(),
        "role": body.role or "trusted contact",
        "consent": False,
        "consent_at": None,
        "added_at": _now_iso(),
    }
    await _db.bookings.update_one(
        {"id": booking_id.upper()},
        {"$push": {"secondary_contacts": contact}},
    )

    base = os.environ.get("SITE_BASE_URL", "https://roxtaxi.com").rstrip("/")
    confirm_url = f"{base}/api/secondary-contacts/confirm?booking={booking_id.upper()}&cid={cid}&t={_make_cc_token(booking_id.upper(), cid, 'confirm')}"
    unsub_url = f"{base}/api/secondary-contacts/unsubscribe?booking={booking_id.upper()}&cid={cid}&t={_make_cc_token(booking_id.upper(), cid, 'unsub')}"
    try:
        from notifications import send_email  # noqa: PLC0415
        html = _opt_in_html(booking_id.upper(), contact, confirm_url, unsub_url)
        text = f"Confirm: {confirm_url}\n\nDecline: {unsub_url}"
        send_email(contact["email"],
                   f"Rox Taxi · You've been added to {booking_id.upper()}'s updates",
                   html, text, category="transactional")
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "contact": contact}


@router.delete("/admin/bookings/{booking_id}/secondary-contacts/{cid}")
async def admin_remove_secondary(
    booking_id: str, cid: str, _: str = Depends(_admin_dep),
):
    await _db.bookings.update_one(
        {"id": booking_id.upper()},
        {"$pull": {"secondary_contacts": {"id": cid}}},
    )
    return {"ok": True}


def _landing(ok: bool, title: str, body: str) -> HTMLResponse:
    tint = "#059669" if ok else "#DC2626"
    html = f"""
    <!DOCTYPE html><html><head><meta charset="utf-8"/><title>{title}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"/></head>
    <body style="margin:0;background:#FAF9F6;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
      <div style="max-width:520px;margin:48px auto;padding:36px;background:#fff;border:1px solid #E2E8F0;border-radius:24px;text-align:center;">
        <div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:{tint};font-weight:800;">{title}</div>
        <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:12px 0 10px;font-size:24px;">{body}</h1>
        <p style="color:#64748B;font-size:13px;margin:0;">You can close this tab. · <a href="https://roxtaxi.com" style="color:#D4A94A;">Rox Taxi homepage</a></p>
      </div>
    </body></html>
    """
    return HTMLResponse(html)


@router.get("/secondary-contacts/confirm")
async def secondary_contact_confirm(
    booking: str = Query(...), cid: str = Query(...), t: str = Query(...),
):
    if not hmac.compare_digest(t, _make_cc_token(booking.upper(), cid, "confirm")):
        return _landing(False, "Invalid link", "This confirm link is invalid or expired.")
    r = await _db.bookings.update_one(
        {"id": booking.upper(), "secondary_contacts.id": cid},
        {"$set": {
            "secondary_contacts.$.consent": True,
            "secondary_contacts.$.consent_at": _now_iso(),
        }},
    )
    if not r.matched_count:
        return _landing(False, "Not found", "We couldn't find that invitation. It may have been removed.")
    return _landing(True, "You're all set", "Thanks! You'll receive future updates for this booking. Unsubscribe is in every email.")


@router.get("/secondary-contacts/unsubscribe")
async def secondary_contact_unsubscribe(
    booking: str = Query(...), cid: str = Query(...), t: str = Query(...),
):
    if not hmac.compare_digest(t, _make_cc_token(booking.upper(), cid, "unsub")):
        return _landing(False, "Invalid link", "This unsubscribe link is invalid or expired.")
    await _db.bookings.update_one(
        {"id": booking.upper()},
        {"$pull": {"secondary_contacts": {"id": cid}}},
    )
    return _landing(True, "Unsubscribed", "Done — we won't contact you again for this booking.")


async def get_consented_cc_emails(booking_id: str) -> List[str]:
    """Public helper used by notifications.py to CC confirmed secondary
    contacts on balance reminders + paid-in-full receipts."""
    doc = await _db.bookings.find_one(
        {"id": booking_id.upper()}, {"secondary_contacts": 1},
    ) or {}
    return [
        c["email"] for c in (doc.get("secondary_contacts") or [])
        if c.get("consent") and c.get("email")
    ]
