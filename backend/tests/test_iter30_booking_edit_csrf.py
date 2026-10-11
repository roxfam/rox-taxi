"""Iteration 30: PATCH /admin/bookings/{id}/details + guest-confirm + CSRF Origin fallback
+ regression PUT on /admin/{tours,taxi_services,rentals}/{id}."""
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


def _loop():
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "roxfam2509@gmail.com", "password": "admin123"
    })
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("admin_csrf")
    assert csrf, "No admin_csrf cookie set"
    s.headers.update({"X-CSRF-Token": csrf})
    return s


@pytest.fixture(scope="module")
def seeded_booking():
    """Insert a regular TEST booking and clean up after. id=TESTEDIT9."""
    bid = "TESTEDIT9"
    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
    doc = {
        "id": bid,
        "customer_name": "TEST Edit",
        "customer_email": "test.edit@example.com",
        "customer_phone": "+12425550199",
        "status": "confirmed",
        "payment_status": "pending",
        "booking_date": tomorrow,
        "pickup_location": "Nassau Airport",
        "dropoff_location": "Atlantis",
        "passengers": 2,
        "total": 50.0,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }

    async def _setup():
        client = AsyncIOMotorClient(MONGO_URL)
        await client[DB_NAME].bookings.delete_one({"id": bid})
        await client[DB_NAME].bookings.insert_one(dict(doc))
        client.close()
    _loop().run_until_complete(_setup())
    yield doc

    async def _teardown():
        client = AsyncIOMotorClient(MONGO_URL)
        await client[DB_NAME].bookings.delete_one({"id": bid})
        client.close()
    _loop().run_until_complete(_teardown())


@pytest.fixture(scope="module")
def seeded_cablebeach_booking():
    """Cable-Beach style booking (has total_price, no total). id=TESTCB9."""
    bid = "TESTCB9"
    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
    doc = {
        "id": bid,
        "customer_name": "TEST CB",
        "customer_email": "test.cb@example.com",
        "status": "confirmed",
        "payment_status": "paid",
        "booking_date": tomorrow,
        "total_price": 92.40,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }

    async def _setup():
        client = AsyncIOMotorClient(MONGO_URL)
        await client[DB_NAME].bookings.delete_one({"id": bid})
        await client[DB_NAME].bookings.insert_one(dict(doc))
        client.close()
    _loop().run_until_complete(_setup())
    yield doc

    async def _teardown():
        client = AsyncIOMotorClient(MONGO_URL)
        await client[DB_NAME].bookings.delete_one({"id": bid})
        client.close()
    _loop().run_until_complete(_teardown())


# ── Booking edit PATCH ────────────────────────────────────────────────────────
class TestBookingEdit:
    def test_edit_single_field_writes_history(self, admin_session, seeded_booking):
        bid = seeded_booking["id"]
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/details",
            json={"customer_name": "TEST Edit Updated"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["updated"] is True
        assert "customer_name" in body["changed"]
        assert body["booking"]["customer_name"] == "TEST Edit Updated"
        # untouched fields intact
        assert body["booking"]["customer_email"] == "test.edit@example.com"
        # edit_history appended
        hist = body["booking"].get("edit_history") or []
        assert len(hist) >= 1
        assert "roxfam2509" in hist[-1]["by"]
        assert "customer_name" in hist[-1]["changes"]

    def test_edit_booking_date_unsets_dayof_reminder(self, admin_session, seeded_booking):
        bid = seeded_booking["id"]
        # First mark it as having a reminder sent
        async def _set_flag():
            client = AsyncIOMotorClient(MONGO_URL)
            await client[DB_NAME].bookings.update_one(
                {"id": bid}, {"$set": {"dayof_reminder_sent_at": "2026-01-01T00:00:00Z"}}
            )
            client.close()
        _loop().run_until_complete(_set_flag())

        new_date = (datetime.utcnow() + timedelta(days=2)).isoformat() + "Z"
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/details",
            json={"booking_date": new_date},
        )
        assert r.status_code == 200
        b = r.json()["booking"]
        assert "dayof_reminder_sent_at" not in b or b.get("dayof_reminder_sent_at") is None

    def test_invalid_booking_date_400(self, admin_session, seeded_booking):
        bid = seeded_booking["id"]
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/details",
            json={"booking_date": "not-a-date"},
        )
        assert r.status_code == 400

    def test_unknown_booking_404(self, admin_session):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/NOPE_XYZ/details",
            json={"customer_name": "x"},
        )
        assert r.status_code == 404

    def test_total_maps_to_total_price_on_cablebeach(self, admin_session, seeded_cablebeach_booking):
        bid = seeded_cablebeach_booking["id"]
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/bookings/{bid}/details",
            json={"total": 123.45},
        )
        assert r.status_code == 200, r.text
        b = r.json()["booking"]
        assert b.get("total_price") == 123.45
        assert "total" not in b or b.get("total") is None


