"""Regression tests for the admin kill-switch + guest reschedule + rebook SMS.

Verifies:
  * Admin logout revokes the JWT server-side — replay via cookie OR Bearer 401s
  * Guest reschedule enforces email match + 2 hr lead + 60 s rate limit
  * Reschedule fans out owner + guest SMS and writes reschedule_history
"""
import os
import time
from datetime import datetime, timedelta, timezone

import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://bahamas-taxi-tours.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "roxfam2509@gmail.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


def _admin_login():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    r.raise_for_status()
    return s, r.json()["token"], r.json()["csrf_token"]


def test_kill_switch_cookie_replay():
    """After logout, replaying the same cookie token must 401."""
    s, token, csrf = _admin_login()
    assert s.get(f"{API}/admin/stats", timeout=15).status_code == 200
    assert s.post(f"{API}/auth/admin-logout", headers={"X-CSRF-Token": csrf}, timeout=15).status_code == 200
    # Replay the OLD cookie values via a fresh session
    r = requests.get(
        f"{API}/admin/stats",
        cookies={"admin_session": token, "admin_csrf": csrf},
        timeout=15,
    )
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
    assert "revoked" in r.text.lower()


def test_kill_switch_bearer_replay():
    """Legacy Authorization: Bearer path must also honour the revocation list."""
    s, token, _csrf = _admin_login()
    s.post(f"{API}/auth/admin-logout", timeout=15)
    r = requests.get(
        f"{API}/admin/stats",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    assert r.status_code == 401
    assert "revoked" in r.text.lower()


def _create_booking():
    future = (datetime.now(timezone.utc) + timedelta(days=14)).replace(microsecond=0)
    body = {
        "service_type": "taxi", "item_id": "airport-nassau",
        "item_name": "LPIA → Downtown", "price": 40,
        "customer_name": "Reschedule Pytest",
        "customer_email": "pytest-guest@example.com",
        "customer_phone": "+12422003333",
        "booking_date": future.isoformat(),
        "pickup_location": "LPIA", "dropoff_location": "Downtown",
        "passengers": 1, "payment_method": "zelle",
    }
    r = requests.post(f"{API}/bookings", json=body, timeout=15)
    r.raise_for_status()
    return r.json()["id"]


def test_guest_reschedule_wrong_email_blocked():
    bid = _create_booking()
    new_pickup = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    r = requests.post(
        f"{API}/bookings/{bid}/guest-reschedule",
        json={"email": "attacker@evil.com", "new_pickup": new_pickup},
        timeout=15,
    )
    assert r.status_code == 403


def test_guest_reschedule_too_close_blocked():
    bid = _create_booking()
    near = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    r = requests.post(
        f"{API}/bookings/{bid}/guest-reschedule",
        json={"email": "pytest-guest@example.com", "new_pickup": near},
        timeout=15,
    )
    assert r.status_code == 400
    assert "2 hours" in r.text


def test_guest_reschedule_success_fires_sms():
    bid = _create_booking()
    new_pickup = (datetime.now(timezone.utc) + timedelta(days=20)).isoformat()
    r = requests.post(
        f"{API}/bookings/{bid}/guest-reschedule",
        json={
            "email": "pytest-guest@example.com",
            "new_pickup": new_pickup,
            "new_return_date": "2027-08-15",
            "new_return_time": "19:30",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["booking_id"] == bid
    assert body["return_date"] == "2027-08-15"
    assert body["return_time"] == "19:30"
    assert "sms" in body
    # Both channels must have been invoked (sent flag can be True/False
    # depending on Twilio creds, but the dict must exist — proves fan-out).
    assert "owner_sms" in body["sms"]
    assert "guest_sms" in body["sms"]

    # Rate limit — immediate 2nd call must 429.
    r2 = requests.post(
        f"{API}/bookings/{bid}/guest-reschedule",
        json={"email": "pytest-guest@example.com", "new_pickup": new_pickup},
        timeout=15,
    )
    assert r2.status_code == 429

    # reschedule_history recorded.
    b = requests.get(f"{API}/bookings/{bid}", timeout=15).json()
    hist = b.get("reschedule_history") or []
    assert len(hist) >= 1
    assert hist[0]["actor"] == "guest"
    assert hist[0]["to_pickup"] == new_pickup
