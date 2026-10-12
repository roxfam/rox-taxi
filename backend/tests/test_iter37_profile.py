"""Iteration 37 — PUT /api/my/profile tests.

Seeds TEST_ user + user_sessions row directly in Mongo, exercises the endpoint
over the public REACT_APP_BACKEND_URL, then cleans up.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient


def _read_env(path, key):
    try:
        for line in open(path):
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"')
    except FileNotFoundError:
        pass
    return None


BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = (os.environ.get("MONGO_URL")
             or _read_env("/app/backend/.env", "MONGO_URL") or "mongodb://localhost:27017")
DB_NAME = (os.environ.get("DB_NAME")
           or _read_env("/app/backend/.env", "DB_NAME") or "test_database")
assert BASE, "REACT_APP_BACKEND_URL not configured"


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def seeded_user(mongo):
    user_id = f"TEST_u_{uuid.uuid4().hex[:10]}"
    email = f"test_profile_{uuid.uuid4().hex[:6]}@example.com"
    token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    ts = _now_iso()
    mongo.users.insert_one({
        "user_id": user_id, "email": email, "name": "TEST Profile User",
        "auth_method": "email", "profile_completed": False,
        "created_at": ts, "updated_at": ts,
    })
    mongo.user_sessions.insert_one({
        "user_id": user_id, "session_token": token, "auth_method": "email",
        "user_agent": "pytest", "ip": "127.0.0.1",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "last_activity_at": ts, "created_at": ts,
    })
    yield {"user_id": user_id, "token": token, "email": email}
    mongo.users.delete_one({"user_id": user_id})
    mongo.user_sessions.delete_many({"user_id": user_id})


# ── Tests ────────────────────────────────────────────────────────────

def test_put_profile_401_without_session():
    r = requests.put(f"{BASE}/api/my/profile", json={
        "phone": "+1 242 555 0100", "address": "1 Bay St", "city": "Nassau", "country": "The Bahamas"
    })
    assert r.status_code == 401, r.text


def test_put_profile_422_missing_fields(seeded_user):
    cookies = {"session_token": seeded_user["token"]}
    r = requests.put(f"{BASE}/api/my/profile", json={"phone": "+1 242 555 0100"}, cookies=cookies)
    assert r.status_code == 422, r.text


def test_put_profile_200_saves_and_returns(seeded_user):
    cookies = {"session_token": seeded_user["token"]}
    payload = {
        "phone": "+1 242 555 0199", "address": "99 Bay St", "city": "Nassau",
        "country": "The Bahamas", "hotel": "Baha Mar", "travel_from": "2026-03-01",
        "travel_to": "2026-03-07", "heard_from": "Google search", "marketing_opt_in": True,
    }
    r = requests.put(f"{BASE}/api/my/profile", json=payload, cookies=cookies)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("profile_completed") is True
    assert body.get("phone") == payload["phone"]
    prof = body.get("profile") or {}
    assert prof.get("address") == "99 Bay St"
    assert prof.get("city") == "Nassau"
    assert prof.get("country") == "The Bahamas"
    assert prof.get("hotel") == "Baha Mar"
    assert prof.get("marketing_opt_in") is True


def test_auth_me_returns_profile(seeded_user):
    cookies = {"session_token": seeded_user["token"]}
    r = requests.get(f"{BASE}/api/auth/me", cookies=cookies)
    assert r.status_code == 200, r.text
    body = r.json()
    user = body.get("user") or body
    assert user.get("profile_completed") is True
    assert (user.get("profile") or {}).get("city") == "Nassau"
    assert user.get("phone") == "+1 242 555 0199"
