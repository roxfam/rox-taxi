"""Payment endpoints — Stripe Checkout, PayPal Smart Buttons, deposit refunds.

Server.py wires this up by calling `configure(...)` with the shared DB handle,
Stripe key and notification callback, then `include_router(router)`.
"""
from typing import Optional, Dict, Any
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import httpx

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)

import paypal_client


# -- shared state, populated by server.py via configure() -------------------
_db = None
_stripe_api_key: str = ""
_notify = None
_now_iso = None
_clean = None


def configure(db, stripe_api_key: str, notify_fn, now_iso_fn, clean_fn):
    """Called once at app startup so this module gets a handle to shared state."""
    global _db, _stripe_api_key, _notify, _now_iso, _clean
    _db = db
    _stripe_api_key = stripe_api_key
    _notify = notify_fn
    _now_iso = now_iso_fn
    _clean = clean_fn


router = APIRouter()


# -- request models -----------------------------------------------------------
class CheckoutRequest(BaseModel):
    booking_id: str
    origin_url: str


class PayPalCreateOrderRequest(BaseModel):
    booking_id: str


# -- Stripe Checkout ----------------------------------------------------------
@router.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest, request: Request):
    booking = await _db.bookings.find_one({"id": req.booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")

    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=_stripe_api_key, webhook_url=webhook_url)

    success_url = f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{req.origin_url}/payment/cancel?booking_id={booking['id']}"

    checkout_req = CheckoutSessionRequest(
        amount=float(booking["total"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"booking_id": booking["id"], "customer_email": booking["customer_email"]},
    )
    session = await stripe_checkout.create_checkout_session(checkout_req)

    await _db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "booking_id": booking["id"],
        "amount": float(booking["total"]),
        "currency": "usd",
        "status": "initiated",
        "payment_status": "pending",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    })
    return {"checkout_url": session.url, "session_id": session.session_id}


async def _mark_paid(session_id: str, booking_id: Optional[str]):
    await _db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid", "updated_at": _now_iso()}},
    )
    # Rental extension short-circuit: apply the extension against the parent
    # booking and STOP. We don't want to trip the normal "booking confirmed"
    # notification pipeline for the parent — the parent was already paid.
    try:
        from server import apply_rental_extension_if_paid  # noqa: PLC0415
        applied = await apply_rental_extension_if_paid(session_id)
        if applied:
            return
    except Exception as e:  # noqa: BLE001
        logging.warning("rental extension apply err: %s", e)

    if booking_id:
        res = await _db.bookings.update_one(
            {"id": booking_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "status": "confirmed", "updated_at": _now_iso()}},
        )
        if res.modified_count:
            booking = await _db.bookings.find_one({"id": booking_id})
            provider = (await _db.payment_transactions.find_one({"session_id": session_id}) or {}).get("provider", "stripe")
            # Hook the referral conversion — no-op if the referee has no
            # referred_by or already had a paid booking. Silent fail is safe.
            try:
                from server import _apply_referral_conversion_if_paid  # noqa: PLC0415
                await _apply_referral_conversion_if_paid(booking_id)
            except Exception as e:  # noqa: BLE001
                logging.warning("referral conversion err: %s", e)
            try:
                prefs = await _db.site_config.find_one({"_id": "main"}) or {}
                report = _notify(_clean(dict(booking)), prefs)
                await _db.bookings.update_one(
                    {"id": booking_id},
                    {"$set": {"notification_status": report, "notified_at": _now_iso()}},
                )
            except Exception as e:  # noqa: BLE001
                logging.warning("notify err: %s", e)
            # Owner SMS: "payment received" alert (independent of customer notify)
            try:
                from notifications import notify_owner_payment_received
                notify_owner_payment_received(_clean(dict(booking)), provider=provider)
            except Exception as e:  # noqa: BLE001
                logging.warning("owner payment alert err: %s", e)


@router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, request: Request):
    record = await _db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(404, "Transaction not found")

    if record.get("payment_status") != "paid":
        host_url = str(request.base_url)
        webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
        sc = StripeCheckout(api_key=_stripe_api_key, webhook_url=webhook_url)
        try:
            status = await sc.get_checkout_status(session_id)
            if status.payment_status == "paid" or status.status == "complete":
                await _mark_paid(session_id, record["booking_id"])
                record = await _db.payment_transactions.find_one({"session_id": session_id})
        except Exception as e:  # noqa: BLE001
            logging.warning("stripe status err: %s", e)

    return {
        "session_id": record["session_id"],
        "booking_id": record["booking_id"],
        "status": record["status"],
        "payment_status": record["payment_status"],
    }


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    sc = StripeCheckout(api_key=_stripe_api_key, webhook_url=webhook_url)
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        result = await sc.handle_webhook(body, sig)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Webhook error: {e}") from e
    if result.payment_status == "paid":
        booking_id = (result.metadata or {}).get("booking_id")
        await _mark_paid(result.session_id, booking_id)
    return {"status": "ok"}


# -- PayPal Checkout (Smart Buttons) -----------------------------------------
@router.get("/paypal/config")
async def paypal_config():
    """Public config for the frontend PayPalScriptProvider."""
    return paypal_client.public_config()


