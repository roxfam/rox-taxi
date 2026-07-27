"""Backend tests for Rox Taxi Home page + core endpoints."""
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


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# -------- Reviews --------
def test_reviews(s):
    r = s.get(f"{API}/reviews", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["rating"] == 4.9
    assert "total" in d and isinstance(d["total"], int)
    assert isinstance(d["reviews"], list) and len(d["reviews"]) >= 1


# -------- Tours --------
def test_tours(s):
    r = s.get(f"{API}/tours", timeout=20)
    assert r.status_code == 200
    tours = r.json()
    assert isinstance(tours, list) and len(tours) == 5
    text = " ".join(f"{t['name']} {t.get('location','')}" for t in tours).lower()
    assert "nassau" in text or "paradise" in text


# -------- Rentals --------
def test_rentals(s):
    r = s.get(f"{API}/rentals", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 5
    names = " ".join(t["name"].lower() for t in data)
    for keyword in ["spark", "sentra", "malibu", "trax", "town & country"]:
        assert keyword in names, f"missing {keyword}"


def test_rental_availability(s):
    r = s.get(f"{API}/rentals/trax-suv/availability", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["rental_id"] == "trax-suv"
    assert isinstance(d["blackouts"], list)


# -------- Fees --------
def test_fees(s):
    r = s.get(f"{API}/fees", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["luggage_fee_usd"] == 3.0
    assert d["extra_passenger_fee_usd"] == 5.0
    assert d["extra_passenger_threshold"] == 3


# -------- Booking pricing --------
def test_booking_taxi_pricing(s):
    payload = {
        "service_type": "taxi",
        "item_id": "airport-nassau",
        "item_name": "LPIA → Nassau",
        "price": 35.0,
        "customer_name": "TEST_Home",
        "customer_email": "test_home@example.com",
        "customer_phone": "+12420000001",
        "booking_date": "2026-06-01T12:00:00Z",
        "pickup_location": "LPIA",
        "dropoff_location": "Nassau",
        "passengers": 4,
        "extra_luggage": 2,
        "payment_method": "zelle",
    }
    r = s.post(f"{API}/bookings", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    b = r.json()
    # base 35 + 2*3 luggage + 5 passenger fee = 46
    assert b["total"] == 46.0, f"expected 46, got {b['total']}"
    assert b["luggage_fee"] == 6.0
    assert b["passenger_fee"] == 5.0
    # verify persisted
    r2 = s.get(f"{API}/bookings/{b['id']}", timeout=20)
    assert r2.status_code == 200
    assert r2.json()["total"] == 46.0


def test_booking_requires_passengers(s):
    payload = {
        "service_type": "taxi",
        "item_id": "airport-nassau",
        "item_name": "LPIA → Nassau",
        "price": 35.0,
        "customer_name": "TEST_NoPax",
        "customer_email": "test_nopax@example.com",
        "customer_phone": "+12420000002",
        "booking_date": "2026-06-01T12:00:00Z",
        "payment_method": "zelle",
    }
    r = s.post(f"{API}/bookings", json=payload, timeout=20)
    assert r.status_code == 422


# -------- Chat SSE --------
def test_chat_stream_sse(s):
    r = s.post(f"{API}/chat/stream", json={"session_id": "test_sess_home", "message": "Hi"}, timeout=45, stream=True)
    assert r.status_code == 200
    got_data = False
    for line in r.iter_lines(decode_unicode=True):
        if line and line.startswith("data:"):
            got_data = True
            break
    assert got_data, "No SSE data received from /api/chat/stream"
