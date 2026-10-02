"""Payment endpoints — Stripe Checkout, PayPal Smart Buttons, deposit refunds.

Server.py wires this up by calling `configure(...)` with the shared DB handle,
Stripe key and notification callback, then `include_router(router)`.
"""
from typing import Optional, Dict, Any
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import httpx

from fastapi import Depends, Header
from typing import List

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)

import paypal_client
import card_hold as _card_hold


# -- shared state, populated by server.py via configure() -------------------
_db = None
_stripe_api_key: str = ""
_notify = None
_now_iso = None
_clean = None
_require_admin = None


def configure(db, stripe_api_key: str, notify_fn, now_iso_fn, clean_fn, require_admin=None):
    """Called once at app startup so this module gets a handle to shared state."""
    global _db, _stripe_api_key, _notify, _now_iso, _clean, _require_admin
    _db = db
    _stripe_api_key = stripe_api_key
    _notify = notify_fn
    _now_iso = now_iso_fn
    _clean = clean_fn
    _require_admin = require_admin


def _admin_dep(authorization: Optional[str] = Header(None)):
    return _require_admin(authorization) if callable(_require_admin) else None


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


# ─── Card-on-File (Stripe SetupIntents via Checkout `setup` mode) ─────────
# Lets admins email/SMS a guest a one-time Stripe link to securely store
# a card. Later, admin can charge that card off-session for incidentals,
# rental damage, or late-return fees. Uses raw Stripe REST so we don't
# depend on `emergentintegrations` supporting setup mode.
class CardHoldCreateRequest(BaseModel):
    origin_url: str
    send_sms: bool = True
    send_email: bool = True


class CardHoldChargeRequest(BaseModel):
    amount: float
    reason: str


@router.post("/admin/bookings/{booking_id}/card-hold/create")
async def card_hold_create(
    booking_id: str,
    req: CardHoldCreateRequest,
    _: str = Depends(_admin_dep),
):
    """Create a Stripe Checkout Session in `setup` mode and (optionally)
    text/email the link to the guest so they can securely save a card
    on file for later admin-triggered charges."""
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")

    # The shared `sk_test_emergent` key is a proxied sandbox — it only works
    # through the emergentintegrations library, not raw Stripe REST. Setup
    # mode requires a real Stripe key (claimable sandbox or live).
    if (_stripe_api_key or "").strip().lower() in ("sk_test_emergent", ""):
        raise HTTPException(
            503,
            "Card-on-file needs a real Stripe key. Claim your Stripe sandbox from the "
            "Payments tab, or use Zelle request for now.",
        )

    origin = req.origin_url.rstrip("/")
    success_url = f"{origin}/card-hold/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/card-hold/cancel?booking_id={booking['id']}"
    try:
        session = await _card_hold.create_setup_checkout(
            stripe_key=_stripe_api_key,
            booking=booking,
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except Exception as e:  # noqa: BLE001
        logging.exception("card-hold create failed")
        raise HTTPException(502, f"Stripe error: {e}") from e

    hold_doc = {
        "session_id": session["id"],
        "status": session.get("status") or "open",
        "payment_method_id": None,
        "customer_id": None,
        "card_brand": None,
        "card_last4": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "charges": [],
    }
    await _db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"card_hold": hold_doc}},
    )

    # Fire optional SMS + email with the secure link.
    link = session.get("url") or ""
    notification = {"sms": {"sent": False}, "email": {"sent": False}}
    guest_first = (booking.get("customer_name") or "Guest").split(" ")[0]
    if req.send_sms and booking.get("customer_phone") and link:
        try:
            from notifications import send_sms  # noqa: PLC0415
            sms_body = (
                f"Hi {guest_first}, Rox Taxi here. Please securely save a card "
                f"on file for your booking {booking['id']}: {link} "
                f"(no charge now — only if damage/incidentals apply)."
            )
            notification["sms"] = send_sms(booking["customer_phone"], sms_body)
        except Exception as e:  # noqa: BLE001
            notification["sms"] = {"sent": False, "error": str(e)}
    if req.send_email and booking.get("customer_email") and link:
        try:
            from notifications import send_email  # noqa: PLC0415
            html = (
                f"<p>Hi {guest_first},</p>"
                f"<p>Please securely save a card on file for your Rox Taxi booking "
                f"<strong>{booking['id']}</strong>. You will <strong>not be charged</strong> now — "
                f"the card is only used if incidental charges apply (damage, late return, extra cleaning).</p>"
                f"<p><a href='{link}' style='display:inline-block;padding:12px 20px;background:#0B3B5C;"
                f"color:#fff;border-radius:8px;text-decoration:none;'>Save card securely</a></p>"
                f"<p style='font-size:12px;color:#64748B;'>Powered by Stripe. Rox Taxi never sees your card number.</p>"
            )
            notification["email"] = send_email(
                booking["customer_email"],
                f"Save a card on file for booking {booking['id']}",
                html,
            )
        except Exception as e:  # noqa: BLE001
            notification["email"] = {"sent": False, "error": str(e)}

    return {
        "booking_id": booking["id"],
        "session_id": session["id"],
        "checkout_url": link,
        "status": hold_doc["status"],
        "notification": notification,
    }


