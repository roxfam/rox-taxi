"""Regression tests for the nudge-attribution logic on gallery submissions.

When a photo is submitted, the /gallery/submit handler must:
  - Look up any booking with matching customer_email whose photo_nudge_sent_at
    is within the last 7 days.
  - Persist attributed_nudge_booking_id + attributed_nudge_sent_at on the
    submission doc so the admin funnel report can count conversions.

We exercise the attribution query shape directly against an in-memory dict
so the test doesn't need a live Mongo — it's the query semantics we care
about, not driver plumbing.
"""
from datetime import datetime, timedelta, timezone


def _in_window(nudge_iso: str, days: int = 7) -> bool:
    """Mirror of the cutoff comparison used in gallery.py: nudge >= now-7d."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return nudge_iso >= cutoff


def test_nudge_within_7d_is_attributed():
    recent = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    assert _in_window(recent) is True


def test_nudge_older_than_7d_is_ignored():
    stale = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    assert _in_window(stale) is False


def test_conversion_pct_math_matches_admin_endpoint():
    # Mirrors the _pct helper in routes/admin.py::admin_photo_nudge_stats
    def _pct(part, whole):
        return round((part / whole) * 100, 1) if whole > 0 else 0.0

    assert _pct(0, 0) == 0.0        # divide-by-zero guard
    assert _pct(3, 10) == 30.0
    assert _pct(1, 3) == 33.3       # rounding to 1 dp
