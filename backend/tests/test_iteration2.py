"""Iteration 2 backend tests: Saturday blackout, admin CRUD, tours=5."""
import os
import requests
import pytest
from pathlib import Path


def _load_url():
    env = Path("/app/frontend/.env")
    for line in env.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", _load_url()).rstrip("/")
API = f"{BASE_URL}/api"

SATURDAY = "2026-02-28T10:00:00Z"  # Saturday
SUNDAY = "2026-03-01T10:00:00Z"    # Sunday
FRIDAY = "2026-02-27T10:00:00Z"    # Friday


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": "admin@roxtaxi.com", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    assert tok, f"no token in {d}"
    return tok


def _taxi_payload(date, name="TEST_Sat"):
    return {
        "service_type": "taxi",
        "item_id": "airport-nassau",
        "item_name": "LPIA → Nassau",
        "price": 35.0,
        "customer_name": name,
        "customer_email": "test_sat@example.com",
        "customer_phone": "+12420000001",
        "booking_date": date,
        "pickup_location": "LPIA",
        "dropoff_location": "Nassau",
        "passengers": 2,
        "extra_luggage": 0,
        "payment_method": "zelle",
    }


def _rental_payload(date, days, name="TEST_Rental"):
    return {
        "service_type": "rental",
        "item_id": "trax-suv",
        "item_name": "Chevy Trax",
        "price": 65.0,
        "customer_name": name,
        "customer_email": "test_rent@example.com",
        "customer_phone": "+12420000002",
        "booking_date": date,
        "days": days,
        "passengers": 2,
        "extra_luggage": 0,
        "payment_method": "zelle",
    }


def _tour_payload(date, name="TEST_Tour"):
    return {
        "service_type": "tour",
        "item_id": "atlantis-day-pass",
        "item_name": "Tour",
        "price": 100.0,
        "customer_name": name,
        "customer_email": "test_tour@example.com",
        "customer_phone": "+12420000003",
        "booking_date": date,
        "passengers": 2,
        "extra_luggage": 0,
        "payment_method": "zelle",
    }


# --- Blackout tests ---
def test_taxi_saturday_rejected(s):
    r = s.post(f"{API}/bookings", json=_taxi_payload(SATURDAY), timeout=20)
    assert r.status_code == 400, r.text
    assert "saturday" in r.text.lower()


def test_rental_friday_3days_rejected(s):
    r = s.post(f"{API}/bookings", json=_rental_payload(FRIDAY, 3), timeout=20)
    assert r.status_code == 400, r.text
    assert "saturday" in r.text.lower()


def test_taxi_sunday_ok(s):
    r = s.post(f"{API}/bookings", json=_taxi_payload(SUNDAY), timeout=20)
    assert r.status_code == 200, r.text


def test_tour_saturday_ok(s):
    # first grab a real tour id
    tours = s.get(f"{API}/tours", timeout=20).json()
    tid = tours[0]["id"]
    payload = _tour_payload(SATURDAY)
    payload["item_id"] = tid
    payload["item_name"] = tours[0]["name"]
    payload["price"] = tours[0]["price"]
    r = s.post(f"{API}/bookings", json=payload, timeout=20)
    assert r.status_code == 200, r.text


# --- Fees / tours ---
def test_fees_includes_closed(s):
    r = s.get(f"{API}/fees", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d.get("closed_weekdays_labels") == ["Saturday"]
    assert sorted(d.get("closed_applies_to", [])) == ["rental", "taxi"]


def test_tours_count_5(s):
    r = s.get(f"{API}/tours", timeout=20)
    assert r.status_code == 200
    assert len(r.json()) == 5


# --- Admin ---
def test_admin_login(admin_token):
    assert isinstance(admin_token, str) and len(admin_token) > 10


def test_admin_bookings(s, admin_token):
    r = s.get(f"{API}/admin/bookings", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_admin_tours(s, admin_token):
    r = s.get(f"{API}/admin/tours", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_admin_taxi_services(s, admin_token):
    r = s.get(f"{API}/admin/taxi_services", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert r.status_code == 200, r.text


def test_admin_rentals(s, admin_token):
    r = s.get(f"{API}/admin/rentals", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert r.status_code == 200, r.text
