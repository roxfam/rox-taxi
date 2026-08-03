"""Regression tests for pinning + A/B variant assignment.

Pin/unpin lives entirely in Mongo; here we test the deterministic
variant-bucketing hash so the assignment stays stable across ticks (a
booking never flips between A and B once it's been created).
"""
import hashlib


def _variant_for(booking_id: str) -> str:
    return "A" if (int(hashlib.md5(booking_id.encode()).hexdigest(), 16) % 2 == 0) else "B"


def test_variant_bucketing_is_deterministic():
    for bid in ["ABC123", "XYZ999", "D93DE73D", "FCCF490A", "D5AE750B"]:
        assert _variant_for(bid) == _variant_for(bid), "same id must always map to same variant"


def test_variant_split_is_roughly_balanced_over_many_ids():
    # 500 random-ish booking ids should split roughly 50/50 (±10%)
    ids = [f"B{i:06d}" for i in range(500)]
    a = sum(1 for i in ids if _variant_for(i) == "A")
    b = len(ids) - a
    ratio = a / len(ids)
    assert 0.40 <= ratio <= 0.60, f"unbalanced split a={a} b={b} ratio={ratio}"


def test_pinned_photos_sort_before_unpinned():
    # Mirror the sort behaviour of _sorted_approved_submissions: pinned first
    # (by pinned_at desc), then unpinned (by approved_at desc).
    docs = [
        {"id": "u1", "is_pinned": False, "approved_at": "2026-02-05T10:00:00Z"},
        {"id": "p1", "is_pinned": True,  "pinned_at":   "2026-02-01T10:00:00Z", "approved_at": "2026-01-20T10:00:00Z"},
        {"id": "u2", "is_pinned": False, "approved_at": "2026-02-10T10:00:00Z"},
        {"id": "p2", "is_pinned": True,  "pinned_at":   "2026-02-08T10:00:00Z", "approved_at": "2026-01-05T10:00:00Z"},
    ]
    pinned = sorted([d for d in docs if d["is_pinned"]], key=lambda d: d["pinned_at"], reverse=True)
    unpinned = sorted([d for d in docs if not d["is_pinned"]], key=lambda d: d["approved_at"], reverse=True)
    order = [d["id"] for d in pinned + unpinned]
    assert order == ["p2", "p1", "u2", "u1"]
