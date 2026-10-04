"""Group chat router — private thread per booking.

Each booking can host a one-to-one thread between the lead planner
(wedding/corporate organizer) and the dispatch desk. Guest access uses
a HMAC-signed token emailed with the booking confirmation so no customer
account is required. Admin access uses the shared `require_admin` dep.

Collection: `group_chat_messages`
    { id, booking_id, author, author_name, body, image_url, created_at }

Owner is pinged via SMS when the planner posts; the planner is emailed
when admin posts. Drivers can read the thread 1h before pickup via a
read-only endpoint scoped to the booking URL.
"""
import hmac
import hashlib
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
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
    body: str = Field("", max_length=2000)
    author_name: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=500)


async def _list_messages(booking_id: str) -> List[Dict[str, Any]]:
    docs = await _db.group_chat_messages.find(
        {"booking_id": booking_id}
    ).sort("created_at", 1).to_list(500)
    return [_clean(d) for d in docs]


async def _mark_read(booking_id: str, by: str) -> str:
    """Stamp the latest-read timestamp on the booking so the other side
    can render a 'Seen ✓' badge next to messages older than that stamp.
    `by` is either 'dispatch' or 'guest'. Returns the new ISO stamp."""
    now = _now_iso()
    field = "last_read_dispatch_at" if by == "dispatch" else "last_read_guest_at"
    await _db.bookings.update_one({"id": booking_id}, {"$set": {field: now}})
    return now


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
    # Mark anything the guest sent before now as read by dispatch — the
    # guest's `last_read_guest_at` is included so the admin UI can paint
    # 'Seen ✓' badges on dispatch messages the planner has viewed.
    await _mark_read(booking_id.upper(), "dispatch")
    fresh = await _db.bookings.find_one({"id": booking_id.upper()}) or {}
    return {
        "booking_id": booking_id.upper(),
        "guest_name": booking.get("customer_name"),
        "messages": messages,
        "guest_link": f"https://roxtaxi.com/booking/{booking_id.upper()}/chat?t={make_chat_token(booking_id.upper())}",
        "last_read_guest_at": fresh.get("last_read_guest_at"),
        "last_read_dispatch_at": fresh.get("last_read_dispatch_at"),
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
        "body": (msg.body or "").strip(),
        "image_url": msg.image_url,
        "created_at": _now_iso(),
    }
    if not doc["body"] and not doc["image_url"]:
        raise HTTPException(400, "Message cannot be empty.")
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
    await _mark_read(booking_id.upper(), "guest")
    fresh = await _db.bookings.find_one({"id": booking_id.upper()}) or {}
    return {
        "booking_id": booking_id.upper(),
        "item_name": booking.get("item_name"),
        "booking_date": booking.get("booking_date"),
        "messages": messages,
        "last_read_guest_at": fresh.get("last_read_guest_at"),
        "last_read_dispatch_at": fresh.get("last_read_dispatch_at"),
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
        "body": (msg.body or "").strip(),
        "image_url": msg.image_url,
        "created_at": _now_iso(),
    }
    if not doc["body"] and not doc["image_url"]:
        raise HTTPException(400, "Message cannot be empty.")
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



# ─── Image uploads (shared by admin + guest sides) ─────────────────────
# Store in Emergent Object Storage; return a signed URL the chat UI can
# render inline. Guest side requires the booking HMAC token so random
# uploads can't flood our bucket.
_MAX_IMG_BYTES = 5 * 1024 * 1024  # 5 MB — covers phone-size JPEGs comfortably
_ALLOWED_IMG = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"}


async def _store_chat_image(booking_id: str, author: str, upload: UploadFile) -> str:
    content_type = (upload.content_type or "").lower()
    if content_type not in _ALLOWED_IMG:
        raise HTTPException(400, "Only JPEG/PNG/WebP/GIF/HEIC images are allowed.")
    data = await upload.read()
    if not data or len(data) > _MAX_IMG_BYTES:
        raise HTTPException(400, "Image must be between 1 byte and 5 MB.")
    ext = (upload.filename.rsplit(".", 1)[-1] if "." in (upload.filename or "") else "jpg").lower()[:5]
    name = f"chat/{booking_id}/{author}-{uuid.uuid4().hex[:10]}.{ext}"
    try:
        from storage import put_object  # noqa: PLC0415
        ok = put_object(name, data, content_type)
        if not ok:
            raise RuntimeError("object storage unavailable")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Could not upload image: {e}") from e
    return f"/api/uploads/{name}"


@router.post("/admin/chat/{booking_id}/upload")
async def admin_chat_upload(
    booking_id: str, file: UploadFile = File(...), _: str = Depends(_admin_dep),
):
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    url = await _store_chat_image(booking_id.upper(), "dispatch", file)
    return {"image_url": url}


@router.post("/chat/{booking_id}/upload")
async def guest_chat_upload(
    booking_id: str, t: str = Query(...), file: UploadFile = File(...),
):
    _check_token(booking_id.upper(), t)
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    url = await _store_chat_image(booking_id.upper(), "guest", file)
    return {"image_url": url}


# ─── Driver read-only view (1 h before pickup, no auth) ────────────────
# The driver's capability-token is the booking_id in the URL — same model
# as `/driver/{booking_id}`. We only expose the chat 60 min before the
# scheduled pickup so idle historical chats never leak once a trip is in
# flight. Driver cannot post — strictly read-only.
@router.get("/driver/chat/{booking_id}")
async def driver_chat_view(booking_id: str):
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    status = (booking.get("status") or "").lower()


# ─── Driver quick-reply canned templates ──────────────────────────────
# Fires a short SMS to the planner AND inserts an entry into the chat
# thread so the dispatch desk sees the same acknowledgement without the
# driver having to type anything on their phone.
_QUICK_REPLY_TEMPLATES = {
    "en_route_5": ("5 min out", "Rox Taxi: Your driver is 5 minutes away. See you soon! 🚕"),
    "arrived_ack": ("At pickup", "Rox Taxi: Your driver has arrived at the pickup location."),
    "running_late": ("Running late", "Rox Taxi: Your driver is running a few minutes late. We'll keep you posted."),
}


@router.post("/driver/{booking_id}/quick-reply")
async def driver_quick_reply(booking_id: str, kind: str = Query(...)):
    tpl = _QUICK_REPLY_TEMPLATES.get(kind)
    if not tpl:
        raise HTTPException(400, "Unknown quick-reply template.")
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    label, sms_body = tpl

    sms_report = {"sent": False, "error": None}
    if booking.get("customer_phone"):
        try:
            from notifications import send_sms  # noqa: PLC0415
            sms_report = send_sms(booking["customer_phone"], sms_body)
        except Exception as e:  # noqa: BLE001
            sms_report = {"sent": False, "error": str(e)}

    # Mirror into the chat thread so admin + planner see what the driver
    # just acknowledged. Author is 'driver' so the UI can colour it
    # differently from dispatch posts.
    doc = {
        "id": uuid.uuid4().hex[:12],
        "booking_id": booking_id.upper(),
        "author": "driver",
        "author_name": "Driver (quick reply)",
        "body": f"📣 {label} · {sms_body}",
        "image_url": None,
        "created_at": _now_iso(),
    }
    await _db.group_chat_messages.insert_one(doc)
    return {"ok": True, "label": label, "sms": sms_report, "message": _clean(doc)}