async def _refresh_card_hold(booking: Dict[str, Any]) -> Dict[str, Any]:
    """Fetches the latest status from Stripe, extracts payment_method +
    customer when the setup completed, and persists the result on the
    booking. Returns the refreshed `card_hold` sub-doc."""
    hold = booking.get("card_hold") or {}
    session_id = hold.get("session_id")
    if not session_id:
        return hold
    session = await _card_hold.retrieve_setup_session(_stripe_api_key, session_id)
    hold["status"] = session.get("status") or hold.get("status")
    hold["customer_id"] = session.get("customer") or hold.get("customer_id")
    setup_intent_id = session.get("setup_intent")
    if setup_intent_id and not hold.get("payment_method_id"):
        si = await _card_hold.retrieve_setup_intent(_stripe_api_key, setup_intent_id)
        pm_id = si.get("payment_method")
        if pm_id:
            hold["payment_method_id"] = pm_id
            try:
                pm = await _card_hold.retrieve_payment_method(_stripe_api_key, pm_id)
                card = (pm.get("card") or {})
                hold["card_brand"] = card.get("brand")
                hold["card_last4"] = card.get("last4")
                hold["card_exp_month"] = card.get("exp_month")
                hold["card_exp_year"] = card.get("exp_year")
            except Exception:  # noqa: BLE001
                pass
    hold["updated_at"] = _now_iso()
    await _db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"card_hold": hold}},
    )
    return hold


@router.get("/admin/bookings/{booking_id}/card-hold/status")
async def card_hold_status(booking_id: str, _: str = Depends(_admin_dep)):
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if not (booking.get("card_hold") or {}).get("session_id"):
        return {"booking_id": booking["id"], "card_hold": None}
    try:
        hold = await _refresh_card_hold(booking)
    except Exception as e:  # noqa: BLE001
        logging.warning("card-hold status refresh failed: %s", e)
        raise HTTPException(502, f"Stripe error: {e}") from e
    return {"booking_id": booking["id"], "card_hold": hold}


@router.get("/card-hold/status/{session_id}")
async def card_hold_public_status(session_id: str):
    """Public, unauthenticated poll used by the guest's success page.
    Returns only `{status, saved}` — never the payment_method id."""
    booking = await _db.bookings.find_one({"card_hold.session_id": session_id})
    if not booking:
        raise HTTPException(404, "Session not found")
    try:
        hold = await _refresh_card_hold(booking)
    except Exception as e:  # noqa: BLE001
        logging.warning("card-hold public refresh failed: %s", e)
        hold = booking.get("card_hold") or {}
    return {
        "status": hold.get("status"),
        "saved": bool(hold.get("payment_method_id")),
        "booking_id": booking["id"],
    }


# ─── PayPal Vault (incidental card-hold alternative to Stripe) ──────────
class PayPalVaultCreateRequest(BaseModel):
    origin_url: str


class PayPalVaultChargeRequest(BaseModel):
    amount: float
    reason: str


@router.post("/admin/bookings/{booking_id}/paypal-vault/create")
async def paypal_vault_create(
    booking_id: str,
    req: PayPalVaultCreateRequest,
    _: str = Depends(_admin_dep),
):
    if not paypal_client.is_configured():
        raise HTTPException(503, "PayPal is not configured on the server")
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")

    origin = req.origin_url.rstrip("/")
    return_url = f"{origin}/card-hold/success?via=paypal&booking_id={booking['id']}"
    cancel_url = f"{origin}/card-hold/cancel?booking_id={booking['id']}"
    try:
        token_data = await paypal_client.create_vault_setup_token(
            booking_id=booking["id"],
            return_url=return_url,
            cancel_url=cancel_url,
        )
    except Exception as e:  # noqa: BLE001
        logging.exception("paypal vault setup failed")
        raise HTTPException(502, f"PayPal error: {e}") from e

    vault_doc = {
        "setup_token_id": token_data["id"],
        "approve_url": token_data.get("approve_url"),
        "payment_token_id": None,
        "status": "pending",
        "charges": [],
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await _db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"paypal_vault": vault_doc}},
    )
    return {
        "booking_id": booking["id"],
        "setup_token_id": token_data["id"],
        "approve_url": token_data.get("approve_url"),
    }


