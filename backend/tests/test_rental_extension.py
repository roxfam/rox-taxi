"""Backend tests for rental extension endpoints (iteration 25).

Endpoints under test:
- POST /api/my/bookings/{booking_id}/extend/quote
- POST /api/my/bookings/{booking_id}/extend/checkout
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Load backend env for MongoDB direct seeding
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _pickup_iso(offset_days=7):
    """Get a valid future pickup date that's NOT Saturday (closed) and skip site blackouts."""
    site = _db.site_config.find_one({"_id": "main"}) or {}
    site_blk = set(site.get("blackout_dates") or [])
    d = (datetime.now(timezone.utc) + timedelta(days=offset_days)).date()
    # avoid Saturday (weekday=5) and site blackouts
    while d.weekday() == 5 or d.isoformat() in site_blk:
        d = d + timedelta(days=1)
    return d.isoformat()


@pytest.fixture(scope="module")
def rental_vehicle():
    """Fetch a real rental item from /api/rentals."""
    r = requests.get(f"{API}/rentals", timeout=30)
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) > 0, "No rentals in seed data"
    return items[0]


@pytest.fixture(scope="module")
def customer():
    """Register a fresh customer, return session token + email + user_id."""
    email = f"test_ext_{uuid.uuid4().hex[:8]}@example.com"
    password = "TestPass123!"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={"name": "Test Ext", "email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    token = s.cookies.get("session_token")
    assert token
    user = r.json()["user"]
    yield {"email": email, "token": token, "user_id": user["user_id"], "session": s}
    # Teardown
    _db.users.delete_one({"user_id": user["user_id"]})
    _db.user_sessions.delete_many({"user_id": user["user_id"]})
    _db.bookings.delete_many({"customer_email": email})
    _db.rental_extensions.delete_many({"customer_email": email})


def _make_booking(email, vehicle, *, days=2, paid=True, service_type="rental",
                  status=None, pickup_iso=None):
    """Insert a booking directly. Returns booking_id."""
    bid = f"bk_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": bid,
        "customer_email": email,
        "customer_name": "Test Ext",
        "service_type": service_type,
        "item_id": vehicle["id"] if vehicle else "veh_none",
        "days": days,
        "price": float(vehicle.get("price", 89.0)) if vehicle else 89.0,
        "total": float(vehicle.get("price", 89.0)) * days if vehicle else 89.0 * days,
        "booking_date": pickup_iso or _pickup_iso(),
        "payment_status": "paid" if paid else "pending",
        "created_at": now_iso(),
    }
    if status is not None:
        doc["status"] = status
    _db.bookings.insert_one(doc)
    return bid, doc


def _auth_headers(customer):
    return {"Authorization": f"Bearer {customer['token']}"}


# ─── 1. Unauth returns 401 ─────────────────────────────────────────────
def test_extend_quote_unauthenticated_401():
    # Use a random booking id — unauthenticated request should be rejected
    # BEFORE the booking lookup happens.
    r = requests.post(f"{API}/my/bookings/does_not_matter/extend/quote",
                      json={"additional_days": 2}, timeout=30)
    assert r.status_code == 401, r.text


# ─── 2. Happy path: quote with 3 additional days on 2-day rental ──────
def test_extend_quote_happy_path(customer, rental_vehicle):
    bid, doc = _make_booking(customer["email"], rental_vehicle, days=2)
    r = requests.post(f"{API}/my/bookings/{bid}/extend/quote",
                      headers=_auth_headers(customer),
                      json={"additional_days": 3}, timeout=30)
    assert r.status_code == 200, r.text
    q = r.json()
    for key in ["orig_days", "new_days", "additional_days", "daily_price",
                "extra_gross", "extra_discount", "extra_cost",
                "orig_discount_pct", "new_discount_pct", "new_return_date",
                "deposit_note"]:
        assert key in q, f"missing {key}"
    assert q["orig_days"] == 2
    assert q["additional_days"] == 3
    assert q["new_days"] == 5
    # daily_price==vehicle price
    assert abs(q["daily_price"] - float(rental_vehicle["price"])) < 0.01
    # Math: extra_gross = daily * 3
    assert abs(q["extra_gross"] - round(q["daily_price"] * 3, 2)) < 0.01
    # new_days=5 => 3% tier
    assert q["new_discount_pct"] == 0.03
    assert abs(q["extra_discount"] - round(q["extra_gross"] * 0.03, 2)) < 0.01
    assert abs(q["extra_cost"] - round(q["extra_gross"] - q["extra_discount"], 2)) < 0.01
    # new_return_date = pickup + new_days
    pickup = datetime.fromisoformat(doc["booking_date"]).date()
    expected_ret = (pickup + timedelta(days=5)).isoformat()
    assert q["new_return_date"] == expected_ret


# ─── 3. Tier crossing 4+3=7 → 7% discount ──────────────────────────────
def test_extend_quote_tier_crossing_7pct(customer, rental_vehicle):
    bid, _ = _make_booking(customer["email"], rental_vehicle, days=4)
    r = requests.post(f"{API}/my/bookings/{bid}/extend/quote",
                      headers=_auth_headers(customer),
                      json={"additional_days": 3}, timeout=30)
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["new_days"] == 7
    assert q["orig_discount_pct"] == 0.0  # 4 days is below 5-day threshold
    assert q["new_discount_pct"] == 0.07
    assert abs(q["extra_discount"] - round(q["extra_gross"] * 0.07, 2)) < 0.01


