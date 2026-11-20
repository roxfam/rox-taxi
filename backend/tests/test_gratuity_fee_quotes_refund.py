# Gratuity + processing-fee toggles on manual bookings/quotes, admin quote edit, manual (cash/Zelle) refunds
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "roxfam2509@gmail.com", "password": "admin123"}
FAKE_PHONE = "+12025550143"  # fictional 555-01xx range
CREATED_BOOKINGS, CREATED_QUOTES = [], []


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip("admin login failed")
    ses = requests.Session()
    ses.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    yield ses
    # cleanup: only ids we created
    from pymongo import MongoClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    for q in CREATED_QUOTES:
        doc = db.quotes.find_one({"id": q}, {"booking_id": 1})
        if doc and doc.get("booking_id"):
            CREATED_BOOKINGS.append(doc["booking_id"])
        db.quotes.delete_one({"id": q})
    for b in set(CREATED_BOOKINGS):
        db.bookings.delete_one({"id": b})
        db.payment_transactions.delete_many({"booking_id": b})


def manual_booking(s, **kw):
    body = {"service_type": "tour", "item_name": "TEST_Custom tour", "customer_name": "TEST_Guest",
            "customer_email": "test_grat@example.com", "booking_date": "2026-06-10T10:00", "passengers": 2,
            "total": 100, "payment": "cash", "send_confirmation": False}
    body.update(kw)
    r = s.post(f"{BASE_URL}/api/admin/bookings/manual", json=body)
    assert r.status_code == 200, r.text
    b = r.json()["booking"]
    CREATED_BOOKINGS.append(b["id"])
    return b


# --- Manual booking: VAT / processing fee / tip math ---
class TestManualBookingFees:
    def test_tour_default_vat_no_fee_tip(self, s):
        b = manual_booking(s, tip_amount=15)
        assert b["vat_amount"] == 10.0 and b["processing_fee"] == 0
        assert b["tip_amount"] == 15 and b["total"] == 125.0

    def test_tour_fee_on_no_vat_tip_not_feed(self, s):
        b = manual_booking(s, no_vat=True, processing_fee_on=True, tip_amount=20)
        assert b["vat_amount"] == 0 and b["processing_fee"] == 5.0  # fee on 100 only, not on tip
        assert b["total"] == 125.0

    def test_taxi_default_fee_on(self, s):
        b = manual_booking(s, service_type="taxi", item_name="TEST_Taxi", total=40, tip_amount=6)
        assert b["processing_fee"] == 2.0 and b["vat_amount"] == 0 and b["total"] == 48.0

    def test_taxi_fee_off(self, s):
        b = manual_booking(s, service_type="taxi", item_name="TEST_Taxi", total=40, tip_amount=6, processing_fee_on=False)
        assert b["processing_fee"] == 0 and b["total"] == 46.0

    def test_negative_tip_rejected(self, s):
        r = s.post(f"{BASE_URL}/api/admin/bookings/manual", json={"service_type": "taxi", "item_name": "TEST_x", "customer_name": "TEST_x",
                   "booking_date": "2026-06-10T10:00", "total": 10, "tip_amount": -5, "payment": "cash", "send_confirmation": False})
        assert r.status_code == 422


# --- Refundable + manual refund ---
class TestManualRefund:
    def test_refundable_excludes_fee_and_tip(self, s):
        b = manual_booking(s, no_vat=True, processing_fee_on=True, tip_amount=20)  # total 125, kept 25
        r = s.get(f"{BASE_URL}/api/admin/bookings/{b['id'].lower()}/refundable")
        assert r.status_code == 200
        d = r.json()
        assert d["fee_kept"] == 25.0 and d["manual_max"] == 100.0 and d["refundable"] is False
        pytest.shared_bid = b["id"]

    def test_manual_refund_partial_then_overlimit(self, s):
        bid = pytest.shared_bid
        r = s.post(f"{BASE_URL}/api/admin/bookings/{bid}/refund-manual", json={"amount": 30, "method": "zelle", "reason": "TEST"})
        assert r.status_code == 200 and r.json()["refunded_total"] == 30
        d = s.get(f"{BASE_URL}/api/admin/bookings/{bid}/refundable").json()
        assert d["manual_max"] == 70.0 and d["payment_status"] == "partially_refunded"
        r = s.post(f"{BASE_URL}/api/admin/bookings/{bid}/refund-manual", json={"amount": 70.5, "method": "cash"})
        assert r.status_code == 400
        r = s.post(f"{BASE_URL}/api/admin/bookings/{bid}/refund-manual", json={"amount": 70, "method": "cash"})
        assert r.status_code == 200
        d = s.get(f"{BASE_URL}/api/admin/bookings/{bid}/refundable").json()
        assert d["manual_max"] == 0 and d["payment_status"] == "refunded"

    def test_unpaid_booking_manual_max_zero(self, s):
        b = manual_booking(s, payment="unpaid")
        d = s.get(f"{BASE_URL}/api/admin/bookings/{b['id']}/refundable").json()
        assert d["manual_max"] == 0
        r = s.post(f"{BASE_URL}/api/admin/bookings/{b['id']}/refund-manual", json={"amount": 1, "method": "cash"})
        assert r.status_code == 400

    def test_unknown_booking_404(self, s):
        assert s.get(f"{BASE_URL}/api/admin/bookings/ZZZZ0000/refundable").status_code == 404
        assert s.post(f"{BASE_URL}/api/admin/bookings/ZZZZ0000/refund-manual", json={"amount": 1}).status_code == 404

    def test_bad_method_and_zero_amount(self, s):
        bid = pytest.shared_bid
        assert s.post(f"{BASE_URL}/api/admin/bookings/{bid}/refund-manual", json={"amount": 1, "method": "bitcoin"}).status_code == 422
        assert s.post(f"{BASE_URL}/api/admin/bookings/{bid}/refund-manual", json={"amount": 0}).status_code == 422

    def test_requires_admin(self):
        assert requests.get(f"{BASE_URL}/api/admin/bookings/ZZZZ0000/refundable").status_code in (401, 403)


