"""Iteration 7: notification prefs + notification_status + resend endpoint.

Covers:
- GET /api/site-config returns notify_email_enabled + notify_sms_enabled booleans.
- PUT /api/admin/site-config accepts + persists the new flags.
- POST /api/bookings (zelle) attaches notification_status + notified_at.
- GET /api/admin/bookings surfaces notification_status.
- POST /api/admin/bookings/{id}/resend-notification returns + persists a fresh status.
- notify_email_enabled=false is honored on subsequent zelle bookings.
"""
import os
import datetime as dt
import pytest
import requests

def _read_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        # Fallback to frontend/.env
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

ADMIN_EMAIL = "admin@roxtaxi.com"
ADMIN_PASSWORD = "admin123"


def _next_open_date() -> str:
    d = dt.date.today() + dt.timedelta(days=2)
    # skip Saturdays (weekday 5) — service closed for taxi
    while d.weekday() == 5:
        d += dt.timedelta(days=1)
    return d.isoformat()


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def taxi_service(s):
    r = s.get(f"{API}/taxi-services", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert items, "taxi services empty"
    return items[0]


# ---------- site-config ----------

def test_site_config_has_notify_flags(s):
    r = s.get(f"{API}/site-config", timeout=15)
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert "notify_email_enabled" in cfg, f"missing notify_email_enabled: {cfg}"
    assert "notify_sms_enabled" in cfg, f"missing notify_sms_enabled: {cfg}"
    assert isinstance(cfg["notify_email_enabled"], bool)
    assert isinstance(cfg["notify_sms_enabled"], bool)


def test_admin_update_site_config_persists_flags(s, admin_headers):
    # Flip both to False
    r = s.put(
        f"{API}/admin/site-config",
        json={"notify_email_enabled": False, "notify_sms_enabled": False},
        headers=admin_headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert cfg["notify_email_enabled"] is False
    assert cfg["notify_sms_enabled"] is False

    # Read back via public endpoint
    r2 = s.get(f"{API}/site-config", timeout=15).json()
    assert r2["notify_email_enabled"] is False
    assert r2["notify_sms_enabled"] is False


# ---------- booking + notification_status ----------

def _mk_zelle_booking(s, svc, booking_date):
    payload = {
        "service_type": "taxi",
        "item_id": svc["id"],
        "item_name": svc["name"],
        "price": float(svc["price"]),
        "customer_name": "TEST_Notify User",
        "customer_email": "test_notify@example.com",
        "customer_phone": "+15005550006",  # Twilio magic test number
        "booking_date": booking_date,
        "pickup_location": "LPIA",
        "dropoff_location": "Downtown Nassau",
        "passengers": 2,
        "days": 1,
        "payment_method": "zelle",
    }
    r = s.post(f"{API}/bookings", json=payload, timeout=30)
    return r


def test_zelle_booking_disabled_reflects_in_status(s, taxi_service):
    """Flags currently False from prev test — verify enabled=false on status."""
    r = _mk_zelle_booking(s, taxi_service, _next_open_date())
    assert r.status_code == 200, r.text
    b = r.json()
    assert "notification_status" in b, f"missing notification_status: {b}"
    ns = b["notification_status"]
    assert "email" in ns and "sms" in ns
    for ch in ("email", "sms"):
        for k in ("sent", "provider", "error", "enabled"):
            assert k in ns[ch], f"{ch} missing '{k}': {ns[ch]}"
    assert ns["email"]["enabled"] is False
    assert ns["email"]["sent"] is False
    assert ns["sms"]["enabled"] is False
    assert ns["sms"]["sent"] is False
    assert b.get("notified_at")


def test_restore_flags_then_booking_reflects_enabled(s, admin_headers, taxi_service):
    # restore both to True
    r = s.put(
        f"{API}/admin/site-config",
        json={"notify_email_enabled": True, "notify_sms_enabled": True},
        headers=admin_headers,
        timeout=15,
    )
    assert r.status_code == 200
    cfg = r.json()
    assert cfg["notify_email_enabled"] is True
    assert cfg["notify_sms_enabled"] is True

    # new zelle booking should now show enabled=True
    r2 = _mk_zelle_booking(s, taxi_service, _next_open_date())
    assert r2.status_code == 200, r2.text
    b = r2.json()
    ns = b["notification_status"]
    assert ns["email"]["enabled"] is True
    assert ns["sms"]["enabled"] is True
    # Store booking id for admin + resend tests
    pytest.booking_id = b["id"]


def test_admin_bookings_surfaces_notification_status(s, admin_headers):
    r = s.get(f"{API}/admin/bookings", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list) and items
    bid = getattr(pytest, "booking_id", None)
    assert bid, "prior test did not stash booking id"
    match = next((b for b in items if b.get("id") == bid), None)
    assert match, f"created booking {bid} not in admin list"
    assert "notification_status" in match
    ns = match["notification_status"]
    assert "email" in ns and "sms" in ns


def test_resend_notification_updates_status(s, admin_headers):
    bid = getattr(pytest, "booking_id", None)
    assert bid
    r = s.post(f"{API}/admin/bookings/{bid}/resend-notification", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["booking_id"] == bid
    assert "notification_status" in body
    ns = body["notification_status"]
    assert "email" in ns and "sms" in ns
    for ch in ("email", "sms"):
        for k in ("sent", "provider", "error", "enabled"):
            assert k in ns[ch]


def test_resend_notification_requires_auth(s):
    bid = getattr(pytest, "booking_id", None) or "AAAAAAAA"
    r = s.post(f"{API}/admin/bookings/{bid}/resend-notification", timeout=15)
    assert r.status_code in (401, 403), r.text


def test_resend_notification_404_for_missing(s, admin_headers):
    r = s.post(f"{API}/admin/bookings/ZZZZZZZZ/resend-notification", headers=admin_headers, timeout=15)
    assert r.status_code == 404