# ── Guest-confirm ─────────────────────────────────────────────────────────────
class TestGuestConfirm:
    def test_confirm_and_unconfirm(self, admin_session, seeded_booking):
        bid = seeded_booking["id"]
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{bid}/guest-confirm",
            json={"confirmed": True},
        )
        assert r.status_code == 200
        assert r.json()["confirmed"] is True

        # Verify persistence
        async def _check():
            client = AsyncIOMotorClient(MONGO_URL)
            doc = await client[DB_NAME].bookings.find_one({"id": bid})
            client.close()
            return doc
        doc = _loop().run_until_complete(_check())
        assert doc.get("guest_confirmed_at")
        assert doc.get("guest_confirmed_via", "").startswith("admin:")

        # Unconfirm
        r2 = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/{bid}/guest-confirm",
            json={"confirmed": False},
        )
        assert r2.status_code == 200
        doc = _loop().run_until_complete(_check())
        assert "guest_confirmed_at" not in doc or doc.get("guest_confirmed_at") is None

    def test_confirm_unknown_404(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/admin/bookings/NOPE_XYZ/guest-confirm",
            json={"confirmed": True},
        )
        assert r.status_code == 404


# ── CSRF Origin/Referer fallback ──────────────────────────────────────────────
class TestCsrfOrigin:
    def _login_no_csrf_header(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "roxfam2509@gmail.com", "password": "admin123"})
        assert r.status_code == 200
        return s

    def test_matching_csrf_header_passes(self, seeded_booking):
        s = self._login_no_csrf_header()
        csrf = s.cookies.get("admin_csrf")
        r = s.patch(
            f"{BASE_URL}/api/admin/bookings/{seeded_booking['id']}/details",
            json={"notes": "csrf header ok"},
            headers={"X-CSRF-Token": csrf},
        )
        assert r.status_code == 200, r.text

    def test_same_site_origin_passes_without_token(self, seeded_booking):
        """Origin matches preview host → should pass even without X-CSRF-Token."""
        s = self._login_no_csrf_header()
        from urllib.parse import urlparse
        host = urlparse(BASE_URL).hostname
        origin = f"https://{host}"
        r = s.patch(
            f"{BASE_URL}/api/admin/bookings/{seeded_booking['id']}/details",
            json={"notes": "origin fallback ok"},
            headers={"Origin": origin},
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"

    def test_foreign_origin_no_token_403(self, seeded_booking):
        s = self._login_no_csrf_header()
        r = s.patch(
            f"{BASE_URL}/api/admin/bookings/{seeded_booking['id']}/details",
            json={"notes": "evil"},
            headers={"Origin": "https://evil.com"},
        )
        assert r.status_code == 403
        assert "CSRF" in r.text or "csrf" in r.text.lower()

    def test_foreign_origin_bad_token_403(self, seeded_booking):
        s = self._login_no_csrf_header()
        r = s.patch(
            f"{BASE_URL}/api/admin/bookings/{seeded_booking['id']}/details",
            json={"notes": "bad"},
            headers={"Origin": "https://evil.com", "X-CSRF-Token": "wrong-token"},
        )
        assert r.status_code == 403

    def test_no_origin_no_token_403(self, seeded_booking):
        """requests by default doesn't send Origin for same-host PATCH, but we can
        strip explicitly. Without any Origin AND no CSRF token → 403."""
        s = self._login_no_csrf_header()
        # requests does not send Origin by default; also wipe referer just in case
        r = s.patch(
            f"{BASE_URL}/api/admin/bookings/{seeded_booking['id']}/details",
            json={"notes": "no-origin"},
            headers={"Referer": ""},
        )
        assert r.status_code == 403


# ── Regression: PUT /admin/{tours,taxi_services,rentals}/{id} ────────────────
class TestAdminCatalogPutRegression:
    @pytest.mark.parametrize("kind", ["tours", "taxi_services", "rentals"])
    def test_put_existing_item_same_data(self, admin_session, kind):
        # Fetch list
        r = admin_session.get(f"{BASE_URL}/api/admin/{kind}")
        assert r.status_code == 200, f"GET {kind} -> {r.status_code}"
        items = r.json()
        if not items:
            pytest.skip(f"no {kind} seeded")
        item = items[0]
        iid = item["id"]
        # PUT back same data (minus server-generated fields the model might reject)
        payload = {k: v for k, v in item.items() if k not in ("_id", "updated_at", "created_at", "price_history")}
        r2 = admin_session.put(f"{BASE_URL}/api/admin/{kind}/{iid}", json=payload)
        assert r2.status_code == 200, f"PUT {kind}/{iid} -> {r2.status_code} {r2.text[:300]}"
        assert r2.json().get("id") == iid
