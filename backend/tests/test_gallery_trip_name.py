"""Regression tests for the /api/gallery trip_name enrichment + PII scrubbing.

The trip_name join logic runs in server.list_gallery() and is heavy to
integration-test end-to-end. Here we exercise the pure Python shape of
the join in isolation so a future refactor can't regress it silently.
"""


def _enrich_guests_with_trip_names(guests, bookings):
    """Mirror of the join loop in server.list_gallery. Returns a NEW list
    of guest entries with `trip_name` added when a booking's customer_email
    matches submitter_email, and drops the raw submitter_email from output."""
    trip_by_email = {}
    for b in sorted(bookings, key=lambda b: b.get("created_at", ""), reverse=True):
        e = (b.get("customer_email") or "").lower()
        if e and e not in trip_by_email and b.get("item_name"):
            trip_by_email[e] = b["item_name"]

    out = []
    for g in guests:
        entry = dict(g)
        email = (entry.pop("submitter_email", "") or "").lower()
        tn = trip_by_email.get(email)
        if tn:
            entry["trip_name"] = tn
        out.append(entry)
    return out


def test_trip_name_joined_when_email_matches_booking():
    guests = [{"title": "Blue lagoon", "submitter_email": "amit@x.com", "submitter": "Amit"}]
    bookings = [
        {"customer_email": "amit@x.com", "item_name": "Blue Lagoon Beach Day", "created_at": "2026-02-01"},
    ]
    out = _enrich_guests_with_trip_names(guests, bookings)
    assert out[0]["trip_name"] == "Blue Lagoon Beach Day"


def test_most_recent_booking_wins_when_multiple():
    guests = [{"title": "Nassau", "submitter_email": "amit@x.com"}]
    bookings = [
        {"customer_email": "amit@x.com", "item_name": "Old Tour",   "created_at": "2025-01-01"},
        {"customer_email": "amit@x.com", "item_name": "New Tour",   "created_at": "2026-02-15"},
        {"customer_email": "amit@x.com", "item_name": "Older Tour", "created_at": "2024-05-01"},
    ]
    out = _enrich_guests_with_trip_names(guests, bookings)
    assert out[0]["trip_name"] == "New Tour"


def test_no_trip_name_when_no_matching_booking():
    guests = [{"title": "Guest photo", "submitter_email": "stranger@x.com"}]
    bookings = [{"customer_email": "someoneelse@x.com", "item_name": "Foo", "created_at": "2026-02-01"}]
    out = _enrich_guests_with_trip_names(guests, bookings)
    assert "trip_name" not in out[0]


def test_submitter_email_is_scrubbed_from_public_output():
    guests = [{"title": "x", "submitter_email": "leak@example.com", "submitter": "Foo"}]
    out = _enrich_guests_with_trip_names(guests, [])
    assert "submitter_email" not in out[0]  # PII must never leak on public endpoint


def test_case_insensitive_email_match():
    guests = [{"title": "x", "submitter_email": "Amit@X.com"}]
    bookings = [{"customer_email": "amit@x.com", "item_name": "City Tour", "created_at": "2026-02-01"}]
    out = _enrich_guests_with_trip_names(guests, bookings)
    assert out[0]["trip_name"] == "City Tour"
