"""Iteration 32: refundable check, cancel-with-refund, recently-deleted + restore."""
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

pytestmark = pytest.mark.xdist_group(name="iter32_refund_restore")


def _loop():
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


def _now_iso():
    return datetime.utcnow().isoformat() + "Z"


def _mk(bid, **ov):
    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
    doc = {
        "id": bid,
        "customer_name": "TEST Refund",
        "customer_email": "test.rf@example.com",
        "status": "confirmed",
        "payment_status": "pending",
        "payment_method": "stripe",
        "booking_date": tomorrow,
        "total": 40.0,
        "item_name": "TEST Taxi",
        "created_at": _now_iso(),
    }
    doc.update(ov)
    return doc


async def _reset(bid, doc=None, tx=None):
    c = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    await c.bookings.delete_one({"id": bid})
    await c.bookings_deleted.delete_many({"id": bid})
    await c.payment_transactions.delete_many({"booking_id": bid})
    if doc is not None:
        await c.bookings.insert_one(dict(doc))
    if tx is not None:
        await c.payment_transactions.insert_one(dict(tx))


async def _cleanup(bid):
    c = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    await c.bookings.delete_one({"id": bid})
    await c.bookings_deleted.delete_many({"id": bid})
    await c.payment_transactions.delete_many({"booking_id": bid})


async def _fetch(bid, coll="bookings"):
    c = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    return await c[coll].find_one({"id": bid}, {"_id": 0})


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "roxfam2509@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("admin_csrf")
    assert csrf
    s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture
def seeded_unpaid(request):
    bid = f"TESTRF1_{request.node.name[:16]}"
    doc = _mk(bid)
    _loop().run_until_complete(_reset(bid, doc))
    yield doc
    _loop().run_until_complete(_cleanup(bid))


@pytest.fixture
def seeded_paid(request):
    bid = f"TESTRF2_{request.node.name[:16]}"
    doc = _mk(bid, payment_status="paid", total=60.0)
    tx = {
        "session_id": f"cs_TEST_{bid}",
        "booking_id": bid,
        "payment_status": "paid",
        "provider": "stripe",
        "amount": 60.0,
        "updated_at": _now_iso(),
    }
    _loop().run_until_complete(_reset(bid, doc, tx))
    yield doc
    _loop().run_until_complete(_cleanup(bid))


# ── Refundable endpoint ─────────────────────────────────────────────────────
class TestRefundable:
    def test_unpaid_not_refundable(self, admin_session, seeded_unpaid):
        r = admin_session.get(f"{BASE_URL}/api/admin/bookings/{seeded_unpaid['id']}/refundable")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["refundable"] is False

    def test_paid_card_is_refundable_amount(self, admin_session, seeded_paid):
        r = admin_session.get(f"{BASE_URL}/api/admin/bookings/{seeded_paid['id']}/refundable")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["refundable"] is True
        assert d["amount"] == 60.0
        assert d["provider"] == "stripe"

    def test_404_unknown(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/bookings/NOPE_RF_X/refundable")
        assert r.status_code == 404

    def test_zelle_not_refundable(self, admin_session, request):
        bid = f"TESTRF_ZELLE_{request.node.name[:10]}"
        doc = _mk(bid, payment_status="paid", total=50.0)
        tx = {"session_id": f"cs_TEST_{bid}", "booking_id": bid,
              "payment_status": "paid", "provider": "zelle", "amount": 50.0, "updated_at": _now_iso()}
        _loop().run_until_complete(_reset(bid, doc, tx))
        try:
            r = admin_session.get(f"{BASE_URL}/api/admin/bookings/{bid}/refundable")
            assert r.status_code == 200
            assert r.json()["refundable"] is False
        finally:
            _loop().run_until_complete(_cleanup(bid))


# ── Cancel with refund on unpaid booking ────────────────────────────────────
class TestCancelWithRefund:
    def test_refund_true_unpaid_surfaces_error_not_500(self, admin_session, seeded_unpaid):
        bid = seeded_unpaid["id"]
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{bid}/cancel",
            json={"reason": "TEST", "notify_guest": False, "refund": True},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["cancelled"] is True
        assert body.get("refund") is not None
        assert body["refund"].get("ok") is False
        assert "No card payment" in (body["refund"].get("error") or "")
        # Booking cancelled regardless
        doc = _loop().run_until_complete(_fetch(bid))
        assert doc["status"] == "cancelled"


# ── Recently deleted + restore ─────────────────────────────────────────────
class TestRecentlyDeletedRestore:
    def test_list_and_restore_removes_from_deleted(self, admin_session, seeded_unpaid):
        bid = seeded_unpaid["id"]
        # delete it
        r = admin_session.delete(f"{BASE_URL}/api/admin/bookings/{bid}")
        assert r.status_code == 200

        # list contains it
        r = admin_session.get(f"{BASE_URL}/api/admin/bookings-deleted")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        ids = [x["id"] for x in rows]
        assert bid in ids
        # newest first — our id should be at or near the top
        assert rows[0]["id"] == bid or bid in ids[:5]

        # restore
        r = admin_session.post(f"{BASE_URL}/api/admin/bookings-deleted/{bid}/restore")
        assert r.status_code == 200, r.text
        assert r.json()["restored"] is True

        # booking back in bookings
        doc = _loop().run_until_complete(_fetch(bid, "bookings"))
        assert doc is not None
        assert doc.get("restored_at")

        # gone from bookings_deleted
        gone = _loop().run_until_complete(_fetch(bid, "bookings_deleted"))
        assert gone is None

        # second restore → 404
        r = admin_session.post(f"{BASE_URL}/api/admin/bookings-deleted/{bid}/restore")
        assert r.status_code == 404

    def test_restore_409_when_active_exists(self, admin_session, seeded_unpaid):
        bid = seeded_unpaid["id"]
        # delete to archive
        assert admin_session.delete(f"{BASE_URL}/api/admin/bookings/{bid}").status_code == 200
        # Re-insert active booking with same id directly
        _loop().run_until_complete(_reset(bid, _mk(bid)))
        # Also need to re-archive the deleted copy — _reset wipes bookings_deleted. Re-create archive doc.
        async def _mk_archive():
            c = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
            await c.bookings_deleted.insert_one({**_mk(bid), "deleted_at": _now_iso(), "deleted_by": "test"})
        _loop().run_until_complete(_mk_archive())

        r = admin_session.post(f"{BASE_URL}/api/admin/bookings-deleted/{bid}/restore")
        assert r.status_code == 409, r.text
