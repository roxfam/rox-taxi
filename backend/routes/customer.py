"""Customer router — signed-in customer's own bookings, referrals, and extensions.

Endpoints:
    GET  /my/bookings                           — signed-in customer's booking history
    GET  /referrals/summary                     — referral code, unlocks, credit balance
    POST /my/bookings/{id}/extend/quote         — extension pricing preview
    POST /my/bookings/{id}/extend/checkout      — Stripe checkout for the extension
    GET  /my/wallet                             — saved Stripe PaymentMethods
    POST /my/wallet/setup-session               — new Stripe setup Checkout (save a card)
    DELETE /my/wallet/{pm_id}                   — detach a saved card

Wired up by server.py via `configure()` + `include_router()`. `get_current_user`
stays in server.py (shared across many routes) and is passed here as a
late-binding wrapper (matches routes/auth.py + routes/licenses.py pattern).
"""
import uuid
from typing import Any, Callable, Dict, Optional

import httpx
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



# ─────────────────────── Trip Wallet (saved Stripe cards) ─────────────
# Authenticated customers save a Stripe PaymentMethod via SetupIntent
# Checkout; we store `payment_method_id` + display metadata on the user
# doc (`stripe_customer_id`, `payment_methods: [...]`). No raw card data
# ever hits our servers — Stripe hosts the collection UI.
STRIPE_API = "https://api.stripe.com/v1"


class WalletSetupSession(BaseModel):
    origin_url: str


async def _stripe_post(path: str, data: Dict[str, Any]) -> Dict[str, Any]:
    key = _secrets_store.get_secret("STRIPE_API_KEY", "")
    if not key or key.strip().lower() in ("sk_test_emergent", ""):
        raise HTTPException(503, "Trip wallet needs a real Stripe key. Admin: claim your Stripe sandbox or use live keys.")
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post(f"{STRIPE_API}{path}", auth=(key, ""), data=data)
    if r.status_code >= 400:
        raise HTTPException(502, f"Stripe error ({r.status_code}): {r.text[:300]}")
    return r.json()


async def _stripe_get(path: str) -> Dict[str, Any]:
    key = _secrets_store.get_secret("STRIPE_API_KEY", "")
    if not key or key.strip().lower() in ("sk_test_emergent", ""):
        raise HTTPException(503, "Trip wallet needs a real Stripe key.")
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.get(f"{STRIPE_API}{path}", auth=(key, ""))
    if r.status_code >= 400:
        raise HTTPException(502, f"Stripe error ({r.status_code}): {r.text[:300]}")
    return r.json()


async def _ensure_customer(user: Dict[str, Any]) -> str:
    """Lazily create a Stripe Customer keyed on user_id so repeat
    bookings all share the same customer record (and therefore the
    same vaulted PaymentMethods)."""
    cid = (user or {}).get("stripe_customer_id")
    if cid:
        return cid
    payload = {
        "email": user.get("email") or "",
        "name": user.get("name") or "",
        "metadata[user_id]": user.get("user_id") or "",
    }
    created = await _stripe_post("/customers", payload)
    cid = created["id"]
    await _db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"stripe_customer_id": cid, "stripe_customer_at": _now_iso()}},
    )
    return cid


@router.get("/my/wallet")
async def wallet_list(user: dict = _current_user()):
    """Return the user's saved cards (brand/last4/exp only)."""
    doc = await _db.users.find_one({"user_id": user["user_id"]}) or {}
    pms = doc.get("payment_methods") or []
    # Hide anything stale / non-card
    out = [
        {k: pm.get(k) for k in ("id", "brand", "last4", "exp_month", "exp_year", "added_at")}
        for pm in pms if pm.get("id")
    ]
    return {"payment_methods": out, "stripe_customer_id": doc.get("stripe_customer_id")}


@router.post("/my/wallet/setup-session")
async def wallet_setup_session(req: WalletSetupSession, user: dict = _current_user()):
    """Open a Stripe-hosted SetupIntent Checkout so the guest can save a
    card without raw PAN ever touching our servers. On success we poll
    Stripe for the attached PaymentMethod and persist it on the user."""
    user_doc = await _db.users.find_one({"user_id": user["user_id"]}) or user
    customer_id = await _ensure_customer(user_doc)
    origin = req.origin_url.rstrip("/")
    sess = await _stripe_post("/checkout/sessions", {
        "mode": "setup",
        "payment_method_types[]": "card",
        "customer": customer_id,
        "success_url": f"{origin}/my-bookings?wallet=added&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{origin}/my-bookings?wallet=cancelled",
        "metadata[purpose]": "trip_wallet",
        "metadata[user_id]": user["user_id"],
    })
    # Record the pending setup — the webhook can also reconcile later
    await _db.wallet_setup_sessions.insert_one({
        "session_id": sess["id"], "user_id": user["user_id"],
        "customer_id": customer_id, "status": sess.get("status"),
        "created_at": _now_iso(),
    })
    return {"checkout_url": sess["url"], "session_id": sess["id"]}


