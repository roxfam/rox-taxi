"""Regression tests for /api/webhooks/stripe — the official-SDK webhook.

Uses `stripe.Webhook.construct_event` locally to prove the signature
scheme we rely on is honoured end-to-end. The endpoint itself returns
503 in CI because STRIPE_WEBHOOK_SECRET isn't configured in the test
pod — we only probe its signature-rejection path from an HTTP client.
"""
import hashlib
import hmac
import json
import os
import time

import requests
import stripe


BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://bahamas-taxi-tours.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _sign(payload: bytes, secret: str) -> str:
    ts = str(int(time.time()))
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def test_construct_event_accepts_valid_signature():
    """The library we rely on must verify a well-formed signature."""
    secret = "whsec_pytest_" + "a" * 32
    payload = json.dumps({
        "id": "evt_pytest_ok",
        "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_test_abc", "payment_status": "paid",
                             "metadata": {"booking_id": "TESTBID"}}},
    }).encode()
    header = _sign(payload, secret)
    event = stripe.Webhook.construct_event(payload, header, secret)
    assert event["type"] == "checkout.session.completed"
    assert event["id"] == "evt_pytest_ok"


def test_construct_event_rejects_tampered_body():
    """Any body mutation after signing must be rejected."""
    secret = "whsec_pytest_" + "b" * 32
    payload = b'{"id":"evt_tamper","type":"charge.refunded"}'
    header = _sign(payload, secret)
    try:
        stripe.Webhook.construct_event(payload + b"TAMPER", header, secret)
    except stripe.error.SignatureVerificationError:
        return  # expected
    raise AssertionError("tampered body was NOT rejected")


def test_construct_event_rejects_wrong_secret():
    """A payload signed with another secret must not validate against ours."""
    payload = b'{"id":"evt_wrong_secret"}'
    header = _sign(payload, "whsec_other_" + "c" * 32)
    try:
        stripe.Webhook.construct_event(payload, header, "whsec_ours_" + "d" * 32)
    except stripe.error.SignatureVerificationError:
        return
    raise AssertionError("foreign-signed payload was NOT rejected")


def test_endpoint_rejects_missing_signature_header():
    """Live HTTP probe — endpoint must not 200 on a header-less request."""
    r = requests.post(
        f"{API}/webhooks/stripe",
        json={"id": "evt_nosig", "type": "checkout.session.completed", "data": {"object": {}}},
        timeout=15,
    )
    # 503 if secret not configured in the pod (expected in CI); 400 if it is.
    assert r.status_code in (400, 503), f"unexpected {r.status_code}: {r.text}"


def test_endpoint_rejects_garbage_signature():
    """Live HTTP probe — bad signature value must not 200."""
    r = requests.post(
        f"{API}/webhooks/stripe",
        headers={"Stripe-Signature": "t=1,v1=deadbeef", "Content-Type": "application/json"},
        data=b'{"id":"evt_bad","type":"checkout.session.completed","data":{"object":{}}}',
        timeout=15,
    )
    assert r.status_code in (400, 503), f"unexpected {r.status_code}: {r.text}"
