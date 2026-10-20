# Iteration 42: add-on catalog v2 (no picnic, sign $7, casino $20/30min per_block), pricing, Love Beach
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
CREATED = []
EMAIL = "test_addon@example.com"


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    DB.bookings.delete_many({"customer_email": EMAIL})
    for b in CREATED:
        DB.bookings.delete_many({"id": b})
        DB.payment_transactions.delete_many({"booking_id": b})


def _date():
    return (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%dT10:00")


def _svc(sid):
    r = requests.get(f"{API}/taxi-services")
    return next(s for s in r.json() if s["id"] == sid)


def _tour(tid):
    r = requests.get(f"{API}/tours")
    return next(t for t in r.json() if t["id"] == tid)


def _book(stype, item, addons=None, qty=None, pax=2):
    payload = {
        "service_type": stype, "item_id": item["id"], "item_name": item.get("name") or item.get("title") or "x",
        "price": float(item.get("price") or 0), "customer_name": "TEST_Addon", "customer_email": EMAIL,
        "customer_phone": "+12425550000", "booking_date": _date(), "passengers": pax,
        "payment_method": "zelle", "pickup_location": "Lynden Pindling Airport", "dropoff_location": "Paradise Island",
    }
    if addons is not None:
        payload["selected_addon_ids"] = addons
    if qty is not None:
        payload["addon_qty"] = qty
    r = requests.post(f"{API}/bookings", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    CREATED.append(d["id"])
    return d


# Catalog checks
class TestCatalog:
    def test_no_picnic_and_sign_7_taxi(self):
        svcs = requests.get(f"{API}/taxi-services").json()
        assert svcs
        for s in svcs:
            ids = {a["id"]: a for a in s.get("addons") or []}
            assert "beach-picnic" not in ids, s["id"]
            sign = ids.get("meet-greet-sign") or ids.get("wharf-greeter")
            assert sign is not None, f"{s['id']} missing sign addon"
            assert float(sign["price"]) == 7.0, s["id"]

    def test_no_picnic_and_sign_7_tours(self):
        tours = requests.get(f"{API}/tours").json()
        assert tours
        for t in tours:
            ids = {a["id"]: a for a in t.get("addons") or []}
            assert "beach-picnic" not in ids, t["id"]
            assert "meet-greet-sign" in ids, f"{t['id']} missing meet-greet-sign"
            assert float(ids["meet-greet-sign"]["price"]) == 7.0

    @pytest.mark.parametrize("sid", ["airport-paradise", "port-paradise", "downtown-paradise"])
    def test_casino_per_block(self, sid):
        a = {x["id"]: x for x in _svc(sid).get("addons") or []}.get("casino-wait-30")
        assert a, sid
        assert float(a["price"]) == 20.0
        assert a["price_mode"] == "per_block"
        assert int(a["block_minutes"]) == 30

    def test_love_beach_location(self):
        r = requests.get(f"{API}/taxi/locations")
        assert r.status_code == 200
        assert "Love Beach" in r.text


# Pricing checks
class TestPricing:
    def test_taxi_casino_3_blocks_plus_sign(self):
        s = _svc("airport-paradise")
        base = _book("taxi", s)
        b = _book("taxi", s, ["casino-wait-30", "meet-greet-sign"], {"casino-wait-30": 3})
        sel = {a["id"]: a for a in b["addons_selected"]}
        assert sel["casino-wait-30"]["fee"] == 60.0
        assert sel["casino-wait-30"]["blocks"] == 3 and sel["casino-wait-30"]["minutes"] == 90
        assert sel["meet-greet-sign"]["fee"] == 7.0
        assert b["addons_fee"] == 67.0
        assert round(b["subtotal_before_tax"] - base["subtotal_before_tax"], 2) == 67.0
        assert not b.get("vat_amount")
        doc = DB.bookings.find_one({"id": b["id"]})
        assert doc["addons_fee"] == 67.0

    def test_taxi_qty_capped_12(self):
        s = _svc("airport-paradise")
        b = _book("taxi", s, ["casino-wait-30"], {"casino-wait-30": 50})
        a = b["addons_selected"][0]
        assert a["blocks"] == 12 and a["fee"] == 240.0 and a["minutes"] == 360

    def test_spoofed_addon_ignored(self):
        s = _svc("airport-paradise")
        b = _book("taxi", s, ["fake-addon", "meet-greet-sign"])
        ids = [a["id"] for a in b["addons_selected"]]
        assert ids == ["meet-greet-sign"]
        assert b["addons_fee"] == 7.0

    def test_tour_sign_with_vat(self):
        t = _tour("blue-lagoon")
        base = _book("tour", t)
        b = _book("tour", t, ["meet-greet-sign"])
        assert b["addons_fee"] == 7.0
        assert round(b["subtotal_before_tax"] - base["subtotal_before_tax"], 2) == 7.0
        assert round(b["vat_amount"] - base["vat_amount"], 2) == 0.7