@router.post("/my/wallet/reconcile/{session_id}")
async def wallet_reconcile(session_id: str, user: dict = _current_user()):
    """Called by the frontend after returning from Stripe setup checkout.
    Pulls the SetupIntent, extracts the PaymentMethod, and persists it
    on the user doc so the "Saved cards" list reflects the new card."""
    sess = await _stripe_get(f"/checkout/sessions/{session_id}")
    if (sess.get("metadata") or {}).get("user_id") != user["user_id"]:
        raise HTTPException(403, "This setup session is not yours.")
    si_id = sess.get("setup_intent")
    if not si_id:
        raise HTTPException(409, "Setup not complete yet. Try again in a moment.")
    si = await _stripe_get(f"/setup_intents/{si_id}")
    pm_id = si.get("payment_method")
    if not pm_id:
        raise HTTPException(409, "No card attached to this setup.")
    pm = await _stripe_get(f"/payment_methods/{pm_id}")
    card = pm.get("card") or {}
    row = {
        "id": pm_id,
        "brand": card.get("brand"),
        "last4": card.get("last4"),
        "exp_month": card.get("exp_month"),
        "exp_year": card.get("exp_year"),
        "added_at": _now_iso(),
    }
    # Use $addToSet-style upsert via pull-then-push so we never duplicate
    await _db.users.update_one(
        {"user_id": user["user_id"]},
        {"$pull": {"payment_methods": {"id": pm_id}}},
    )
    await _db.users.update_one(
        {"user_id": user["user_id"]},
        {"$push": {"payment_methods": row}},
    )
    return {"ok": True, "payment_method": row}


@router.delete("/my/wallet/{pm_id}")
async def wallet_delete(pm_id: str, user: dict = _current_user()):
    """Detach the PaymentMethod from the Stripe Customer and remove the
    row from the user doc. Idempotent — missing rows are a no-op."""
    try:
        await _stripe_post(f"/payment_methods/{pm_id}/detach", {})
    except HTTPException as e:
        # 404 means already detached — safe to proceed with local wipe.
        if "404" not in str(e.detail or ""):
            raise
    await _db.users.update_one(
        {"user_id": user["user_id"]},
        {"$pull": {"payment_methods": {"id": pm_id}}},
    )
    return {"ok": True}


# ─────────────────── Pay-with-Saved-Card (one-tap re-book) ─────────────
# Off-session PaymentIntent flow for authenticated customers who already
# have a Stripe PaymentMethod in their Trip Wallet. We default to charging
# the booking's `balance_due` when present (deposit flow), falling back to
# `total` for a brand-new unpaid booking.
class PayWithWalletRequest(BaseModel):
    payment_method_id: str


@router.post("/my/bookings/{booking_id}/pay-with-wallet")
async def pay_with_wallet(
    booking_id: str, req: PayWithWalletRequest, user: dict = _current_user(),
):
    user_doc = await _db.users.find_one({"user_id": user["user_id"]}) or {}
    customer_id = user_doc.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(400, "No saved Stripe profile yet. Add a card to your wallet first.")
    saved = [pm for pm in (user_doc.get("payment_methods") or []) if pm.get("id") == req.payment_method_id]
    if not saved:
        raise HTTPException(404, "That card isn't in your wallet.")
    pm_meta = saved[0]

    booking = await _db.bookings.find_one({
        "id": booking_id.upper(),
        "customer_email": user_doc.get("email"),
    })
    if not booking:
        raise HTTPException(404, "Booking not found")
    if (booking.get("status") or "").lower() in {"cancelled", "refunded"}:
        raise HTTPException(409, "This booking is no longer billable.")

    balance_due = float(booking.get("balance_due") or 0.0)
    total = float(booking.get("total") or 0.0)
    # Balance-due wins (deposit flow); otherwise charge the full total.
    amount = balance_due if balance_due > 0.0 else total
    if amount < 0.50:
        raise HTTPException(409, "Nothing to charge — booking is already paid.")
    pay_mode = "balance" if balance_due > 0.0 else "full"

    data = {
        "amount": str(int(round(amount * 100))),
        "currency": "usd",
        "customer": customer_id,
        "payment_method": req.payment_method_id,
        "off_session": "true",
        "confirm": "true",
        "description": f"Rox Taxi · {booking_id.upper()} · {pay_mode}"[:999],
        "metadata[booking_id]": booking_id.upper(),
        "metadata[pay_mode]": pay_mode,
        "metadata[source]": "trip_wallet",
    }
    try:
        intent = await _stripe_post("/payment_intents", data)
    except HTTPException as e:
        # Stripe surfaces card-decline / authentication-required as 402 on
        # the PI create response; we pass that through verbatim so the UI
        # can prompt the guest to confirm/update the card.
        raise HTTPException(e.status_code or 402, f"Card declined: {e.detail}") from e

    status = (intent.get("status") or "").lower()
    now = _now_iso()
    await _db.payment_transactions.insert_one({
        "session_id": intent["id"],
        "stripe_payment_intent": intent["id"],
        "provider": "stripe",
        "booking_id": booking_id.upper(),
        "amount": amount,
        "pay_mode": pay_mode,
        "status": "completed" if status == "succeeded" else "initiated",
        "payment_status": "paid" if status == "succeeded" else "pending",
        "payment_method_id": req.payment_method_id,
        "created_at": now, "updated_at": now,
    })

    if status == "succeeded":
        # Re-use the shared post-payment pipeline so the balance clears,
        # paid-in-full receipt fires, and notifications stay in-sync with
        # the hosted-checkout flow.
        try:
            from routes import payments as pay_mod  # noqa: PLC0415
            await pay_mod._mark_paid(intent["id"], booking_id.upper())
        except Exception:  # noqa: BLE001
            # Best-effort — the webhook will reconcile on its own
            pass
        return {
            "status": "paid",
            "amount": amount,
            "pay_mode": pay_mode,
            "card": {"brand": pm_meta.get("brand"), "last4": pm_meta.get("last4")},
        }
    # requires_action / processing — surface it so UI can route to Stripe's
    # 3DS confirmation page.
    return {
        "status": status or "pending",
        "amount": amount,
        "pay_mode": pay_mode,
        "client_secret": intent.get("client_secret"),
    }
