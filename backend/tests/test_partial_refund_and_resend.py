"""Partial refund + resend-refund-email backend tests.

Exercises the admin Payments panel endpoints over HTTP against the live
preview backend:
  - POST /api/admin/payments/{payment_id}/refund   (full + partial + validation)
  - POST /api/admin/payments/{payment_id}/resend-refund-email
"""
from __future__ import annotations

import os
import uuid

import requests
import pymongo

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


def _seed_paid_booking(amount: float):
    """Insert a paid booking + payment_transactions row directly into Mongo
    so the admin refund endpoint has something to refund."""
    bid = f"TST-{uuid.uuid4().hex[:6].upper()}"
    pid = f"tst-{uuid.uuid4().hex[:10]}"
    _mongo.bookings.insert_one({
        "id": bid,
        "customer_name": "Partial Refund Tester",
        "customer_email": "partial.refund@example.com",
        "customer_phone": "+12421234567",
        "item_name": "Test tour",
        "service_type": "tour",
        "total": amount,
        "payment_method": "manual",  # routes refund through "manual" branch so no Stripe network call
        "payment_status": "paid",
        "status": "confirmed",
        "created_at": "2026-10-03T00:00:00+00:00",
    })
    _mongo.payment_transactions.insert_one({
        "session_id": pid,
        "provider": "stripe",
        "booking_id": bid,
        "amount": amount,
        "status": "completed",
        "payment_status": "paid",
        "created_at": "2026-10-03T00:00:00+00:00",
    })
    # Mark the booking as having a successful refund already recorded so
    # the "manual" branch of _attempt_deposit_refund still produces a
    # refund_history entry we can act on. We flip it to refunded in
    # Mongo AFTER the test calls the endpoint — the endpoint itself
    # handles both success + "manual" branches correctly.
    return bid, pid


def _cleanup(bid, pid):
    _mongo.bookings.delete_one({"id": bid})
    _mongo.payment_transactions.delete_one({"session_id": pid})


def test_partial_refund_within_limit():
    s = _login()
    bid, pid = _seed_paid_booking(100.0)
    try:
        # Even though the provider is "manual" (returns refunded=False),
        # the endpoint still records refund_history + fires the email.
        # Status flips to "refund_pending" instead of "partially_refunded".
        r = s.post(f"{API}/admin/payments/{pid}/refund", json={"amount": 30.0})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 30.0
        assert d["payment_status"] in ("partially_refunded", "refund_pending")

        # Over-limit → 400
        r = s.post(f"{API}/admin/payments/{pid}/refund", json={"amount": 10_000.0})
        assert r.status_code == 400

        # Zero → 400
        r = s.post(f"{API}/admin/payments/{pid}/refund", json={"amount": 0})
        assert r.status_code == 400

        # Negative → 400
        r = s.post(f"{API}/admin/payments/{pid}/refund", json={"amount": -5})
        assert r.status_code == 400
    finally:
        _cleanup(bid, pid)


def test_full_refund_when_amount_omitted():
    s = _login()
    bid, pid = _seed_paid_booking(42.42)
    try:
        r = s.post(f"{API}/admin/payments/{pid}/refund", json={})
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == 42.42
    finally:
        _cleanup(bid, pid)


def test_resend_refund_email():
    s = _login()
    bid, pid = _seed_paid_booking(80.0)
    try:
        # No refund yet → 409
        r = s.post(f"{API}/admin/payments/{pid}/resend-refund-email")
        assert r.status_code == 409

        # Issue a refund (manual branch records history even on failure)
        r = s.post(f"{API}/admin/payments/{pid}/refund", json={"amount": 25.0})
        assert r.status_code == 200
        # Now resend
        r = s.post(f"{API}/admin/payments/{pid}/resend-refund-email")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["amount"] == 25.0
        assert "report" in d
    finally:
        _cleanup(bid, pid)


def test_refund_404_on_unknown_payment():
    s = _login()
    r = s.post(f"{API}/admin/payments/does-not-exist/refund", json={"amount": 1})
    assert r.status_code == 404
    r = s.post(f"{API}/admin/payments/does-not-exist/resend-refund-email")
    assert r.status_code == 404
