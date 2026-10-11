"""Iteration 26 — Payment Digest + Payment Retry + Owner SMS 'all_bookings'."""
import asyncio
import os
import sys
import uuid
from unittest.mock import patch, MagicMock

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASSWORD = "admin123"

sys.path.insert(0, "/app/backend")


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    csrf = s.cookies.get("admin_csrf")
    assert csrf
    s.headers.update({"X-CSRF-Token": csrf})
    return s


# ── Payment digest preview + auth ───────────────────────────────────────────
def test_digest_preview_requires_admin():
    r = requests.get(f"{API}/admin/payment-digest/preview", timeout=15)
    assert r.status_code in (401, 403)


def test_digest_send_now_requires_admin():
    r = requests.post(f"{API}/admin/payment-digest/send-now", timeout=15)
    assert r.status_code in (401, 403)


def test_digest_preview_shape(admin_session):
    r = admin_session.get(f"{API}/admin/payment-digest/preview", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["schedule"] == "Daily at 9:00 PM Nassau time"
    for k in ("paid", "failed", "refunded", "pending"):
        assert k in d["totals"]
        assert "count" in d["totals"][k] and "amount" in d["totals"][k]
    assert isinstance(d["recipients"], list)
    assert "last_run" in d


# ── Owner SMS recipients: 'all_bookings' kind ───────────────────────────────
def test_owner_sms_kinds_has_all_bookings(admin_session):
    r = admin_session.get(f"{API}/admin/owner-sms/recipients", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "all_bookings" in data["kinds"]
    # cache original roster for restore
    original = data["recipients"]
    pytest._original_sms_roster = original


def test_owner_sms_accepts_all_bookings_sub(admin_session):
    original = pytest._original_sms_roster
    if not original:
        pytest.skip("no roster to test against")
    first = dict(original[0])
    modified = [{"phone": first["phone"], "label": first.get("label", ""),
                 "subscriptions": ["all_bookings"],
                 "quiet_hours": bool(first.get("quiet_hours", True))}]
    for r in original[1:]:
        modified.append(dict(r))
    r = admin_session.put(f"{API}/admin/owner-sms/recipients",
                          json={"recipients": modified}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["recipients"][0]["subscriptions"] == ["all_bookings"]
    # restore
    rr = admin_session.put(f"{API}/admin/owner-sms/recipients",
                           json={"recipients": original}, timeout=15)
    assert rr.status_code == 200


# ── _matches_subscription logic (unit) ──────────────────────────────────────
def test_matches_subscription_all_bookings():
    from notifications import _matches_subscription
    rec = {"subscriptions": ["all_bookings"]}
    for kind in ("cable_beach_paid", "taxi_paid", "booking", "payment",
                 "payment_failed", "group_booking"):
        assert _matches_subscription(rec, kind), f"all_bookings should match {kind}"
    for kind in ("contact_form", "customer_signup"):
        assert not _matches_subscription(rec, kind), f"all_bookings should NOT match {kind}"


def test_matches_subscription_payment_digest():
    from notifications import _matches_subscription
    assert _matches_subscription({"subscriptions": ["payment"]}, "payment_digest")


# ── send_payment_retry idempotency + skip-if-paid ───────────────────────────
@pytest.mark.asyncio
async def test_send_payment_retry_idempotent_and_skips_paid():
    import secrets_store  # noqa: F401
    from motor.motor_asyncio import AsyncIOMotorClient
    from routes import payment_digest as pd
    from datetime import datetime, timezone

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    def _now_iso():
        return datetime.now(timezone.utc).isoformat()

    pd.configure(db=db, require_admin=None, now_iso=_now_iso)

    bid = f"TEST_RETRY_{uuid.uuid4().hex[:8].upper()}"
    booking = {
        "id": bid, "customer_name": "Test Guest",
        "customer_email": "test@example.com", "customer_phone": "+10000000000",
        "payment_status": "pending", "total": 42.0, "item_name": "Test",
        "service_type": "taxi", "booking_date": "2026-01-15",
        "created_at": _now_iso(),
    }
    await db.bookings.insert_one(booking)
    try:
        with patch("notifications.notify_payment_retry",
                   return_value={"email": {"sent": True}, "sms": {"sent": True}}) as m_notify, \
             patch("notifications.send_owner_sms",
                   return_value={"sent": True}):
            r1 = await pd.send_payment_retry(bid, reason="failed")
            assert r1.get("email", {}).get("sent") or r1.get("sms", {}).get("sent"), r1
            # 2nd call — already sent
            r2 = await pd.send_payment_retry(bid, reason="failed")
            assert r2 == {"sent": False, "error": "retry already sent"}
            assert m_notify.call_count == 1

        # paid booking → skip
        bid2 = f"TEST_RETRY_{uuid.uuid4().hex[:8].upper()}"
        booking2 = {k: v for k, v in booking.items() if k != "_id"}
        booking2["id"] = bid2
        booking2["payment_status"] = "paid"
        await db.bookings.insert_one(booking2)
        with patch("notifications.notify_payment_retry") as m2:
            r3 = await pd.send_payment_retry(bid2, reason="failed")
            assert r3 == {"sent": False, "error": "booking missing or already paid"}
            assert m2.call_count == 0
        await db.bookings.delete_one({"id": bid2})
    finally:
        await db.bookings.delete_one({"id": bid})
        client.close()


# ── _process_stripe_event dispatches to send_payment_retry ──────────────────
@pytest.mark.asyncio
async def test_process_stripe_event_fires_retry():
    from routes import payments as pay_mod

    calls = []

    async def fake_retry(booking_id, session_id=None, reason="failed"):
        calls.append({"bid": booking_id, "reason": reason, "sid": session_id})
        return {"sent": True}

    # Patch the import within payment_digest since payments imports lazily
    import routes.payment_digest as pd_mod
    with patch.object(pd_mod, "send_payment_retry", side_effect=fake_retry):
        for etype in ("checkout.session.expired",
                      "checkout.session.async_payment_failed",
                      "payment_intent.payment_failed"):
            event = {"type": etype,
                     "data": {"object": {"id": f"cs_test_{etype}",
                                          "metadata": {"booking_id": "ABC123"}}}}
            await pay_mod._process_stripe_event(event)
    kinds = [c["bid"] for c in calls]
    assert kinds.count("ABC123") >= 3, f"expected 3 retries, got: {calls}"
