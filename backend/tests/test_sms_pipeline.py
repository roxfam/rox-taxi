"""Live SMS/Twilio pipeline verification for Rox Taxi.

Verifies:
1) Direct Twilio API delivery to +12428039170 (verified caller ID on trial).
2) Booking flow (Zelle path) triggers notify_booking_confirmed which sends SMS.
3) SMS body contains booking id, item_name, and booking_date.
4) SMTP email path fires without exception.
5) Booking with empty customer_phone does NOT raise an exception (SMS is no-op).
"""
import os
import time
import datetime as dt
from pathlib import Path

import pytest
import requests
from requests.auth import HTTPBasicAuth

# Load backend .env explicitly (pytest runs in isolation from supervisor env).
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # Fallback: read from frontend .env
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL"):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

TEST_PHONE = "+12428039170"
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM = os.environ.get("TWILIO_FROM_NUMBER", "").strip()


def _twilio_api(path: str, method="GET", data=None):
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}{path}"
    return requests.request(method, url, auth=HTTPBasicAuth(TWILIO_SID, TWILIO_TOKEN), data=data, timeout=30)


def _wait_for_final_status(sid: str, timeout: int = 20) -> dict:
    """Poll Twilio for terminal message status."""
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        r = _twilio_api(f"/Messages/{sid}.json")
        assert r.status_code == 200, f"Twilio GET failed: {r.status_code} {r.text}"
        last = r.json()
        if last.get("status") in {"delivered", "failed", "undelivered", "sent"}:
            if last.get("status") in {"delivered", "failed", "undelivered"}:
                return last
        time.sleep(2)
    return last


# ---------- Config sanity ----------

def test_twilio_env_loaded():
    assert TWILIO_SID.startswith("AC0738"), f"unexpected TWILIO_ACCOUNT_SID: {TWILIO_SID[:8]}..."
    assert TWILIO_TOKEN, "TWILIO_AUTH_TOKEN missing"
    assert TWILIO_FROM == "+12202228965", f"unexpected TWILIO_FROM_NUMBER: {TWILIO_FROM}"


# ---------- 1) Direct Twilio API delivery ----------

def test_direct_twilio_send_to_verified_number():
    body = f"Rox Taxi verify {int(time.time())} — direct API test"
    r = _twilio_api("/Messages.json", method="POST",
                    data={"From": TWILIO_FROM, "To": TEST_PHONE, "Body": body})
    assert r.status_code == 201, f"Twilio create returned {r.status_code}: {r.text}"
    j = r.json()
    assert not j.get("error_code"), f"Twilio error_code on create: {j.get('error_code')} {j.get('error_message')}"
    sid = j["sid"]
    print(f"Direct SMS SID={sid} initial_status={j.get('status')}")

    final = _wait_for_final_status(sid)
    print(f"Final status for {sid}: {final.get('status')} error_code={final.get('error_code')}")
    assert final.get("error_code") in (None, ""), f"Twilio error_code: {final.get('error_code')} / {final.get('error_message')}"
    assert final.get("status") in {"delivered", "sent", "queued"}, f"Unexpected status: {final.get('status')}"


# ---------- 2 & 3) Booking flow triggers SMS with proper body ----------

def _pick_non_saturday_date(days_ahead: int = 3) -> str:
    d = dt.date.today() + dt.timedelta(days=days_ahead)
    while d.weekday() == 5:  # 5 == Saturday (closed for taxi/rental)
        d += dt.timedelta(days=1)
    return d.isoformat()


def _list_recent_messages(to: str, limit: int = 5):
    r = _twilio_api(f"/Messages.json?To={requests.utils.quote(to)}&PageSize={limit}")
    assert r.status_code == 200, r.text
    return r.json().get("messages", [])


