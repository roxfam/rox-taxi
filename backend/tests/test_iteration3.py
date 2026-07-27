"""Iteration 3 backend tests: passenger fees, 14 taxi routes, 4 tours, logo upload auth, PDFs, chat SSE."""
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

SUNDAY = "2026-03-01T10:00:00Z"  # open day for taxi


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": "admin@roxtaxi.com", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("access_token") or d.get("token")


# ---------- Taxi services: 14 Nassau routes ----------
def test_taxi_services_count_and_new_routes(s):
    r = s.get(f"{API}/taxi-services", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 14, f"expected 14 routes, got {len(data)}: {[t.get('name') or t.get('id') for t in data]}"
    blob = " | ".join(f"{t.get('name','')}::{t.get('id','')}::{t.get('price','')}" for t in data).lower()
    # New route markers
    assert "baha mar" in blob
    assert "cable beach" in blob
    assert "atlantis" in blob
    assert "fish fry" in blob
    assert "compass point" in blob
    assert "adelaide" in blob
    assert "blue hole" in blob


# ---------- Tours count = 4 ----------
def test_tours_count_4(s):
    r = s.get(f"{API}/tours", timeout=20)
    assert r.status_code == 200
    tours = r.json()
    names = [t.get("name", "").lower() for t in tours]
    assert len(tours) == 4, f"expected 4 tours, got {len(tours)}: {names}"
    assert not any("exuma" in n for n in names), f"Exuma should be removed, found: {names}"


# ---------- Fees passenger policy string ----------
def test_fees_passenger_policy(s):
    r = s.get(f"{API}/fees", timeout=20)
    assert r.status_code == 200
    d = r.json()
    policy = str(d.get("passenger_policy", "")).lower()
    assert "flat rate covers up to 2 passengers" in policy, f"policy={policy!r}"


# ---------- Passenger fee on POST /api/bookings ----------
def _taxi_payload(passengers):
    return {
        "service_type": "taxi",
        "item_id": "airport-nassau",
        "item_name": "LPIA → Nassau",
        "price": 35.0,
        "customer_name": f"TEST_PaxFee_{passengers}",
        "customer_email": "test_pax@example.com",
        "customer_phone": "+12420000001",
        "booking_date": SUNDAY,
        "pickup_location": "LPIA",
        "dropoff_location": "Nassau",
        "passengers": passengers,
        "extra_luggage": 0,
        "payment_method": "zelle",
    }


@pytest.mark.parametrize("pax,expected_fee", [(2, 0.0), (3, 5.0), (5, 15.0)])
def test_passenger_fee(s, pax, expected_fee):
    r = s.post(f"{API}/bookings", json=_taxi_payload(pax), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    # try common field names
    fee = d.get("passenger_fee")
    if fee is None:
        fee = d.get("extra_passenger_fee")
    assert fee is not None, f"no passenger_fee in booking response: keys={list(d.keys())}"
    assert float(fee) == expected_fee, f"pax={pax} expected {expected_fee}, got {fee}. resp={d}"


# ---------- Logo upload route registered (401 unauth, not 404) ----------
def test_logo_upload_requires_auth(s):
    r = s.post(f"{API}/admin/upload-logo", timeout=20)
    # Must NOT be 404 (route registered) — should be 401/403/422 (missing auth / body)
    assert r.status_code != 404, f"route shadowed/not registered: {r.status_code} {r.text}"
    assert r.status_code in (401, 403, 422), f"unexpected {r.status_code}: {r.text}"


# ---------- Wedding PDF ----------
def test_wedding_pdf(s, admin_token):
    # Create a wedding group inquiry with a package
    cr = s.post(f"{API}/group-inquiries", json={
        "event_type": "wedding",
        "event_date": "2026-06-15",
        "guest_count": 40,
        "needs": ["ceremony", "transport"],
        "budget_range": "$5k-$10k",
        "customer_name": "TEST_Wedding",
        "customer_email": "wed@test.com",
        "customer_phone": "+12420000009",
        "notes": "test",
        "package": {"name": "Beach Ceremony", "price": 2500, "features": ["ceremony", "flowers"]},
    }, timeout=20)
    assert cr.status_code == 200, f"cannot create wedding: {cr.status_code} {cr.text}"
    wid = cr.json().get("id")
    assert wid, cr.json()

    pdf = s.get(f"{API}/wedding-package/{wid}/quote.pdf", timeout=30)
    assert pdf.status_code == 200, f"{pdf.status_code} {pdf.text[:400]}"
    assert pdf.content[:4] == b"%PDF", f"not a PDF: {pdf.content[:20]}"


# ---------- Booking receipt PDF ----------
def test_booking_receipt_pdf(s):
    # create a booking, then fetch its receipt PDF
    cr = s.post(f"{API}/bookings", json=_taxi_payload(2), timeout=20)
    assert cr.status_code == 200, cr.text
    bid = cr.json().get("id")
    assert bid, cr.json()
    pdf = s.get(f"{API}/bookings/{bid}/receipt.pdf", timeout=30)
    assert pdf.status_code == 200, f"{pdf.status_code} {pdf.text[:400]}"
    assert pdf.content[:4] == b"%PDF", f"not a PDF: {pdf.content[:20]}"


# ---------- Chat SSE stream ----------
def test_chat_sse_stream(s):
    with s.post(f"{API}/chat/stream", json={"message": "hello", "session_id": "TEST_it3"}, stream=True, timeout=30) as r:
        assert r.status_code == 200, r.text
        ctype = r.headers.get("content-type", "")
        assert "event-stream" in ctype or "text/plain" in ctype, f"ctype={ctype}"
        got = b""
        for chunk in r.iter_content(chunk_size=64):
            got += chunk
            if len(got) > 20:
                break
        assert len(got) > 0, "no SSE bytes"
