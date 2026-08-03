"""Regression tests for A/B statistical-significance math + featured-photo email."""
from routes.admin import _compute_ab_significance
from notifications import send_featured_notification


def _row(v, n, x):
    return {"variant": v, "label": "x", "nudges_sent": n, "attributed_submissions": x, "conversion_pct": (x / n * 100 if n else 0)}


# ── A/B significance ──────────────────────────────────────────────────

def test_below_min_sample_reports_needed_count():
    res = _compute_ab_significance([_row("A", 10, 2), _row("B", 5, 1)])
    assert res["is_significant"] is False
    assert res["needed_per_arm"] == 25  # 30 - 5
    assert "more nudges" in res["message"].lower()


def test_clear_winner_is_significant():
    # Massive gap: 40% vs 5% on 200 per arm — should trivially clear 95%
    res = _compute_ab_significance([_row("A", 200, 80), _row("B", 200, 10)])
    assert res["is_significant"] is True
    assert res["leader"] == "A"
    assert res["needed_per_arm"] == 0
    assert res["confidence"] == 0.95


def test_close_call_not_significant_but_estimates_needed():
    # 22% vs 20% on 200 — real diff but not sig with this n
    res = _compute_ab_significance([_row("A", 200, 44), _row("B", 200, 40)])
    assert res["is_significant"] is False
    assert res["needed_per_arm"] > 0
    assert "per arm" in res["message"].lower()


def test_identical_arms_returns_no_meaningful_diff():
    res = _compute_ab_significance([_row("A", 100, 20), _row("B", 100, 20)])
    assert res["is_significant"] is False
    assert res["needed_per_arm"] is None
    assert "identically" in res["message"].lower()


def test_missing_arm_returns_waiting_message():
    res = _compute_ab_significance([_row("A", 100, 20)])
    assert res["is_significant"] is False
    assert "both variants" in res["message"].lower()


# ── Featured notification email ───────────────────────────────────────

def test_featured_notification_short_circuits_without_email():
    r = send_featured_notification({"id": "S1", "submitter_email": "", "submitter_name": "Amit"})
    assert r["sent"] is False
    assert r["error"] == "No submitter email"


def test_featured_notification_calls_send_email(monkeypatch):
    captured = {}

    def fake_send(to, subject, html, text=None, category=None):
        captured["to"] = to
        captured["subject"] = subject
        captured["has_groups_link"] = "cruise-groups-nassau" in html
        captured["has_discount"] = "10% welcome-back" in html or "10% welcome-back" in (text or "")
        return {"sent": True, "provider": "sendgrid", "error": None}

    import notifications
    monkeypatch.setattr(notifications, "send_email", fake_send)
    r = send_featured_notification({
        "id": "S2",
        "submitter_email": "a@b.com",
        "submitter_name": "Amit Smith",
        "caption": "amazing tour",
    })
    assert r["sent"] is True
    assert captured["to"] == "a@b.com"
    assert "featured" in captured["subject"].lower()
    assert captured["has_groups_link"] is True
    assert captured["has_discount"] is True
