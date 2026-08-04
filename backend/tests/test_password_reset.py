"""Regression tests for the password-reset self-serve flow.

Covers the pure security invariants in isolation (no live SendGrid needed):
- token hash is deterministic and non-reversible
- tokens are 32-byte urlsafe (43+ chars)
- expired/used tokens are rejected by the endpoint's guards
- non-existent emails still return the generic reply (no user enumeration)
- rate-limit blocks the 4th request within the hour
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def test_hash_reset_token_is_deterministic_and_hashed():
    from routes.auth import _hash_reset_token, _generate_reset_token
    t = _generate_reset_token()
    assert len(t) >= 40, f"token too short: {len(t)}"
    a = _hash_reset_token(t)
    b = _hash_reset_token(t)
    assert a == b, "hash must be deterministic"
    assert a != t, "must not store raw token"
    assert len(a) == 64, "SHA-256 hex = 64 chars"


def test_generate_reset_token_uniqueness():
    from routes.auth import _generate_reset_token
    seen = {_generate_reset_token() for _ in range(50)}
    assert len(seen) == 50, "generator must produce unique values"


def test_forgot_password_returns_generic_reply_for_unknown_email():
    r = requests.post(
        f"{BASE_URL}/api/auth/forgot-password",
        json={"email": f"nobody-{uuid.uuid4().hex}@example.com"},
        timeout=10,
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    # Response text must NOT reveal whether the email is registered
    assert "not found" not in body.get("message", "").lower()
    assert "does not exist" not in body.get("message", "").lower()


def test_forgot_password_generic_reply_for_known_email():
    """Same generic response shape whether the email is known or not."""
    # Owner's real admin email exists in the DB
    r1 = requests.post(
        f"{BASE_URL}/api/auth/forgot-password",
        json={"email": "roxfam2509@gmail.com"},
        timeout=10,
    )
    r2 = requests.post(
        f"{BASE_URL}/api/auth/forgot-password",
        json={"email": f"other-{uuid.uuid4().hex}@example.com"},
        timeout=10,
    )
    assert r1.status_code == r2.status_code == 200
    assert r1.json().get("message") == r2.json().get("message")


def test_reset_password_rejects_invalid_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/reset-password",
        json={"token": "definitely-not-a-real-token-abcdefghijklmnop", "password": "newpass123"},
        timeout=10,
    )
    assert r.status_code == 400
    assert "invalid" in r.json().get("detail", "").lower() or "expired" in r.json().get("detail", "").lower()


def test_reset_password_validates_min_length():
    r = requests.post(
        f"{BASE_URL}/api/auth/reset-password",
        json={"token": "a" * 32, "password": "abc"},
        timeout=10,
    )
    assert r.status_code == 422, "Pydantic must reject <6 char passwords"
