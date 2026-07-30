"""Customer router — signed-in customer's own bookings, referrals, and extensions.

Endpoints:
    GET  /my/bookings                           — signed-in customer's booking history
    GET  /referrals/summary                     — referral code, unlocks, credit balance
    POST /my/bookings/{id}/extend/quote         — extension pricing preview
    POST /my/bookings/{id}/extend/checkout      — Stripe checkout for the extension

Wired up by server.py via `configure()` + `include_router()`. `get_current_user`
stays in server.py (shared across many routes) and is passed here as a
late-binding wrapper (matches routes/auth.py + routes/licenses.py pattern).
"""
import uuid
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)


_db = None
_now_iso: Callable = lambda: ""
_clean: Callable = lambda x: x
_get_current_user: Callable = lambda: None
_new_referral_code: Callable = lambda: ""
_compute_extension_amount: Callable = None
_check_extension_blackouts: Callable = None
_secrets_store = None
_referral_reward_usd: float = 25.0
_referral_reward_every: int = 5


def configure(**kw):
    g = globals()
    for k, v in kw.items():
        g["_" + k] = v


router = APIRouter()


# Late-binding Depends wrapper — see routes/admin.py comment for the
# module-load-time capture pitfall this avoids.
async def _current_user_dep(request: Request):
    return await _get_current_user(request)


def _current_user():
    return Depends(_current_user_dep)


class RentalExtendQuote(BaseModel):
    additional_days: int = Field(..., ge=1, le=30)


class RentalExtendCheckout(BaseModel):
    additional_days: int = Field(..., ge=1, le=30)
    origin_url: str


@router.get("/my/bookings")
async def my_bookings(user: dict = _current_user()):
    docs = await _db.bookings.find({"customer_email": user["email"]}).sort("created_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.get("/referrals/summary")
async def referral_summary(user: dict = _current_user()):
    doc = await _db.users.find_one({"user_id": user["user_id"]}) or {}
    code = doc.get("referral_code")
    if not code:
        code = _new_referral_code()
        await _db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral_code": code}})
    total_referred = await _db.users.count_documents({"referred_by": user["user_id"]})
    total_converted = await _db.referrals.count_documents({"referrer_id": user["user_id"]})
    credits_earned = round(_referral_reward_usd * (total_converted // _referral_reward_every), 2)
    next_reward_at = _referral_reward_every - (total_converted % _referral_reward_every) if total_converted else _referral_reward_every
    return {
        "code": code,
        "referral_link": f"https://roxtaxi.com/signup?ref={code}",
        "total_referred": total_referred,
        "total_converted": total_converted,
        "credits_earned": credits_earned,
        "credit_balance": round(float(doc.get("credit_balance") or 0.0), 2),
        "next_reward_at": next_reward_at,
        "reward_per_unlock_usd": _referral_reward_usd,
        "unlock_every": _referral_reward_every,
    }


@router.post("/my/bookings/{booking_id}/extend/quote")
async def rental_extend_quote(
    booking_id: str, req: RentalExtendQuote, user: dict = _current_user(),
):
    booking = await _db.bookings.find_one({"id": booking_id, "customer_email": user["email"]})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.get("service_type") != "rental":
        raise HTTPException(400, "Only rentals can be extended")
    if booking.get("status") in {"cancelled", "completed"}:
        raise HTTPException(400, f"Cannot extend a {booking['status']} booking")
    if booking.get("payment_status") != "paid":
        raise HTTPException(400, "Pay the original booking first, then extend.")
    await _check_extension_blackouts(booking, req.additional_days)
    quote = _compute_extension_amount(booking, req.additional_days)
    quote["deposit_note"] = "Your existing security deposit stays held on the original booking — no new deposit charged."
    return quote


@router.post("/my/bookings/{booking_id}/extend/checkout")
async def rental_extend_checkout(
    booking_id: str, req: RentalExtendCheckout, request: Request,
    user: dict = _current_user(),
):
    booking = await _db.bookings.find_one({"id": booking_id, "customer_email": user["email"]})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.get("service_type") != "rental" or booking.get("status") in {"cancelled", "completed"} or booking.get("payment_status") != "paid":
        raise HTTPException(400, "Booking is not eligible for extension.")
    await _check_extension_blackouts(booking, req.additional_days)
    quote = _compute_extension_amount(booking, req.additional_days)
    if quote["extra_cost"] <= 0:
        raise HTTPException(400, "Extension amount must be > $0")

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_key = _secrets_store.get_secret("STRIPE_API_KEY", "")
    sc = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    ext_id = f"ext_{uuid.uuid4().hex[:10]}"
    success_url = f"{req.origin_url.rstrip('/')}/my-bookings?extended={booking_id}&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{req.origin_url.rstrip('/')}/my-bookings?extend_cancelled={booking_id}"
    checkout_req = CheckoutSessionRequest(
        amount=float(quote["extra_cost"]), currency="usd",
        success_url=success_url, cancel_url=cancel_url,
        metadata={"booking_id": booking_id, "extension_id": ext_id, "kind": "rental_extension"},
    )
    session = await sc.create_checkout_session(checkout_req)
    await _db.rental_extensions.insert_one({
        "id": ext_id, "booking_id": booking_id, "customer_email": user["email"],
        "additional_days": req.additional_days, "extra_cost": quote["extra_cost"],
        "quote": quote, "session_id": session.session_id,
        "status": "pending", "created_at": _now_iso(),
    })
    await _db.payment_transactions.insert_one({
        "session_id": session.session_id, "booking_id": booking_id,
        "kind": "rental_extension", "extension_id": ext_id,
        "amount": float(quote["extra_cost"]), "currency": "usd",
        "status": "initiated", "payment_status": "pending",
        "created_at": _now_iso(), "updated_at": _now_iso(),
    })
    return {"checkout_url": session.url, "session_id": session.session_id,
            "extension_id": ext_id, "quote": quote}
