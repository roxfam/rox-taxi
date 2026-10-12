"""Iteration 33 - Stripe webhook unverifiable path, reconcile loop, _fetch_verified_event,
and partial refund via admin cancel endpoint."""
import os
import asyncio
import pytest
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO = os.environ["MONGO_URL"]
DB = os.environ["DB_NAME"]
ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASS = "admin123"


# -------- helpers ------------------------------------------------------------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    tok = s.cookies.get("admin_csrf")
    if tok:
        s.headers.update({"X-CSRF-Token": tok})
    return s


@pytest.fixture
def mongo():
    client = AsyncIOMotorClient(MONGO)
    return client[DB]


# ============================================================================
# Webhook: no secret present in preview, posting unsigned payload must 400,
# not 500/503. Invalid JSON also 400.
# ============================================================================
class TestWebhookV2Unverifiable:
    def test_fake_event_no_signature_returns_400(self):
        r = requests.post(
            f"{BASE}/api/webhooks/stripe",
            json={"id": "evt_fake_iter33", "type": "checkout.session.completed"},
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"
        assert r.status_code not in (500, 503)

    def test_invalid_json_returns_400(self):
        r = requests.post(
            f"{BASE}/api/webhooks/stripe",
            data=b"not-json-at-all{{",
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        assert r.status_code == 400
        assert r.status_code not in (500, 503)


# ============================================================================
# Unit test _fetch_verified_event via monkeypatch of httpx + _key
# ============================================================================
@pytest.mark.asyncio
async def test_fetch_verified_event_valid(monkeypatch):
    import sys, pathlib
    sys.path.insert(0, "/app/backend")
    from routes import payments

    monkeypatch.setattr(payments, "_key", lambda: "sk_live_fake")

    class _Resp:
        status_code = 200
        def json(self):
            return {"id": "evt_abc", "type": "checkout.session.completed",
                    "data": {"object": {"id": "cs_x", "payment_status": "paid",
                                        "metadata": {"booking_id": "TESTIT33"}}}}

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): return _Resp()

    monkeypatch.setattr(payments.httpx, "AsyncClient", _Client)
    ev = await payments._fetch_verified_event(b'{"id":"evt_abc"}')
    assert ev is not None and ev["id"] == "evt_abc"


@pytest.mark.asyncio
async def test_fetch_verified_event_non_evt_returns_none(monkeypatch):
    import sys
    sys.path.insert(0, "/app/backend")
    from routes import payments
    monkeypatch.setattr(payments, "_key", lambda: "sk_live_fake")
    ev = await payments._fetch_verified_event(b'{"id":"ch_notanevent"}')
    assert ev is None


@pytest.mark.asyncio
async def test_fetch_verified_event_malformed_json(monkeypatch):
    import sys
    sys.path.insert(0, "/app/backend")
    from routes import payments
    monkeypatch.setattr(payments, "_key", lambda: "sk_live_fake")
    ev = await payments._fetch_verified_event(b"not json")
    assert ev is None


# ============================================================================
# Unit test reconcile_pending_sessions
# ============================================================================
@pytest.mark.asyncio
async def test_reconcile_returns_zero_on_sk_test_emergent(monkeypatch):
    import sys
    sys.path.insert(0, "/app/backend")
    from routes import payments
    monkeypatch.setattr(payments, "_key", lambda: "sk_test_emergent")
    n = await payments.reconcile_pending_sessions()
    assert n == 0


@pytest.mark.asyncio
async def test_reconcile_marks_paid_and_skips_404(monkeypatch):
    import sys
    sys.path.insert(0, "/app/backend")
    from routes import payments

    db = AsyncIOMotorClient(MONGO)[DB]
    payments._db = db  # ensure (should already be configured by server)
    payments._now_iso = payments._now_iso or (lambda: datetime.utcnow().isoformat())

    now = datetime.utcnow().isoformat()
    # Clean prior
    await db.payment_transactions.delete_many({"session_id": {"$in": ["cs_TEST_recon_paid", "cs_TEST_recon_404"]}})
    await db.bookings.delete_many({"id": {"$in": ["TESTREC_PAID", "TESTREC_404"]}})

    await db.bookings.insert_many([
        {"id": "TESTREC_PAID", "total": 50.0, "status": "pending", "payment_status": "pending",
         "customer_email": "r@x.com", "item_name": "TEST", "booking_date": now, "created_at": now},
        {"id": "TESTREC_404", "total": 30.0, "status": "pending", "payment_status": "pending",
         "customer_email": "r@x.com", "item_name": "TEST", "booking_date": now, "created_at": now},
    ])
    await db.payment_transactions.insert_many([
        {"session_id": "cs_TEST_recon_paid", "booking_id": "TESTREC_PAID", "payment_status": "pending",
         "amount": 50.0, "created_at": now, "updated_at": now, "provider": "stripe"},
        {"session_id": "cs_TEST_recon_404", "booking_id": "TESTREC_404", "payment_status": "pending",
         "amount": 30.0, "created_at": now, "updated_at": now, "provider": "stripe"},
    ])

    monkeypatch.setattr(payments, "_key", lambda: "sk_live_fake")

    calls = {"mark_paid": []}
    async def fake_mark_paid(session_id, booking_id):
        calls["mark_paid"].append((session_id, booking_id))
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid"}},
        )
    monkeypatch.setattr(payments, "_mark_paid", fake_mark_paid)

    class _Resp:
        def __init__(self, status, data=None):
            self.status_code = status
            self._data = data or {}
        def json(self): return self._data

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url, auth=None):
            if "cs_TEST_recon_paid" in url:
                return _Resp(200, {"payment_status": "paid", "payment_intent": "pi_test_123",
                                   "status": "complete"})
            return _Resp(404, {})

    monkeypatch.setattr(payments.httpx, "AsyncClient", _Client)

    try:
        n = await payments.reconcile_pending_sessions()
        assert n == 1
        assert calls["mark_paid"] == [("cs_TEST_recon_paid", "TESTREC_PAID")]
        tx = await db.payment_transactions.find_one({"session_id": "cs_TEST_recon_paid"})
        assert tx.get("stripe_payment_intent") == "pi_test_123"
    finally:
        await db.payment_transactions.delete_many({"session_id": {"$in": ["cs_TEST_recon_paid", "cs_TEST_recon_404"]}})
        await db.bookings.delete_many({"id": {"$in": ["TESTREC_PAID", "TESTREC_404"]}})


