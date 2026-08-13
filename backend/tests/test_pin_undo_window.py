"""Regression tests for the 30-second pin-undo window.

Contract:
  1. Pinning schedules side effects (email + FB post) instead of running
     them inline. Response reflects `side_effects_scheduled: True`.
  2. If admin unpins within the window, the deferred worker re-checks
     `is_pinned` and skips both side effects.
  3. If the window elapses without an unpin, the worker fires the email
     and FB post (idempotent via `featured_*_at` flags).

We test the worker in isolation against an in-memory dict so we don't need
a Mongo instance or actual SendGrid/FB creds.
"""
import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch

import pytest

# Test harness runs from /app so the backend/ package layout imports as
# `backend.routes.gallery`. Add /app/backend to sys.path so plain
# `from routes import gallery` also resolves (mirrors how server.py runs).
_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)


class FakeDB:
    """Minimal duck-type for the two collection ops the worker uses."""
    def __init__(self, doc):
        self.doc = doc
        self.updates = []

    async def find_one(self, _query):
        return dict(self.doc) if self.doc else None

    async def update_one(self, _query, update):
        self.updates.append(update)
        self.doc.update(update.get("$set", {}))


@pytest.fixture
def base_doc():
    return {
        "id": "SUB1",
        "status": "approved",
        "is_pinned": True,
        "url": "/uploads/guest_x.jpg",
        "submitter_name": "Amit",
        "submitter_email": "amit@x.com",
        "caption": "sunset",
    }


@pytest.mark.asyncio
async def test_worker_skips_when_photo_gets_unpinned_during_window(base_doc):
    """The whole point of the undo toast: the deferred worker must NOT
    fire either side effect if the admin unpinned inside the window."""
    fake_db = FakeDB(dict(base_doc, is_pinned=False))  # unpinned before we peek

    from routes import gallery as g
    with patch.object(g, "_db") as mock_db_module:
        mock_db_module.gallery_submissions = fake_db
        with patch("notifications.send_featured_notification") as email, \
             patch("facebook.post_pinned_photo_to_facebook", new_callable=AsyncMock) as fb:
            # delay=0 so the test doesn't wait 30s
            await g._fire_pin_side_effects_after_delay("SUB1", delay_seconds=0)

    email.assert_not_called()
    fb.assert_not_called()
    assert fake_db.updates == []


@pytest.mark.asyncio
async def test_worker_fires_email_and_fb_when_still_pinned(base_doc):
    fake_db = FakeDB(dict(base_doc))

    from routes import gallery as g
    with patch.object(g, "_db") as mock_db_module:
        mock_db_module.gallery_submissions = fake_db
        with patch("notifications.send_featured_notification", return_value={"sent": True, "provider": "sendgrid"}) as email, \
             patch("facebook.post_pinned_photo_to_facebook", new_callable=AsyncMock,
                   return_value={"ok": True, "post_id": "fb123", "error": None}) as fb:
            await g._fire_pin_side_effects_after_delay("SUB1", delay_seconds=0)

    email.assert_called_once()
    fb.assert_called_once()
    # Both flag columns must have been written so the worker is idempotent
    flags_written = " ".join(str(u) for u in fake_db.updates)
    assert "featured_notified_at" in flags_written
    assert "featured_fb_posted_at" in flags_written


@pytest.mark.asyncio
async def test_worker_skips_email_when_no_submitter_email(base_doc):
    fake_db = FakeDB(dict(base_doc, submitter_email=""))

    from routes import gallery as g
    with patch.object(g, "_db") as mock_db_module:
        mock_db_module.gallery_submissions = fake_db
        with patch("notifications.send_featured_notification") as email, \
             patch("facebook.post_pinned_photo_to_facebook", new_callable=AsyncMock,
                   return_value={"ok": True, "post_id": "fb123", "error": None}) as fb:
            await g._fire_pin_side_effects_after_delay("SUB1", delay_seconds=0)

    email.assert_not_called()  # no email address → skip
    fb.assert_called_once()    # FB post doesn't need an email
