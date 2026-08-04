"""Tests for the T-60 min airport pre-pickup reminder tick.

Focuses on the branching logic in `_run_airport_reminder_tick`:
  • Airport-bound + inside the 30-90 min window → reminded, DB stamped
  • Non-airport booking in same window → skipped
  • Airport-bound but outside the window → skipped
  • Airport-bound + already reminded (`airport_reminder_sent_at` set) → skipped
  • Cancelled / completed / no_show → skipped
  • Airport-bound with only `flight_number` (no "airport" in strings) → reminded
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

# Import the server module lazily so we can patch its db before functions
# access it. Note: the top-level `db` binding is set on module import via
# motor client — for our tests we patch the collection methods directly.


class _FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    def find(self, query):
        rows = [d for d in self.docs if _matches(d, query)]
        class _Cursor:
            def __aiter__(self_):
                self_._i = 0
                return self_
            async def __anext__(self_):
                if self_._i >= len(rows):
                    raise StopAsyncIteration
                r = rows[self_._i]; self_._i += 1
                return r
        return _Cursor()

    async def find_one(self, query):
        for d in self.docs:
            if _matches(d, query):
                return d
        return None

    async def update_one(self, query, update):
        for d in self.docs:
            if _matches(d, query):
                d.update((update.get("$set") or {}))
                return


def _matches(doc, query):
    for k, v in query.items():
        if isinstance(v, dict):
            if "$exists" in v and (k in doc) != v["$exists"]:
                return False
            if "$nin" in v and doc.get(k) in v["$nin"]:
                return False
            if "$ne" in v and doc.get(k) == v["$ne"]:
                return False
        elif doc.get(k) != v:
            return False
    return True


class _FakeDB:
    def __init__(self, bookings=None, cfg=None):
        self.bookings = _FakeCollection(bookings)
        self.site_config = _FakeCollection([{**{"_id": "main"}, **(cfg or {})}])


def _iso_from_now(minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def _b(**over):
    base = {
        "id": f"BID{uuid.uuid4().hex[:6]}".upper(),
        "status": "confirmed",
        "booking_date": _iso_from_now(60),
        "customer_name": "Test Guest",
        "customer_email": "guest@example.com",
        "customer_phone": "",
        "item_id": "airport-nassau",
        "item_name": "LPIA Airport → Downtown Nassau",
        "pickup_location": "Baha Mar",
        "dropoff_location": "LPIA Airport",
    }
    base.update(over)
    return base


@pytest.fixture
def patched_server(monkeypatch):
    import server as srv
    return srv


async def _run(server, db, bookings):
    monkeypatch_target = server
    original_db = monkeypatch_target.db
    monkeypatch_target.db = db
    try:
        with patch.object(server, "clean", side_effect=lambda x: x):
            with patch("notifications.send_airport_pre_pickup_reminder") as mock_send:
                mock_send.return_value = {
                    "kind": "airport_pre_pickup",
                    "email": {"sent": True, "provider": "smtp", "error": None, "enabled": True},
                    "sms":   {"sent": False, "provider": "none", "error": "No phone number", "enabled": True},
                }
                sent = await server._run_airport_reminder_tick()
                return sent, mock_send, db.bookings.docs
    finally:
        monkeypatch_target.db = original_db


@pytest.mark.asyncio
async def test_airport_bound_in_window_reminds(patched_server):
    b = _b(booking_date=_iso_from_now(55))
    db = _FakeDB(bookings=[b])
    sent, mock_send, docs = await _run(patched_server, db, [b])
    assert sent == 1
    mock_send.assert_called_once()
    assert docs[0].get("airport_reminder_sent_at") is not None


@pytest.mark.asyncio
async def test_non_airport_booking_skipped(patched_server):
    b = _b(item_id="tour-atlantis", item_name="Atlantis Beach Day",
           dropoff_location="Atlantis Paradise Island",
           pickup_location="Hilton Nassau", booking_date=_iso_from_now(55))
    db = _FakeDB(bookings=[b])
    sent, mock_send, docs = await _run(patched_server, db, [b])
    assert sent == 0
    mock_send.assert_not_called()
    assert "airport_reminder_sent_at" not in docs[0]


@pytest.mark.asyncio
async def test_outside_window_skipped(patched_server):
    too_early = _b(booking_date=_iso_from_now(120))
    too_late  = _b(booking_date=_iso_from_now(10), id="BID_LATE")
    db = _FakeDB(bookings=[too_early, too_late])
    sent, mock_send, _ = await _run(patched_server, db, [too_early, too_late])
    assert sent == 0
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_already_reminded_skipped(patched_server):
    b = _b(booking_date=_iso_from_now(55), airport_reminder_sent_at="2026-01-01T00:00:00+00:00")
    db = _FakeDB(bookings=[b])
    sent, mock_send, _ = await _run(patched_server, db, [b])
    assert sent == 0
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_cancelled_booking_skipped(patched_server):
    b = _b(booking_date=_iso_from_now(55), status="cancelled")
    db = _FakeDB(bookings=[b])
    sent, mock_send, _ = await _run(patched_server, db, [b])
    assert sent == 0
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_flight_number_qualifies_even_without_airport_string(patched_server):
    # Guest booked a "custom" airport transfer via free-text pickup — no
    # "airport" in the strings, but flight_number is present → reminded.
    b = _b(item_id="custom-transfer", item_name="Custom transfer",
           dropoff_location="Terminal 2 Departures",
           pickup_location="Rosewood Baha Mar",
           flight_number="AA1024",
           booking_date=_iso_from_now(55))
    db = _FakeDB(bookings=[b])
    sent, mock_send, docs = await _run(patched_server, db, [b])
    assert sent == 1
    assert docs[0].get("airport_reminder_sent_at") is not None
