"""Iteration 27 regression:
- Day-of reminders preview/send-now (admin + CSRF)
- Stripe live-check reads via secrets_store (key_prefix sk_test_)
- CSRF fallback via sessionStorage path still blocked server-side
  without X-CSRF-Token when no cookie is sent (double-submit enforcement)
- send_guest_reminders idempotency unit test
"""
import os
import uuid
import asyncio
from datetime import datetime, timedelta

import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://bahamas-taxi-tours.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASS = "admin123"


# ─── fixtures ─────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "csrf_token" in body and body["csrf_token"], "login must return csrf_token in body"
    s.headers.update({"X-CSRF-Token": body["csrf_token"]})
    return s, body


# ─── Stripe live-check ────────────────────────────────────────────────
class TestStripeLiveCheck:
    def test_reads_secret_and_returns_prefix(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/admin/stripe-live-check", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "key_prefix" in data
        # Prefix must NOT be '(none)' / empty — the whole bug was that it was empty
        assert data["key_prefix"], f"key_prefix empty — secrets_store not read: {data}"
        assert data["key_prefix"].startswith("sk_test_"), f"expected sk_test_… got {data['key_prefix']}"
        assert data["mode"] in ("test", "live", "unknown")


# ─── Day-of reminders ─────────────────────────────────────────────────
class TestDayOfReminders:
    def test_preview_shape(self, admin_session):
        s, _ = admin_session
        r = s.get(f"{API}/admin/dayof-reminders/preview", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("schedule") == "Daily at 12:00 AM Nassau time"
        assert isinstance(d.get("today"), list)
        assert "last_run" in d

    def test_send_now_requires_csrf(self):
        """POST without CSRF header must be rejected (double-submit)."""
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200
        # Strip CSRF cookie + no header → should 403
        s.cookies.pop("admin_csrf", None)
        r = s.post(f"{API}/admin/dayof-reminders/send-now", timeout=15)
        assert r.status_code in (401, 403), f"CSRF enforcement missing: {r.status_code} {r.text[:200]}"

    def test_send_now_with_csrf(self, admin_session):
        s, _ = admin_session
        r = s.post(f"{API}/admin/dayof-reminders/send-now", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Returns run result dict
        assert "count" in d
        assert "guest_reminders_sent" in d
        assert isinstance(d["count"], int)


# ─── Idempotency unit test ────────────────────────────────────────────
@pytest.mark.asyncio
async def test_send_guest_reminders_idempotency(monkeypatch):
    """Second call with same booking must not re-send guest reminder."""
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME missing")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    from routes import dayof_reminders as mod
    mod.configure(db=db, require_admin=lambda *a, **k: "x", now_iso=lambda: datetime.utcnow().isoformat())

    bid = f"TEST_dayof_{uuid.uuid4().hex[:8]}"
    today = datetime.now(mod.NASSAU)
    booking = {
        "id": bid,
        "status": "confirmed",
        "booking_date": today.replace(hour=14, minute=30).isoformat(),
        "customer_name": "Test User",
        "customer_email": "test@example.com",
        "customer_phone": "+10000000000",
        "item_name": "TEST tour",
        "pickup_location": "Nassau",
        "payment_status": "paid",
    }
    await db.bookings.insert_one(booking)

    try:
        # Mock notification funcs so we don't send anything real
        import notifications
        calls = {"email": 0, "sms": 0}

        def fake_send_email(*a, **k):
            calls["email"] += 1
            return {"sent": True}

        def fake_send_sms(*a, **k):
            calls["sms"] += 1
            return {"sent": True}

        monkeypatch.setattr(notifications, "send_email", fake_send_email)
        monkeypatch.setattr(notifications, "send_sms", fake_send_sms)

        bookings = await mod.todays_bookings()
        bookings = [b for b in bookings if b["id"] == bid]
        assert bookings, "test booking should appear in today's list"

        n1 = await mod.send_guest_reminders(bookings)
        assert n1 == 1

        # Second run — must be idempotent
        bookings2 = await mod.todays_bookings()
        bookings2 = [b for b in bookings2 if b["id"] == bid]
        n2 = await mod.send_guest_reminders(bookings2)
        assert n2 == 0, "second call must skip already-reminded booking"

        # Verify the field was set
        got = await db.bookings.find_one({"id": bid})
        assert got.get("dayof_reminder_sent_at")
    finally:
        await db.bookings.delete_one({"id": bid})
        client.close()