@router.post("/admin/bookings/{booking_id}/paypal-vault/finalize")
async def paypal_vault_finalize(booking_id: str, _: str = Depends(_admin_dep)):
    """Exchange the approved setup token for a permanent payment token.
    Idempotent — safe to call repeatedly from an admin poll button."""
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    vault = booking.get("paypal_vault") or {}
    setup_token = vault.get("setup_token_id")
    if not setup_token:
        raise HTTPException(409, "No PayPal vault setup pending")
    if vault.get("payment_token_id"):
        return {"booking_id": booking["id"], "paypal_vault": vault}
    try:
        pm = await paypal_client.exchange_vault_setup_token(setup_token)
    except Exception as e:  # noqa: BLE001
        logging.exception("paypal vault exchange failed")
        raise HTTPException(502, f"PayPal error: {e}") from e

    source = (pm.get("payment_source") or {}).get("paypal") or {}
    vault.update({
        "payment_token_id": pm.get("id"),
        "customer_id": (pm.get("customer") or {}).get("id"),
        "payer_email": source.get("email_address"),
        "payer_name": (source.get("name") or {}).get("given_name"),
        "status": "saved",
        "updated_at": _now_iso(),
    })
    await _db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"paypal_vault": vault}},
    )
    return {"booking_id": booking["id"], "paypal_vault": vault}


@router.get("/admin/bookings/{booking_id}/paypal-vault/status")
async def paypal_vault_status(booking_id: str, _: str = Depends(_admin_dep)):
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    return {"booking_id": booking["id"], "paypal_vault": booking.get("paypal_vault")}


@router.post("/admin/bookings/{booking_id}/paypal-vault/charge")
async def paypal_vault_charge(
    booking_id: str,
    req: PayPalVaultChargeRequest,
    _: str = Depends(_admin_dep),
):
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    reason = (req.reason or "").strip()
    if len(reason) < 3:
        raise HTTPException(400, "Reason is required (min 3 chars)")
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    vault = booking.get("paypal_vault") or {}
    vault_id = vault.get("payment_token_id")
    if not vault_id:
        raise HTTPException(409, "No PayPal payment method vaulted yet for this booking")
    try:
        order = await paypal_client.charge_vaulted(
            vault_id=vault_id,
            amount=float(req.amount),
            booking_id=booking["id"],
            description=reason,
        )
    except Exception as e:  # noqa: BLE001
        logging.exception("paypal vault charge failed")
        raise HTTPException(502, f"PayPal error: {e}") from e

    status = (order.get("status") or "").upper()
    charge_record = {
        "order_id": order.get("id"),
        "amount": float(req.amount),
        "reason": reason,
        "status": status,
        "created_at": _now_iso(),
    }
    await _db.bookings.update_one(
        {"id": booking["id"]},
        {"$push": {"paypal_vault.charges": charge_record},
         "$set": {"paypal_vault.updated_at": _now_iso()}},
    )
    return {"booking_id": booking["id"], "charge": charge_record, "order_status": status}


@router.post("/admin/bookings/{booking_id}/card-hold/charge")
async def card_hold_charge(
    booking_id: str,
    req: CardHoldChargeRequest,
    _: str = Depends(_admin_dep),
):
    """Off-session charge against a previously saved card. Reason + amount
    are stored under `card_hold.charges` for audit."""
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be greater than zero")
    reason = (req.reason or "").strip()
    if len(reason) < 3:
        raise HTTPException(400, "Reason is required (min 3 chars)")

    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    hold = booking.get("card_hold") or {}
    if not hold.get("payment_method_id") or not hold.get("customer_id"):
        raise HTTPException(409, "No card on file for this booking yet")

    amount_cents = int(round(float(req.amount) * 100))
    try:
        pi = await _card_hold.charge_saved_card(
            stripe_key=_stripe_api_key,
            customer_id=hold["customer_id"],
            payment_method_id=hold["payment_method_id"],
            amount_cents=amount_cents,
            reason=reason,
            booking_id=booking["id"],
        )
    except Exception as e:  # noqa: BLE001
        logging.exception("card-hold charge failed")
        raise HTTPException(502, f"Stripe charge error: {e}") from e

    charge_record = {
        "payment_intent_id": pi.get("id"),
        "amount": float(req.amount),
        "amount_cents": amount_cents,
        "reason": reason,
        "status": pi.get("status"),
        "created_at": _now_iso(),
    }
    await _db.bookings.update_one(
        {"id": booking["id"]},
        {"$push": {"card_hold.charges": charge_record},
         "$set": {"card_hold.updated_at": _now_iso()}},
    )
    return {
        "booking_id": booking["id"],
        "charge": charge_record,
        "payment_intent_status": pi.get("status"),
    }
