"""Tests for the admin payments + content endpoints (iteration 16)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@roxtaxi.com", "password": "admin123"},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_admin_payments_ok(auth_headers):
    r = requests.get(f"{BASE_URL}/api/admin/payments", headers=auth_headers, timeout=20)
    assert r.status_code == 200, f"payments failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "rows" in data
    assert "totals" in data
    assert isinstance(data["rows"], list)
    for k in ("paid_count", "today_usd", "week_usd", "month_usd", "total_usd"):
        assert k in data["totals"], f"missing totals key: {k}"


def test_admin_content_ok(auth_headers):
    r = requests.get(f"{BASE_URL}/api/admin/content", headers=auth_headers, timeout=20)
    assert r.status_code == 200, f"content failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    for k in ("hero_taglines", "about_copy", "faq", "cancellation_policy_text"):
        assert k in data, f"missing key: {k}"


def test_admin_zelle_mark_paid_404(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/admin/payments/zelle-mark-paid",
        headers=auth_headers,
        json={"booking_id": "FAKEID12"},
        timeout=20,
    )
    assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:300]}"


def test_admin_content_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/content", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


def test_about_page_serves():
    r = requests.get(f"{BASE_URL}/about", timeout=15)
    assert r.status_code == 200


def test_home_serves():
    r = requests.get(f"{BASE_URL}/", timeout=15)
    assert r.status_code == 200


def test_pay_page_serves():
    r = requests.get(f"{BASE_URL}/pay", timeout=15)
    assert r.status_code == 200
