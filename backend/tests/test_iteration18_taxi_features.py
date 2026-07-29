"""Iteration 18 — validate 6 new features:
Live stats, taxi quote/locations, quote-request fallback, round-trip discount,
rental discount tiers, Saturday validation, heartbeat endpoint.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"


# ---------- Live stats ----------

class TestLiveStats:
    def test_live_stats_shape(self):
        r = requests.get(f"{API}/live-stats", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("bookings_last_hour", "bookings_last_24h", "contacts_last_hour", "as_of"):
            assert k in d, f"missing {k}"
        assert isinstance(d["bookings_last_hour"], int)
        assert isinstance(d["bookings_last_24h"], int)
        assert isinstance(d["contacts_last_hour"], int)
        assert isinstance(d["as_of"], str) and "T" in d["as_of"]


# ---------- Taxi locations & quote ----------

class TestTaxiQuote:
    def test_locations(self):
        r = requests.get(f"{API}/taxi/locations", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 14, f"expected >=14, got {len(arr)}"
        for loc in arr:
            assert "tag" in loc and "label" in loc and "keywords" in loc
            assert isinstance(loc["keywords"], list)

    def test_lpia_to_cable_beach_matches_35(self):
        r = requests.post(f"{API}/taxi/quote",
                          json={"from_location": "LPIA", "to_location": "Cable Beach"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["matched"] is True, d
        assert d["service"]["price"] == 35, d["service"]
        assert d["direction"] in ("forward", "reverse")

    def test_downtown_to_lpia_matches_40(self):
        r = requests.post(f"{API}/taxi/quote",
                          json={"from_location": "Downtown", "to_location": "LPIA"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["matched"] is True, d
        assert d["service"]["price"] == 40

    def test_lpia_to_downtown_bidirectional_40(self):
        r = requests.post(f"{API}/taxi/quote",
                          json={"from_location": "LPIA", "to_location": "Downtown"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["matched"] is True
        assert d["service"]["price"] == 40

    def test_unknown_route_no_fixed_rate(self):
        r = requests.post(f"{API}/taxi/quote",
                          json={"from_location": "Cabbage Beach", "to_location": "Junkanoo Beach"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["matched"] is False
        assert d["reason"] in ("no_fixed_rate", "unknown_location")

    def test_same_location(self):
        r = requests.post(f"{API}/taxi/quote",
                          json={"from_location": "LPIA", "to_location": "LPIA Airport"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["matched"] is False
        assert d["reason"] == "same_location"


# ---------- Quote request fallback ----------

class TestQuoteRequest:
    def test_quote_request_created(self):
        payload = {
            "from_location": "TEST_from",
            "to_location": "TEST_to",
            "customer_name": "TEST User",
            "customer_email": "TEST_qr@example.com",
            "customer_phone": "+12425551234",
            "passengers": 3,
            "when": "2026-04-05 10:00",
            "notes": "iteration18 test",
        }
        r = requests.post(f"{API}/taxi/quote-request", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"].startswith("QR-")
        assert d["status"] == "new"
        assert d["from_location"] == "TEST_from"
        assert d["to_location"] == "TEST_to"

    def test_quote_request_requires_fields(self):
        r = requests.post(f"{API}/taxi/quote-request",
                          json={"from_location": "a", "to_location": "b"}, timeout=15)
        assert r.status_code == 422


# ---------- Round-trip discount ----------

def _sunday_iso():
    # 2026-03-15 is a Sunday
    return "2026-03-15"


def _saturday_iso():
    return "2026-03-21"


class TestRoundTrip:
    def test_round_trip_taxi_40_price(self):
        payload = {
            "service_type": "taxi",
            "item_id": "lpia-downtown",
            "item_name": "LPIA Airport → Downtown Nassau",
            "price": 40,
            "customer_name": "TEST RT",
            "customer_email": "TEST_rt@example.com",
            "customer_phone": "+12425550001",
            "booking_date": _sunday_iso(),
            "pickup_location": "LPIA",
            "dropoff_location": "Downtown",
            "passengers": 1,
            "days": 1,
            "extra_luggage": 0,
            "payment_method": "zelle",
            "round_trip": True,
        }
        r = requests.post(f"{API}/bookings", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # base=40 x2=80, discount=8, total=72
        assert d["total"] == 72, d
        assert d["round_trip_discount"] == 8

    def test_round_trip_paradise_bridge_toll(self):
        # base 40 -> RT=80-8=72 + $2 bridge toll = $74
        payload = {
            "service_type": "taxi",
            "item_id": "any-paradise",
            "item_name": "LPIA → Paradise Island / Atlantis",
            "price": 40,
            "customer_name": "TEST RT PI",
            "customer_email": "TEST_rtpi@example.com",
            "customer_phone": "+12425550002",
            "booking_date": _sunday_iso(),
            "pickup_location": "LPIA",
            "dropoff_location": "Atlantis Paradise Island",
            "passengers": 1,
            "days": 1,
            "payment_method": "zelle",
            "round_trip": True,
        }
        r = requests.post(f"{API}/bookings", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("bridge_toll_fee") == 2.0
        assert d["total"] == 74, d


# ---------- Rental discount tiers ----------

class TestRentalTiers:
    def _rental_payload(self, days):
        return {
            "service_type": "rental",
            "item_id": "compact-car",
            "item_name": "Compact Rental",
            "price": 120,
            "customer_name": "TEST Rental",
            "customer_email": f"TEST_rental_{days}@example.com",
            "customer_phone": "+12425550003",
            "booking_date": _sunday_iso(),
            "passengers": 1,
            "days": days,
            "payment_method": "zelle",
        }

    def test_5_day_3pct(self):
        r = requests.post(f"{API}/bookings", json=self._rental_payload(5), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("rental_discount") == 18.0, d
        # base 600 - 18 + 150 deposit = 732
        assert d["total"] == 732

    def test_7_day_7pct(self):
        r = requests.post(f"{API}/bookings", json=self._rental_payload(7), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["rental_discount"] == 58.80
        # base 840 - 58.80 + 150 = 931.20
        assert d["total"] == 931.20

    def test_14_day_12pct(self):
        r = requests.post(f"{API}/bookings", json=self._rental_payload(14), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["rental_discount"] == 201.60
        # base 1680 - 201.60 + 150 = 1628.40
        assert d["total"] == 1628.40


# ---------- Saturday validation ----------

class TestSaturdayValidation:
    def test_saturday_pickup_rejected(self):
        payload = {
            "service_type": "taxi",
            "item_id": "lpia-downtown",
            "item_name": "LPIA → Downtown",
            "price": 40,
            "customer_name": "TEST Sat",
            "customer_email": "TEST_sat@example.com",
            "customer_phone": "+12425550004",
            "booking_date": _saturday_iso(),
            "passengers": 1,
            "payment_method": "zelle",
        }
        r = requests.post(f"{API}/bookings", json=payload, timeout=15)
        assert r.status_code == 400
        assert "closed on Saturdays for pickup" in r.text

    def test_sunday_pickup_6_day_rental_accepted(self):
        # Sunday + 6 days spans Saturday drop-off — should NOW succeed
        payload = {
            "service_type": "rental",
            "item_id": "compact-car",
            "item_name": "Compact Rental",
            "price": 120,
            "customer_name": "TEST SunSpan",
            "customer_email": "TEST_sunspan@example.com",
            "customer_phone": "+12425550005",
            "booking_date": _sunday_iso(),
            "passengers": 1,
            "days": 6,
            "payment_method": "zelle",
        }
        r = requests.post(f"{API}/bookings", json=payload, timeout=20)
        assert r.status_code == 200, r.text


# ---------- Heartbeat ----------

class TestHeartbeat:
    def _register(self):
        email = f"tst.{int(time.time()*1000)}@example.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register",
                   json={"name": "TEST HB", "email": email, "password": "Test1234"},
                   timeout=15)
        assert r.status_code == 200, r.text
        return s

    def test_heartbeat_ok(self):
        s = self._register()
        r = s.post(f"{API}/auth/heartbeat", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["idle_timeout_minutes"] == 60
