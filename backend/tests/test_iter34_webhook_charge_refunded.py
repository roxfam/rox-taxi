"""Iteration 34 - Verify _process_stripe_event correctly handles:
- charge.refunded (partial vs full)
- checkout.session.completed (regression - marks paid, notifications stubbed)
- checkout.session.expired (triggers send_payment_retry)
- payment_intent.succeeded (marks paid)
- POST /api/webhooks/stripe unverifiable -> 400
"""
import os
import sys
import pytest
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import requests

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

sys.path.insert(0, "/app/backend")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO = os.environ["MONGO_URL"]
DB = os.environ["DB_NAME"]


def _now():
    return datetime.utcnow().isoformat()


@pytest.fixture
def mongo():
    client = AsyncIOMotorClient(MONGO)
    return client[DB]


@pytest.fixture(autouse=True)
def _configure_payments_module():
    """Ensure routes.payments has _db and _now_iso wired for in-process calls."""
    from routes import payments as _p
    _p._db = AsyncIOMotorClient(MONGO)[DB]
    _p._now_iso = lambda: datetime.utcnow().isoformat() + "Z"
    _p._clean = _p._clean or (lambda d: {k: v for k, v in d.items() if k != "_id"})
    _p._notify = _p._notify or (lambda *a, **k: {"stubbed": True})
    yield


async def _seed_booking_paid(db, bid: str, pi_id: str, amount: float = 60.0):
    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat()
    await db.bookings.delete_many({"id": bid})
    await db.payment_transactions.delete_many({"booking_id": bid})
    await db.bookings.insert_one({
        "id": bid, "customer_name": "TEST Refund", "customer_email": "test.rf@example.com",
        "status": "confirmed", "payment_status": "paid", "payment_method": "stripe",
        "booking_date": tomorrow, "total": amount, "item_name": "TEST Taxi",
        "created_at": _now(),
    })
    await db.payment_transactions.insert_one({
        "session_id": f"cs_TEST_{bid}", "booking_id": bid, "provider": "stripe",
        "stripe_payment_intent": pi_id,
        "payment_status": "paid", "status": "completed", "amount": amount,
        "created_at": _now(), "updated_at": _now(),
    })


async def _cleanup(db, bids):
    for bid in bids:
        await db.bookings.delete_many({"id": bid})
        await db.bookings_deleted.delete_many({"id": bid})
        await db.payment_transactions.delete_many({"booking_id": bid})


# ===== charge.refunded: PARTIAL ============================================
@pytest.mark.asyncio
async def test_charge_refunded_partial(mongo):
    from routes import payments
    bid = "TESTREF_PART"
    pi = "pi_TEST_partial"
    try:
        await _seed_booking_paid(mongo, bid, pi, amount=60.0)
        event = {
            "id": "evt_TEST_part",
            "type": "charge.refunded",
            "data": {"object": {
                "payment_intent": pi,
                "amount_refunded": 4500,
                "refunded": False,
            }},
        }
        await payments._process_stripe_event(event)

        booking = await mongo.bookings.find_one({"id": bid})
        tx = await mongo.payment_transactions.find_one({"stripe_payment_intent": pi})
        assert booking is not None and tx is not None
        assert booking["payment_status"] == "partially_refunded", f"booking.payment_status={booking.get('payment_status')}"
        assert booking["refunded_amount"] == 45.0, f"booking.refunded_amount={booking.get('refunded_amount')}"
        assert tx["payment_status"] == "partially_refunded"
        assert tx["status"] == "partially_refunded"
        assert tx["refund_amount"] == 45.0
    finally:
        await _cleanup(mongo, [bid])


# ===== charge.refunded: FULL ===============================================
@pytest.mark.asyncio
async def test_charge_refunded_full(mongo):
    from routes import payments
    bid = "TESTREF_FULL"
    pi = "pi_TEST_full"
    try:
        await _seed_booking_paid(mongo, bid, pi, amount=60.0)
        event = {
            "id": "evt_TEST_full",
            "type": "charge.refunded",
            "data": {"object": {
                "payment_intent": pi,
                "amount_refunded": 6000,
                "refunded": True,
            }},
        }
        await payments._process_stripe_event(event)

        booking = await mongo.bookings.find_one({"id": bid})
        tx = await mongo.payment_transactions.find_one({"stripe_payment_intent": pi})
        assert booking["payment_status"] == "refunded"
        assert booking["refunded_amount"] == 60.0
        assert tx["payment_status"] == "refunded"
        assert tx["refund_amount"] == 60.0
    finally:
        await _cleanup(mongo, [bid])


