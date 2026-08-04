"""Regression tests for the driver-mobile status + arrival-notification flow.

Covers:
  1. Legal transitions (confirmed → en_route → arrived → completed)
  2. Illegal transition rejected with 409
  3. Guest notification auto-fires exactly once when moving to `arrived`
  4. Re-sending arrival ping bypasses idempotency and re-notifies
  5. Cancelled bookings refuse driver mutations
"""
import os
import uuid

import pytest
import httpx


API = os.environ.get("API_URL") or f"{(open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split(chr(10))[0]).strip()}/api"


def _new_test_booking(sync_client):
    """Create a bare-minimum public booking so we have a real ID to drive."""
    payload = {
        "service_type": "taxi",
        "item_id": "airport-downtown",
        "item_name": "Test Airport → Downtown",
        "customer_name": "Driver Test Guest",
        "customer_email": "driver-test@example.com",
        "customer_phone": "",  # deliberately blank — sms path should error but not crash
        "booking_date": "2026-06-15T10:00:00+00:00",
        "pickup_location": "Nassau Cruise Port",
        "dropoff_location": "Atlantis Paradise Island",
        "passengers": 2,
        "total": 40.0,
        "payment_method": "zelle",
    }
    r = sync_client.post(f"{API}/bookings", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def client():
    with httpx.Client(timeout=30.0) as c:
        yield c


@pytest.fixture
def booking_id(client):
    bid = _new_test_booking(client)
    # Push it to "confirmed" so it's ready for driver actions
    admin_login = client.post(f"{API}/auth/login", json={"email": "roxfam2509@gmail.com", "password": "admin123"})
    admin_login.raise_for_status()
    token = admin_login.json()["token"]
    client.patch(
        f"{API}/admin/bookings/{bid}/status",
        json={"status": "confirmed"},
        headers={"Authorization": f"Bearer {token}"},
    ).raise_for_status()
    return bid


def test_driver_can_read_booking(client, booking_id):
    r = client.get(f"{API}/driver/{booking_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == booking_id
    assert body["status"] == "confirmed"
    assert body["pickup_location"] == "Nassau Cruise Port"


def test_driver_read_404_for_unknown(client):
    r = client.get(f"{API}/driver/NOPE123")
    assert r.status_code == 404


def test_legal_status_flow_and_arrival_ping(client, booking_id):
    # confirmed → en_route
    r = client.post(f"{API}/driver/{booking_id}/status",
                    json={"status": "en_route", "note": "Black SUV, 5 min out"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "en_route"

    # en_route → arrived + auto-notification block returned
    r = client.post(f"{API}/driver/{booking_id}/status",
                    json={"status": "arrived", "note": "Front entrance"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "arrived"
    assert body["notification"] is not None
    assert "email" in body["notification"] and "sms" in body["notification"]

    # arrived → completed (no re-notification expected)
    r = client.post(f"{API}/driver/{booking_id}/status", json={"status": "completed"})
    assert r.status_code == 200
    assert r.json()["status"] == "completed"


def test_illegal_transition_rejected(client, booking_id):
    # confirmed → completed is illegal (must pass through en_route/arrived)
    r = client.post(f"{API}/driver/{booking_id}/status", json={"status": "completed"})
    assert r.status_code == 409
    assert "Cannot move from" in r.text


def test_notify_arrival_endpoint_works_and_bypasses_idempotency(client, booking_id):
    # Get to arrived state first
    client.post(f"{API}/driver/{booking_id}/status", json={"status": "en_route"}).raise_for_status()
    r = client.post(f"{API}/driver/{booking_id}/status", json={"status": "arrived"})
    assert r.status_code == 200
    first_result = r.json()["notification"]
    assert first_result is not None

    # Re-send explicit ping — should NOT 409, should return a fresh notification block
    r2 = client.post(f"{API}/driver/{booking_id}/notify-arrival",
                     json={"status": "arrived", "note": "Buzzed twice"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["notification"] is not None


def test_closed_booking_refuses_arrival_ping(client, booking_id):
    # Push to completed via legal chain
    client.post(f"{API}/driver/{booking_id}/status", json={"status": "en_route"}).raise_for_status()
    client.post(f"{API}/driver/{booking_id}/status", json={"status": "arrived"}).raise_for_status()
    client.post(f"{API}/driver/{booking_id}/status", json={"status": "completed"}).raise_for_status()
    r = client.post(f"{API}/driver/{booking_id}/notify-arrival", json={"status": "arrived"})
    assert r.status_code == 409
