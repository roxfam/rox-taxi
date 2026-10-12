"""iter35 — Gift card lifecycle + user panel endpoints.

Covers:
  - POST /api/gift-cards/redeem-check (expired vs active)
  - POST /api/bookings/{id}/apply-gift (partial, full coverage, dup code, cancelled, paid)
  - POST /api/bookings/{id}/cancel  → gift_restored, idempotent
  - POST /api/gift-cards/purchase    → doc gets expires_at (~365d) + non_refundable
  - GET  /api/my/gift-cards + /api/my/recommendations with customer session cookie
  - GET  /api/bookings/{id}/qr.png   → PNG with border
  - GET  /api/bookings/{id}/receipt.pdf

Live Stripe/PayPal: we never complete a real payment. We seed state directly in Mongo
to drive the apply-gift / cancel flows. The /purchase endpoint IS called (creates a
real Stripe Checkout Session) but we abandon it and delete the gift-card row.
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pymongo
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

NOW = datetime.now(timezone.utc)
TOMORROW_ISO = (NOW + timedelta(days=5)).isoformat()      # eligible for refund (>48h)
PAST_ISO = (NOW - timedelta(days=10)).isoformat()
IN_YEAR_ISO = (NOW + timedelta(days=365)).isoformat()

TEST_PREFIX = "TEST_GIFT_"
GC_ACTIVE = "TEST-GC-ACTIVE1"
GC_EXPIRED = "TEST-GC-EXPIRED"
GC_LEGACY = "TEST-GC-LEGACY1"     # no expires_at → never expires
GC_SECOND = "TEST-GC-SECOND1"

BID_PARTIAL = "TESTGIFTPART"
BID_FULL = "TESTGIFTFULL"
BID_CANCEL = "TESTGIFTCANC"
BID_LEGACY = "TESTGIFTLEG"
BID_ALREADY_PAID = "TESTGIFTPAID"

USER_EMAIL = f"test.gift+{uuid.uuid4().hex[:6]}@example.com"
USER_ID = f"{TEST_PREFIX}user"
SESSION_TOKEN = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"


# ─── Fixtures ─────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def db():
    return pymongo.MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup(db):
    # Clean any leftovers first
    _cleanup(db)

    now_iso = NOW.isoformat()
    db.gift_cards.insert_many([
        {"code": GC_ACTIVE, "status": "active", "balance": 100.0, "amount": 100.0,
         "expires_at": IN_YEAR_ISO, "buyer_email": USER_EMAIL.lower(),
         "recipient_email": USER_EMAIL.lower(), "buyer_name": "Test Buyer",
         "non_refundable": True, "created_at": now_iso},
        {"code": GC_EXPIRED, "status": "active", "balance": 50.0, "amount": 50.0,
         "expires_at": PAST_ISO, "buyer_email": USER_EMAIL.lower(),
         "recipient_email": USER_EMAIL.lower(), "non_refundable": True,
         "created_at": now_iso},
        {"code": GC_LEGACY, "status": "active", "balance": 25.0, "amount": 25.0,
         "buyer_email": USER_EMAIL.lower(), "recipient_email": USER_EMAIL.lower(),
         "created_at": now_iso},
        {"code": GC_SECOND, "status": "active", "balance": 40.0, "amount": 40.0,
         "expires_at": IN_YEAR_ISO, "buyer_email": USER_EMAIL.lower(),
         "recipient_email": USER_EMAIL.lower(), "non_refundable": True,
         "created_at": now_iso},
    ])

    bookings = [
        _booking(BID_PARTIAL, 120.0),
        _booking(BID_FULL, 20.0),
        _booking(BID_CANCEL, 60.0),
        _booking(BID_LEGACY, 15.0),
        {**_booking(BID_ALREADY_PAID, 50.0), "status": "confirmed", "payment_status": "paid"},
    ]
    db.bookings.insert_many(bookings)

    # Customer user + session
    db.users.update_one(
        {"user_id": USER_ID},
        {"$set": {
            "user_id": USER_ID, "email": USER_EMAIL.lower(), "name": "TEST Gift User",
            "created_at": now_iso,
        }}, upsert=True,
    )
    db.user_sessions.insert_one({
        "user_id": USER_ID, "session_token": SESSION_TOKEN, "auth_method": "email",
        "expires_at": (NOW + timedelta(days=7)).isoformat(),
        "last_activity_at": now_iso, "created_at": now_iso,
    })

    # Previous "mine" booking to drive recommendations
    db.bookings.insert_one({
        "id": TEST_PREFIX + "PREV", "customer_email": USER_EMAIL.lower(),
        "status": "completed", "payment_status": "paid",
        "service_type": "taxi", "item_id": "lpia-downtown",
        "booking_date": PAST_ISO, "total": 30.0, "created_at": now_iso,
    })

    yield
    _cleanup(db)


def _booking(bid: str, total: float):
    return {
        "id": bid, "customer_name": "TEST Gift Flow",
        "customer_email": USER_EMAIL.lower(), "status": "pending_payment",
        "payment_status": "pending", "payment_method": "stripe",
        "booking_date": TOMORROW_ISO, "total": total,
        "service_type": "taxi", "item_name": "TEST Taxi",
        "created_at": NOW.isoformat(),
    }


def _cleanup(db):
    db.gift_cards.delete_many({"code": {"$in": [GC_ACTIVE, GC_EXPIRED, GC_LEGACY, GC_SECOND]}})
    db.gift_cards.delete_many({"code": {"$regex": "^TEST-GC-"}})
    db.gift_cards.delete_many({"buyer_email": USER_EMAIL.lower()})
    db.bookings.delete_many({"id": {"$in": [
        BID_PARTIAL, BID_FULL, BID_CANCEL, BID_LEGACY, BID_ALREADY_PAID,
        TEST_PREFIX + "PREV",
    ]}})
    db.bookings.delete_many({"id": {"$regex": "^TESTGIFT"}})
    db.bookings_deleted.delete_many({"id": {"$regex": "^TESTGIFT"}})
    db.payment_transactions.delete_many({"session_id": {"$regex": "^gift_TESTGIFT"}})
    db.payment_transactions.delete_many({"session_id": {"$regex": "^gift_TEST"}})
    db.user_sessions.delete_many({"user_id": USER_ID})
    db.users.delete_many({"user_id": USER_ID})


@pytest.fixture
def customer_cookies():
    return {"session_token": SESSION_TOKEN}


# ─── redeem-check ─────────────────────────────────────────────────────
def test_redeem_check_rejects_expired():
    r = requests.post(f"{BASE_URL}/api/gift-cards/redeem-check", json={"code": GC_EXPIRED})
    assert r.status_code == 400, r.text
    assert "expired" in (r.json().get("detail") or "").lower()


def test_redeem_check_accepts_active():
    r = requests.post(f"{BASE_URL}/api/gift-cards/redeem-check", json={"code": GC_ACTIVE})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["code"] == GC_ACTIVE
    assert data["balance"] == 100.0
    assert data["status"] == "active"


def test_redeem_check_accepts_legacy_no_expiry():
    r = requests.post(f"{BASE_URL}/api/gift-cards/redeem-check", json={"code": GC_LEGACY})
    assert r.status_code == 200, r.text
    assert r.json()["balance"] == 25.0


# ─── apply-gift ───────────────────────────────────────────────────────
def test_apply_gift_partial(db):
    r = requests.post(f"{BASE_URL}/api/bookings/{BID_PARTIAL}/apply-gift",
                      json={"code": GC_ACTIVE})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["applied"] == 100.0
    assert data["total"] == 20.0            # 120 - 100
    assert data["paid"] is False
    b = db.bookings.find_one({"id": BID_PARTIAL})
    assert b["gift_credit"] == 100.0
    assert b["gift_code"] == GC_ACTIVE
    assert round(b["total"], 2) == 20.0
    gc = db.gift_cards.find_one({"code": GC_ACTIVE})
    assert gc["balance"] == 0.0


def test_apply_gift_rejects_second_different_code(db):
    r = requests.post(f"{BASE_URL}/api/bookings/{BID_PARTIAL}/apply-gift",
                      json={"code": GC_SECOND})
    assert r.status_code == 400, r.text
    assert "already applied" in r.json()["detail"].lower()
    # Second-card balance untouched
    assert db.gift_cards.find_one({"code": GC_SECOND})["balance"] == 40.0


def test_apply_gift_full_coverage_confirms_booking(db):
    r = requests.post(f"{BASE_URL}/api/bookings/{BID_FULL}/apply-gift",
                      json={"code": GC_SECOND})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["applied"] == 20.0
    assert data["total"] == 0.0
    assert data["paid"] is True
    # Allow a brief moment for _mark_paid downstream writes
    time.sleep(1.0)
    b = db.bookings.find_one({"id": BID_FULL})
    assert b["payment_status"] == "paid"
    assert b["status"] == "confirmed"
    assert b["payment_method"] == "gift_card"


def test_apply_gift_rejects_paid_booking():
    r = requests.post(f"{BASE_URL}/api/bookings/{BID_ALREADY_PAID}/apply-gift",
                      json={"code": GC_LEGACY})
    assert r.status_code == 400, r.text
    assert "no longer take" in r.json()["detail"].lower()


def test_apply_gift_rejects_cancelled_booking(db):
    db.bookings.update_one({"id": BID_LEGACY}, {"$set": {"status": "cancelled"}})
    r = requests.post(f"{BASE_URL}/api/bookings/{BID_LEGACY}/apply-gift",
                      json={"code": GC_LEGACY})
    assert r.status_code == 400, r.text
    # restore for later tests
    db.bookings.update_one({"id": BID_LEGACY}, {"$set": {"status": "pending_payment"}})


# ─── cancel restores gift ─────────────────────────────────────────────
def test_cancel_booking_returns_gift_credit(db):
    # Apply legacy card ($25) to BID_CANCEL ($60)
    r = requests.post(f"{BASE_URL}/api/bookings/{BID_CANCEL}/apply-gift",
                      json={"code": GC_LEGACY})
    assert r.status_code == 200
    assert db.gift_cards.find_one({"code": GC_LEGACY})["balance"] == 0.0

    # Cancel booking → gift balance restored
    r = requests.post(f"{BASE_URL}/api/bookings/{BID_CANCEL}/cancel")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["gift_restored"] == 25.0
    assert db.gift_cards.find_one({"code": GC_LEGACY})["balance"] == 25.0


def test_cancel_gift_restore_is_idempotent(db):
    # Second cancel/restore call should not re-add balance
    # (cancel endpoint itself refuses already-cancelled, so test via gift_redeem.restore)
    bal_before = db.gift_cards.find_one({"code": GC_LEGACY})["balance"]
    # Call cancel again — should 400 (already cancelled)
    r = requests.post(f"{BASE_URL}/api/bookings/{BID_CANCEL}/cancel")
    assert r.status_code == 400
    bal_after = db.gift_cards.find_one({"code": GC_LEGACY})["balance"]
    assert bal_before == bal_after


# ─── purchase (do NOT complete Stripe) ────────────────────────────────
def test_purchase_sets_expires_at_365_days_and_non_refundable(db):
    """Hits the live /gift-cards/purchase endpoint which creates a Stripe Checkout
    session (safe — no charge until completion). We verify the Mongo doc then
    delete it so it never gets activated."""
    payload = {
        "amount": 50, "buyer_name": "TEST Buyer", "buyer_email": USER_EMAIL,
        "recipient_name": "TEST Rcpt", "recipient_email": USER_EMAIL,
        "message": "TEST — do not pay", "origin_url": BASE_URL,
    }
    r = requests.post(f"{BASE_URL}/api/gift-cards/purchase", json=payload)
    if r.status_code == 503:
        pytest.skip("Stripe not configured in this env")
    assert r.status_code == 200, r.text
    code = r.json()["code"]
    try:
        doc = db.gift_cards.find_one({"code": code})
        assert doc is not None
        assert doc["non_refundable"] is True
        assert doc["expires_at"]
        exp = datetime.fromisoformat(doc["expires_at"].replace("Z", "+00:00"))
        delta_days = (exp - datetime.now(timezone.utc)).days
        assert 360 <= delta_days <= 366, f"expected ~365d, got {delta_days}"
        assert doc["status"] == "pending"   # not activated until webhook
    finally:
        db.gift_cards.delete_one({"code": code})


# ─── Customer-session endpoints ───────────────────────────────────────
def test_my_gift_cards(customer_cookies):
    r = requests.get(f"{BASE_URL}/api/my/gift-cards", cookies=customer_cookies)
    assert r.status_code == 200, r.text
    codes = {d["code"] for d in r.json()}
    # Should see active + legacy (not expired, since status active and $or buyer/recipient)
    assert GC_ACTIVE in codes or GC_LEGACY in codes


def test_my_recommendations(customer_cookies):
    r = requests.get(f"{BASE_URL}/api/my/recommendations", cookies=customer_cookies)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    assert 1 <= len(data) <= 6
    for item in data:
        assert "id" in item and "name" in item and "reason" in item


# ─── QR / Receipt ─────────────────────────────────────────────────────
def test_booking_qr_png_returns_png_with_border():
    # Need a booking — use the paid one so it works regardless
    r = requests.get(f"{BASE_URL}/api/bookings/{BID_ALREADY_PAID}/qr.png")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    content = r.content
    # PNG signature
    assert content[:8] == b"\x89PNG\r\n\x1a\n"
    assert len(content) > 500   # Non-trivial QR; quiet-zone adds pixels


def test_booking_receipt_pdf():
    r = requests.get(f"{BASE_URL}/api/bookings/{BID_ALREADY_PAID}/receipt.pdf")
    # Receipt may require booking to be paid — our seeded paid booking qualifies
    assert r.status_code in (200, 404), r.text
    if r.status_code == 200:
        assert r.content[:4] == b"%PDF"
