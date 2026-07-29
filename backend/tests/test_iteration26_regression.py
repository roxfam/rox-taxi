"""
Iteration 26 — Focused regression checks
- Baby seat $7/day × seats × days, cap at 3, free on 14+ days
- PromoBanner backend feed shape
- Packages endpoint shape
"""
import os
from datetime import datetime, timedelta, timezone
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _next_non_saturday(days_ahead=7):
    d = datetime.now(timezone.utc) + timedelta(days=days_ahead)
    while d.weekday() == 5:
        d += timedelta(days=1)
    return d.date().isoformat()


def test_baby_seat_2seats_3days_is_42():
    payload = {
        "service_type": "rental",
        "item_id": "spark-compact",
        "item_name": "Test rental",
        "price": 55.0,
        "customer_name": "TEST_BS3",
        "customer_email": "test_bs3@example.com",
        "customer_phone": "+12420000000",
        "booking_date": _next_non_saturday(7),
        "passengers": 2,
        "days": 3,
        "baby_seats": 2,
        "payment_method": "cash",
    }
    r = requests.post(f"{API}/bookings", json=payload)
    assert r.status_code == 200, r.text[:400]
    b = r.json()
    assert b.get("baby_seats") == 2
    assert b.get("baby_seat_fee") == 42.0, f"expected $42, got {b.get('baby_seat_fee')}"
    assert b.get("baby_seat_free") is False


def test_baby_seat_clamps_at_3():
    payload = {
        "service_type": "rental",
        "item_id": "spark-compact",
        "item_name": "Test rental",
        "price": 55.0,
        "customer_name": "TEST_BSCLAMP",
        "customer_email": "test_bsclamp@example.com",
        "customer_phone": "+12420000000",
        "booking_date": _next_non_saturday(7),
        "passengers": 2,
        "days": 2,
        "baby_seats": 99,
        "payment_method": "cash",
    }
    r = requests.post(f"{API}/bookings", json=payload)
    # Pydantic Field le=3 will 422 on 99 — that's still a valid clamp behaviour.
    # If server clamps instead of rejecting, expect baby_seats==3 & fee=$42.
    if r.status_code == 200:
        b = r.json()
        assert b.get("baby_seats") == 3
        assert b.get("baby_seat_fee") == round(3 * 7.0 * 2, 2)
    else:
        assert r.status_code in (400, 422)


def test_packages_endpoint_shape():
    r = requests.get(f"{API}/packages")
    assert r.status_code == 200
    pkgs = r.json()
    assert len(pkgs) >= 2
    ids = {p.get("id") for p in pkgs}
    assert "airport-atlantis-airport" in ids
    assert "airport-tour-airport" in ids
    for p in pkgs:
        assert "items" in p and isinstance(p["items"], list)
        assert "subtotal" in p
        assert "package_price" in p
        # savings may be derived on frontend or included
        assert p["subtotal"] >= p["package_price"]


def test_public_promotions_shape():
    r = requests.get(f"{API}/promotions")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for p in data:
        assert p.get("active") is not False  # only active surfaced
        assert "label" in p
        assert "discount_type" in p