# ===== checkout.session.completed regression ================================
@pytest.mark.asyncio
async def test_checkout_session_completed_marks_paid(mongo, monkeypatch):
    from routes import payments
    bid = "TESTCKS_COMP"
    session_id = "cs_TEST_comp_iter34"

    # Stub out notification senders — never fire real email/SMS
    import notifications as _notif
    monkeypatch.setattr(_notif, "notify_booking_received", lambda *a, **k: {"stubbed": True}, raising=False)
    monkeypatch.setattr(_notif, "notify_owner_payment_received", lambda *a, **k: {"stubbed": True}, raising=False)
    # Stub the module-level _notify callback used in _mark_paid
    monkeypatch.setattr(payments, "_notify", lambda *a, **k: {"stubbed": True})
    try:
        from notifications import notify_paid_in_full as _orig  # noqa: F401
        monkeypatch.setattr("notifications.notify_paid_in_full", lambda *a, **k: {"stubbed": True})
    except Exception:
        pass

    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat()
    try:
        await mongo.bookings.delete_many({"id": bid})
        await mongo.payment_transactions.delete_many({"booking_id": bid})
        await mongo.bookings.insert_one({
            "id": bid, "customer_name": "TEST Comp", "customer_email": "t.c@example.com",
            "status": "pending", "payment_status": "pending", "booking_date": tomorrow,
            "total": 50.0, "balance_due": 0.0, "item_name": "TEST", "created_at": _now(),
        })
        await mongo.payment_transactions.insert_one({
            "session_id": session_id, "booking_id": bid, "provider": "stripe",
            "payment_status": "pending", "status": "initiated", "amount": 50.0,
            "created_at": _now(), "updated_at": _now(),
        })

        event = {
            "id": "evt_TEST_cks_comp",
            "type": "checkout.session.completed",
            "data": {"object": {
                "id": session_id,
                "payment_status": "paid",
                "metadata": {"booking_id": bid},
            }},
        }
        await payments._process_stripe_event(event)

        booking = await mongo.bookings.find_one({"id": bid})
        tx = await mongo.payment_transactions.find_one({"session_id": session_id})
        assert booking["payment_status"] == "paid"
        assert booking["status"] == "confirmed"
        assert tx["payment_status"] == "paid"
    finally:
        await _cleanup(mongo, [bid])


# ===== checkout.session.expired triggers send_payment_retry =================
@pytest.mark.asyncio
async def test_checkout_session_expired_triggers_retry(monkeypatch):
    from routes import payments
    calls = []

    async def fake_send_payment_retry(booking_id, session_id=None, reason=None):
        calls.append({"booking_id": booking_id, "session_id": session_id, "reason": reason})

    # The handler does: from routes.payment_digest import send_payment_retry
    import routes.payment_digest as pd
    monkeypatch.setattr(pd, "send_payment_retry", fake_send_payment_retry)

    event = {
        "id": "evt_TEST_exp",
        "type": "checkout.session.expired",
        "data": {"object": {"id": "cs_TEST_exp", "metadata": {"booking_id": "TESTEXP1"}}},
    }
    await payments._process_stripe_event(event)
    assert len(calls) == 1
    assert calls[0]["booking_id"] == "TESTEXP1"
    assert calls[0]["session_id"] == "cs_TEST_exp"
    assert calls[0]["reason"] == "expired"


# ===== payment_intent.succeeded marks paid ==================================
@pytest.mark.asyncio
async def test_payment_intent_succeeded_marks_paid(mongo):
    from routes import payments
    bid = "TESTPIS1"
    pi = "pi_TEST_succeeded"
    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat()
    try:
        await mongo.bookings.delete_many({"id": bid})
        await mongo.payment_transactions.delete_many({"booking_id": bid})
        await mongo.bookings.insert_one({
            "id": bid, "customer_name": "TEST PI", "customer_email": "t.pi@example.com",
            "status": "pending", "payment_status": "pending", "booking_date": tomorrow,
            "total": 25.0, "item_name": "TEST", "created_at": _now(),
        })
        await mongo.payment_transactions.insert_one({
            "booking_id": bid, "stripe_payment_intent": pi, "provider": "stripe",
            "payment_status": "pending", "status": "initiated", "amount": 25.0,
            "created_at": _now(), "updated_at": _now(),
        })
        event = {
            "id": "evt_TEST_pis",
            "type": "payment_intent.succeeded",
            "data": {"object": {"id": pi, "metadata": {"booking_id": bid}}},
        }
        await payments._process_stripe_event(event)

        booking = await mongo.bookings.find_one({"id": bid})
        tx = await mongo.payment_transactions.find_one({"stripe_payment_intent": pi})
        assert booking["payment_status"] == "paid"
        assert tx["payment_status"] == "paid"
    finally:
        await _cleanup(mongo, [bid])


# ===== POST /api/webhooks/stripe unverifiable -> 400 ========================
def test_webhook_unverifiable_returns_400():
    r = requests.post(
        f"{BASE}/api/webhooks/stripe",
        json={"id": "evt_fake_iter34", "type": "checkout.session.completed"},
        timeout=30,
    )
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"


# ===== Cleanup stripe_webhook_events test entries ===========================
@pytest.mark.asyncio
async def test_zz_cleanup_stripe_events(mongo):
    """Final cleanup: remove any TEST evt_ or fake webhook event records."""
    r = await mongo.stripe_webhook_events.delete_many({
        "event_id": {"$regex": "^evt_(TEST|fake)"}
    })
    print(f"Cleaned {r.deleted_count} stripe_webhook_events test rows")