def test_booking_zelle_triggers_sms_with_body():
    assert BASE_URL, "REACT_APP_BACKEND_URL not set"

    # Snapshot latest message SID before creating booking
    before = _list_recent_messages(TEST_PHONE, limit=1)
    before_sid = before[0]["sid"] if before else None

    booking_date = _pick_non_saturday_date(3)
    payload = {
        "service_type": "taxi",
        "item_id": "TEST_ITEM_1",
        "item_name": "Airport Pickup TEST",
        "price": 45.0,
        "customer_name": "SMS Test Guest",
        "customer_email": "TEST_sms@example.com",
        "customer_phone": TEST_PHONE,
        "booking_date": booking_date,
        "pickup_location": "LPIA",
        "dropoff_location": "Cable Beach",
        "passengers": 2,
        "days": 1,
        "extra_luggage": 0,
        "payment_method": "zelle",
    }
    resp = requests.post(f"{BASE_URL}/api/bookings", json=payload, timeout=30)
    assert resp.status_code == 200, f"POST /api/bookings failed: {resp.status_code} {resp.text}"
    booking = resp.json()
    booking_id = booking["id"]
    print(f"Created booking {booking_id}")

    # Wait for backend to submit SMS via Twilio (it's synchronous, but new SID must appear).
    new_msg = None
    deadline = time.time() + 20
    while time.time() < deadline:
        msgs = _list_recent_messages(TEST_PHONE, limit=5)
        for m in msgs:
            if m["sid"] != before_sid and booking_id in (m.get("body") or ""):
                new_msg = m
                break
        if new_msg:
            break
        time.sleep(2)

    assert new_msg is not None, f"No new Twilio message for booking {booking_id} found within 20s"
    body = new_msg["body"]
    print(f"SMS SID={new_msg['sid']} body={body!r}")

    # Assert body contains id, item_name, booking_date
    assert booking_id in body, f"booking id missing from SMS body: {body}"
    assert "Airport Pickup TEST" in body, f"item_name missing from SMS body: {body}"
    assert booking_date in body, f"booking_date missing from SMS body: {body}"
    assert body.startswith("Rox Taxi: Booking "), f"unexpected template prefix: {body[:40]}"

    # Verify final delivery status
    final = _wait_for_final_status(new_msg["sid"])
    print(f"Booking SMS final status: {final.get('status')} error_code={final.get('error_code')}")
    assert final.get("error_code") in (None, ""), f"Twilio error_code: {final.get('error_code')} / {final.get('error_message')}"
    assert final.get("status") in {"delivered", "sent", "queued"}, f"Unexpected status: {final.get('status')}"


# ---------- 4) SMTP email fires without exception ----------

def test_smtp_email_send_no_exception():
    """Directly invoke send_email to confirm the SMTP path connects without raising."""
    import sys
    sys.path.insert(0, "/app/backend")
    from notifications import send_email  # type: ignore

    ok = send_email(
        to_email="TEST_smtp@example.com",
        subject="Rox Taxi SMTP pipeline test",
        html="<p>Test</p>",
        text="Test",
    )
    # Namecheap may reject to invalid recipient, but send_email must NOT raise; returns bool.
    print(f"send_email returned: {ok}")
    assert isinstance(ok, bool)


# ---------- 5) Empty customer_phone is safe ----------

def test_send_sms_empty_phone_noop():
    import sys
    sys.path.insert(0, "/app/backend")
    from notifications import send_sms  # type: ignore

    # Empty phone -> Twilio SDK raises internally, but send_sms must catch and return False
    result = send_sms("", "test")
    assert result is False, "send_sms with empty phone should return False (no-op / caught)"


def test_notify_booking_confirmed_empty_phone_no_exception():
    """The dispatcher must not propagate exceptions when phone is empty."""
    import sys
    sys.path.insert(0, "/app/backend")
    from notifications import notify_booking_confirmed  # type: ignore

    fake_booking = {
        "id": "TESTX001",
        "item_name": "TEST tour",
        "booking_date": "2026-02-01",
        "customer_name": "No Phone Guest",
        "customer_email": "TEST_nophone@example.com",
        "customer_phone": "",  # empty
        "total": 50.0,
    }
    # Should not raise
    notify_booking_confirmed(fake_booking)
