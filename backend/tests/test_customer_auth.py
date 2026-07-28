"""Backend tests for customer auth (email/password) + idle timeout + booking auto-link.

Uses localhost:8001 for direct backend access as suggested in the review request.
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


def _unique_email():
    return f"test.customer.{int(time.time()*1000)}.{uuid.uuid4().hex[:6]}@example.com"


class BearerSession(requests.Session):
    """Wraps a session — auto promotes any session_token cookie to Authorization header.
    Needed because backend sets Secure cookies which `requests` won't resend over http localhost."""
    def request(self, method, url, **kw):
        resp = super().request(method, url, **kw)
        tok = self.cookies.get("session_token")
        if tok:
            self.headers["Authorization"] = f"Bearer {tok}"
        return resp


@pytest.fixture
def s():
    sess = BearerSession()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Register ----------

def test_register_creates_user_and_sets_cookie(s):
    email = _unique_email()
    r = s.post(f"{API}/auth/register", json={"name": "Test User", "email": email, "password": "Test1234!"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "user" in data
    assert data["user"]["email"] == email
    assert data["user"].get("name") == "Test User"
    assert "password_hash" not in data["user"]
    # cookie set
    assert "session_token" in s.cookies.get_dict()


def test_register_duplicate_email_returns_400(s):
    email = _unique_email()
    r1 = s.post(f"{API}/auth/register", json={"name": "A", "email": email, "password": "Test1234!"})
    assert r1.status_code == 200
    s2 = requests.Session()
    r2 = s2.post(f"{API}/auth/register", json={"name": "B", "email": email, "password": "Test1234!"})
    assert r2.status_code == 400
    assert "exists" in r2.json().get("detail", "").lower()


def test_register_password_too_short_422(s):
    r = s.post(f"{API}/auth/register", json={"name": "X", "email": _unique_email(), "password": "abc"})
    assert r.status_code == 422


def test_register_missing_name_422(s):
    r = s.post(f"{API}/auth/register", json={"email": _unique_email(), "password": "abcdef"})
    assert r.status_code == 422


# ---------- Login ----------

def test_login_email_success_and_wrong_password(s):
    email = _unique_email()
    pw = "Test1234!"
    r = s.post(f"{API}/auth/register", json={"name": "Login Test", "email": email, "password": pw})
    assert r.status_code == 200

    s2 = requests.Session()
    r_ok = s2.post(f"{API}/auth/login-email", json={"email": email, "password": pw})
    assert r_ok.status_code == 200
    assert r_ok.json()["user"]["email"] == email
    assert "session_token" in s2.cookies.get_dict()

    s3 = requests.Session()
    r_bad = s3.post(f"{API}/auth/login-email", json={"email": email, "password": "wrongpass"})
    assert r_bad.status_code == 401
    assert r_bad.json().get("detail") == "Invalid email or password"


# ---------- /auth/me ----------

def test_me_requires_cookie(s):
    fresh = requests.Session()
    r = fresh.get(f"{API}/auth/me")
    assert r.status_code == 401
    assert r.json().get("detail") == "Not authenticated"


def test_me_returns_user_with_idle_timeout(s):
    email = _unique_email()
    s.post(f"{API}/auth/register", json={"name": "Me", "email": email, "password": "Test1234!"})
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == email
    assert data.get("idle_timeout_minutes") == 60
    assert "password_hash" not in data


# ---------- heartbeat ----------

def test_heartbeat_updates_last_activity(s):
    email = _unique_email()
    s.post(f"{API}/auth/register", json={"name": "HB", "email": email, "password": "Test1234!"})
    token = s.cookies.get("session_token")
    # backdate last activity
    from pymongo import MongoClient
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    old_ts = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    db.user_sessions.update_one({"session_token": token}, {"$set": {"last_activity_at": old_ts}})

    r = s.post(f"{API}/auth/heartbeat")
    assert r.status_code == 200
    assert r.json().get("idle_timeout_minutes") == 60

    sess = db.user_sessions.find_one({"session_token": token})
    assert sess["last_activity_at"] != old_ts
    mc.close()


# ---------- logout ----------

def test_logout_clears_cookie_and_session(s):
    email = _unique_email()
    s.post(f"{API}/auth/register", json={"name": "LO", "email": email, "password": "Test1234!"})
    token = s.cookies.get("session_token")
    r = s.post(f"{API}/auth/logout", cookies={"session_token": token})
    assert r.status_code == 200

    from pymongo import MongoClient
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    assert db.user_sessions.find_one({"session_token": token}) is None

    r2 = s.get(f"{API}/auth/me")
    # cookie should have been cleared server-side; use bearer to prove session gone
    s3 = requests.Session()
    s3.headers.update({"Authorization": f"Bearer {token}"})
    r3 = s3.get(f"{API}/auth/me")
    assert r3.status_code == 401
    mc.close()


# ---------- Idle timeout ----------

def test_idle_timeout_kills_session(s):
    email = _unique_email()
    s.post(f"{API}/auth/register", json={"name": "IT", "email": email, "password": "Test1234!"})
    token = s.cookies.get("session_token")

    from pymongo import MongoClient
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    old_ts = (datetime.now(timezone.utc) - timedelta(minutes=65)).isoformat()
    db.user_sessions.update_one({"session_token": token}, {"$set": {"last_activity_at": old_ts}})

    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401
    assert "idle" in r.json().get("detail", "").lower()

    assert db.user_sessions.find_one({"session_token": token}) is None

    # login_events should include auto_logout_idle
    events = list(db.login_events.find({"user_id": {"$exists": True}, "action": "auto_logout_idle"}))
    assert len(events) >= 1
    mc.close()


# ---------- login_events collection ----------

def test_login_events_recorded_for_login_and_logout(s):
    email = _unique_email()
    r = s.post(f"{API}/auth/register", json={"name": "Ev", "email": email, "password": "Test1234!"})
    user_id = r.json()["user"]["user_id"]
    token = s.cookies.get("session_token")
    s.post(f"{API}/auth/logout", cookies={"session_token": token})

    from pymongo import MongoClient
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    events = list(db.login_events.find({"user_id": user_id}))
    actions = {e["action"] for e in events}
    methods = {e.get("method") for e in events}
    assert "login" in actions
    assert "logout" in actions
    assert "email" in methods
    mc.close()


# ---------- Booking auto-link ----------

def test_my_bookings_auto_links_pre_signup_bookings(s):
    email = _unique_email()
    # Create a booking with the email BEFORE signup by inserting directly (no public POST endpoint w/o auth is available for arbitrary email)
    from pymongo import MongoClient
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    bid = f"bk_{uuid.uuid4().hex[:10]}"
    db.bookings.insert_one({
        "id": bid,
        "customer_email": email,
        "customer_name": "Pre Signup",
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    mc.close()

    # Now register with the same email
    r = s.post(f"{API}/auth/register", json={"name": "Pre", "email": email, "password": "Test1234!"})
    assert r.status_code == 200

    r2 = s.get(f"{API}/my/bookings")
    assert r2.status_code == 200
    ids = [b.get("id") for b in r2.json()]
    assert bid in ids


# ---------- Google-only account can add password ----------

def test_google_only_user_can_add_password(s):
    """A user that exists (from google login) with no password_hash should be able to register (adds a password)."""
    from pymongo import MongoClient
    mc = MongoClient(os.environ["MONGO_URL"])
    db = mc[os.environ["DB_NAME"]]
    email = _unique_email()
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    db.users.insert_one({
        "user_id": user_id, "email": email, "name": "Google User",
        "provider": "google", "created_at": datetime.now(timezone.utc).isoformat(),
    })
    mc.close()

    r = s.post(f"{API}/auth/register", json={"name": "Google User", "email": email, "password": "Test1234!"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email"] == email
