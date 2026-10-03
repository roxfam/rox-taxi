"""Live-mode payment smoke test (safe-by-default).

Runs against the live preview backend over HTTP. Verifies:
  1. Admin login + sessions endpoint reachable (end-to-end auth + cookie)
  2. A $1 booking → /payments/checkout returns a Stripe session_id
     (sandbox-safe — the sk_test_emergent proxy produces a `cs_test_` id)
  3. Refund endpoint 404s on an unknown payment id
  4. The "live mode" check (SKIPPED by default) — set LIVE_SMOKE=1 on a
     VPS shell to assert the deployed backend is really using sk_live_.
     Never issues a real charge.
"""
from __future__ import annotations

import os
import uuid

import pymongo
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://bahamas-taxi-tours.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "roxfam2509@gmail.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = pymongo.MongoClient(MONGO_URL)[DB_NAME]


def _login():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    s.headers["X-CSRF-Token"] = s.cookies.get("admin_csrf")
    return s


def test_admin_sessions_endpoint_reachable():
    s = _login()
    r = s.get(f"{API}/admin/sessions")
    assert r.status_code == 200
    assert "sessions" in r.json()


def test_checkout_creates_session():
    s = _login()
    bid = f"SMOKE-{uuid.uuid4().hex[:6].upper()}"
    _mongo.bookings.insert_one({
        "id": bid,
        "customer_name": "Smoke Tester",
        "customer_email": "smoke@example.com",
        "customer_phone": "+12421234567",
        "item_name": "Smoke test tour",
        "service_type": "tour",
        "total": 1.00,
        "payment_status": "pending",
        "status": "pending_payment",
        "created_at": "2026-10-03T00:00:00+00:00",
    })
    try:
        r = requests.post(f"{API}/payments/checkout", json={
            "booking_id": bid,
            "origin_url": BASE_URL,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert "session_id" in d
        assert "checkout_url" in d
        # Sandbox proxy returns a cs_test_... session; a real live key
        # would start with cs_live_... — never asserted so this test
        # stays safe in both modes.
    finally:
        _mongo.bookings.delete_one({"id": bid})


def test_refund_endpoint_404_on_unknown():
    s = _login()
    r = s.post(f"{API}/admin/payments/does-not-exist/refund", json={"amount": 1})
    assert r.status_code == 404


@pytest.mark.skipif(
    os.environ.get("LIVE_SMOKE") != "1",
    reason="Set LIVE_SMOKE=1 on your VPS shell to assert sk_live_ Stripe key is active.",
)
def test_live_mode_health_check():
    """Only runs on the live VPS. Verifies the deployed backend reports a
    live-mode Stripe key in a public /payments/public-config endpoint.
    If this test fails on the VPS, the live key hasn't been injected yet.
    """
    # The preview backend intentionally does NOT expose its Stripe secret;
    # the live-mode detector lives client-side via the checkout URL prefix.
    # Create a $1 checkout session and verify the URL starts with
    # `https://checkout.stripe.com/c/pay/cs_live_` which only live keys
    # produce. (sk_test_ keys produce cs_test_).
    s = _login()
    bid = f"LIVE-{uuid.uuid4().hex[:6].upper()}"
    _mongo.bookings.insert_one({
        "id": bid, "customer_name": "Live Check", "customer_email": "live@example.com",
        "customer_phone": "+10000000000", "item_name": "Live mode check",
        "service_type": "tour", "total": 1.00, "payment_status": "pending",
        "status": "pending_payment", "created_at": "2026-10-03T00:00:00+00:00",
    })
    try:
        r = requests.post(f"{API}/payments/checkout", json={
            "booking_id": bid, "origin_url": BASE_URL,
        })
        assert r.status_code == 200, r.text
        sid = r.json()["session_id"]
        print(f"\n[LIVE SMOKE] Stripe session_id = {sid[:16]}…")
        assert sid.startswith("cs_live_"), (
            f"Stripe is NOT in live mode — session_id prefix is '{sid[:12]}…'. "
            "Paste the real sk_live_… key into backend/.env, yarn build, and restart."
        )
    finally:
        _mongo.bookings.delete_one({"id": bid})
