"""Reschedule price-quote + weekend-surcharge regression tests.

Exercises:
  - GET  /api/bookings/{id}/reschedule-quote   (preview surcharge delta)
  - POST /api/bookings/{id}/guest-reschedule   (applies the surcharge)
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pymongo
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://bahamas-taxi-tours.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = pymongo.MongoClient(MONGO_URL)[DB_NAME]

_GUEST_EMAIL = "resched.quote@example.com"


def _seed_booking(pickup_dt: datetime, service_type: str = "tour", total: float = 100.0) -> str:
    bid = f"RSQ-{uuid.uuid4().hex[:6].upper()}"
    _mongo.bookings.insert_one({
        "id": bid,
        "customer_name": "Reschedule QA",
        "customer_email": _GUEST_EMAIL,
        "customer_phone": "+12421234567",
        "item_name": "Dolphin swim" if service_type == "tour" else "Taxi ride",
        "service_type": service_type,
        "booking_date": pickup_dt.isoformat(),
        "total": total,
        "payment_status": "paid",
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return bid


def _cleanup(bid):
    _mongo.bookings.delete_one({"id": bid})


def _next_weekday(target_wd: int) -> datetime:
    """Returns a UTC datetime 3-21 days out on the requested weekday
    (0=Monday..6=Sunday) at 14:00."""
    now = datetime.now(timezone.utc) + timedelta(days=3)
    delta = (target_wd - now.weekday()) % 7
    d = now + timedelta(days=delta)
    return d.replace(hour=14, minute=0, second=0, microsecond=0)


def test_quote_weekday_to_sunday_adds_surcharge():
    monday = _next_weekday(0)
    sunday = _next_weekday(6)
    bid = _seed_booking(monday, service_type="tour", total=100.0)
    try:
        r = requests.get(f"{API}/bookings/{bid}/reschedule-quote",
                         params={"new_pickup": sunday.isoformat()})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["applies"] is True
        assert d["old_weekend"] is False
        assert d["new_weekend"] is True
        assert d["delta"] == 15.0
        assert d["old_total"] == 100.0
        assert d["new_total"] == 115.0
        assert "surcharge" in d["message"].lower()
    finally:
        _cleanup(bid)


def test_quote_sunday_to_weekday_removes_surcharge():
    sunday = _next_weekday(6)
    friday = _next_weekday(4)
    bid = _seed_booking(sunday, service_type="tour", total=115.0)
    try:
        r = requests.get(f"{API}/bookings/{bid}/reschedule-quote",
                         params={"new_pickup": friday.isoformat()})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["old_weekend"] is True
        assert d["new_weekend"] is False
        assert d["delta"] == -15.0
        assert d["new_total"] == 100.0
    finally:
        _cleanup(bid)


def test_quote_weekday_to_weekday_zero_delta():
    monday = _next_weekday(0)
    friday = _next_weekday(4)
    bid = _seed_booking(monday, service_type="tour", total=100.0)
    try:
        r = requests.get(f"{API}/bookings/{bid}/reschedule-quote",
                         params={"new_pickup": friday.isoformat()})
        assert r.status_code == 200
        d = r.json()
        assert d["delta"] == 0.0
        assert d["new_total"] == 100.0
    finally:
        _cleanup(bid)


def test_quote_doesnt_apply_to_rentals():
    monday = _next_weekday(0)
    sunday = _next_weekday(6)
    bid = _seed_booking(monday, service_type="rental", total=200.0)
    try:
        r = requests.get(f"{API}/bookings/{bid}/reschedule-quote",
                         params={"new_pickup": sunday.isoformat()})
        assert r.status_code == 200
        d = r.json()
        assert d["applies"] is False
        assert d["delta"] == 0.0
    finally:
        _cleanup(bid)


def test_guest_reschedule_applies_surcharge_to_total():
    monday = _next_weekday(0)
    sunday = _next_weekday(6)
    bid = _seed_booking(monday, service_type="tour", total=100.0)
    try:
        r = requests.post(f"{API}/bookings/{bid}/guest-reschedule", json={
            "new_pickup": sunday.isoformat(),
            "email": _GUEST_EMAIL,
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price_delta"] == 15.0
        assert d["new_total"] == 115.0
        # Verify Mongo reflects the new total
        row = _mongo.bookings.find_one({"id": bid})
        assert abs(row["total"] - 115.0) < 0.01
        hist = row.get("reschedule_history") or []
        assert hist and hist[-1]["weekend_transition"] == "weekday_to_weekend"
    finally:
        _cleanup(bid)


def test_guest_reschedule_rejects_wrong_email():
    bid = _seed_booking(_next_weekday(0), service_type="tour", total=100.0)
    try:
        r = requests.post(f"{API}/bookings/{bid}/guest-reschedule", json={
            "new_pickup": _next_weekday(6).isoformat(),
            "email": "wrong@example.com",
        })
        assert r.status_code == 403
    finally:
        _cleanup(bid)
