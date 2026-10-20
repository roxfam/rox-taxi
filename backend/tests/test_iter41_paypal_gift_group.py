# Iteration 41: PayPal for gift cards + group bookings, meet-sign $7, google wallet status
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _db():
    env = {}
    with open("/app/backend/.env") as f:
        for line in f:
            if "=" in line:
                k, v = line.strip().split("=", 1)
                env[k] = v.strip('"')
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


DB = _db()
CREATED = {"gift": [], "grp": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for c in CREATED["gift"]:
        DB.gift_cards.delete_many({"code": c})
    for b in CREATED["grp"]:
        DB.bookings.delete_many({"id": b})
        DB.payment_transactions.delete_many({"booking_id": b})


# Gift cards: PayPal purchase path
class TestGiftPayPal:
    def test_purchase_paypal_and_create_order(self):
        r = requests.post(f"{API}/gift-cards/purchase", json={
            "amount": 50, "buyer_name": "TEST_Buyer", "buyer_email": "test_buyer@example.com",
            "recipient_email": "test_recipient@example.com", "theme": "classic",
            "origin_url": BASE_URL, "pay_with": "paypal"})
        assert r.status_code == 200, r.text
        d = r.json()
        CREATED["gift"].append(d["code"])
        assert d["pay_with"] == "paypal"
        assert "checkout_url" not in d
        assert d["total_charged"] == 55.0
        doc = DB.gift_cards.find_one({"code": d["code"]})
        assert doc["status"] == "pending" and doc["total_charged"] == 55.0
        r2 = requests.post(f"{API}/gift-cards/{d['code']}/paypal/create-order")
        assert r2.status_code == 200, r2.text
        oid = r2.json()["order_id"]
        assert isinstance(oid, str) and len(oid) > 5
        assert DB.gift_cards.find_one({"code": d["code"]})["paypal_order_id"] == oid

    def test_create_order_unknown_gift(self):
        r = requests.post(f"{API}/gift-cards/NOPE-XXXX/paypal/create-order")
        assert r.status_code == 404

    def test_capture_unknown(self):
        r = requests.post(f"{API}/gift-cards/paypal/capture/UNKNOWN")
        assert r.status_code == 404

    def test_invalid_pay_with(self):
        r = requests.post(f"{API}/gift-cards/purchase", json={
            "amount": 50, "buyer_name": "TEST_Buyer", "buyer_email": "test_buyer@example.com",
            "recipient_email": "test_recipient@example.com", "origin_url": BASE_URL, "pay_with": "bitcoin"})
        assert r.status_code == 422


# Group bookings: PayPal deposit
class TestGroupPayPal:
    def test_group_checkout_paypal_deposit_order(self):
        date = (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%d")
        tours = requests.get(f"{API}/tours").json()
        t = tours[0] if isinstance(tours, list) else tours["tours"][0]
        price = float(t.get("price") or t.get("price_adult") or 100)
        r = requests.post(f"{API}/group-bookings/checkout", json={
            "service_type": "tour", "item_id": t["id"], "item_name": t.get("name", "TEST tour"),
            "base_price": price, "pax": 12, "booking_date": date,
            "customer_name": "TEST_Group", "customer_email": "test_group@example.com",
            "customer_phone": "+12425550000", "origin_url": BASE_URL, "pay_with": "paypal"})
        assert r.status_code == 200, r.text
        d = r.json()
        CREATED["grp"].append(d["booking_id"])
        assert d["pay_with"] == "paypal"
        assert "checkout_url" not in d
        bk = DB.bookings.find_one({"id": d["booking_id"]})
        assert bk["payment_method"] == "paypal"
        assert d["amount"] == pytest.approx(bk["deposit"])
        assert d["amount"] < d["total"]
        r2 = requests.post(f"{API}/paypal/create-order", json={"booking_id": d["booking_id"], "origin_url": BASE_URL})
        assert r2.status_code == 200, r2.text
        tx = DB.payment_transactions.find_one({"booking_id": d["booking_id"], "provider": "paypal"})
        assert tx["amount"] == pytest.approx(bk["deposit"])


# Meet-with-sign add-on price
def test_meet_sign_addons_7():
    svcs = requests.get(f"{API}/taxi-services").json()
    svcs = svcs if isinstance(svcs, list) else svcs.get("services", [])
    found = 0
    for s in svcs:
        for a in s.get("addons") or []:
            if a.get("id") in ("meet-greet-sign", "wharf-greeter"):
                found += 1
                assert float(a["price"]) == 7.0, (s.get("id"), a)
    assert found > 0


def test_google_wallet_status():
    r = requests.get(f"{API}/google-wallet/status")
    assert r.status_code == 200
    assert r.json()["configured"] is False


def test_love_beach_route():
    svcs = requests.get(f"{API}/taxi-services").json()
    svcs = svcs if isinstance(svcs, list) else svcs.get("services", [])
    lb = [s for s in svcs if s.get("id") == "port-love-beach"]
    assert lb, "port-love-beach missing"
    assert float(lb[0].get("price") or lb[0].get("price_per_person") or 0) == 20.0
