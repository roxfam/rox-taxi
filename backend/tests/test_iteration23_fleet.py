"""Backend tests for Fleet feature (iteration 23)."""
import os
import copy
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def original_fleet():
    r = requests.get(f"{BASE_URL}/api/fleet")
    assert r.status_code == 200
    return r.json()


class TestFleetPublic:
    def test_get_fleet_shape(self, original_fleet):
        d = original_fleet
        for k in ["headline", "subheadline", "drivers", "vehicles", "trust_notes"]:
            assert k in d, f"missing {k}"
        assert len(d["drivers"]) == 4
        assert len(d["vehicles"]) == 5
        assert len(d["trust_notes"]) == 4

    def test_driver_ids(self, original_fleet):
        ids = {x["id"] for x in original_fleet["drivers"]}
        assert ids == {"d-rox", "d-julien", "d-marcus", "d-nia"}
        for drv in original_fleet["drivers"]:
            for k in ["name", "tagline", "years_driving", "languages", "badges", "bio"]:
                assert k in drv

    def test_vehicle_ids(self, original_fleet):
        ids = {x["id"] for x in original_fleet["vehicles"]}
        assert ids == {"v-minivan", "v-suv", "v-sedan", "v-luxury", "v-pickup"}
        for v in original_fleet["vehicles"]:
            for k in ["name", "year", "type", "capacity", "luggage_capacity", "features", "tagline"]:
                assert k in v


class TestFleetAdmin:
    def test_put_requires_auth(self):
        r = requests.put(f"{BASE_URL}/api/admin/fleet", json={"headline": "no-auth"})
        assert r.status_code == 401

    def test_put_updates_headline_and_restores(self, admin_token, original_fleet):
        original_hl = original_fleet["headline"]
        h = {"Authorization": f"Bearer {admin_token}"}
        # PUT test headline
        r = requests.put(f"{BASE_URL}/api/admin/fleet",
                         json={"headline": "TEST_HEADLINE_XYZ"}, headers=h)
        assert r.status_code == 200
        # Verify via GET
        g = requests.get(f"{BASE_URL}/api/fleet").json()
        assert g["headline"] == "TEST_HEADLINE_XYZ"
        # Ensure drivers/vehicles unchanged
        assert len(g["drivers"]) == 4 and len(g["vehicles"]) == 5
        # Restore
        r2 = requests.put(f"{BASE_URL}/api/admin/fleet",
                          json={"headline": original_hl}, headers=h)
        assert r2.status_code == 200
        g2 = requests.get(f"{BASE_URL}/api/fleet").json()
        assert g2["headline"] == original_hl

    def test_empty_state_then_restore(self, admin_token, original_fleet):
        h = {"Authorization": f"Bearer {admin_token}"}
        orig_drivers = copy.deepcopy(original_fleet["drivers"])
        orig_vehicles = copy.deepcopy(original_fleet["vehicles"])
        # Empty
        r = requests.put(f"{BASE_URL}/api/admin/fleet",
                         json={"drivers": [], "vehicles": []}, headers=h)
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/fleet").json()
        assert g["drivers"] == [] and g["vehicles"] == []
        # Restore
        r2 = requests.put(f"{BASE_URL}/api/admin/fleet",
                          json={"drivers": orig_drivers, "vehicles": orig_vehicles}, headers=h)
        assert r2.status_code == 200
        g2 = requests.get(f"{BASE_URL}/api/fleet").json()
        assert len(g2["drivers"]) == 4 and len(g2["vehicles"]) == 5


class TestRegression:
    def test_tours_still_work(self):
        r = requests.get(f"{BASE_URL}/api/tours")
        assert r.status_code == 200

    def test_driver_manifest_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/admin/driver/manifest")
        assert r.status_code == 401
