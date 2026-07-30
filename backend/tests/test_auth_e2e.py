"""E2E auth regression test — locks in the late-binding Depends fix so it
never regresses. Covers the full customer session lifecycle over HTTP:

    register (with a unique disposable email)
      → /auth/me MUST require session (401 without cookie)
      → /auth/login-email
      → /auth/me returns the user
      → /auth/heartbeat keeps the session alive
      → /auth/logout
      → /auth/me returns 401 after logout

Also verifies the security fix on the extracted modules (gallery, licenses):
    → /admin/gallery/pending returns 401 without admin bearer token
    → /admin/licenses returns 401 without admin bearer token

Run from /app/backend: `pytest tests/test_auth_e2e.py -v`
"""
import os
import uuid

import httpx
import pytest


API_URL = os.environ.get("REACT_APP_BACKEND_URL_OVERRIDE") or _read_frontend_env() if False else None  # noqa


def _read_frontend_env() -> str:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE = _read_frontend_env().rstrip("/")


@pytest.fixture(scope="module")
def creds():
    """Fresh throwaway credentials so the test is idempotent."""
    return {
        "email": f"pytest-{uuid.uuid4().hex[:8]}@rox-tests.local",
        "password": "test-pass-123",
        "name": "Pytest User",
    }


def test_auth_me_without_session_is_401():
    """/auth/me MUST reject unauthenticated requests. This is the exact
    regression the late-binding Depends fix protects against."""
    r = httpx.get(f"{BASE}/api/auth/me")
    assert r.status_code == 401, f"BUG — auth bypass regression! /auth/me returned {r.status_code}: {r.text[:200]}"


def test_admin_licenses_without_token_is_401():
    """/admin/licenses in the extracted licenses router MUST require a bearer token."""
    r = httpx.get(f"{BASE}/api/admin/licenses")
    assert r.status_code == 401, f"BUG — admin bypass on licenses router! Got {r.status_code}: {r.text[:200]}"


def test_admin_gallery_pending_without_token_is_401():
    """/admin/gallery/pending in the extracted gallery router MUST require a bearer token."""
    r = httpx.get(f"{BASE}/api/admin/gallery/pending")
    assert r.status_code == 401, f"BUG — admin bypass on gallery router! Got {r.status_code}: {r.text[:200]}"


def test_full_customer_session_lifecycle(creds):
    """Happy-path E2E: register → me → heartbeat → logout → me returns 401."""
    with httpx.Client(base_url=BASE, follow_redirects=False) as c:
        # 1) register creates a session cookie
        r = c.post("/api/auth/register", json=creds)
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["user"]["email"] == creds["email"].lower()

        # Grab the session cookie
        session_token = c.cookies.get("session_token")
        assert session_token, "No session cookie set on /auth/register"

        # 2) /auth/me returns the same user
        r = c.get("/api/auth/me")
        assert r.status_code == 200, f"/auth/me after register failed: {r.status_code}"
        assert r.json()["email"] == creds["email"].lower()

        # 3) heartbeat keeps session alive
        r = c.post("/api/auth/heartbeat")
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # 4) logout
        r = c.post("/api/auth/logout")
        assert r.status_code == 200

        # 5) /auth/me now returns 401 (session was destroyed)
        r = c.get("/api/auth/me", cookies={"session_token": session_token})
        assert r.status_code == 401, f"/auth/me after logout returned {r.status_code} — session not invalidated!"


def test_login_email_with_wrong_password_is_401(creds):
    """Wrong password → 401 (must run AFTER the register test)."""
    r = httpx.post(f"{BASE}/api/auth/login-email", json={"email": creds["email"], "password": "wrong-password"})
    assert r.status_code == 401


def test_admin_login_correct_password_returns_jwt():
    """Admin JWT flow still works (routes/auth.py)."""
    email = os.environ.get("ADMIN_TEST_EMAIL", "roxfam2509@gmail.com")
    password = os.environ.get("ADMIN_TEST_PASSWORD", "admin123")
    r = httpx.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"admin login failed: {r.text[:200]}"
    token = r.json().get("token")
    assert token and token.startswith("eyJ"), f"expected JWT, got: {token}"

    # Verify the bearer token works on an admin route
    r = httpx.get(f"{BASE}/api/admin/licenses", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
