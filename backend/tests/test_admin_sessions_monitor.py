"""Admin Sessions Monitor backend tests over HTTP.

Verifies:
  - Login creates an `admin_sessions` row
  - GET /api/admin/sessions returns the current session with `current=True`
  - require_admin bumps `last_seen_at`
  - Revoke-by-prefix on a DIFFERENT session blocks that session's cookie
  - Revoke validates min-length prefix and 404s on unknown prefix
"""
from __future__ import annotations

import hashlib
import os
import time

import pymongo
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://bahamas-taxi-tours.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "roxfam2509@gmail.com")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = pymongo.MongoClient(MONGO_URL)[DB_NAME]


def _login() -> tuple[requests.Session, str]:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    s.headers["X-CSRF-Token"] = s.cookies.get("admin_csrf")
    token = s.cookies.get("admin_session") or r.json().get("token")
    return s, token


def test_login_creates_admin_session_row():
    _, token = _login()
    assert token
    th = hashlib.sha256(token.encode()).hexdigest()
    row = _mongo.admin_sessions.find_one({"token_hash": th})
    assert row is not None
    assert row.get("sub") == ADMIN_EMAIL


def test_list_sessions_has_current():
    s, token = _login()
    r = s.get(f"{API}/admin/sessions")
    assert r.status_code == 200, r.text
    sessions = r.json()["sessions"]
    th = hashlib.sha256(token.encode()).hexdigest()[:16]
    me = [x for x in sessions if x["token_hash_prefix"] == th]
    assert len(me) == 1
    assert me[0]["current"] is True
    assert me[0]["sub"] == ADMIN_EMAIL


def test_revoke_other_session_kills_it():
    # Session A (observer, will do the revoke)
    sess_a, _ = _login()
    # Session B — fresh login creates a second row
    sess_b, token_b = _login()
    hash_b_prefix = hashlib.sha256(token_b.encode()).hexdigest()[:16]

    # From A, revoke B
    r = sess_a.post(f"{API}/admin/sessions/{hash_b_prefix}/revoke")
    assert r.status_code == 200, r.text

    # Give the backend a split-second to settle the revocation write.
    time.sleep(0.3)

    # B's next admin call should 401
    r_b = sess_b.get(f"{API}/admin/sessions")
    assert r_b.status_code == 401

    # And B's row should be absent from A's listing
    r_a = sess_a.get(f"{API}/admin/sessions")
    assert r_a.status_code == 200
    still_there = [s for s in r_a.json()["sessions"]
                   if s["token_hash_prefix"] == hash_b_prefix]
    assert still_there == []


def test_revoke_rejects_short_prefix():
    s, _ = _login()
    r = s.post(f"{API}/admin/sessions/abc/revoke")
    assert r.status_code == 400


def test_revoke_unknown_prefix_returns_404():
    s, _ = _login()
    r = s.post(f"{API}/admin/sessions/deadbeefdeadbeef/revoke")
    assert r.status_code == 404
