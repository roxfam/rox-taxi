"""iter36 — Gift card new features: 10 themes, recipient_phone, scheduled_send_at,
non_refundable=True, admin resend endpoint, admin report `recent` list, and
_drain_scheduled_gifts delivery loop.

Live Stripe: /gift-cards/purchase creates a session but we never pay; we read the
Mongo doc then delete. Live Twilio: resend test uses an active card WITH NO
recipient_phone so no real SMS is dispatched.
"""
import asyncio
import os
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

ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASS = "admin123"

NOW = datetime.now(timezone.utc)
NOW_ISO = NOW.isoformat()
PAST_ISO = (NOW - timedelta(hours=1)).isoformat()
FUTURE_ISO = (NOW + timedelta(days=30)).isoformat()

VALID_THEMES = [
    "classic", "birthday", "honeymoon", "thank_you", "anniversary",
    "wedding", "graduation", "holiday", "mothers_day", "just_because",
]

GC_ACTIVE = f"TEST-GC-ITER36-ACTIVE-{uuid.uuid4().hex[:4].upper()}"
GC_PENDING = f"TEST-GC-ITER36-PENDING-{uuid.uuid4().hex[:4].upper()}"
GC_SCHED = f"TEST-GC-ITER36-SCHED-{uuid.uuid4().hex[:4].upper()}"


@pytest.fixture(scope="module")
def db():
    return pymongo.MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module", autouse=True)
def seed(db):
    _cleanup(db)
    db.gift_cards.insert_many([
        {
            "code": GC_ACTIVE, "status": "active", "amount": 100.0, "balance": 100.0,
            "theme": "birthday",
            "buyer_email": "test_resend_buyer@example.com", "buyer_name": "TEST Buyer",
            "recipient_email": "test_resend@example.com",
            "recipient_name": "TEST Recipient",
            # NO recipient_phone → no real SMS
            "non_refundable": True,
            "created_at": NOW_ISO,
            "expires_at": (NOW + timedelta(days=365)).isoformat(),
            "delivered_at": None,
            "message": "TEST do not pay",
        },
        {
            "code": GC_PENDING, "status": "pending", "amount": 50.0, "balance": 50.0,
            "theme": "classic",
            "buyer_email": "test_resend_buyer@example.com",
            "recipient_email": "test_resend_pending@example.com",
            "non_refundable": True, "created_at": NOW_ISO,
            "expires_at": (NOW + timedelta(days=365)).isoformat(),
            "delivered_at": None,
        },
        {
            "code": GC_SCHED, "status": "active", "amount": 75.0, "balance": 75.0,
            "theme": "anniversary",
            "buyer_email": "test_resend_buyer@example.com",
            "recipient_email": "test_resend_sched@example.com",
            "non_refundable": True, "created_at": NOW_ISO,
            "expires_at": (NOW + timedelta(days=365)).isoformat(),
            "scheduled_send_at": PAST_ISO,  # past → should be drained
            "delivered_at": None,
        },
    ])
    yield
    _cleanup(db)


def _cleanup(db):
    db.gift_cards.delete_many({"code": {"$regex": "^TEST-GC-ITER36-"}})
    db.gift_cards.delete_many({"buyer_email": "test_resend_buyer@example.com"})


# ───── /gift-cards/purchase: theme + phone + scheduled_send_at ─────
def test_purchase_persists_theme_phone_schedule(db):
    """Round-trip the live purchase endpoint with all new fields. Verify the Mongo
    doc has them set (status=pending, non_refundable=True, expires~365d). Then
    delete the card so Stripe can never activate it."""
    future = (NOW + timedelta(days=14)).isoformat()
    payload = {
        "amount": 60, "buyer_name": "TEST Buyer",
        "buyer_email": "test_iter36_buyer@example.com",
        "recipient_email": "test_iter36_rcpt@example.com",
        "recipient_name": "TEST Rcpt",
        "recipient_phone": "+12425550000",
        "theme": "honeymoon",
        "message": "TEST — do not pay",
        "scheduled_send_at": future,
        "origin_url": BASE_URL,
    }
    r = requests.post(f"{BASE_URL}/api/gift-cards/purchase", json=payload)
    if r.status_code == 503:
        pytest.skip("Stripe not configured")
    if r.status_code == 500 and "429" in r.text:
        pytest.skip("Stripe shared sandbox rate-limited (429)")
    assert r.status_code == 200, r.text
    code = r.json()["code"]
    try:
        doc = db.gift_cards.find_one({"code": code})
        assert doc is not None
        assert doc["theme"] == "honeymoon"
        assert doc["recipient_phone"] == "+12425550000"
        assert doc["scheduled_send_at"] is not None
        assert doc["non_refundable"] is True
        assert doc["status"] == "pending"
        assert doc["delivered_at"] is None
        exp = datetime.fromisoformat(doc["expires_at"].replace("Z", "+00:00"))
        days = (exp - datetime.now(timezone.utc)).days
        assert 360 <= days <= 366
    finally:
        db.gift_cards.delete_one({"code": code})


