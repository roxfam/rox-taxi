"""Regression tests for the suspicious-login email alert.

Covers three cases:
  1. First-ever login → no alert (nothing to compare against)
  2. Second login from same city + same device → no alert
  3. Second login from a brand-new city → alert fires + login_events stamped
  4. Second login from a brand-new device (same city) → alert fires
"""
import asyncio
import uuid
from unittest.mock import patch

import pytest

# The auth module is imported for its internal helpers. We inject a fake db
# via configure() so we don't hit the real Mongo instance.
from routes import auth as auth_mod


class _FakeCollection:
    def __init__(self, initial=None):
        self.docs = list(initial or [])

    async def find_one(self, query, sort=None):
        rows = [d for d in self.docs if _matches(d, query)]
        if sort:
            key, direction = sort[0]
            rows.sort(key=lambda r: r.get(key) or "", reverse=(direction == -1))
        return rows[0] if rows else None

    async def insert_one(self, doc):
        doc = dict(doc)
        doc.setdefault("_id", uuid.uuid4().hex)
        self.docs.append(doc)

        class _R:
            inserted_id = doc["_id"]
        return _R()

    async def update_one(self, query, update):
        for d in self.docs:
            if _matches(d, query):
                d.update((update.get("$set") or {}))
                return


class _FakeDB:
    def __init__(self):
        self.login_events = _FakeCollection()
        self.users = _FakeCollection()
        self.visitor_geo_cache = _FakeCollection()


def _matches(doc, query):
    for k, v in query.items():
        if k == "_id":
            # Handle both simple and $ne compare
            if isinstance(v, dict) and "$ne" in v:
                if doc.get("_id") == v["$ne"]:
                    return False
            elif doc.get("_id") != v:
                return False
        elif isinstance(v, dict) and "$ne" in v:
            if doc.get(k) == v["$ne"]:
                return False
        elif doc.get(k) != v:
            return False
    return True


@pytest.fixture
def fake_db():
    db = _FakeDB()
    auth_mod.configure(db=db, now_iso=lambda: "2026-02-01T12:00:00+00:00")
    return db


def _seed_prior_login(db, *, ip, ua, city, country):
    """Add a completed prior login_event + geo cache entry."""
    prior_id = uuid.uuid4().hex
    db.login_events.docs.append({
        "_id": prior_id,
        "user_id": "user_alice",
        "action": "login",
        "method": "email",
        "at": "2026-01-31T10:00:00+00:00",
        "ip": ip,
        "user_agent": ua,
    })
    db.visitor_geo_cache.docs.append({
        "_id": ip,
        "geo": {"city": city, "region": "", "country": country},
    })
    db.users.docs.append({
        "user_id": "user_alice",
        "email": "alice@example.com",
        "name": "Alice",
    })


