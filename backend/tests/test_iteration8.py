"""Iteration 8 regression + P1 tests.

Covers:
- Regression: GET /api/tours, /api/rentals, /api/taxi-services counts (4, 5, 14)
- Regression: GET /api/bookings/{id}/receipt.pdf returns application/pdf
- Regression: GET /api/wedding-package/{id}/quote.pdf returns application/pdf
- Regression: POST /api/bookings (zelle) response includes notified_at + notification_status
- P1: POST /api/admin/bookings/{id}/resend-notification without body respects site-config
- P1: Same endpoint with {"force": true} bypasses site-config toggles
"""
import os
import pytest
import requests


def _read_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            for line in open("/app/frontend/.env"):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
        except Exception:
            pass
    assert v, "REACT_APP_BACKEND_URL not configured"
    return v.rstrip("/")


BASE_URL = _read_base_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@roxtaxi.com", "password": "admin123"}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- Catalog regressions (seed_data.py extraction) ----------------

def test_tours_catalog_count():
    r = requests.get(f"{API}/tours", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 4, f"expected 4 tours, got {len(data)}: {[t.get('id') for t in data]}"


def test_taxi_services_catalog_count():
    r = requests.get(f"{API}/taxi-services", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 14, f"expected 14 taxi services, got {len(data)}"


def test_rentals_catalog_count():
    r = requests.get(f"{API}/rentals", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 5, f"expected 5 rentals, got {len(data)}"


# ---------------- PDF regression (pdf_utils.py extraction) ----------------

@pytest.fixture(scope="session")
def seeded_booking_id():
    """Create a zelle booking so we can test receipt.pdf."""
    payload = {
        "service_type": "taxi",
        "item_id": "airport-nassau",
        "item_name": "LPIA Airport -> Nassau",
        "price": 35.0,
        "customer_name": "TEST_Iter8 Receipt",
        "customer_email": "test_iter8_receipt@example.com",
        "customer_phone": "+15005550006",
        "booking_date": "2026-05-15T10:00",
        "pickup_location": "LPIA",
        "dropoff_location": "Atlantis",
        "passengers": 2,
        "days": 1,
        "extra_luggage": 0,
        "payment_method": "zelle",
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=60)
    assert r.status_code in (200, 201), f"create booking failed: {r.status_code} {r.text}"
    return r.json()["id"], r.json()


def test_booking_receipt_pdf(seeded_booking_id):
    booking_id, _ = seeded_booking_id
    r = requests.get(f"{API}/bookings/{booking_id}/receipt.pdf", timeout=60)
    assert r.status_code == 200, f"receipt fetch failed: {r.status_code}"
    assert "application/pdf" in r.headers.get("content-type", ""), r.headers.get("content-type")
    assert len(r.content) > 500, f"pdf too small: {len(r.content)} bytes"
    assert r.content[:4] == b"%PDF", "content does not start with %PDF magic bytes"


def test_create_booking_response_includes_notified_at(seeded_booking_id):
    """Iter7 minor fix: POST /api/bookings should return notified_at + notification_status."""
    _, booking = seeded_booking_id
    assert "notification_status" in booking, f"missing notification_status: {list(booking.keys())}"
    assert "notified_at" in booking, f"missing notified_at from create response: {list(booking.keys())}"
    assert booking["notified_at"], "notified_at is empty"


# ---------------- Wedding PDF regression ----------------

@pytest.fixture(scope="session")
def wedding_inquiry_id(admin_headers):
    """Create a wedding-package inquiry so we can test quote.pdf."""
    payload = {
        "event_type": "wedding",
        "customer_name": "TEST_Iter8 Wedding",
        "customer_email": "test_iter8_wedding@example.com",
        "customer_phone": "+15005550006",
        "event_date": "2026-06-20",
        "guest_count": 40,
        "needs": ["taxi", "tours"],
        "notes": "Test iter8 wedding",
        "package": {
            "transport": {"van-group": 2},
            "tourItems": {"blue-lagoon": 40},
            "rentalItems": {},
            "addons": ["ceremony"],
        },
    }
    r = requests.post(f"{API}/group-inquiries", json=payload, timeout=30)
    if r.status_code not in (200, 201):
        pytest.skip(f"wedding-package create failed with {r.status_code}: {r.text}")
    return r.json()["id"]


def test_wedding_quote_pdf(wedding_inquiry_id):
    r = requests.get(f"{API}/wedding-package/{wedding_inquiry_id}/quote.pdf", timeout=60)
    assert r.status_code == 200, f"quote.pdf failed: {r.status_code} {r.text[:200]}"
    assert "application/pdf" in r.headers.get("content-type", "")
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 500


# ---------------- P1: resend-notification force flag ----------------

@pytest.fixture(scope="session")
def resend_booking_id():
    """Create a fresh zelle booking to use for resend tests."""
    payload = {
        "service_type": "taxi",
        "item_id": "airport-nassau",
        "item_name": "LPIA Airport -> Nassau",
        "price": 35.0,
        "customer_name": "TEST_Iter8 Resend",
        "customer_email": "test_iter8_resend@example.com",
        "customer_phone": "+15005550006",
        "booking_date": "2026-05-18T09:00",
        "passengers": 1,
        "days": 1,
        "payment_method": "zelle",
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=60)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _set_toggles(admin_headers, email_enabled: bool, sms_enabled: bool):
    r = requests.put(
        f"{API}/admin/site-config",
        json={"notify_email_enabled": email_enabled, "notify_sms_enabled": sms_enabled},
        headers=admin_headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text


def test_resend_respects_toggles_when_no_body(admin_headers, resend_booking_id):
    # Disable both channels
    _set_toggles(admin_headers, False, False)
    try:
        r = requests.post(
            f"{API}/admin/bookings/{resend_booking_id}/resend-notification",
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("forced") is False, f"forced expected False, got {body.get('forced')}"
        ns = body["notification_status"]
        assert ns["email"]["enabled"] is False, ns
        assert ns["sms"]["enabled"] is False, ns
    finally:
        # Restore
        _set_toggles(admin_headers, True, True)


def test_resend_with_force_true_bypasses_toggles(admin_headers, resend_booking_id):
    # Disable both channels
    _set_toggles(admin_headers, False, False)
    try:
        r = requests.post(
            f"{API}/admin/bookings/{resend_booking_id}/resend-notification",
            json={"force": True},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("forced") is True, f"forced expected True, got {body.get('forced')}"
        ns = body["notification_status"]
        assert ns["email"]["enabled"] is True, ns
        assert ns["sms"]["enabled"] is True, ns
    finally:
        _set_toggles(admin_headers, True, True)


def test_resend_with_empty_body_respects_toggles(admin_headers, resend_booking_id):
    _set_toggles(admin_headers, False, False)
    try:
        r = requests.post(
            f"{API}/admin/bookings/{resend_booking_id}/resend-notification",
            json={},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("forced") is False
        assert body["notification_status"]["email"]["enabled"] is False
        assert body["notification_status"]["sms"]["enabled"] is False
    finally:
        _set_toggles(admin_headers, True, True)