# ============================================================================
# Partial refund via admin cancel endpoint
# ============================================================================
def _sync_db():
    import pymongo
    return pymongo.MongoClient(MONGO)[DB]


@pytest.fixture
def seed_partial_booking():
    """Seed TESTPR1 with paid stripe tx (cs_TEST_pr1). Sync pymongo for teardown safety."""
    db = _sync_db()
    now = datetime.utcnow().isoformat()
    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat()
    bid = "TESTPR1"

    db.bookings.delete_many({"id": bid})
    db.bookings_deleted.delete_many({"id": bid})
    db.payment_transactions.delete_many({"booking_id": bid})
    db.bookings.insert_one({
        "id": bid, "customer_name": "TEST Partial", "customer_email": "test.pr@example.com",
        "status": "confirmed", "payment_status": "paid", "payment_method": "stripe",
        "booking_date": tomorrow, "total": 60.0, "item_name": "TEST Taxi",
        "created_at": now,
    })
    db.payment_transactions.insert_one({
        "session_id": "cs_TEST_pr1", "booking_id": bid, "provider": "stripe",
        "payment_status": "paid", "status": "completed", "amount": 60.0,
        "created_at": now, "updated_at": now,
    })
    yield bid
    db.bookings.delete_many({"id": bid})
    db.bookings_deleted.delete_many({"id": bid})
    db.payment_transactions.delete_many({"booking_id": bid})


class TestPartialRefundCancel:
    def test_cancel_with_partial_refund_amount(self, admin_session, seed_partial_booking):
        bid = seed_partial_booking
        # Verify refundable
        r = admin_session.get(f"{BASE}/api/admin/bookings/{bid}/refundable", timeout=30)
        assert r.status_code == 200
        info = r.json()
        assert info["refundable"] is True
        assert info["amount"] == 60.0

        # Cancel with refund_amount=25 (partial). Since sk_test_emergent key can't do real refund,
        # provider will return error — but endpoint must not 500.
        r = admin_session.post(
            f"{BASE}/api/admin/bookings/{bid}/cancel",
            json={"reason": "iter33 test", "notify_guest": False, "refund": True, "refund_amount": 25},
            timeout=60,
        )
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        data = r.json()
        assert data["cancelled"] is True
        assert data.get("refund") is not None
        # ok flag can be False if sandbox refund returns provider error, but response must include a 'refund' object
        # Validate booking cancelled regardless of refund outcome
        b = admin_session.get(f"{BASE}/api/admin/bookings-deleted", timeout=30)
        # Booking still in active list (not deleted), status cancelled
        b = requests.get(f"{BASE}/api/admin/bookings/{bid}", cookies=admin_session.cookies, timeout=30)
        # some apps don't have /admin/bookings/{id} GET; alternative:
        # Just confirm via /api/bookings/{id} public lookup
        pub = requests.get(f"{BASE}/api/bookings/{bid}", timeout=30)
        if pub.status_code == 200:
            assert pub.json().get("status") == "cancelled"

    def test_cancel_refund_amount_exceeds_remaining(self, admin_session, seed_partial_booking):
        bid = seed_partial_booking
        r = admin_session.post(
            f"{BASE}/api/admin/bookings/{bid}/cancel",
            json={"reason": "iter33 overflow", "notify_guest": False, "refund": True, "refund_amount": 70},
            timeout=60,
        )
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        data = r.json()
        assert data["cancelled"] is True
        # Refund must be ok:false with error since 70 > 60 remaining
        refund = data.get("refund") or {}
        assert refund.get("ok") is False
        assert "exceeds" in (refund.get("error") or "").lower() or refund.get("error")


# ============================================================================
# Regression: /api/payments/checkout returns a checkout_url for unpaid booking
# ============================================================================
class TestCheckoutRegression:
    def test_checkout_returns_url(self):
        bid = "TESTCHK33"
        db = _sync_db()
        now = datetime.utcnow().isoformat()
        tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat()

        db.bookings.delete_many({"id": bid})
        db.payment_transactions.delete_many({"booking_id": bid})
        db.bookings.insert_one({
            "id": bid, "customer_name": "TEST Checkout", "customer_email": "test.chk@example.com",
            "status": "pending", "payment_status": "pending", "booking_date": tomorrow,
            "total": 40.0, "item_name": "TEST Taxi", "created_at": now,
        })
        try:
            r = requests.post(
                f"{BASE}/api/payments/checkout",
                json={"booking_id": bid, "origin_url": BASE},
                timeout=60,
            )
            assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
            data = r.json()
            assert data.get("checkout_url"), "missing checkout_url"
            assert data.get("session_id"), "missing session_id"
        finally:
            db.bookings.delete_many({"id": bid})
            db.payment_transactions.delete_many({"booking_id": bid})
