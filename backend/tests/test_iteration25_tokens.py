"""Iteration 25 — Admin Token Store (/api/admin/tokens) + Tours Hub regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "roxfam2509@gmail.com", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ── /admin/tokens GET ──────────────────────────────────────────────────
def test_tokens_list_requires_auth():
    r = requests.get(f"{API}/admin/tokens", timeout=15)
    assert r.status_code in (401, 403)


def test_tokens_list_returns_29_registered(auth_headers):
    r = requests.get(f"{API}/admin/tokens", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    tokens = data["tokens"]
    assert len(tokens) == 29, f"Expected 29 tokens, got {len(tokens)}"
    groups = {t["group"] for t in tokens}
    for g in ["Facebook", "Twilio SMS", "Email", "Stripe", "PayPal", "AviationStack", "Emergent LLM", "Web Push", "Google OAuth"]:
        assert g in groups, f"Missing group {g}"
    # Sensitive rows must not leak plaintext
    for t in tokens:
        if t["sensitive"] and t["has_value"]:
            assert t["value"] == ""
            assert t["masked"].startswith("••••")


# ── PUT upsert ─────────────────────────────────────────────────────────
def test_put_unknown_key_returns_400(auth_headers):
    r = requests.put(f"{API}/admin/tokens", headers=auth_headers,
                     json={"key": "TOTALLY_MADE_UP_KEY_XYZ", "value": "x"}, timeout=15)
    assert r.status_code == 400
    assert "Unknown token key" in r.text


def test_put_and_persist_roundtrip(auth_headers):
    # Use non-sensitive safe key
    key = "FB_SITE_URL"
    test_val = "https://TEST-roxtaxi-iter25.example"
    # Snapshot current value first for restore
    r0 = requests.get(f"{API}/admin/tokens", headers=auth_headers, timeout=15)
    orig = next(t for t in r0.json()["tokens"] if t["key"] == key)
    orig_source = orig["source"]

    try:
        r = requests.put(f"{API}/admin/tokens", headers=auth_headers,
                         json={"key": key, "value": test_val}, timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert r.json()["cleared"] is False

        # Verify persistence via GET
        r2 = requests.get(f"{API}/admin/tokens", headers=auth_headers, timeout=15)
        entry = next(t for t in r2.json()["tokens"] if t["key"] == key)
        assert entry["source"] == "db"
        assert entry["value"] == test_val
        assert entry["db_override"] is True
    finally:
        # Cleanup: clear the DB override
        requests.delete(f"{API}/admin/tokens/{key}", headers=auth_headers, timeout=15)
        r3 = requests.get(f"{API}/admin/tokens", headers=auth_headers, timeout=15)
        entry2 = next(t for t in r3.json()["tokens"] if t["key"] == key)
        assert entry2["source"] == orig_source
        assert entry2["db_override"] is False


def test_put_empty_string_clears_override(auth_headers):
    key = "FB_GRAPH_VERSION"
    # Set then clear via empty string
    requests.put(f"{API}/admin/tokens", headers=auth_headers,
                 json={"key": key, "value": "v99.9"}, timeout=15)
    r = requests.put(f"{API}/admin/tokens", headers=auth_headers,
                     json={"key": key, "value": ""}, timeout=15)
    assert r.status_code == 200
    assert r.json()["cleared"] is True
    r2 = requests.get(f"{API}/admin/tokens", headers=auth_headers, timeout=15)
    entry = next(t for t in r2.json()["tokens"] if t["key"] == key)
    assert entry["db_override"] is False


# ── DELETE ─────────────────────────────────────────────────────────────
def test_delete_unknown_key_400(auth_headers):
    r = requests.delete(f"{API}/admin/tokens/NOT_A_REAL_KEY", headers=auth_headers, timeout=15)
    assert r.status_code == 400


def test_delete_clears_override(auth_headers):
    key = "GOOGLE_CLIENT_ID"
    requests.put(f"{API}/admin/tokens", headers=auth_headers,
                 json={"key": key, "value": "TEST-client-iter25"}, timeout=15)
    r = requests.delete(f"{API}/admin/tokens/{key}", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    assert r.json()["cleared"] is True


# ── Facebook status probe ──────────────────────────────────────────────
def test_facebook_status_endpoint(auth_headers):
    r = requests.get(f"{API}/admin/tokens/facebook/status", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    # Should return either ok:True with page info, or an error field
    assert "ok" in data or "error" in data or "status" in data


# ── Tours hub regression ───────────────────────────────────────────────
def test_tours_list_public():
    r = requests.get(f"{API}/tours", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_taxi_services_hub_prices():
    r = requests.get(f"{API}/taxi-services", timeout=15)
    assert r.status_code == 200
    services = r.json()
    ids = {s["id"]: s for s in services}
    # Hub cards reference these route IDs
    assert "downtown-ardastra" in ids, f"Missing downtown-ardastra route. Have: {list(ids.keys())}"
    assert "downtown-paradise" in ids
    assert "cablebeach-downtown" in ids
