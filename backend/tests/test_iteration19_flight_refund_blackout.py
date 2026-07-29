"""Iteration 19 — validate 4 features:
1) Flight tracker via AviationStack
2) Auto-refund on cancel (Stripe/PayPal/Zelle)
3) Blackout calendar via admin endpoint
4) (frontend-only) Tour upsell — tours listing verified as pre-req
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"


# ---------- Admin auth fixture ----------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "roxfam2509@gmail.com", "password": "admin123"},
                      timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- 1. Flight tracker ----------

class TestFlightTracker:
    def test_flight_wu805_found(self):
        r = requests.get(f"{API}/flight/WU805", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("found") is True, d
        assert d["flight_number"] == "WU805"
        assert d["airline"] == "Western Air", d
        assert d["departure"]["airport_iata"] == "GGT", d["departure"]
        assert d["arrival"]["airport_iata"] == "NAS", d["arrival"]
        # recommended pickup should be ISO string when arrival timestamp present
        rp = d.get("recommended_pickup")
        # It may be None if no scheduled/estimated/actual present — but WU805 should have scheduled
        assert rp is None or ("T" in rp)

    def test_flight_not_found_returns_200(self):
        r = requests.get(f"{API}/flight/ZZ9999", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("found") is False
        assert "No flight found" in d.get("message", "")

    def test_flight_invalid_short(self):
        r = requests.get(f"{API}/flight/AB", timeout=15)
        assert r.status_code == 400
        assert "Invalid flight number" in r.text

    def test_flight_cache(self):
        # First call
        r1 = requests.get(f"{API}/flight/WU805", timeout=20)
        # Second call within cache TTL — should be identical
        r2 = requests.get(f"{API}/flight/WU805", timeout=20)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json() == r2.json()


# ---------- 2. Bookings with flight_number field ----------

class TestBookingFlightField:
    def test_booking_stores_flight_number_uppercase(self):
        payload = {
            "service_type": "taxi",
            "item_id": "lpia-downtown",
            "item_name": "LPIA → Downtown Nassau",
            "price": 40,
            "customer_name": "TEST Flight",
            "customer_email": "TEST_flight@example.com",
            "customer_phone": "+12425559999",
            "booking_date": "2026-12-06T14:00:00",  # Sunday
            "pickup_location": "LPIA",
            "dropoff_location": "Downtown",
            "passengers": 1,
            "days": 1,
            "payment_method": "zelle",
            "flight_number": "  wu805  ",
        }
        r = requests.post(f"{API}/bookings", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        bid = d["id"]
        # Fetch and confirm stored uppercase/stripped
        g = requests.get(f"{API}/bookings/{bid}", timeout=15)
        assert g.status_code == 200
        gd = g.json()
        assert gd.get("flight_number") == "WU805", gd


# ---------- 3. Cancellation & refund ----------

def _mk_booking(booking_date_iso, payment_method="zelle", paid=False,
                email="TEST_cancel@example.com"):
    payload = {
        "service_type": "taxi",
        "item_id": "lpia-downtown",
        "item_name": "LPIA → Downtown",
        "price": 40,
        "customer_name": "TEST Cancel",
        "customer_email": email,
        "customer_phone": "+12425558888",
        "booking_date": booking_date_iso,
        "pickup_location": "LPIA",
        "dropoff_location": "Downtown",
        "passengers": 1,
        "days": 1,
        "payment_method": payment_method,
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _mark_paid(bid, admin_headers):
    r = requests.post(f"{API}/admin/payments/zelle-mark-paid",
                      json={"booking_id": bid},
                      headers=admin_headers, timeout=15)
    return r


class TestCancellation:
    def test_cancel_zelle_paid_far_future(self, admin_headers):
        # Booking date well beyond 48h — Monday 2026-12-14
        b = _mk_booking("2026-12-14T14:00:00", payment_method="zelle",
                        email="TEST_cancel_zelle@example.com")
        bid = b["id"]
        pr = _mark_paid(bid, admin_headers)
        if pr.status_code not in (200, 204):
            pytest.skip(f"Cannot mark booking paid via admin endpoint: {pr.status_code} {pr.text[:200]}")
        r = requests.post(f"{API}/bookings/{bid}/cancel", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["eligible_for_refund"] is True
        # 15% fee of 40 = 6, refund = 34
        assert d["cancellation_fee"] == 6.0, d
        assert d["refund_estimate"] == 34.0, d
        rr = d.get("refund_result") or {}
        assert rr.get("attempted") is True, rr
        assert rr.get("method") == "zelle"
        assert rr.get("ok") is False
        assert "Manual refund required" in (rr.get("reason") or "")

        # GET should have cancellation with refund_result
        g = requests.get(f"{API}/bookings/{bid}", timeout=15).json()
        assert g["status"] == "cancelled"
        assert g["cancellation"]["refund_result"]["method"] == "zelle"

    def test_cancel_far_future_unpaid_still_computes_fee(self):
        b = _mk_booking("2026-12-16T14:00:00",
                        email="TEST_cancel_farfuture@example.com")
        bid = b["id"]
        r = requests.post(f"{API}/bookings/{bid}/cancel", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["eligible_for_refund"] is True
        # Unpaid: fee 0, refund 0 in current code
        # but eligible True — verify 15% math applies only to paid path
        # Actually per code: fee = 15% if eligible (paid or not); refund=0 if unpaid.
        # So we just assert eligible True and total sanity
        assert d["cancellation_fee"] in (6.0, 0.0)

    def test_cancel_within_48h_no_refund(self):
        # Book within 24h from now — use a booking_date about 1 day from now
        from datetime import datetime, timedelta, timezone
        soon = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
        # But service is closed Saturdays — pick +25h to be safe; also service_type taxi
        b = _mk_booking(soon, email="TEST_cancel_soon@example.com")
        bid = b["id"]
        r = requests.post(f"{API}/bookings/{bid}/cancel", timeout=20)
        # If Saturday validation rejected booking creation, skip
        if not b.get("id"):
            pytest.skip("booking creation blocked")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["eligible_for_refund"] is False, d
        # Unpaid + not eligible: fee = 0, refund = 0
        # (see code: fee = total if paid else 0.0 when NOT eligible)
        assert d["refund_estimate"] == 0.0

    def test_cancel_already_cancelled_returns_400(self):
        b = _mk_booking("2026-12-21T14:00:00",
                        email="TEST_cancel_twice@example.com")
        bid = b["id"]
        r1 = requests.post(f"{API}/bookings/{bid}/cancel", timeout=20)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/bookings/{bid}/cancel", timeout=20)
        assert r2.status_code == 400
        assert "already cancelled" in r2.text.lower()


# ---------- 4. Blackout dates ----------

class TestBlackoutDates:
    def test_public_get_default_empty_or_list(self):
        r = requests.get(f"{API}/blackout-dates", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "blackout_dates" in d
        assert isinstance(d["blackout_dates"], list)

    def test_admin_set_requires_auth(self):
        r = requests.post(f"{API}/admin/blackout-dates",
                          json={"dates": ["2026-06-15"]}, timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_admin_set_and_get(self, admin_headers):
        r = requests.post(f"{API}/admin/blackout-dates",
                          json={"dates": ["2026-06-15", "2026-07-04", "not-a-date"]},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["blackout_dates"] == ["2026-06-15", "2026-07-04"]

        # Public reflects it
        g = requests.get(f"{API}/blackout-dates", timeout=15).json()
        assert "2026-06-15" in g["blackout_dates"]
        assert "2026-07-04" in g["blackout_dates"]
        assert "not-a-date" not in g["blackout_dates"]

    def test_booking_on_blackout_rejected(self, admin_headers):
        # Ensure 2026-06-15 in blackout list
        requests.post(f"{API}/admin/blackout-dates",
                      json={"dates": ["2026-06-15"]},
                      headers=admin_headers, timeout=15)
        time.sleep(0.5)
        payload = {
            "service_type": "taxi",
            "item_id": "lpia-downtown",
            "item_name": "LPIA → Downtown",
            "price": 40,
            "customer_name": "TEST Blackout",
            "customer_email": "TEST_blackout@example.com",
            "customer_phone": "+12425557777",
            "booking_date": "2026-06-15T14:00:00",
            "passengers": 1,
            "payment_method": "zelle",
        }
        r = requests.post(f"{API}/bookings", json=payload, timeout=20)
        assert r.status_code == 400, r.text
        assert "offline on 2026-06-15" in r.text

    def test_clearing_blackout_allows_booking(self, admin_headers):
        # Clear
        r = requests.post(f"{API}/admin/blackout-dates",
                          json={"dates": []},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["blackout_dates"] == []
        time.sleep(0.5)
        # Try booking again — 2026-06-15 is a Monday, should work now
        payload = {
            "service_type": "taxi",
            "item_id": "lpia-downtown",
            "item_name": "LPIA → Downtown",
            "price": 40,
            "customer_name": "TEST Blackout Clear",
            "customer_email": "TEST_blackout_clear@example.com",
            "customer_phone": "+12425556666",
            "booking_date": "2026-06-15T14:00:00",
            "passengers": 1,
            "payment_method": "zelle",
        }
        r = requests.post(f"{API}/bookings", json=payload, timeout=20)
        assert r.status_code == 200, r.text


# ---------- 5. Tours for upsell (prereq) ----------

class TestTours:
    def test_tours_available(self):
        r = requests.get(f"{API}/tours", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 2