def test_pydantic_accepts_all_ten_themes():
    """Validate the GiftCardPurchaseRequest schema itself accepts all 10 themes
    (avoids spamming Stripe sandbox with 10 parallel sessions)."""
    import sys
    sys.path.insert(0, "/app/backend")
    from server import GiftCardPurchaseRequest  # noqa: PLC0415
    base = dict(
        amount=25, buyer_name="t", buyer_email="t@t.co",
        recipient_email="r@t.co", origin_url="http://x",
    )
    for theme in VALID_THEMES:
        obj = GiftCardPurchaseRequest(**base, theme=theme)
        assert obj.theme == theme


def test_pydantic_rejects_invalid_theme():
    import sys
    sys.path.insert(0, "/app/backend")
    from server import GiftCardPurchaseRequest  # noqa: PLC0415
    import pydantic
    with pytest.raises(pydantic.ValidationError):
        GiftCardPurchaseRequest(
            amount=25, buyer_name="t", buyer_email="t@t.co",
            recipient_email="r@t.co", origin_url="http://x", theme="not_a_theme",
        )


def test_purchase_rejects_invalid_theme():
    payload = {
        "amount": 25, "buyer_name": "TEST",
        "buyer_email": "test_iter36_bad@example.com",
        "recipient_email": "test_iter36_bad_r@example.com",
        "theme": "not_a_theme", "origin_url": BASE_URL,
    }
    r = requests.post(f"{BASE_URL}/api/gift-cards/purchase", json=payload)
    assert r.status_code == 422, r.text


# ───── admin report `recent` list ─────────────────────────────────
def test_admin_report_includes_recent_with_new_fields(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/gift-cards/report", headers=admin_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "recent" in data
    assert isinstance(data["recent"], list)
    # Our seeded GC_ACTIVE should appear
    found = next((g for g in data["recent"] if g["code"] == GC_ACTIVE), None)
    assert found is not None, f"GC_ACTIVE not in recent (len={len(data['recent'])})"
    for key in ("theme", "recipient_phone", "scheduled_send_at", "delivered_at", "resent_at"):
        assert key in found, f"Missing key {key} in recent row"
    assert found["theme"] == "birthday"


def test_admin_report_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/gift-cards/report")
    assert r.status_code == 401


# ───── POST /admin/gift-cards/{code}/resend ───────────────────────
def test_resend_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/gift-cards/{GC_ACTIVE}/resend")
    assert r.status_code == 401


def test_resend_unknown_404(admin_headers):
    r = requests.post(f"{BASE_URL}/api/admin/gift-cards/NOPE-NOPE/resend",
                      headers=admin_headers)
    assert r.status_code == 404


def test_resend_pending_400(admin_headers):
    r = requests.post(f"{BASE_URL}/api/admin/gift-cards/{GC_PENDING}/resend",
                      headers=admin_headers)
    assert r.status_code == 400
    assert "active" in r.json()["detail"].lower()


def test_resend_active_card_succeeds_and_sets_resent_at(db, admin_headers):
    r = requests.post(f"{BASE_URL}/api/admin/gift-cards/{GC_ACTIVE}/resend",
                      headers=admin_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "sent" in data
    assert data.get("to") == "test_resend@example.com"
    # resent_at should be set regardless of email provider result
    doc = db.gift_cards.find_one({"code": GC_ACTIVE})
    assert doc.get("resent_at")


# ───── _drain_scheduled_gifts ─────────────────────────────────────
def test_drain_scheduled_gifts_marks_delivered(db):
    """Call the internal drain function; a past-scheduled active card with
    delivered_at null must get delivered_at populated."""
    import sys
    sys.path.insert(0, "/app/backend")
    import server  # noqa: PLC0415

    # confirm pre-state
    pre = db.gift_cards.find_one({"code": GC_SCHED})
    assert pre["delivered_at"] is None
    assert pre["scheduled_send_at"] is not None

    res = asyncio.get_event_loop().run_until_complete(server._drain_scheduled_gifts())
    assert isinstance(res, dict)
    # verify db
    post = db.gift_cards.find_one({"code": GC_SCHED})
    assert post["delivered_at"] is not None, "scheduled past card should have been delivered"
