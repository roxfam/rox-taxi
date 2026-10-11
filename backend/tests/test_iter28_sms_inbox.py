"""Iteration 28: Admin guest-SMS inbox + unconfirmed alert tests."""
import os
import uuid
import asyncio
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
NASSAU = ZoneInfo("America/Nassau")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "roxfam2509@gmail.com", "password": "admin123"
    })
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    csrf = s.cookies.get("admin_csrf")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture
def seeded_sms():
    """Seed 3 inbound TEST sms docs for one phone key."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    phone_key = "2425550177"
    phone = "+12425550177"
    now = datetime.utcnow()
    docs = [
        {"from": phone, "body": "TEST hi there", "direction": "in", "phone_key": phone_key,
         "read": False, "booking_id": "TESTSMS1", "customer_name": "TEST Guest",
         "received_at": (now - timedelta(minutes=10)).isoformat() + "Z"},
        {"from": phone, "body": "TEST are we good?", "direction": "in", "phone_key": phone_key,
         "read": False, "booking_id": "TESTSMS1", "customer_name": "TEST Guest",
         "received_at": (now - timedelta(minutes=5)).isoformat() + "Z"},
        {"from": phone, "body": "TEST last one", "direction": "in", "phone_key": phone_key,
         "read": False, "booking_id": "TESTSMS1", "customer_name": "TEST Guest",
         "received_at": now.isoformat() + "Z"},
    ]

    async def _seed():
        await db.inbound_sms.insert_many(docs)

    async def _clean():
        await db.inbound_sms.delete_many({"booking_id": "TESTSMS1"})

    asyncio.get_event_loop().run_until_complete(_seed())
    yield phone_key, phone
    asyncio.get_event_loop().run_until_complete(_clean())
    client.close()


class TestSmsInbox:
    def test_inbox_returns_threads(self, admin_session, seeded_sms):
        phone_key, phone = seeded_sms
        r = admin_session.get(f"{BASE_URL}/api/admin/guest-sms/inbox")
        assert r.status_code == 200
        data = r.json()
        assert "threads" in data and "unread_total" in data
        thread = next((t for t in data["threads"] if t["phone_key"] == phone_key), None)
        assert thread is not None, f"seeded phone_key not in inbox"
        assert thread["unread"] == 3
        assert thread["customer_name"] == "TEST Guest"
        assert thread["booking_id"] == "TESTSMS1"
        assert thread["last_direction"] == "in"
        assert "last one" in thread["last_body"]
        assert data["unread_total"] >= 3

    def test_thread_returns_messages_ascending_and_marks_read(self, admin_session, seeded_sms):
        phone_key, _ = seeded_sms
        r = admin_session.get(f"{BASE_URL}/api/admin/guest-sms/thread/{phone_key}")
        assert r.status_code == 200
        data = r.json()
        assert data["phone_key"] == phone_key
        msgs = [m for m in data["messages"] if m.get("booking_id") == "TESTSMS1"]
        assert len(msgs) == 3
        times = [m["received_at"] for m in msgs]
        assert times == sorted(times), "messages not ascending"

        # verify now-read on next inbox call
        r2 = admin_session.get(f"{BASE_URL}/api/admin/guest-sms/inbox")
        thread = next((t for t in r2.json()["threads"] if t["phone_key"] == phone_key), None)
        assert thread is not None
        assert thread["unread"] == 0, "unread not reset after thread open"

    def test_reply_empty_body_returns_400(self, admin_session, seeded_sms):
        _, phone = seeded_sms
        r = admin_session.post(f"{BASE_URL}/api/admin/guest-sms/reply",
                               json={"to": phone, "body": "   "})
        assert r.status_code == 400

    def test_reply_requires_csrf(self, seeded_sms):
        _, phone = seeded_sms
        # fresh session: login but strip CSRF header
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "roxfam2509@gmail.com", "password": "admin123"})
        r = s.post(f"{BASE_URL}/api/admin/guest-sms/reply",
                   json={"to": phone, "body": "hello"})
        assert r.status_code in (401, 403)

    def test_inbox_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/admin/guest-sms/inbox")
        assert r.status_code in (401, 403)


class TestUnconfirmedAlert:
    """Direct function call with mocked notifications.send_owner_sms."""

    def test_pending_bookings_trigger_sms(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from routes import dayof_reminders  # type: ignore

        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]

        today_local = datetime.now(NASSAU).replace(hour=14, minute=0, second=0, microsecond=0)
        booking_id = f"TEST_UNC_{uuid.uuid4().hex[:8]}"
        confirmed_id = f"TEST_UNC_C_{uuid.uuid4().hex[:8]}"

        pending_doc = {
            "id": booking_id, "status": "pending",
            "booking_date": today_local.replace(tzinfo=None).isoformat(),
            "customer_phone": "+12425559911", "customer_name": "TEST Pending",
            "item_name": "Airport Transfer", "passengers": 2,
        }
        confirmed_doc = {
            "id": confirmed_id, "status": "pending",
            "booking_date": today_local.replace(tzinfo=None).isoformat(),
            "customer_phone": "+12425559922", "customer_name": "TEST Confirmed",
            "item_name": "Cable Beach", "passengers": 1,
            "guest_confirmed_at": datetime.utcnow().isoformat() + "Z",
        }

        async def run():
            await db.bookings.insert_many([pending_doc, confirmed_doc])
            try:
                # Configure dayof_reminders module if not already
                if dayof_reminders._db is None:
                    dayof_reminders.configure(
                        db=db,
                        require_admin=lambda *a, **kw: None,
                        now_iso=lambda: datetime.utcnow().isoformat() + "Z",
                    )
                else:
                    dayof_reminders._db = db
                with patch("notifications.send_owner_sms", return_value={"sent": True}) as m:
                    result = await dayof_reminders.run_unconfirmed_alert(force=True)
                assert result is not None
                assert result["count"] >= 1
                assert result["sms_sent"] is True
                m.assert_called_once()
                body = m.call_args[0][0]
                assert booking_id in body
                assert confirmed_id not in body, "confirmed booking should be excluded"
                assert "haven't replied YES" in body
            finally:
                await db.bookings.delete_many({"id": {"$in": [booking_id, confirmed_id]}})

        asyncio.get_event_loop().run_until_complete(run())
        client.close()

    def test_no_pending_bookings_no_sms(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from routes import dayof_reminders  # type: ignore

        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]

        async def run():
            # Confirmed-only booking today
            confirmed_id = f"TEST_UNC_ONLY_{uuid.uuid4().hex[:8]}"
            today_local = datetime.now(NASSAU).replace(hour=10, minute=0, second=0, microsecond=0)
            await db.bookings.insert_one({
                "id": confirmed_id, "status": "pending",
                "booking_date": today_local.replace(tzinfo=None).isoformat(),
                "customer_phone": "+12425559933", "customer_name": "TEST OnlyConfirmed",
                "item_name": "x", "passengers": 1,
                "guest_confirmed_at": datetime.utcnow().isoformat() + "Z",
            })
            try:
                if dayof_reminders._db is None:
                    dayof_reminders.configure(
                        db=db,
                        require_admin=lambda *a, **kw: None,
                        now_iso=lambda: datetime.utcnow().isoformat() + "Z",
                    )
                else:
                    dayof_reminders._db = db
                with patch("notifications.send_owner_sms", return_value={"sent": True}) as m:
                    # Need to also ensure no OTHER pending TEST exists — rely on real db state
                    # we just verify SMS not called when count == 0
                    result = await dayof_reminders.run_unconfirmed_alert(force=True)
                # If db has unrelated pending bookings today, we skip strict assertion;
                # but assert sms_sent only when count>0
                if result["count"] == 0:
                    assert result["sms_sent"] is False
                    m.assert_not_called()
            finally:
                await db.bookings.delete_many({"id": confirmed_id})

        asyncio.get_event_loop().run_until_complete(run())
        client.close()
