"""Casino drop-off & wait: driver starts the clock, guest gets a text 10 min before
the wait ends with a link to buy more time ($ per 30 min) by card or PayPal."""
import asyncio
import hashlib
import hmac
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import paypal_client
import secrets_store

router = APIRouter()
_db = None
_site = "https://roxtaxi.com"
ADDON_ID = "casino-wait-30"
log = logging.getLogger(__name__)


def configure(*, db, public_base_url: Optional[str] = None):
    global _db, _site
    _db = db
    if public_base_url:
        _site = public_base_url.rstrip("/")


def _token(bid: str) -> str:
    secret = (os.environ.get("BOOKING_LINK_SECRET") or os.environ.get("WEBHOOK_CRON_SECRET") or "rox-casino").strip()
    return hmac.new(secret.encode(), f"casino-wait:{bid}".encode(), hashlib.sha256).hexdigest()[:16]


def _check(bid: str, t: str):
    if not t or not hmac.compare_digest(_token(bid), t.strip()):
        raise HTTPException(401, "Invalid link")


def _addon(b: dict) -> Optional[dict]:
    return next((a for a in (b.get("addons_selected") or []) if a.get("id") == ADDON_ID), None)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _booking(bid: str) -> dict:
    b = await _db.bookings.find_one({"id": bid.upper()})
    if not b:
        raise HTTPException(404, "Booking not found")
    if not _addon(b):
        raise HTTPException(400, "This booking has no casino wait add-on")
    return b


def _info(b: dict) -> dict:
    a = _addon(b) or {}
    return {
        "id": b["id"], "customer_name": b.get("customer_name", ""),
        "started_at": b.get("casino_wait_started_at"), "ends_at": b.get("casino_wait_ends_at"),
        "minutes_total": int(b.get("casino_wait_minutes") or a.get("minutes") or 30),
        "block_price": float(a.get("price") or 20.0), "block_minutes": 30,
        "paypal": paypal_client.is_configured(),
    }


class DropoffReq(BaseModel):
    token: str


@router.post("/bookings/{bid}/casino-dropoff")
async def casino_dropoff(bid: str, req: DropoffReq):
    """Driver taps 'Dropped at casino' on the scan page — starts the wait clock."""
    from server import _verify_qr_token  # noqa: PLC0415
    if not _verify_qr_token(bid.upper(), req.token):
        raise HTTPException(401, "Invalid scan link")
    b = await _booking(bid)
    if b.get("casino_wait_started_at"):
        return _info(b)
    minutes = int((_addon(b) or {}).get("minutes") or 30)
    start = _now()
    upd = {"casino_wait_started_at": start.isoformat(), "casino_wait_minutes": minutes,
           "casino_wait_ends_at": (start + timedelta(minutes=minutes)).isoformat()}
    await _db.bookings.update_one({"id": b["id"]}, {"$set": upd})
    return _info({**b, **upd})


@router.get("/bookings/{bid}/casino-wait/driver")
async def casino_wait_driver(bid: str, token: str):
    from server import _verify_qr_token  # noqa: PLC0415
    if not _verify_qr_token(bid.upper(), token):
        raise HTTPException(401, "Invalid scan link")
    return _info(await _booking(bid))


@router.get("/bookings/{bid}/casino-wait")
async def casino_wait_info(bid: str, t: str):
    _check(bid.upper(), t)
    return _info(await _booking(bid))


class ExtendReq(BaseModel):
    blocks: int = Field(..., ge=1, le=8)
    pay_with: str = Field("stripe", pattern="^(stripe|paypal)$")
    origin_url: Optional[str] = None


async def _apply_extension(bid: str, blocks: int, ref: str):
    """Idempotent per payment ref: pushes the end time out and alerts the owner/driver."""
    b = await _db.bookings.find_one({"id": bid})
    if not b or any(x.get("ref") == ref for x in (b.get("casino_extensions") or [])):
        return
    base = b.get("casino_wait_ends_at")
    end = max(datetime.fromisoformat(base), _now()) if base else _now()
    new_end = end + timedelta(minutes=30 * blocks)
    a = _addon(b) or {}
    paid = round(float(a.get("price") or 20) * blocks, 2)
    await _db.bookings.update_one({"id": bid}, {
        "$set": {"casino_wait_ends_at": new_end.isoformat(),
                 "casino_wait_minutes": int(b.get("casino_wait_minutes") or 30) + 30 * blocks,
                 "casino_reminder_for": None},
        "$push": {"casino_extensions": {"ref": ref, "blocks": blocks, "amount": paid, "at": _now().isoformat()}},
    })
    try:
        from notifications import send_owner_sms, send_sms  # noqa: PLC0415
        msg = f"Rox: {b.get('customer_name','Guest')} added {30*blocks} min casino wait (${paid:.2f} paid) on {bid}. New pickup ~{new_end.astimezone(timezone(timedelta(hours=-5))).strftime('%I:%M %p')}."
        send_owner_sms(msg)
        if b.get("driver_phone"):
            send_sms(b["driver_phone"], msg)
    except Exception as e:  # noqa: BLE001
        log.warning("casino extend notify err: %s", e)


