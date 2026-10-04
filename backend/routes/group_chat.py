"""Group chat router — private thread per booking.

Each booking can host a one-to-one thread between the lead planner
(wedding/corporate organizer) and the dispatch desk. Guest access uses
a HMAC-signed token emailed with the booking confirmation so no customer
account is required. Admin access uses the shared `require_admin` dep.

Collection: `group_chat_messages`
    { id, booking_id, author, author_name, body, created_at }

Owner is pinged via SMS when the planner posts; the planner is emailed
when admin posts.
"""
import hmac
import hashlib
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field


_db = None
_now_iso: Callable = lambda: ""
_clean: Callable = lambda x: x
_require_admin: Callable = None


def configure(*, db, now_iso: Callable, clean: Callable, require_admin: Callable) -> None:
    global _db, _now_iso, _clean, _require_admin
    _db = db
    _now_iso = now_iso
    _clean = clean
    _require_admin = require_admin


router = APIRouter()


def _secret() -> bytes:
    return (
        os.environ.get("BOOKING_LINK_SECRET")
        or os.environ.get("WEBHOOK_CRON_SECRET")
        or "rox-chat-fallback"
    ).encode()


def make_chat_token(booking_id: str) -> str:
    """Deterministic HMAC token for emailed guest-chat deep links."""
    return hmac.new(_secret(), f"chat:{booking_id}".encode(),
                    hashlib.sha256).hexdigest()[:20]


def _check_token(booking_id: str, token: str) -> None:
    if not token or not hmac.compare_digest(token, make_chat_token(booking_id)):
        raise HTTPException(403, "Invalid or expired chat link")


class ChatMessageIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)
    author_name: Optional[str] = None


async def _list_messages(booking_id: str) -> List[Dict[str, Any]]:
    docs = await _db.group_chat_messages.find(
        {"booking_id": booking_id}
    ).sort("created_at", 1).to_list(500)
    return [_clean(d) for d in docs]


# ── Admin side ──────────────────────────────────────────────────────
async def _admin_dep(request: Request):
    """Late-binding admin dep that forwards cookies + CSRF through to
    the shared require_admin configured by server.py."""
    from fastapi import Header
    return await _require_admin(
        request,
        request.headers.get("authorization"),
        request.headers.get("x-csrf-token") or request.headers.get("X-CSRF-Token"),
    )


@router.get("/admin/chat/{booking_id}")
async def admin_chat_list(booking_id: str, _: str = Depends(_admin_dep)):
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    messages = await _list_messages(booking_id.upper())
    return {
        "booking_id": booking_id.upper(),
        "guest_name": booking.get("customer_name"),
        "messages": messages,
        "guest_link": f"https://roxtaxi.com/booking/{booking_id.upper()}/chat?t={make_chat_token(booking_id.upper())}",
    }


@router.post("/admin/chat/{booking_id}")
async def admin_chat_send(
    booking_id: str, msg: ChatMessageIn, _: str = Depends(_admin_dep),
):
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    doc = {
        "id": uuid.uuid4().hex[:12],
        "booking_id": booking_id.upper(),
        "author": "dispatch",
        "author_name": msg.author_name or "Rox Dispatch",
        "body": msg.body.strip(),
        "created_at": _now_iso(),
    }
    await _db.group_chat_messages.insert_one(doc)
    # Email the planner when admin posts so they aren't blind to the
    # thread. Fire-and-forget — a Resend/Twilio miss shouldn't 500 the
    # dispatcher's send button.
    try:
        from notifications import send_email  # noqa: PLC0415
        if booking.get("customer_email"):
            link = f"https://roxtaxi.com/booking/{booking_id.upper()}/chat?t={make_chat_token(booking_id.upper())}"
            html = f"""
            <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#FAF9F6;">
              <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:800;">Rox Dispatch</div>
              <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:22px;">New message about {booking_id.upper()}</h1>
              <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:16px;margin-top:14px;color:#0B3B5C;font-size:14px;line-height:1.5;">{doc['body']}</div>
              <a href="{link}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:999px;margin-top:16px;font-size:13px;">Reply in your thread →</a>
            </div>
            """
            send_email(booking["customer_email"], f"Rox Dispatch: new message · {booking_id.upper()}",
                       html, doc["body"], category="chat")
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "message": _clean(doc)}


# ── Guest side (HMAC token, no login required) ────────────────────────
@router.get("/chat/{booking_id}")
async def guest_chat_list(booking_id: str, t: str = Query(...)):
    _check_token(booking_id.upper(), t)
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    messages = await _list_messages(booking_id.upper())
    return {
        "booking_id": booking_id.upper(),
        "item_name": booking.get("item_name"),
        "booking_date": booking.get("booking_date"),
        "messages": messages,
    }


@router.post("/chat/{booking_id}")
async def guest_chat_send(booking_id: str, msg: ChatMessageIn, t: str = Query(...)):
    _check_token(booking_id.upper(), t)
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    doc = {
        "id": uuid.uuid4().hex[:12],
        "booking_id": booking_id.upper(),
        "author": "guest",
        "author_name": msg.author_name or booking.get("customer_name") or "Guest",
        "body": msg.body.strip(),
        "created_at": _now_iso(),
    }
    await _db.group_chat_messages.insert_one(doc)
    # Owner SMS so dispatch sees the planner's message in real time.
    try:
        from notifications import send_owner_sms  # noqa: PLC0415
        sms_body = (
            f"Rox · {booking_id.upper()}: new message from "
            f"{doc['author_name']}: {doc['body'][:200]}"
        )[:600]
        send_owner_sms(sms_body, kind="chat", force_priority=False)
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "message": _clean(doc)}