# ─── 4. Unpaid booking rejected 400 ────────────────────────────────────
def test_extend_quote_unpaid_400(customer, rental_vehicle):
    bid, _ = _make_booking(customer["email"], rental_vehicle, days=2, paid=False)
    r = requests.post(f"{API}/my/bookings/{bid}/extend/quote",
                      headers=_auth_headers(customer),
                      json={"additional_days": 2}, timeout=30)
    assert r.status_code == 400, r.text
    assert "Pay the original booking first" in r.json().get("detail", "")


# ─── 5. Non-rental (taxi) rejected 400 ─────────────────────────────────
def test_extend_quote_non_rental_400(customer, rental_vehicle):
    bid, _ = _make_booking(customer["email"], rental_vehicle, days=2, service_type="taxi")
    r = requests.post(f"{API}/my/bookings/{bid}/extend/quote",
                      headers=_auth_headers(customer),
                      json={"additional_days": 2}, timeout=30)
    assert r.status_code == 400, r.text
    assert "Only rentals" in r.json().get("detail", "")


# ─── 6. Cancelled + Completed → 400 ────────────────────────────────────
@pytest.mark.parametrize("status,expect_word", [("cancelled", "cancelled"), ("completed", "completed")])
def test_extend_quote_cancelled_or_completed_400(customer, rental_vehicle, status, expect_word):
    bid, _ = _make_booking(customer["email"], rental_vehicle, days=2, status=status)
    r = requests.post(f"{API}/my/bookings/{bid}/extend/quote",
                      headers=_auth_headers(customer),
                      json={"additional_days": 2}, timeout=30)
    assert r.status_code == 400, r.text
    assert expect_word in r.json().get("detail", "")


# ─── 7. Extending someone else's booking → 404 ─────────────────────────
def test_extend_quote_other_users_booking_404(customer, rental_vehicle):
    other_email = f"TEST_other_{uuid.uuid4().hex[:6]}@example.com"
    bid, _ = _make_booking(other_email, rental_vehicle, days=2)
    try:
        r = requests.post(f"{API}/my/bookings/{bid}/extend/quote",
                          headers=_auth_headers(customer),
                          json={"additional_days": 2}, timeout=30)
        assert r.status_code == 404, r.text
        assert "Booking not found" in r.json().get("detail", "")
    finally:
        _db.bookings.delete_one({"id": bid})


# ─── 8. additional_days out of range → 422 ─────────────────────────────
@pytest.mark.parametrize("bad", [0, 31])
def test_extend_quote_out_of_range_422(customer, rental_vehicle, bad):
    bid, _ = _make_booking(customer["email"], rental_vehicle, days=2)
    r = requests.post(f"{API}/my/bookings/{bid}/extend/quote",
                      headers=_auth_headers(customer),
                      json={"additional_days": bad}, timeout=30)
    assert r.status_code == 422, r.text


# ─── 9. Blackout day on extension window → 400 ─────────────────────────
def test_extend_quote_blocked_by_blackout_400(customer, rental_vehicle):
    pickup_iso = _pickup_iso()
    pickup = datetime.fromisoformat(pickup_iso).date()
    # We book 2 days; extension = 3 days ⇒ days 2,3,4 after pickup.
    # Add a vehicle blackout for pickup+day3 (i.e. index 3).
    blk_date = (pickup + timedelta(days=3)).isoformat()
    veh_id = rental_vehicle["id"]
    orig_blk = list((_db.rentals.find_one({"id": veh_id}) or {}).get("blackout_dates") or [])
    _db.rentals.update_one({"id": veh_id}, {"$set": {"blackout_dates": orig_blk + [blk_date]}})
    try:
        bid, _ = _make_booking(customer["email"], rental_vehicle, days=2,
                               pickup_iso=pickup_iso)
        r = requests.post(f"{API}/my/bookings/{bid}/extend/quote",
                          headers=_auth_headers(customer),
                          json={"additional_days": 3}, timeout=30)
        assert r.status_code == 400, r.text
        assert blk_date in r.json().get("detail", "")
    finally:
        _db.rentals.update_one({"id": veh_id}, {"$set": {"blackout_dates": orig_blk}})


# ─── 10. Checkout returns url + session_id + persists doc ──────────────
def test_extend_checkout_happy_path(customer, rental_vehicle):
    bid, _ = _make_booking(customer["email"], rental_vehicle, days=2)
    r = requests.post(f"{API}/my/bookings/{bid}/extend/checkout",
                      headers=_auth_headers(customer),
                      json={"additional_days": 3, "origin_url": BASE_URL},
                      timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ["checkout_url", "session_id", "extension_id", "quote"]:
        assert k in body, f"missing {k}"
    assert body["checkout_url"].startswith("http"), body["checkout_url"]
    # Verify db doc
    ext = _db.rental_extensions.find_one({"id": body["extension_id"]})
    assert ext is not None
    assert ext["status"] == "pending"
    assert ext["booking_id"] == bid
    assert ext["customer_email"] == customer["email"]
    assert ext["session_id"] == body["session_id"]
