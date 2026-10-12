"""Iteration 31: admin booking cancel + delete row actions.

Covers:
- POST /api/admin/bookings/{id}/cancel  (idempotent, status_history push, notify_guest flag)
- DELETE /api/admin/bookings/{id}       (archive to bookings_deleted, 404 on re-delete)
- CSRF: foreign Origin without token → 403 for DELETE
"""
import os
import asyncio
import pytest
import requests
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

# Pin all tests in this module to a single xdist worker so TESTROW1/TESTROW2
# aren't fought over by parallel workers.
pytestmark = pytest.mark.xdist_group(name="iter31_rowactions")


def _loop():
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


def _now_iso():
    return datetime.utcnow().isoformat() + "Z"


def _mk_booking(bid: str, overrides: dict = None):
    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
    doc = {
        "id": bid,
        "customer_name": "TEST Row",
        "customer_email": "test.row@example.com",
        # intentionally no phone → notify_guest=True still returns no SMS
        "status": "confirmed",
        "payment_status": "pending",
        "payment_method": "stripe",
        "booking_date": tomorrow,
        "total": 40.0,
        "item_name": "TEST Taxi",
        "created_at": _now_iso(),
    }
    if overrides:
        doc.update(overrides)
    return doc


async def _reset_booking(bid: str, doc: dict = None):
    client = AsyncIOMotorClient(MONGO_URL)
    await client[DB_NAME].bookings.delete_one({"id": bid})
    await client[DB_NAME].bookings_deleted.delete_many({"id": bid})
    if doc is not None:
        await client[DB_NAME].bookings.insert_one(dict(doc))
    client.close()


async def _fetch_booking(bid: str, collection: str = "bookings"):
    client = AsyncIOMotorClient(MONGO_URL)
    d = await client[DB_NAME][collection].find_one({"id": bid}, {"_id": 0})
    client.close()
    return d


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "roxfam2509@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("admin_csrf")
    assert csrf, "No admin_csrf cookie set"
    s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture
def seeded_row1(request):
    bid = f"TESTROW1_{request.node.name[:20]}"
    doc = _mk_booking(bid)
    _loop().run_until_complete(_reset_booking(bid, doc))
    yield doc
    _loop().run_until_complete(_reset_booking(bid, None))


@pytest.fixture
def seeded_row2(request):
    bid = f"TESTROW2_{request.node.name[:20]}"
    doc = _mk_booking(bid, {"customer_name": "TEST Row 2", "customer_email": "test.row2@example.com"})
    _loop().run_until_complete(_reset_booking(bid, doc))
    yield doc
    _loop().run_until_complete(_reset_booking(bid, None))


# ── Cancel ──────────────────────────────────────────────────────────────────
class TestAdminCancelBooking:
    def test_cancel_no_notify_sets_status_and_history(self, admin_session, seeded_row1):
        bid = seeded_row1["id"]
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{bid}/cancel",
            json={"reason": "TEST reason", "notify_guest": False},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["cancelled"] is True
        assert body.get("guest_notified") is False

        # verify DB persistence
        doc = _loop().run_until_complete(_fetch_booking(bid))
        assert doc["status"] == "cancelled"
        assert doc["cancel_reason"] == "TEST reason"
        assert doc.get("cancelled_at")
        assert doc.get("cancelled_by")
        hist = doc.get("status_history") or []
        assert any(h.get("status") == "cancelled" and h.get("note") == "TEST reason" for h in hist)
        # Should NOT have cancel_notice when notify_guest=False
        assert "cancel_notice" not in doc or doc.get("cancel_notice") is None

    def test_cancel_idempotent_second_call(self, admin_session, seeded_row1):
        bid = seeded_row1["id"]
        r1 = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{bid}/cancel",
            json={"reason": "first", "notify_guest": False})
        assert r1.status_code == 200
        r2 = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{bid}/cancel",
            json={"reason": "second", "notify_guest": False})
        assert r2.status_code == 200
        body = r2.json()
        assert body["cancelled"] is True
        assert body.get("already") is True
        assert body.get("guest_notified") is False

    def test_cancel_notify_guest_email_only(self, admin_session, seeded_row2):
        """notify_guest=True with email but no phone → email attempted, no SMS."""
        bid = seeded_row2["id"]
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{bid}/cancel",
            json={"reason": "TEST notify", "notify_guest": True},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["cancelled"] is True
        # guest_notified mirrors whether email/sms claim sent — we don't require True
        # (sandbox may stub). But cancel_notice must be stored.
        doc = _loop().run_until_complete(_fetch_booking(bid))
        notice = doc.get("cancel_notice")
        assert notice is not None, "cancel_notice should be persisted when notify_guest=True"
        # No phone → sms.sent must be False
        assert notice.get("sms", {}).get("sent") is False

    def test_cancel_unknown_404(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/NOPE_ROW_XYZ/cancel",
            json={"reason": "x", "notify_guest": False})
        assert r.status_code == 404


# ── Delete ──────────────────────────────────────────────────────────────────
class TestAdminDeleteBooking:
    def test_delete_archives_and_removes(self, admin_session, seeded_row1):
        bid = seeded_row1["id"]
        r = admin_session.delete(f"{BASE_URL}/api/admin/bookings/{bid}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("deleted") is True
        assert body.get("id") == bid

        # Removed from bookings
        live = _loop().run_until_complete(_fetch_booking(bid, "bookings"))
        assert live is None

        # Archived in bookings_deleted
        archived = _loop().run_until_complete(_fetch_booking(bid, "bookings_deleted"))
        assert archived is not None
        assert archived["id"] == bid
        assert archived.get("deleted_at")
        assert archived.get("deleted_by")
        # Original fields preserved
        assert archived.get("customer_name") == "TEST Row"

    def test_delete_second_call_404(self, admin_session, seeded_row2):
        bid = seeded_row2["id"]
        r1 = admin_session.delete(f"{BASE_URL}/api/admin/bookings/{bid}")
        assert r1.status_code == 200
        r2 = admin_session.delete(f"{BASE_URL}/api/admin/bookings/{bid}")
        assert r2.status_code == 404

    def test_delete_foreign_origin_without_csrf_token_403(self, seeded_row1):
        """Fresh session, no CSRF header, foreign origin → 403."""
        s = requests.Session()
        login = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "roxfam2509@gmail.com", "password": "admin123"})
        assert login.status_code == 200
        # intentionally no X-CSRF-Token header
        r = s.delete(
            f"{BASE_URL}/api/admin/bookings/{seeded_row1['id']}",
            headers={"Origin": "https://evil.com"},
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"
        # Booking must still exist (not deleted)
        doc = _loop().run_until_complete(_fetch_booking(seeded_row1["id"]))
        assert doc is not None, "booking should NOT have been deleted"
