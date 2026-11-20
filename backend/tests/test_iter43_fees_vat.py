"""Iteration 43 — Processing fee (taxi + city tours) vs VAT (everything else), admin-editable rates."""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip()
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

CREATED_BOOKINGS, CREATED_QUOTES = [], []


def _env(key):
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"')


def _date(days=12):
    d = datetime.now(timezone.utc) + timedelta(days=days)
    while d.weekday() == 5:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d") + "T10:00"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "roxfam2509@gmail.com", "password": "admin123"}, timeout=20)
    if r.status_code != 200:
        pytest.skip("admin login failed")
    tok = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}", "X-CSRF-Token": s.cookies.get("admin_csrf") or ""})
    yield s
    # reset rates + cleanup
    s.put(f"{API}/admin/site-config", json={"processing_fee_pct": 5, "vat_pct": 10}, timeout=20)
    for bid in CREATED_BOOKINGS:
        s.delete(f"{API}/admin/bookings/{bid}", timeout=20)
    db = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]
    if CREATED_BOOKINGS:
        db.bookings_deleted.delete_many({"id": {"$in": CREATED_BOOKINGS}})
    if CREATED_QUOTES:
        db.quotes.delete_many({"id": {"$in": CREATED_QUOTES}})


def _quote(service, item_id, item_name, price, **kw):
    p = {"service_type": service, "item_id": item_id, "item_name": item_name, "price": price,
         "customer_name": "TEST_Fee", "customer_email": "test_fee@example.com", "customer_phone": "+10000000000",
         "booking_date": _date()[:10], "passengers": 1, "payment_method": "stripe", "quote_only": True,
         "pickup_location": "TEST pickup", "dropoff_location": "TEST dropoff"}
    p.update(kw)
    r = requests.post(f"{API}/bookings", json=p, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("quote_only") is True
    return r.json()["booking"]


# --- public booking quotes ---
def test_taxi_processing_fee_no_vat():
    b = _quote("taxi", "airport-nassau", "LPIA Airport → Downtown Nassau", 40.0)
    sub = b["subtotal_before_tax"]
    assert b["processing_fee"] == round(sub * 0.05, 2)
    assert not b.get("vat_amount")
    assert b["processing_fee_pct"] == 0.05


@pytest.mark.parametrize("tid,name,price", [("nassau-city-tour", "Nassau City Tour — 2½ Hour Guided Sightseeing", 45.0),
                                            ("atlantis-tour", "Paradise Island & Atlantis City Tour", 55.0)])
def test_city_tours_processing_fee(tid, name, price):
    b = _quote("tour", tid, name, price)
    assert b["processing_fee"] == round(b["subtotal_before_tax"] * 0.05, 2) and b["processing_fee"] > 0
    assert not b.get("vat_amount")


def test_noncity_tour_vat_only():
    b = _quote("tour", "snorkel-rose", "Rose Island Reef Snorkeling", 75.0)
    assert b["vat_amount"] == round(b["subtotal_before_tax"] * 0.10, 2)
    assert b["processing_fee"] == 0


def test_rental_vat_only():
    b = _quote("rental", "spark-compact", "2019 Chevrolet Spark — Compact", 65.0, days=2)
    assert b["vat_amount"] == round(b["subtotal_before_tax"] * 0.10, 2) and b["vat_amount"] > 0
    assert b["processing_fee"] == 0


def test_cable_beach_quote_vat_only():
    r = requests.post(f"{API}/cable-beach/quote", json={"pax": 2}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["vat"] == round(d["subtotal"] * 0.10, 2)
    assert d["processing_fee"] == 0
    assert d["total"] == round(d["subtotal"] + d["vat"], 2)


# --- admin-editable rates ---
def test_admin_rates_change_and_apply(admin):
    r = admin.put(f"{API}/admin/site-config", json={"processing_fee_pct": 7, "vat_pct": 12}, timeout=20)
    assert r.status_code == 200, r.text
    cfg = requests.get(f"{API}/site-config", timeout=20).json()
    assert cfg["processing_fee_pct"] == 7 and cfg["vat_pct"] == 12
    t = _quote("taxi", "airport-nassau", "LPIA Airport → Downtown Nassau", 40.0)
    assert t["processing_fee"] == round(t["subtotal_before_tax"] * 0.07, 2)
    v = _quote("tour", "snorkel-rose", "Rose Island Reef Snorkeling", 75.0)
    assert v["vat_amount"] == round(v["subtotal_before_tax"] * 0.12, 2)
    cb = requests.post(f"{API}/cable-beach/quote", json={"pax": 2}, timeout=20).json()
    assert cb["vat"] == round(cb["subtotal"] * 0.12, 2)
    r = admin.put(f"{API}/admin/site-config", json={"processing_fee_pct": 5, "vat_pct": 10}, timeout=20)
    assert r.status_code == 200
    cfg = requests.get(f"{API}/site-config", timeout=20).json()
    assert cfg["processing_fee_pct"] == 5 and cfg["vat_pct"] == 10


def test_admin_rates_validation(admin):
    r = admin.put(f"{API}/admin/site-config", json={"vat_pct": 50}, timeout=20)
    assert r.status_code == 422
    r = admin.put(f"{API}/admin/site-config", json={"processing_fee_pct": -1}, timeout=20)
    assert r.status_code == 422


def test_admin_rates_requires_auth():
    r = requests.put(f"{API}/admin/site-config", json={"vat_pct": 20}, timeout=20)
    assert r.status_code in (401, 403)


# --- admin manual booking ---
@pytest.mark.parametrize("svc,name,total,fee_key,expected_total", [
    ("taxi", "TEST_Taxi ride", 100.0, "processing_fee", 105.0),
    ("tour", "TEST_Other tour", 100.0, "vat_amount", 110.0),
    ("tour", "TEST_Nassau City Tour", 100.0, "processing_fee", 105.0),
    ("rental", "TEST_Rental", 200.0, "vat_amount", 220.0),
])
def test_admin_manual_booking_fees(admin, svc, name, total, fee_key, expected_total):
    p = {"service_type": svc, "item_name": name, "customer_name": "TEST_Manual", "customer_email": "test_manual@example.com",
         "booking_date": _date(), "passengers": 1, "total": total, "payment": "unpaid",
         "send_confirmation": False, "send_pay_link": False, "text_pay_link": False}
    r = admin.post(f"{API}/admin/bookings/manual", json=p, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    bk = d.get("booking", d)
    bid = bk.get("id") or d.get("id")
    assert bid
    CREATED_BOOKINGS.append(bid)
    g = admin.get(f"{API}/admin/bookings/{bid}", timeout=20)
    doc = g.json() if g.status_code == 200 else bk
    doc = doc.get("booking", doc)
    assert doc["total"] == expected_total, doc
    assert doc[fee_key] == round(expected_total - total, 2)
    other = "vat_amount" if fee_key == "processing_fee" else "processing_fee"
    assert not doc.get(other)
    assert doc["subtotal_before_tax"] == total


# --- admin manual quote ---
@pytest.mark.parametrize("svc,name,label,amount,total", [
    ("tour", "TEST_Snorkel", "VAT (10%)", 30.0, 330.0),
    ("taxi", "TEST_Taxi", "Processing fee (5%)", 15.0, 315.0),
])
def test_admin_manual_quote_fee_line(admin, svc, name, label, amount, total):
    p = {"service_type": svc, "item_name": name, "customer_name": "TEST_Quote", "customer_email": "test_quote@example.com",
         "booking_date": _date(), "passengers": 3, "trip_cost": 100, "per_person": True}
    r = admin.post(f"{API}/admin/quotes/manual", json=p, timeout=30)
    assert r.status_code == 200, r.text
    q = r.json()
    CREATED_QUOTES.append(q["id"])
    labels = {ln["label"]: ln["amount"] for ln in q["lines"]}
    assert labels.get(label) == amount, q["lines"]
    assert q["total"] == total
    g = requests.get(f"{API}/quotes/{q['id']}", timeout=20).json()
    assert g["total"] == total