@pytest.mark.asyncio
async def test_first_ever_login_does_not_alert(fake_db):
    """No prior login events → no alert email."""
    with patch("notifications.send_suspicious_login_alert") as mock_send:
        await auth_mod._maybe_send_suspicious_login_alert(
            user_id="user_alice", method="email", ip="1.2.3.4",
            ua="Mozilla/5.0 (Windows) Chrome/120", when_iso="2026-02-01T12:00:00+00:00",
            event_id="new_evt_1",
        )
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_same_city_same_device_stays_quiet(fake_db):
    _seed_prior_login(fake_db, ip="1.2.3.4",
                      ua="Mozilla/5.0 (Windows NT 10.0) Chrome/120",
                      city="Nassau", country="Bahamas")
    # New event from same IP → same city, same UA family → NO alert
    fake_db.login_events.docs.append({
        "_id": "new_evt", "user_id": "user_alice", "action": "login",
        "method": "email", "at": "2026-02-01T12:00:00+00:00",
        "ip": "1.2.3.4", "user_agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/121",
    })
    with patch("notifications.send_suspicious_login_alert") as mock_send:
        await auth_mod._maybe_send_suspicious_login_alert(
            user_id="user_alice", method="email", ip="1.2.3.4",
            ua="Mozilla/5.0 (Windows NT 10.0) Chrome/121",
            when_iso="2026-02-01T12:00:00+00:00", event_id="new_evt",
        )
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_new_city_fires_alert(fake_db):
    _seed_prior_login(fake_db, ip="1.2.3.4",
                      ua="Mozilla/5.0 (Windows NT 10.0) Chrome/120",
                      city="Nassau", country="Bahamas")
    # New login from a different IP mapping to a different city
    fake_db.visitor_geo_cache.docs.append({
        "_id": "9.9.9.9",
        "geo": {"city": "Miami", "region": "FL", "country": "United States"},
    })
    fake_db.login_events.docs.append({
        "_id": "new_evt", "user_id": "user_alice", "action": "login",
        "method": "email", "at": "2026-02-01T12:00:00+00:00",
        "ip": "9.9.9.9", "user_agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
    })
    with patch("notifications.send_suspicious_login_alert") as mock_send:
        mock_send.return_value = {"sent": True, "provider": "smtp", "error": None}
        await auth_mod._maybe_send_suspicious_login_alert(
            user_id="user_alice", method="email", ip="9.9.9.9",
            ua="Mozilla/5.0 (Windows NT 10.0) Chrome/120",
            when_iso="2026-02-01T12:00:00+00:00", event_id="new_evt",
        )
    mock_send.assert_called_once()
    kwargs = mock_send.call_args.kwargs
    assert kwargs["to_email"] == "alice@example.com"
    assert kwargs["city"] == "Miami"
    assert "United States" in kwargs["country"]
    # The event doc should now be stamped so we don't re-alert
    stamped = [d for d in fake_db.login_events.docs if d["_id"] == "new_evt"][0]
    assert stamped.get("suspicious_alert_sent") is True
    assert stamped.get("suspicious_alert_reason") == "new_city"


@pytest.mark.asyncio
async def test_new_device_same_city_fires_alert(fake_db):
    _seed_prior_login(fake_db, ip="1.2.3.4",
                      ua="Mozilla/5.0 (Windows NT 10.0) Chrome/120",
                      city="Nassau", country="Bahamas")
    # Same IP (same city), but new UA (iPhone Safari)
    fake_db.login_events.docs.append({
        "_id": "new_evt", "user_id": "user_alice", "action": "login",
        "method": "email", "at": "2026-02-01T12:00:00+00:00",
        "ip": "1.2.3.4",
        "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2) Safari/17.2",
    })
    with patch("notifications.send_suspicious_login_alert") as mock_send:
        mock_send.return_value = {"sent": True, "provider": "smtp", "error": None}
        await auth_mod._maybe_send_suspicious_login_alert(
            user_id="user_alice", method="email", ip="1.2.3.4",
            ua="Mozilla/5.0 (iPhone; CPU iPhone OS 17_2) Safari/17.2",
            when_iso="2026-02-01T12:00:00+00:00", event_id="new_evt",
        )
    mock_send.assert_called_once()
    stamped = [d for d in fake_db.login_events.docs if d["_id"] == "new_evt"][0]
    assert stamped.get("suspicious_alert_reason") == "new_device"


@pytest.mark.asyncio
async def test_missing_prior_ua_and_ip_stays_quiet(fake_db):
    """Legacy login_events pre-date the ip/ua columns → don't alarm on the
    first post-upgrade login (would be a one-time false positive)."""
    fake_db.login_events.docs.append({
        "_id": "old_evt", "user_id": "user_alice", "action": "login",
        "method": "email", "at": "2026-01-01T10:00:00+00:00",
        # No ip or user_agent — legacy row
    })
    fake_db.users.docs.append({
        "user_id": "user_alice", "email": "alice@example.com", "name": "Alice",
    })
    fake_db.login_events.docs.append({
        "_id": "new_evt", "user_id": "user_alice", "action": "login",
        "method": "email", "at": "2026-02-01T12:00:00+00:00",
        "ip": "9.9.9.9", "user_agent": "Mozilla/5.0 (Windows) Chrome/120",
    })
    with patch("notifications.send_suspicious_login_alert") as mock_send:
        await auth_mod._maybe_send_suspicious_login_alert(
            user_id="user_alice", method="email", ip="9.9.9.9",
            ua="Mozilla/5.0 (Windows) Chrome/120",
            when_iso="2026-02-01T12:00:00+00:00", event_id="new_evt",
        )
    mock_send.assert_not_called()
