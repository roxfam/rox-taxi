"""Iteration 12 — Rentals CRUD + price_history + PATCH price + persist-after-restart sanity.

Covers:
 - Admin login
 - POST /api/admin/rentals with full vehicle fields (year/make/model/color/body/seats/category)
 - GET /api/admin/rentals returns admin-added item
 - PUT /api/admin/rentals/{id} with a new price → price_history logs 'Edited via full form'
 - PATCH /api/admin/rentals/{id}/price → new price_history entry
 - PATCH identical price → 400
 - PATCH zero/negative → 422
 - GET /api/admin/rentals/{id}/price-history returns newest-first
 - Same PATCH price flow for kind='tours' and kind='taxi_services'
 - DELETE /api/admin/rentals/{id}
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_EMAIL = "admin@roxtaxi.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, "no token"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def rental_id(headers):
    payload = {
        "name": "TEST_Rental_Iter12",
        "description": "Playwright/pytest test rental — safe to delete",
        "price": 120.0,
        "category": "midsize",
        "year": 2022,
        "make": "Toyota",
        "model": "Corolla",
        "color": "White",
        "body": "Sedan",
        "seats": 5,
        "active": True,
    }
    r = requests.post(f"{BASE_URL}/api/admin/rentals", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, f"create failed {r.status_code} {r.text}"
    doc = r.json()
    assert doc["id"].startswith("ren-")
    assert doc["name"] == payload["name"]
    assert doc["year"] == 2022
    assert doc["make"] == "Toyota"
    assert doc["body"] == "Sedan"
    ph = doc.get("price_history") or []
    assert len(ph) == 1
    assert ph[0]["reason"] == "Item created"
    assert ph[0]["new_price"] == 120.0
    yield doc["id"]
    # cleanup
    requests.delete(f"{BASE_URL}/api/admin/rentals/{doc['id']}", headers=headers, timeout=15)


def test_list_rentals_contains_created(headers, rental_id):
    r = requests.get(f"{BASE_URL}/api/admin/rentals", headers=headers, timeout=15)
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert rental_id in ids


def test_put_with_price_change_logs_history(headers, rental_id):
    payload = {
        "name": "TEST_Rental_Iter12",
        "description": "Playwright/pytest test rental — safe to delete",
        "price": 135.0,  # was 120
        "category": "midsize",
        "year": 2022,
        "make": "Toyota",
        "model": "Corolla",
        "color": "White",
        "body": "Sedan",
        "seats": 5,
        "active": True,
    }
    r = requests.put(f"{BASE_URL}/api/admin/rentals/{rental_id}", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["price"] == 135.0
    ph = doc.get("price_history") or []
    # last (or any) entry with reason 'Edited via full form'
    reasons = [e.get("reason") for e in ph]
    assert "Edited via full form" in reasons
    entry = [e for e in ph if e.get("reason") == "Edited via full form"][-1]
    assert entry["old_price"] == 120.0
    assert entry["new_price"] == 135.0


def test_patch_price_ok(headers, rental_id):
    r = requests.patch(
        f"{BASE_URL}/api/admin/rentals/{rental_id}/price",
        json={"price": 149.99, "reason": "Weekend surge"},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["price"] == 149.99
    ph = doc.get("price_history") or []
    latest = ph[-1]
    assert latest["reason"] == "Weekend surge"
    assert latest["new_price"] == 149.99
    assert latest["changed_by"] == ADMIN_EMAIL


def test_patch_price_identical_returns_400(headers, rental_id):
    r = requests.patch(
        f"{BASE_URL}/api/admin/rentals/{rental_id}/price",
        json={"price": 149.99, "reason": "same"},
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 400, r.text


def test_patch_price_zero_or_negative(headers, rental_id):
    r0 = requests.patch(f"{BASE_URL}/api/admin/rentals/{rental_id}/price", json={"price": 0, "reason": "x"}, headers=headers, timeout=15)
    assert r0.status_code in (400, 422), r0.text
    rn = requests.patch(f"{BASE_URL}/api/admin/rentals/{rental_id}/price", json={"price": -5, "reason": "x"}, headers=headers, timeout=15)
    assert rn.status_code in (400, 422), rn.text


def test_get_price_history(headers, rental_id):
    r = requests.get(f"{BASE_URL}/api/admin/rentals/{rental_id}/price-history", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["id"] == rental_id
    assert data["current_price"] == 149.99
    hist = data["history"]
    assert len(hist) >= 3  # created + PUT edit + PATCH
    # newest first
    times = [h.get("changed_at") for h in hist]
    assert times == sorted(times, reverse=True)


@pytest.mark.parametrize("kind", ["tours", "taxi_services"])
def test_price_history_other_kinds(headers, kind):
    # Create test item
    payload = {"name": f"TEST_{kind}_Iter12", "description": "test", "price": 50.0, "active": True}
    r = requests.post(f"{BASE_URL}/api/admin/{kind}", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    item_id = r.json()["id"]
    try:
        # PATCH price
        rp = requests.patch(f"{BASE_URL}/api/admin/{kind}/{item_id}/price", json={"price": 75.0, "reason": "test bump"}, headers=headers, timeout=15)
        assert rp.status_code == 200, rp.text
        assert rp.json()["price"] == 75.0
        # history
        rh = requests.get(f"{BASE_URL}/api/admin/{kind}/{item_id}/price-history", headers=headers, timeout=15)
        assert rh.status_code == 200
        assert rh.json()["current_price"] == 75.0
        assert len(rh.json()["history"]) >= 2
    finally:
        requests.delete(f"{BASE_URL}/api/admin/{kind}/{item_id}", headers=headers, timeout=15)


def test_admin_added_survives_restart(headers):
    """Sanity: admin-added rental should NOT be wiped after backend restart."""
    payload = {"name": "TEST_Persist_Iter12", "description": "persist check", "price": 88.0, "active": True}
    r = requests.post(f"{BASE_URL}/api/admin/rentals", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200
    rid = r.json()["id"]
    try:
        import subprocess
        subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False, capture_output=True)
        # wait for backend to come back
        for _ in range(30):
            time.sleep(1)
            try:
                probe = requests.get(f"{BASE_URL}/api/admin/rentals", headers=headers, timeout=5)
                if probe.status_code == 200:
                    break
            except Exception:
                continue
        r2 = requests.get(f"{BASE_URL}/api/admin/rentals", headers=headers, timeout=15)
        assert r2.status_code == 200
        ids = [x["id"] for x in r2.json()]
        assert rid in ids, "Admin-added rental was wiped by seed_db on restart!"
    finally:
        requests.delete(f"{BASE_URL}/api/admin/rentals/{rid}", headers=headers, timeout=15)


def test_delete_rental(headers):
    payload = {"name": "TEST_ToDelete", "description": "d", "price": 10.0, "active": True}
    r = requests.post(f"{BASE_URL}/api/admin/rentals", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200
    rid = r.json()["id"]
    rd = requests.delete(f"{BASE_URL}/api/admin/rentals/{rid}", headers=headers, timeout=15)
    assert rd.status_code == 200
    assert rd.json().get("deleted") is True
