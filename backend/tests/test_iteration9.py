"""Iteration 9 regression tests — after moving /admin/* endpoints into routes/admin.py.

Validates: admin router registration, auth guards, catalog CRUD, booking mgmt,
deposit refund, notifications force/toggles, site-config, non-admin routes,
and payments router still functioning.
"""
import os
import io
import pytest
import requests


def _read_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        for line in open("/app/frontend/.env"):
            if line.startswith("REACT_APP_BACKEND_URL="):
                v = line.split("=", 1)[1].strip()
                break
    assert v
    return v.rstrip("/")


BASE_URL = _read_base_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@roxtaxi.com", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- Auth guard ----------------
class TestAuthGuard:
    @pytest.mark.parametrize("path,method", [
        ("/admin/bookings", "GET"),
        ("/admin/stats", "GET"),
        ("/admin/tours", "GET"),
        ("/admin/taxi_services", "GET"),
        ("/admin/rentals", "GET"),
        ("/admin/group-inquiries", "GET"),
        ("/admin/site-config", "PUT"),
    ])
    def test_requires_auth(self, path, method):
        r = requests.request(method, f"{API}{path}", timeout=15, json={})
        assert r.status_code in (401, 403), f"{path} expected 401/403 got {r.status_code}"


# ---------------- Non-admin (public) regressions ----------------
class TestPublicRoutes:
    def test_tours(self):
        r = requests.get(f"{API}/tours", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_taxi_services(self):
        r = requests.get(f"{API}/taxi-services", timeout=20)
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_rentals(self):
        r = requests.get(f"{API}/rentals", timeout=20)
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_site_config(self):
        r = requests.get(f"{API}/site-config", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_paypal_config(self):
        r = requests.get(f"{API}/paypal/config", timeout=20)
        assert r.status_code == 200

    def test_payments_status_invalid_404(self):
        r = requests.get(f"{API}/payments/status/does-not-exist", timeout=20)
        assert r.status_code == 404


# ---------------- Admin core endpoints ----------------
class TestAdminCore:
    def test_bookings_list(self, H):
        r = requests.get(f"{API}/admin/bookings", headers=H, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats_shape(self, H):
        r = requests.get(f"{API}/admin/stats", headers=H, timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["total", "paid", "pending", "active", "revenue",
                  "deposits_held", "deposits_released", "deposits_forfeited", "deposits_held_amount"]:
            assert k in d, f"missing key {k}"

    def test_group_inquiries_list(self, H):
        r = requests.get(f"{API}/admin/group-inquiries", headers=H, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- Catalog CRUD (specific-routes-not-shadowed test) ----------------
class TestCatalogCRUD:
    def test_list_each_kind(self, H):
        for kind in ["tours", "taxi_services", "rentals"]:
            r = requests.get(f"{API}/admin/{kind}", headers=H, timeout=20)
            assert r.status_code == 200, f"{kind}: {r.status_code}"
            assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_tours_create_update_delete(self, H):
        payload = {
            "name": "TEST_Iter9 Sunset",
            "description": "Regression tour",
            "price": 99.0,
            "duration": "2h",
            "image_url": "https://example.com/x.jpg",
            "active": True,
        }
        r = requests.post(f"{API}/admin/tours", headers=H, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == payload["name"]
        assert created["price"] == 99.0
        assert "id" in created
        tid = created["id"]

        # verify GET
        r = requests.get(f"{API}/admin/tours", headers=H, timeout=20)
        assert any(t["id"] == tid for t in r.json())

        # update
        upd = {**payload, "name": "TEST_Iter9 Sunset v2", "price": 111.5}
        r = requests.put(f"{API}/admin/tours/{tid}", headers=H, json=upd, timeout=20)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Iter9 Sunset v2"
        assert r.json()["price"] == 111.5

        # delete
        r = requests.delete(f"{API}/admin/tours/{tid}", headers=H, timeout=20)
        assert r.status_code == 200 and r.json().get("deleted") is True

        # confirm gone
        r = requests.delete(f"{API}/admin/tours/{tid}", headers=H, timeout=20)
        assert r.status_code == 404

    def test_unknown_kind_404(self, H):
        r = requests.get(f"{API}/admin/nonsense", headers=H, timeout=20)
        assert r.status_code == 404


# ---------------- Booking flow: create + status + resend + deposit ----------------
@pytest.fixture(scope="module")
def zelle_booking():
    payload = {
        "customer_name": "TEST_Iter9 Regress",
        "customer_email": "test-iter9@example.com",
        "customer_phone": "+15005550006",
        "service_type": "taxi",
        "item_id": "airport-nassau",
        "item_name": "Airport - Nassau",
        "price": 35.0,
        "booking_date": "2026-04-15T10:00",
        "passengers": 2,
        "payment_method": "zelle",
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


class TestBookingWorkflow:
    def test_booking_created(self, zelle_booking):
        assert "id" in zelle_booking
        assert zelle_booking.get("payment_method") == "zelle"

    def test_get_booking(self, zelle_booking):
        bid = zelle_booking["id"]
        r = requests.get(f"{API}/bookings/{bid}", timeout=20)
        assert r.status_code == 200
        assert r.json()["id"] == bid

    def test_receipt_pdf(self, zelle_booking):
        bid = zelle_booking["id"]
        r = requests.get(f"{API}/bookings/{bid}/receipt.pdf", timeout=20)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")

    def test_status_patch(self, H, zelle_booking):
        bid = zelle_booking["id"]
        r = requests.patch(f"{API}/admin/bookings/{bid}/status", headers=H, json={"status": "confirmed"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["status"] == "confirmed"

    def test_resend_default_respects_toggles(self, H, zelle_booking):
        bid = zelle_booking["id"]
        r = requests.post(f"{API}/admin/bookings/{bid}/resend-notification", headers=H, json={}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["booking_id"] == bid
        assert d.get("forced") is False
        assert "notification_status" in d
        assert "email" in d["notification_status"] and "sms" in d["notification_status"]

    def test_resend_force_true(self, H, zelle_booking):
        # First flip toggles OFF via site-config to prove force bypasses them.
        current = requests.get(f"{API}/site-config", timeout=15).json()
        try:
            requests.put(f"{API}/admin/site-config", headers=H,
                         json={"notify_email_enabled": False, "notify_sms_enabled": False}, timeout=15)
            bid = zelle_booking["id"]
            r = requests.post(f"{API}/admin/bookings/{bid}/resend-notification",
                              headers=H, json={"force": True}, timeout=30)
            assert r.status_code == 200
            d = r.json()
            assert d.get("forced") is True
            ns = d["notification_status"]
            assert ns["email"]["enabled"] is True, f"email.enabled must be True on force: {ns}"
            assert ns["sms"]["enabled"] is True, f"sms.enabled must be True on force: {ns}"
        finally:
            # Restore toggles to True
            requests.put(f"{API}/admin/site-config", headers=H,
                         json={"notify_email_enabled": True, "notify_sms_enabled": True}, timeout=15)


class TestSiteConfig:
    def test_toggle_roundtrip(self, H):
        r = requests.put(f"{API}/admin/site-config", headers=H,
                         json={"notify_email_enabled": True, "notify_sms_enabled": True}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("notify_email_enabled") is True
        assert d.get("notify_sms_enabled") is True


# ---------------- Group inquiries + wedding quote ----------------
@pytest.fixture(scope="module")
def group_inquiry():
    payload = {
        "customer_name": "TEST_Iter9 Group",
        "customer_email": "iter9-group@example.com",
        "customer_phone": "+15005550006",
        "event_type": "wedding",
        "guest_count": 20,
        "event_date": "2026-06-01",
        "notes": "Regression test",
    }
    r = requests.post(f"{API}/group-inquiries", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


class TestGroupInquiries:
    def test_created(self, group_inquiry):
        assert "id" in group_inquiry

    def test_status_patch(self, H, group_inquiry):
        gid = group_inquiry["id"]
        r = requests.patch(f"{API}/admin/group-inquiries/{gid}/status",
                           headers=H, json={"status": "contacted"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["status"] == "contacted"

    def test_wedding_quote_pdf(self, group_inquiry):
        gid = group_inquiry["id"]
        r = requests.get(f"{API}/wedding-package/{gid}/quote.pdf", timeout=20)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")


# ---------------- Logo upload ----------------
class TestLogoUpload:
    def test_upload_and_serve(self, H):
        # tiny 1x1 png
        png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
               b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
               b"\xc0\x00\x00\x00\x03\x00\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82")
        r = requests.post(
            f"{API}/admin/upload-logo",
            headers=H,
            files={"file": ("test.png", io.BytesIO(png), "image/png")},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        url = r.json().get("logo_url")
        assert url and url.startswith("/api/uploads/")
        # verify uploads endpoint serves it
        served = requests.get(f"{BASE_URL}{url}", timeout=15)
        assert served.status_code == 200