@router.post("/bookings/{bid}/casino-wait/extend")
async def casino_extend(bid: str, t: str, req: ExtendReq, request: Request):
    _check(bid.upper(), t)
    b = await _booking(bid)
    amount = round(float((_addon(b) or {}).get("price") or 20) * req.blocks, 2)
    if req.pay_with == "paypal":
        order = await paypal_client.create_order(amount=amount, booking_id=b["id"], description=f"Casino wait +{30*req.blocks} min — {b['id']}")
        await _db.casino_orders.insert_one({"order_id": order["id"], "booking_id": b["id"], "blocks": req.blocks, "amount": amount, "status": "pending"})
        return {"order_id": order["id"], "amount": amount}
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest  # noqa: PLC0415
    key = secrets_store.get_secret("STRIPE_API_KEY", "")
    if not key:
        raise HTTPException(503, "Card payments not configured")
    origin = (req.origin_url or _site).rstrip("/")
    sc = StripeCheckout(api_key=key, webhook_url=f"{str(request.base_url).rstrip('/')}/api/webhook/stripe")
    link = f"{origin}/casino-wait?id={b['id']}&t={t}"
    s = await sc.create_checkout_session(CheckoutSessionRequest(
        amount=amount, currency="usd", success_url=f"{link}&paid=1", cancel_url=link,
        metadata={"type": "casino_extend", "casino_booking_id": b["id"], "blocks": str(req.blocks)},
    ))
    return {"checkout_url": s.url, "amount": amount}


@router.post("/casino-wait/paypal/capture/{order_id}")
async def casino_paypal_capture(order_id: str):
    o = await _db.casino_orders.find_one({"order_id": order_id})
    if not o:
        raise HTTPException(404, "Order not found")
    if o.get("status") != "paid":
        res = await paypal_client.capture_order(order_id)
        if (res.get("status") or "").upper() != "COMPLETED":
            raise HTTPException(402, "PayPal payment not completed")
        await _db.casino_orders.update_one({"order_id": order_id}, {"$set": {"status": "paid"}})
        await _apply_extension(o["booking_id"], int(o["blocks"]), f"pp:{order_id}")
    return {"payment_status": "paid"}


async def handle_stripe_paid(session_id: str, metadata: dict):
    """Called from the Stripe webhook when metadata.type == casino_extend."""
    await _apply_extension(metadata["casino_booking_id"], int(metadata.get("blocks") or 1), f"st:{session_id}")


async def reminder_loop():
    """Every minute: text guests whose casino wait ends within 10 minutes (once per end time)."""
    while True:
        try:
            soon = (_now() + timedelta(minutes=10)).isoformat()
            q = {"casino_wait_ends_at": {"$lte": soon, "$gte": _now().isoformat()},
                 "customer_phone": {"$nin": [None, ""]}, "status": {"$ne": "cancelled"}}
            async for b in _db.bookings.find(q).limit(50):
                if b.get("casino_reminder_for") == b["casino_wait_ends_at"]:
                    continue
                from notifications import send_sms  # noqa: PLC0415
                link = f"{_site}/casino-wait?id={b['id']}&t={_token(b['id'])}"
                price = float((_addon(b) or {}).get("price") or 20)
                send_sms(b["customer_phone"], f"Rox Taxi: your casino wait ends in about 10 minutes. Want more time? Add 30 min for ${price:.0f}: {link}")
                await _db.bookings.update_one({"id": b["id"]}, {"$set": {"casino_reminder_for": b["casino_wait_ends_at"]}})
        except Exception as e:  # noqa: BLE001
            log.warning("casino reminder loop err: %s", e)
        await asyncio.sleep(60)
