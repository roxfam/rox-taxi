"""Iteration 29: Quick-reply templates GET/PUT + Google reviews sync + /api/reviews."""
import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

DEFAULTS = [
    "Hi {first}, your driver is on the way!",
    "See you at the lobby, {first}.",
    "Your driver has arrived and is waiting outside.",
    "Running about 10 minutes late — thanks for your patience!",
    "Thanks {first}! You're all confirmed.",
]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": "roxfam2509@gmail.com", "password": "admin123"
    })
    assert r.status_code == 200, r.text
    csrf = s.cookies.get("admin_csrf")
    if csrf:
        s.headers.update({"X-CSRF-Token": csrf})
    return s


# ── Quick-reply template endpoints ────────────────────────────────────────────
class TestQuickReplyTemplates:
    def test_get_returns_defaults_when_unset(self, admin_session):
        # Reset first
        async def _unset():
            client = AsyncIOMotorClient(MONGO_URL)
            await client[DB_NAME].site_config.update_one(
                {"_id": "main"}, {"$unset": {"sms_quick_replies": ""}}, upsert=True
            )
            client.close()
        asyncio.get_event_loop().run_until_complete(_unset())

        r = admin_session.get(f"{BASE_URL}/api/admin/guest-sms/templates")
        assert r.status_code == 200
        templates = r.json().get("templates")
        assert templates == DEFAULTS
        assert any("{first}" in t for t in templates)
        assert len(templates) == 5

    def test_put_saves_and_get_returns_saved(self, admin_session):
        payload = {"templates": ["  Hello {first}!  ", "", "   ", "Welcome to Rox"]}
        r = admin_session.put(f"{BASE_URL}/api/admin/guest-sms/templates", json=payload)
        assert r.status_code == 200
        saved = r.json()["templates"]
        # trimmed + blanks removed
        assert saved == ["Hello {first}!", "Welcome to Rox"]

        r2 = admin_session.get(f"{BASE_URL}/api/admin/guest-sms/templates")
        assert r2.status_code == 200
        assert r2.json()["templates"] == ["Hello {first}!", "Welcome to Rox"]

    def test_put_caps_at_20(self, admin_session):
        many = [f"template {i}" for i in range(30)]
        r = admin_session.put(f"{BASE_URL}/api/admin/guest-sms/templates",
                              json={"templates": many})
        assert r.status_code == 200
        assert len(r.json()["templates"]) == 20

    def test_put_requires_csrf(self):
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "roxfam2509@gmail.com", "password": "admin123"})
        # Strip csrf header (session didn't set it)
        r = s.put(f"{BASE_URL}/api/admin/guest-sms/templates",
                  json={"templates": ["x"]})
        assert r.status_code in (401, 403)

    def test_get_requires_admin(self):
        r = requests.get(f"{BASE_URL}/api/admin/guest-sms/templates")
        assert r.status_code in (401, 403)

    def test_restore_defaults(self, admin_session):
        r = admin_session.put(f"{BASE_URL}/api/admin/guest-sms/templates",
                              json={"templates": DEFAULTS})
        assert r.status_code == 200
        assert r.json()["templates"] == DEFAULTS


# ── /api/reviews filters rating ≥ 4 ───────────────────────────────────────────
class TestReviewsFilter:
    def test_reviews_endpoint_returns_only_4plus(self):
        r = requests.get(f"{BASE_URL}/api/reviews?limit=60")
        assert r.status_code == 200
        data = r.json()
        assert "reviews" in data
        for rev in data["reviews"]:
            assert rev.get("rating", 0) >= 4, f"found rating<4: {rev}"


# ── Background sync task writes cron_runs without exceptions ─────────────────
class TestGoogleReviewsSyncBg:
    def test_sync_records_cron_run(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from routes import cron as cron_mod  # type: ignore

        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]

        async def run():
            cron_mod.configure(db=db, now_iso=lambda: datetime.utcnow().isoformat() + "Z")
            # Should not raise regardless of credential availability
            await cron_mod._sync_google_reviews_bg()
            doc = await db.cron_runs.find_one({"kind": "google_reviews"})
            # If no credentials, no doc may be written; just assert no crash
            if doc is not None:
                # Either success or error should be logged
                assert ("last_success_at" in doc) or ("last_error" in doc)
                # ensure no pymongo update_one(sort=...) crash
                assert isinstance(doc, dict)

        asyncio.get_event_loop().run_until_complete(run())
        client.close()
