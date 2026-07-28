"""Iteration 13 — seed_price + promo annotation + reset-to-seed backend tests."""
import os
import pytest
import requests
from pathlib import Path


def _load_frontend_env():
    envf = Path("/app/frontend/.env")
    if envf.exists():
        for line in envf.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_frontend_env()
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "admin@roxtaxi.com"
ADMIN_PASSWORD = "admin123"

SEED_PRICES = {
    "rentals": {"spark-compact": 65.0, "sentra-orange": 39.0, "trax-suv": 125.0,
                "malibu-fullsize": 79.0, "town-country-van": 149.0},
    "tours": {"blue-lagoon": 89.0, "atlantis-tour": 45.0, "snorkel-rose": 65.0, "island-hop": 149.0},
    "taxi_services": {"airport-nassau": 35.0, "port-paradise": 25.0, "paradise-nassau": 20.0},
}

PUBLIC_PATH = {"rentals": "/api/rentals", "tours": "/api/tours", "taxi_services": "/api/taxi-services"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _public_list(kind):
    r = requests.get(f"{BASE_URL}{PUBLIC_PATH[kind]}", timeout=15)
    assert r.status_code == 200
    return r.json()


def _find(items, item_id):
    for it in items:
        if it["id"] == item_id:
            return it
    return None


# --- Seed price tests -----------------------------------------------------------

def test_rentals_seed_price_present():
    items = _public_list("rentals")
    for rid, sp in SEED_PRICES["rentals"].items():
        it = _find(items, rid)
        assert it is not None, f"missing rental {rid}"
        assert "seed_price" in it, f"{rid} missing seed_price"
        assert float(it["seed_price"]) == sp, f"{rid} seed_price {it['seed_price']} != {sp}"


def test_tours_seed_price_present():
    items = _public_list("tours")
    for tid, sp in SEED_PRICES["tours"].items():
        it = _find(items, tid)
        assert it is not None
        assert float(it["seed_price"]) == sp


def test_taxi_seed_price_present():
    items = _public_list("taxi_services")
    for tid, sp in SEED_PRICES["taxi_services"].items():
        it = _find(items, tid)
        assert it is not None
        assert float(it["seed_price"]) == sp


# --- Promo annotation tests ---------------------------------------------------

def _promo_cycle(kind, item_id, seed_price, auth_headers):
    """Discount → verify promo → reset to seed → verify cleared."""
    # First ensure item is at seed price to avoid "identical price" 400
    requests.patch(
        f"{BASE_URL}/api/admin/{kind}/{item_id}/price",
        json={"price": seed_price, "reason": "Reset to seed default (test setup)"},
        headers=auth_headers, timeout=15,
    )
    new_price = round(seed_price * 0.8, 2)
    # PATCH with promo reason
    r = requests.patch(
        f"{BASE_URL}/api/admin/{kind}/{item_id}/price",
        json={"price": new_price, "reason": "20% off promo"},
        headers=auth_headers, timeout=15,
    )
    assert r.status_code == 200, r.text

    items = _public_list(kind)
    it = _find(items, item_id)
    assert it and "promo" in it, f"promo missing for {item_id}: {it}"
    assert it["promo"]["is_promo"] is True
    assert abs(float(it["promo"]["original_price"]) - seed_price) < 0.01
    assert "promo" in (it["promo"]["reason"] or "").lower()
    assert it["promo"]["changed_at"]

    # PATCH back to seed
    r2 = requests.patch(
        f"{BASE_URL}/api/admin/{kind}/{item_id}/price",
        json={"price": seed_price, "reason": "Reset to seed default"},
        headers=auth_headers, timeout=15,
    )
    assert r2.status_code == 200, r2.text

    items2 = _public_list(kind)
    it2 = _find(items2, item_id)
    assert it2 is not None
    assert "promo" not in it2 or not it2.get("promo", {}).get("is_promo"), \
        f"promo not cleared for {item_id}: {it2.get('promo')}"


def test_rentals_promo_cycle(auth):
    _promo_cycle("rentals", "sentra-orange", 39.0, auth)


def test_tours_promo_cycle(auth):
    _promo_cycle("tours", "atlantis-tour", 45.0, auth)


def test_taxi_promo_cycle(auth):
    _promo_cycle("taxi_services", "paradise-nassau", 20.0, auth)


def test_non_promo_reason_does_not_annotate(auth):
    # Change with a boring reason → should NOT set promo
    r = requests.patch(
        f"{BASE_URL}/api/admin/rentals/spark-compact/price",
        json={"price": 60.0, "reason": "Peak-season adjustment"},
        headers=auth, timeout=15,
    )
    assert r.status_code == 200
    items = _public_list("rentals")
    it = _find(items, "spark-compact")
    assert not it.get("promo", {}).get("is_promo"), it.get("promo")
    # Restore
    requests.patch(
        f"{BASE_URL}/api/admin/rentals/spark-compact/price",
        json={"price": 65.0, "reason": "Reset to seed default"},
        headers=auth, timeout=15,
    )


def test_promo_increase_does_not_annotate(auth):
    # Increase price with promo reason → shouldn't count as promo
    r = requests.patch(
        f"{BASE_URL}/api/admin/rentals/trax-suv/price",
        json={"price": 130.0, "reason": "seasonal promo bump"},
        headers=auth, timeout=15,
    )
    assert r.status_code == 200
    items = _public_list("rentals")
    it = _find(items, "trax-suv")
    assert not it.get("promo", {}).get("is_promo"), it.get("promo")
    # Restore
    requests.patch(
        f"{BASE_URL}/api/admin/rentals/trax-suv/price",
        json={"price": 125.0, "reason": "Reset to seed default"},
        headers=auth, timeout=15,
    )
