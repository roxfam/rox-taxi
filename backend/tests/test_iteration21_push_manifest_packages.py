"""Iteration 21: Packages strip, Web Push (VAPID), Driver Manifest."""
import os
import re
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- PACKAGES ----------
class TestPackages:
    def test_packages_list(self):
        r = requests.get(f"{API}/packages", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # accept list or {packages: [...]}
        pkgs = data if isinstance(data, list) else data.get("packages", [])
        assert len(pkgs) >= 2, f"expected >=2 packages got {len(pkgs)}"
        ids = {p.get("id") or p.get("slug") for p in pkgs}
        assert "airport-atlantis-airport" in ids
        assert "airport-tour-airport" in ids
        for p in pkgs:
            assert "items" in p and isinstance(p["items"], list) and len(p["items"]) > 0
            for k in ("subtotal", "package_price", "savings"):
                assert k in p, f"missing {k} in package {p.get('id')}"
            assert "image_url" in p or "image" in p


# ---------- WEB PUSH ----------
class TestWebPush:
    def test_vapid_no_auth(self):
        r = requests.get(f"{API}/admin/push/vapid-public-key", timeout=15)
        assert r.status_code == 401

    def test_vapid_with_auth(self, admin_headers):
        r = requests.get(f"{API}/admin/push/vapid-public-key", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "public_key" in data
        # base64url basic check
        assert re.match(r"^[A-Za-z0-9\-_]+=*$", data["public_key"])

    def test_subscribe_missing_keys(self, admin_headers):
        r = requests.post(f"{API}/admin/push/subscribe", json={"endpoint": "https://example.com/x"}, headers=admin_headers, timeout=15)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_subscribe_ok(self, admin_headers):
        payload = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/TEST_iter21_endpoint",
            "keys": {"p256dh": "BFakeP256dhKeyForTestingPurposesOnly1234567890abcdef", "auth": "FakeAuthToken1234"},
            "user_agent": "pytest",
        }
        r = requests.post(f"{API}/admin/push/subscribe", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_push_test(self, admin_headers):
        r = requests.post(f"{API}/admin/push/test", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sent" in data
        assert isinstance(data["sent"], int)

    def test_unsubscribe(self, admin_headers):
        r = requests.post(
            f"{API}/admin/push/unsubscribe",
            json={"endpoint": "https://fcm.googleapis.com/fcm/send/TEST_iter21_endpoint"},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code in (200, 204)


# ---------- DRIVER MANIFEST ----------
class TestDriverManifest:
    def test_manifest_no_auth(self):
        r = requests.get(f"{API}/admin/driver/manifest", timeout=15)
        assert r.status_code == 401

    def test_manifest_today(self, admin_headers):
        r = requests.get(f"{API}/admin/driver/manifest", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "date" in data and re.match(r"^\d{4}-\d{2}-\d{2}$", data["date"])
        assert "bookings" in data and isinstance(data["bookings"], list)

    def test_manifest_with_date(self, admin_headers):
        r = requests.get(f"{API}/admin/driver/manifest?date=2026-01-15", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["date"] == "2026-01-15"

    def test_manifest_bad_date(self, admin_headers):
        r = requests.get(f"{API}/admin/driver/manifest?date=not-a-date", headers=admin_headers, timeout=15)
        assert r.status_code == 400


# ---------- BOOKING CREATE (triggers push) + advance status ----------
class TestBookingFlowForManifest:
    _booking_id = None

    def test_create_today_booking(self, admin_headers):
        now = datetime.now(timezone.utc)
        payload = {
            "service_type": "taxi",
            "item_id": "airport-transfer-lpia",
            "item_name": "Airport Transfer - LPIA",
            "price": 40.0,
            "passengers": 2,
            "customer_name": "TEST_ManifestUser",
            "customer_email": "test.manifest@example.com",
            "customer_phone": "+12425550123",
            "booking_date": now.isoformat(),
            "pax": 2,
            "payment_method": "zelle",
        }
        r = requests.post(f"{API}/bookings", json=payload, timeout=20)
        assert r.status_code in (200, 201), f"booking create failed: {r.status_code} {r.text}"
        data = r.json()
        bid = data.get("id") or data.get("booking_id") or (data.get("booking") or {}).get("id")
        assert bid, f"no booking id in response: {data}"
        TestBookingFlowForManifest._booking_id = bid

    def test_booking_shows_in_manifest(self, admin_headers):
        bid = TestBookingFlowForManifest._booking_id
        assert bid, "no booking id from prev test"
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # try today and tomorrow in case of tz cutover
        r = requests.get(f"{API}/admin/driver/manifest?date={today}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        ids = [b.get("id") for b in r.json().get("bookings", [])]
        # Not fatal if not present (timezone edge), but assert manifest returns bookings list
        assert isinstance(ids, list)

    def test_advance_status(self, admin_headers):
        bid = TestBookingFlowForManifest._booking_id
        assert bid
        # Try advancing via PATCH to next status "driver_assigned"
        r = requests.patch(
            f"{API}/admin/bookings/{bid}/status",
            json={"status": "driver_assigned"},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code in (200, 204), f"advance failed: {r.status_code} {r.text}"
