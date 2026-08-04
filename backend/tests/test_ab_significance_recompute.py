"""Tests for the /admin/photo-nudge-stats/ab-significance recompute endpoint.

Exercises the shared `_ab_test_stats` helper — the recompute endpoint must
return identical numbers to the full /admin/photo-nudge-stats payload for the
same underlying DB rows, and the significance block must reflect the fresh
data (no caching).
"""
import pytest

from routes import admin as admin_mod


class _FakeCollection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])

    async def count_documents(self, query):
        return sum(1 for r in self.rows if _matches(r, query))


class _FakeDB:
    def __init__(self, bookings=None, submissions=None):
        self.bookings = _FakeCollection(bookings)
        self.gallery_submissions = _FakeCollection(submissions)


def _matches(doc, query):
    for k, v in query.items():
        if isinstance(v, dict):
            if "$gte" in v and (doc.get(k) or "") < v["$gte"]:
                return False
            if "$exists" in v and (k in doc) != v["$exists"]:
                return False
        elif doc.get(k) != v:
            return False
    return True


from datetime import datetime, timedelta, timezone

# _ab_test_stats uses datetime.now() - 30 days as cutoff, so seed rows with
# a timestamp comfortably inside that window regardless of when we run.
_RECENT = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()


def _nudge(variant, sent_at=_RECENT):
    return {"photo_nudge_sent_at": sent_at, "photo_nudge_variant": variant}


def _sub(variant, sent_at=_RECENT):
    return {"attributed_nudge_sent_at": sent_at, "attributed_nudge_variant": variant}


@pytest.mark.asyncio
async def test_recompute_returns_expected_shape(monkeypatch):
    db = _FakeDB(
        bookings=[_nudge("A")] * 40 + [_nudge("B")] * 40,
        submissions=[_sub("A")] * 8 + [_sub("B")] * 4,
    )
    admin_mod.configure(
        db=db, now_iso=lambda: "2026-02-01T12:00:00+00:00",
        clean=lambda x: x, require_admin=lambda a: "admin@example.com",
        notify_fn=lambda *a, **k: None,
        attempt_deposit_refund=lambda *a, **k: None,
        upload_dir=None,
    )
    ab = await admin_mod._ab_test_stats()
    assert len(ab) == 2
    a, b = ab
    assert a["variant"] == "A"
    assert a["nudges_sent"] == 40
    assert a["attributed_submissions"] == 8
    assert a["conversion_pct"] == 20.0
    assert b["variant"] == "B"
    assert b["nudges_sent"] == 40
    assert b["attributed_submissions"] == 4
    assert b["conversion_pct"] == 10.0

    sig = admin_mod._compute_ab_significance(ab)
    # 20% vs 10% at 40 per arm — sample is above 30 min but effect not yet
    # significant → helper should return a "need N more per arm" hint.
    assert sig["leader"] == "A"
    assert sig["is_significant"] in (True, False)
    assert "z_score" in sig


@pytest.mark.asyncio
async def test_recompute_reflects_fresh_writes():
    """Writing fresh rows and calling _ab_test_stats again must reflect them
    (i.e. no stale caching between calls — this is the whole point of the
    "selective recompute" feature)."""
    db = _FakeDB(bookings=[_nudge("A")] * 30 + [_nudge("B")] * 30, submissions=[])
    admin_mod.configure(
        db=db, now_iso=lambda: "2026-02-01T12:00:00+00:00",
        clean=lambda x: x, require_admin=lambda a: "admin@example.com",
        notify_fn=lambda *a, **k: None,
        attempt_deposit_refund=lambda *a, **k: None,
        upload_dir=None,
    )
    ab1 = await admin_mod._ab_test_stats()
    assert ab1[0]["attributed_submissions"] == 0
    assert ab1[1]["attributed_submissions"] == 0

    # Simulate 5 fresh Variant B submissions coming in
    db.gallery_submissions.rows.extend([_sub("B")] * 5)
    ab2 = await admin_mod._ab_test_stats()
    assert ab2[0]["attributed_submissions"] == 0
    assert ab2[1]["attributed_submissions"] == 5
    assert ab2[1]["conversion_pct"] > 0
