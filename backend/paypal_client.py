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
            "brand_name": "Rox Taxi Service & Tours",
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


async def refund_capture(capture_id: str, amount: float, currency: str = "USD", note: str = "") -> Dict[str, Any]:
    """Refund a completed capture (partial or full). Returns PayPal refund object with `id`, `status`."""
    token = await _access_token()
    body: Dict[str, Any] = {
        "amount": {"value": f"{float(amount):.2f}", "currency_code": currency},
    }
    if note:
        body["note_to_payer"] = note[:255]
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{_base_url()}/v2/payments/captures/{capture_id}/refund",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            json=body,
        )
    if r.status_code >= 400:
        logger.error("PayPal refund failed: %s %s", r.status_code, r.text)
        r.raise_for_status()
    return r.json()


def extract_capture_id(capture_response: Dict[str, Any]) -> Optional[str]:
    """Given the response from capture_order(), extract the first capture id."""
    try:
        return capture_response["purchase_units"][0]["payments"]["captures"][0]["id"]
    except (KeyError, IndexError, TypeError):
        return None


async def create_vault_setup_token(booking_id: str, return_url: str, cancel_url: str) -> Dict[str, Any]:
    """Create a PayPal Vault setup token so the payer can authorize us to
    store their PayPal account for future off-session charges. Returns
    {id, approve_url, raw}."""
    token = await _access_token()
    body = {
        "payment_source": {
            "paypal": {
                "usage_type": "MERCHANT",
                "customer_type": "CONSUMER",
                "experience_context": {
                    "return_url": return_url,
                    "cancel_url": cancel_url,
                    "shipping_preference": "NO_SHIPPING",
                    "vault_instruction": "ON_PAYER_APPROVAL",
                },
            }
        },
        "custom_id": booking_id,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{_base_url()}/v3/vault/setup-tokens",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            json=body,
        )
    if r.status_code >= 400:
        logger.error("PayPal vault setup failed: %s %s", r.status_code, r.text)
        r.raise_for_status()
    data = r.json()
    approve_url = next((l["href"] for l in data.get("links", []) if l.get("rel") == "approve"), None)
    return {"id": data["id"], "approve_url": approve_url, "raw": data}


async def exchange_vault_setup_token(setup_token_id: str) -> Dict[str, Any]:
    """After the payer approves, exchange the setup token for a permanent
    payment token that can be charged off-session via `charge_vaulted`."""
    token = await _access_token()
    body = {"payment_source": {"token": {"id": setup_token_id, "type": "SETUP_TOKEN"}}}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{_base_url()}/v3/vault/payment-tokens",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            json=body,
        )
    if r.status_code >= 400:
        logger.error("PayPal vault exchange failed: %s %s", r.status_code, r.text)
        r.raise_for_status()
    return r.json()


async def charge_vaulted(vault_id: str, amount: float, booking_id: str,
                          description: str = "", currency: str = "USD") -> Dict[str, Any]:
    """Off-session charge against a previously-vaulted PayPal payment token."""
    token = await _access_token()
    body = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": booking_id,
            "custom_id": booking_id,
            "description": description or f"Rox Taxi incidental on {booking_id}",
            "amount": {"currency_code": currency, "value": f"{float(amount):.2f}"},
        }],
        "payment_source": {"paypal": {"vault_id": vault_id}},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
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
        logger.error("PayPal vault charge failed: %s %s", r.status_code, r.text)
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