# --- Manual quote + edit + convert ---
class TestManualQuote:
    def test_create_manual_quote(self, s):
        r = s.post(f"{BASE_URL}/api/admin/quotes/manual", json={
            "service_type": "tour", "item_name": "TEST_Manual quote", "customer_name": "TEST_Q", "customer_email": "test_q@example.com",
            "booking_date": "2026-06-11T09:00", "passengers": 2, "trip_cost": 50, "per_person": True,
            "no_vat": True, "processing_fee_on": True, "tip_amount": 10})
        assert r.status_code == 200, r.text
        q = r.json()
        CREATED_QUOTES.append(q["id"])
        assert q["total"] == 115.0
        labels = [l["label"] for l in q["lines"]]
        assert "Gratuity" in labels and any("Processing" in x for x in labels) and not any("VAT" in x for x in labels)
        pytest.mq = q["id"]

    def test_get_quote_detail(self, s):
        r = s.get(f"{BASE_URL}/api/admin/quotes/{pytest.mq}")
        assert r.status_code == 200 and r.json()["payload"]["tip_amount"] == 10 and "_id" not in r.json()

    def test_edit_untouched_fee_flag_keeps_fee(self, s):
        # Simulates UI save where processing_fee_on is null (EditQuoteDialog pick() reads q.processing_fee_on, which manual quotes don't store)
        r = s.put(f"{BASE_URL}/api/admin/quotes/{pytest.mq}", json={"customer_name": "TEST_Q2", "processing_fee_on": None, "no_vat": True,
                                                                    "tip_amount": 10, "passengers": 2, "trip_cost": 50, "per_person": True})
        assert r.status_code == 200
        assert r.json()["total"] == 115.0, f"fee dropped on edit: total={r.json()['total']}"

    def test_edit_reprices(self, s):
        r = s.put(f"{BASE_URL}/api/admin/quotes/{pytest.mq}", json={"passengers": 3, "no_vat": False, "processing_fee_on": False, "tip_amount": 5})
        assert r.status_code == 200
        assert r.json()["total"] == 170.0
        g = s.get(f"{BASE_URL}/api/admin/quotes/{pytest.mq}").json()
        assert g["total"] == 170.0 and g["passengers"] == 3

    def test_convert_and_readonly(self, s):
        r = requests.post(f"{BASE_URL}/api/quotes/{pytest.mq}/book")
        assert r.status_code == 200, r.text
        bid = r.json()["booking_id"]
        CREATED_BOOKINGS.append(bid)
        d = s.get(f"{BASE_URL}/api/admin/bookings/{bid}/refundable").json()
        assert d["total"] == 170.0
        r = s.put(f"{BASE_URL}/api/admin/quotes/{pytest.mq}", json={"passengers": 1})
        assert r.status_code == 400

    def test_edit_404(self, s):
        assert s.put(f"{BASE_URL}/api/admin/quotes/Q-NOPE00", json={}).status_code == 404


# --- Catalog quote (booking-kind) with tip + toggles ---
class TestCatalogQuote:
    def test_catalog_quote_tip_and_toggles(self, s):
        payload = {"service_type": "tour", "item_id": "snorkel-rose", "item_name": "Rose Island Reef Snorkeling", "price": 75,
                   "customer_name": "TEST_Cat", "customer_email": "test_cat@example.com", "customer_phone": FAKE_PHONE,
                   "booking_date": "2026-06-12T09:00", "passengers": 2, "adults": 2, "days": 1, "payment_method": "stripe", "tip_amount": 12}
        r = s.post(f"{BASE_URL}/api/admin/quotes", json={"payload": payload, "no_vat": True, "processing_fee_on": True})
        assert r.status_code == 200, r.text
        q = r.json()
        CREATED_QUOTES.append(q["id"])
        lines = {l["label"]: l["amount"] for l in q["lines"]}
        print(lines, q["total"])
        assert not any("VAT" == k for k in lines)
        assert lines.get("Processing fee") and lines.get("Driver gratuity") == 12
        pytest.cq = q["id"]

    def test_catalog_quote_edit(self, s):
        r = s.put(f"{BASE_URL}/api/admin/quotes/{pytest.cq}", json={"passengers": 3, "no_vat": False, "processing_fee_on": False, "tip_amount": 0})
        assert r.status_code == 200, r.text
        lines = {l["label"]: l["amount"] for l in r.json()["lines"]}
        print(lines, r.json()["total"])
        assert "Processing fee" not in lines and "VAT" in lines and "Driver gratuity" not in lines
