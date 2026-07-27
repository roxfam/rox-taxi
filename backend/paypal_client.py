"""PayPal Checkout (Orders v2) REST client — sandbox by default.

Uses direct REST calls via httpx instead of the deprecated paypal-checkout-serversdk.
Docs: https://developer.paypal.com/docs/api/orders/v2/
"""
from __future__ import annotations

import base64
import logging
import os
import time
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

_SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
_LIVE_BASE = "https://api-m.paypal.com"


def _base_url() -> str:
    mode = (os.environ.get("PAYPAL_MODE") or "sandbox").lower()
    return _LIVE_BASE if mode == "live" else _SANDBOX_BASE


def _client_id() -> str:
    return os.environ.get("PAYPAL_CLIENT_ID", "")


def _secret() -> str:
    return os.environ.get("PAYPAL_SECRET", "")


def is_configured() -> bool:
    return bool(_client_id()) and bool(_secret())


# --- Access token caching (tokens live ~9h, refresh 5 min before expiry) ---
_token_cache: Dict[str, Any] = {"token": None, "expires_at": 0.0}


async def _access_token() -> str:
    now = time.time()
    if _token_cache["token"] and _token_cache["expires_at"] - 300 > now:
        return _token_cache["token"]

    if not is_configured():
        raise RuntimeError("PayPal credentials not configured")

    auth = base64.b64encode(f"{_client_id()}:{_secret()}".encode()).decode()
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{_base_url()}/v1/oauth2/token",
            headers={
                "Authorization": f"Basic {auth}",
                "Accept": "application/json",
                "Accept-Language": "en_US",
            },
            data={"grant_type": "client_credentials"},
        )
    r.raise_for_status()
    data = r.json()
    token = data["access_token"]
    expires_in = float(data.get("expires_in", 3600))
    _token_cache["token"] = token
    _token_cache["expires_at"] = now + expires_in
    return token


async def create_order(amount: float, booking_id: str, currency: str = "USD", description: str = "") -> Dict[str, Any]:
    """Create a PayPal order. Returns the raw PayPal response including `id` (order id)."""
    token = await _access_token()
    body = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "reference_id": booking_id,
                "description": description or f"Rox Taxi booking {booking_id}",
                "custom_id": booking_id,
                "amount": {
                    "currency_code": currency,
                    "value": f"{float(amount):.2f}",
                },
            }
        ],
        "application_context": {
            "brand_name": "Rox Taxi Service and Tours",
            "shipping_preference": "NO_SHIPPING",
            "user_action": "PAY_NOW",
        },
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{_base_url()}/v2/checkout/orders",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            json=body,
        )
    if r.status_code >= 400:
        logger.error("PayPal create-order failed: %s %s", r.status_code, r.text)
        r.raise_for_status()
    return r.json()


async def capture_order(order_id: str) -> Dict[str, Any]:
    """Capture a previously-approved PayPal order."""
    token = await _access_token()
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{_base_url()}/v2/checkout/orders/{order_id}/capture",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
        )
    if r.status_code >= 400:
        logger.error("PayPal capture failed: %s %s", r.status_code, r.text)
        r.raise_for_status()
    return r.json()


async def get_order(order_id: str) -> Dict[str, Any]:
    """Fetch an order's current status."""
    token = await _access_token()
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            f"{_base_url()}/v2/checkout/orders/{order_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    r.raise_for_status()
    return r.json()


def public_config() -> Dict[str, Any]:
    """Safe subset for the frontend (client_id + mode). Never expose the secret."""
    mode = (os.environ.get("PAYPAL_MODE") or "sandbox").lower()
    return {
        "client_id": _client_id(),
        "mode": mode,
        "configured": is_configured(),
    }
