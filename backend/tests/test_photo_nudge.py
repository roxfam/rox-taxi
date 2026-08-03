"""Regression tests for the post-trip photo-share nudge added Feb 2026.

The nudge fires ~24-72h after the booking pickup date via the existing
reminder tick loop, is email-only, skips rentals + cancellations, and is
idempotent via `photo_nudge_sent_at`.
"""
from notifications import send_photo_share_nudge


def _b(**over):
    base = {
        "id": "TESTID",
        "customer_email": "guest@example.com",
        "customer_name": "Guest Name",
        "item_name": "Nassau City Tour",
        "booking_date": "2026-02-01",
    }
    base.update(over)
    return base


def test_photo_nudge_no_email_short_circuits():
    r = send_photo_share_nudge(_b(customer_email=""))
    assert r["kind"] == "photo_nudge"
    assert r["email"]["sent"] is False
    assert r["email"]["error"] == "No email address"


def test_photo_nudge_respects_admin_disable():
    r = send_photo_share_nudge(_b(), prefs={"notify_email_enabled": False})
    assert r["email"]["sent"] is False
    assert r["email"]["error"] == "Disabled by admin"
    assert r["email"]["enabled"] is False


def test_photo_nudge_calls_send_email_when_enabled(monkeypatch):
    calls = {}

    def fake_send_email(to, subject, html, text=None, category=None):
        calls["to"] = to
        calls["subject"] = subject
        calls["category"] = category
        calls["has_gallery_link"] = "roxtaxi.com/gallery" in html
        return {"sent": True, "provider": "sendgrid", "error": None}

    import notifications
    monkeypatch.setattr(notifications, "send_email", fake_send_email)
    r = send_photo_share_nudge(_b(customer_email="a@b.com", customer_name="Amit"))
    assert r["email"]["sent"] is True
    assert calls["to"] == "a@b.com"
    assert "photos" in calls["subject"].lower()
    assert calls["category"] == "confirmation"
    assert calls["has_gallery_link"] is True
