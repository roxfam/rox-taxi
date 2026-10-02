"""Stripe card-on-file helpers — raw REST calls (no SDK dependency).

Mirrors the pattern already used for refunds in routes/payments.py so we
keep a single Stripe REST surface. Three primitives:

    1. create_setup_checkout(...)  → Stripe Checkout Session in `setup` mode
    2. retrieve_setup_session(...) → poll after guest returns, extracts
       setup_intent + customer so the card is bound to a reusable record.
    3. retrieve_setup_intent(...)  → yields the saved payment_method id.
    4. charge_saved_card(...)      → off-session PaymentIntent for an
       incidental / rental damage / late-return fee.

All functions are async and raise RuntimeError on non-2xx responses with
the Stripe error body truncated to 300 chars — enough signal for the
admin UI to surface without leaking stack traces.
"""
from typing import Dict, Any

import httpx


STRIPE_API = "https://api.stripe.com/v1"


async def create_setup_checkout(
    stripe_key: str,
    booking: Dict[str, Any],
    success_url: str,
    cancel_url: str,
) -> Dict[str, Any]:
    """Create a Stripe Checkout Session in `setup` mode — saves card without charging."""
    data = {
        "mode": "setup",
        "payment_method_types[]": "card",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "customer_creation": "always",
        "metadata[booking_id]": booking["id"],
        "metadata[purpose]": "card_hold",
    }
    email = (booking.get("customer_email") or "").strip()
    if email:
        data["customer_email"] = email
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.post(f"{STRIPE_API}/checkout/sessions", auth=(stripe_key, ""), data=data)
    if r.status_code >= 400:
        raise RuntimeError(f"Stripe setup-session failed ({r.status_code}): {r.text[:300]}")
    return r.json()


async def retrieve_setup_session(stripe_key: str, session_id: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.get(f"{STRIPE_API}/checkout/sessions/{session_id}", auth=(stripe_key, ""))
    if r.status_code >= 400:
        raise RuntimeError(f"Stripe retrieve-session failed ({r.status_code}): {r.text[:300]}")
    return r.json()


async def retrieve_setup_intent(stripe_key: str, setup_intent_id: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.get(f"{STRIPE_API}/setup_intents/{setup_intent_id}", auth=(stripe_key, ""))
    if r.status_code >= 400:
        raise RuntimeError(f"Stripe retrieve-setup-intent failed ({r.status_code}): {r.text[:300]}")
    return r.json()


async def retrieve_payment_method(stripe_key: str, payment_method_id: str) -> Dict[str, Any]:
    """Returns the card brand + last4 so admin UI can display 'Visa •••• 4242'."""
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.get(f"{STRIPE_API}/payment_methods/{payment_method_id}", auth=(stripe_key, ""))
    if r.status_code >= 400:
        raise RuntimeError(f"Stripe retrieve-pm failed ({r.status_code}): {r.text[:300]}")
    return r.json()


async def charge_saved_card(
    stripe_key: str,
    customer_id: str,
    payment_method_id: str,
    amount_cents: int,
    reason: str,
    booking_id: str,
) -> Dict[str, Any]:
    """Off-session charge of a previously saved card."""
    data = {
        "amount": str(amount_cents),
        "currency": "usd",
        "customer": customer_id,
        "payment_method": payment_method_id,
        "off_session": "true",
        "confirm": "true",
        "description": f"Rox Taxi: {reason}"[:999],
        "metadata[booking_id]": booking_id,
        "metadata[reason]": reason[:500],
        "metadata[source]": "card_hold_charge",
    }
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.post(f"{STRIPE_API}/payment_intents", auth=(stripe_key, ""), data=data)
    if r.status_code >= 400:
        raise RuntimeError(f"Stripe charge failed ({r.status_code}): {r.text[:300]}")
    return r.json()
