"""Regression tests for the admin cookie/CSRF auth refactor.

Verifies:
  * POST /auth/login sets httpOnly admin_session + readable admin_csrf cookies
  * GET admin endpoint works with cookie only (no Authorization header)
  * Mutating POST without X-CSRF-Token fails (403)
  * Mutating POST with the matching X-CSRF-Token succeeds
  * Legacy Bearer flow still works (migration safety net)
  * POST /auth/admin-logout clears both cookies
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "roxfam2509@gmail.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


def _login_session() -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    r.raise_for_status()
    return s


def test_login_sets_cookies_and_returns_csrf():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == ADMIN_EMAIL
    assert isinstance(data.get("csrf_token"), str) and len(data["csrf_token"]) >= 20
    assert isinstance(data.get("token"), str)  # backward-compat
    jar = {c.name: c for c in s.cookies}
    assert "admin_session" in jar
    assert "admin_csrf" in jar
    # admin_csrf must be readable by JS → not httpOnly. Requests' cookiejar
    # doesn't expose httpOnly directly, but we confirm cookie exists.
    assert jar["admin_csrf"].value == data["csrf_token"]


def test_get_with_cookie_only():
    s = _login_session()
    r = s.get(f"{API}/admin/stats", timeout=15)
    assert r.status_code == 200, r.text


def test_post_without_csrf_header_is_rejected():
    s = _login_session()
    # Strip any X-CSRF-Token that might be auto-added — plain requests.post
    # with the session cookie but no header should fail CSRF.
    r = s.post(f"{API}/admin/push/test", timeout=15)
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
    assert "CSRF" in r.text


def test_post_with_correct_csrf_header_succeeds():
    s = _login_session()
    csrf = s.cookies.get("admin_csrf")
    r = s.post(f"{API}/admin/push/test", headers={"X-CSRF-Token": csrf}, timeout=15)
    assert r.status_code == 200, r.text


def test_post_with_wrong_csrf_header_is_rejected():
    s = _login_session()
    r = s.post(f"{API}/admin/push/test", headers={"X-CSRF-Token": "not_the_real_token"}, timeout=15)
    assert r.status_code == 403, r.text


def test_legacy_bearer_still_works():
    # Fresh session, no cookies — pure Bearer flow (migration safety net).
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    r.raise_for_status()
    token = r.json()["token"]
    # No cookie jar, so the server falls back to Authorization header and
    # CSRF is skipped (attacker can't forge Authorization cross-origin).
    r2 = requests.post(f"{API}/admin/push/test", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r2.status_code == 200, r2.text


def test_logout_clears_cookies():
    s = _login_session()
    csrf = s.cookies.get("admin_csrf")
    r = s.post(f"{API}/auth/admin-logout", headers={"X-CSRF-Token": csrf}, timeout=15)
    assert r.status_code == 200
    # Response must include expired Set-Cookie for both.
    set_cookie_header = r.headers.get("set-cookie", "")
    assert "admin_session=" in set_cookie_header
    assert "admin_csrf=" in set_cookie_header
    assert "Max-Age=0" in set_cookie_header or "max-age=0" in set_cookie_header.lower()