@router.post("/paypal/create-order")
async def paypal_create_order(req: PayPalCreateOrderRequest):
    if not paypal_client.is_configured():
        raise HTTPException(503, "PayPal is not configured on the server")
    booking = await _db.bookings.find_one({"id": req.booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.get("payment_status") == "paid":
        raise HTTPException(409, "Booking already paid")

    try:
        order = await paypal_client.create_order(
            amount=float(booking["total"]),
            booking_id=booking["id"],
            description=f"{booking.get('item_name','Rox Taxi booking')} — {booking['id']}",
        )
    except Exception as e:  # noqa: BLE001
        logging.exception("PayPal create-order failed")
        raise HTTPException(502, f"PayPal error: {e}") from e

    await _db.payment_transactions.insert_one({
        "provider": "paypal",
        "session_id": order["id"],
        "booking_id": booking["id"],
        "amount": float(booking["total"]),
        "currency": "usd",
        "status": order.get("status", "CREATED"),
        "payment_status": "pending",
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    })
    return {"order_id": order["id"], "status": order.get("status")}


@router.post("/paypal/capture-order/{order_id}")
async def paypal_capture_order(order_id: str):
    if not paypal_client.is_configured():
        raise HTTPException(503, "PayPal is not configured on the server")

    tx = await _db.payment_transactions.find_one({"session_id": order_id, "provider": "paypal"})
    if not tx:
        raise HTTPException(404, "PayPal order not found")

    try:
        result = await paypal_client.capture_order(order_id)
    except Exception as e:  # noqa: BLE001
        logging.exception("PayPal capture failed")
        raise HTTPException(502, f"PayPal capture error: {e}") from e

    status = (result.get("status") or "").upper()
    if status != "COMPLETED":
        await _db.payment_transactions.update_one(
            {"session_id": order_id},
            {"$set": {"status": status or "UNKNOWN", "updated_at": _now_iso()}},
        )
        raise HTTPException(402, f"PayPal capture not completed (status={status})")

    capture_id = paypal_client.extract_capture_id(result)
    await _db.payment_transactions.update_one(
        {"session_id": order_id},
        {"$set": {"paypal_capture_id": capture_id, "updated_at": _now_iso()}},
    )
    if capture_id:
        await _db.bookings.update_one(
            {"id": tx["booking_id"]},
            {"$set": {"paypal_capture_id": capture_id, "payment_provider": "paypal"}},
        )
    await _mark_paid(order_id, tx["booking_id"])
    booking = await _db.bookings.find_one({"id": tx["booking_id"]}, {"_id": 0})
    return {
        "order_id": order_id,
        "status": status,
        "booking_id": tx["booking_id"],
        "payment_status": "paid",
        "booking": _clean(dict(booking)) if booking else None,
    }


# -- Refund helpers (used by the admin deposit-release endpoint) --------------
async def _stripe_refund(payment_intent: str, amount_cents: int, reason: str) -> Dict[str, Any]:
    """Issue a Stripe refund via REST API (works with test + live keys)."""
    async with httpx.AsyncClient(timeout=30.0) as _client:
        r = await _client.post(
            "https://api.stripe.com/v1/refunds",
            auth=(_stripe_api_key, ""),
            data={
                "payment_intent": payment_intent,
                "amount": str(amount_cents),
                "reason": "requested_by_customer",
                "metadata[deposit_reason]": (reason or "Deposit released")[:500],
            },
        )
    if r.status_code >= 400:
        raise RuntimeError(f"Stripe refund failed ({r.status_code}): {r.text}")
    return r.json()


async def _resolve_stripe_payment_intent(booking_id: str) -> Optional[str]:
    """Look up the payment_intent from payment_transactions; retrieve from Stripe if not cached."""
    tx = await _db.payment_transactions.find_one({"booking_id": booking_id, "provider": {"$ne": "paypal"}})
    if not tx:
        tx = await _db.payment_transactions.find_one({"booking_id": booking_id})
    if not tx:
        return None
    if tx.get("stripe_payment_intent"):
        return tx["stripe_payment_intent"]

    session_id = tx.get("session_id")
    if not session_id or tx.get("provider") == "paypal":
        return None

    async with httpx.AsyncClient(timeout=20.0) as _client:
        r = await _client.get(
            f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
            auth=(_stripe_api_key, ""),
        )
    if r.status_code >= 400:
        logging.warning("Stripe session lookup failed: %s %s", r.status_code, r.text)
        return None
    pi = r.json().get("payment_intent")
    if pi:
        await _db.payment_transactions.update_one(
            {"_id": tx["_id"]}, {"$set": {"stripe_payment_intent": pi}},
        )
    return pi


async def attempt_deposit_refund(booking: Dict[str, Any], amount: float, reason: str) -> Dict[str, Any]:
    """Refund `amount` USD via the same payment provider used for the original booking.

    Public helper called by the admin deposit-release endpoint in server.py.
    """
    if booking.get("payment_status") != "paid":
        return {"refunded": False, "provider": None, "error": "Booking not paid — no funds to refund"}

    if booking.get("paypal_capture_id"):
        try:
            refund = await paypal_client.refund_capture(
                capture_id=booking["paypal_capture_id"],
                amount=amount,
                note=f"Deposit released: {reason[:200]}",
            )
            return {
                "refunded": (refund.get("status", "").upper() == "COMPLETED"),
                "refund_id": refund.get("id"),
                "provider": "paypal",
                "status": refund.get("status"),
            }
        except Exception as e:  # noqa: BLE001
            logging.exception("PayPal deposit refund failed")
            return {"refunded": False, "provider": "paypal", "error": str(e)}

    pi = await _resolve_stripe_payment_intent(booking["id"])
    if pi:
        try:
            refund = await _stripe_refund(pi, int(round(amount * 100)), reason)
            return {
                "refunded": (refund.get("status") == "succeeded"),
                "refund_id": refund.get("id"),
                "provider": "stripe",
                "status": refund.get("status"),
            }
        except Exception as e:  # noqa: BLE001
            logging.exception("Stripe deposit refund failed")
            return {"refunded": False, "provider": "stripe", "error": str(e)}

    return {"refunded": False, "provider": booking.get("payment_method", "manual"), "error": "Manual payment method — issue refund by hand"}
