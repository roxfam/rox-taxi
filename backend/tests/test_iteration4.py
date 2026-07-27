"""Iteration 4 backend tests: rental $150 deposit, PayPal live config, admin deposit release/forfeit,
site-config/logo, auth, Saturday blackout, cancel policy, SMS/SMTP no-throw.

Runs against REACT_APP_BACKEND_URL. Requires admin@roxtaxi.com / admin123 (seeded).
"""
import os
import re
import requests
import pytest
import asyncio
from pathlib import Path


def _load_url():
    env = Path("/app/frontend/.env")
    for line in env.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", _load_url()).rstrip("/")
API = f"{BASE_URL}/api"

SUNDAY = "2026-03-01T10:00:00Z"  # weekday=6 open
SATURDAY = "2026-03-07T10:00:00Z"  # weekday=5 closed
FAR_FUTURE = "2027-06-15T10:00:00Z"  # Tuesday, well beyond 48h


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"email": "admin@roxtaxi.com", "password": "admin123"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    assert tok, d
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- Auth ----------------
def test_admin_login_wrong_password(s):
    r = s.post(f"{API}/auth/login", json={"email": "admin@roxtaxi.com", "password": "WRONG"}, timeout=15)
    assert r.status_code == 401, r.text


def test_admin_login_success_returns_jwt(admin_token):
    # JWT has 3 dot-separated segments
    assert admin_token.count(".") == 2, f"not a JWT: {admin_token[:40]}..."


# ---------------- Rental deposit ($150) ----------------
def _rental_payload(days: int, name_suffix: str):
    return {
        "service_type": "rental",
        "item_id": "chevy-trax",
        "item_name": "Chevy Trax",
        "price": 79.0,
        "customer_name": f"TEST_Deposit_{name_suffix}",
        "customer_email": "test_dep@example.com",
        "customer_phone": "+12420000010",
        "booking_date": SUNDAY,
        "pickup_location": "LPIA",
        "dropoff_location": "Cable Beach",
        "passengers": 2,
        "extra_luggage": 0,
        "days": days,
        "payment_method": "zelle",
    }


def test_rental_1day_deposit_150(s):
    r = s.post(f"{API}/bookings", json=_rental_payload(1, "1d"), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("deposit_amount") == 150, d
    assert d.get("deposit_status") == "held", d
    # total = 79*1 + 150 = 229
    assert float(d["total"]) == pytest.approx(229.0), d


def test_rental_3day_deposit_once_150(s):
    r = s.post(f"{API}/bookings", json=_rental_payload(3, "3d"), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("deposit_amount") == 150, f"deposit should be flat $150, not per-day: {d}"
    # total = 79*3 + 150 = 387
    assert float(d["total"]) == pytest.approx(387.0), d


# ---------------- Taxi = no deposit ----------------
def _taxi_payload(pax: int, name_suffix: str):
    return {
        "service_type": "taxi",
        "item_id": "airport-nassau",
        "item_name": "LPIA → Nassau",
        "price": 35.0,
        "customer_name": f"TEST_TaxiNoDep_{name_suffix}",
        "customer_email": "test_tax@example.com",
        "customer_phone": "+12420000011",
        "booking_date": SUNDAY,
        "pickup_location": "LPIA",
        "dropoff_location": "Nassau",
        "passengers": pax,
        "extra_luggage": 0,
        "payment_method": "zelle",
    }


@pytest.mark.parametrize("pax,expected_total", [(1, 35.0), (4, 35.0 + 2 * 5.0)])
def test_taxi_no_deposit(s, pax, expected_total):
    r = s.post(f"{API}/bookings", json=_taxi_payload(pax, f"p{pax}"), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert not d.get("deposit_amount"), f"taxi should have no deposit: {d}"
    assert d.get("deposit_status") in (None, ""), d
    assert float(d["total"]) == pytest.approx(expected_total), d


# ---------------- /api/fees ----------------
def test_fees_rental_deposit(s):
    r = s.get(f"{API}/fees", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("rental_deposit_usd") == 150, d
    policy = str(d.get("rental_deposit_policy", "")).lower()
    assert "$150" in policy or "150" in policy, policy
    assert "refundable" in policy or "deposit" in policy, policy


# ---------------- /api/admin/stats deposit fields ----------------
def test_admin_stats_requires_auth(s):
    r = s.get(f"{API}/admin/stats", timeout=15)
    assert r.status_code in (401, 403), r.text


def test_admin_stats_has_deposit_fields(s, admin_headers):
    r = s.get(f"{API}/admin/stats", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    for f in ["total", "paid", "pending", "active", "revenue",
              "deposits_held", "deposits_released", "deposits_forfeited", "deposits_held_amount"]:
        assert f in d, f"missing field {f}: {d}"


# ---------------- PATCH admin/bookings/{id}/deposit ----------------
def _create_paid_rental(s, name_suffix: str):
    """Create rental booking and mark payment_status='paid' via direct mongo update."""
    r = s.post(f"{API}/bookings", json=_rental_payload(1, name_suffix), timeout=20)
    assert r.status_code == 200, r.text
    bid = r.json()["id"]

    # Mark paid via mongosh (deposit refund path requires payment_status='paid')
    import subprocess
    cmd = f'mongosh test_database --quiet --eval \'db.bookings.updateOne({{id: "{bid}"}}, {{$set: {{payment_status: "paid", payment_method: "zelle"}}}})\''
    subprocess.run(["bash", "-lc", cmd], check=True, timeout=15, capture_output=True)
    return bid


def test_deposit_patch_requires_admin(s):
    bid = _create_paid_rental(s, "auth")
    r = s.patch(f"{API}/admin/bookings/{bid}/deposit", json={"status": "released"}, timeout=15)
    assert r.status_code in (401, 403), r.text


def test_deposit_patch_rejects_invalid_status(s, admin_headers):
    bid = _create_paid_rental(s, "invalid")
    r = s.patch(f"{API}/admin/bookings/{bid}/deposit",
                headers=admin_headers, json={"status": "bogus"}, timeout=15)
    assert r.status_code == 422, r.text


def test_deposit_patch_requires_deposit_amount(s, admin_headers):
    # Create a taxi booking (no deposit_amount) and try to patch — expect 400
    r = s.post(f"{API}/bookings", json=_taxi_payload(2, "no-dep"), timeout=20)
    bid = r.json()["id"]
    r = s.patch(f"{API}/admin/bookings/{bid}/deposit",
                headers=admin_headers, json={"status": "released"}, timeout=15)
    assert r.status_code == 400, r.text


def test_deposit_release_zelle_manual_refund_failed(s, admin_headers):
    bid = _create_paid_rental(s, "zrelease")
    r = s.patch(
        f"{API}/admin/bookings/{bid}/deposit",
        headers=admin_headers,
        json={"status": "released", "reason": "Vehicle returned OK", "auto_refund": True},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("deposit_status") == "released", d
    assert d.get("deposit_refund_provider") == "zelle", d
    assert d.get("deposit_refund_status") == "failed", d
    err = str(d.get("deposit_refund_error", ""))
    assert "manual" in err.lower(), err


def test_deposit_forfeit_no_refund(s, admin_headers):
    bid = _create_paid_rental(s, "forfeit")
    r = s.patch(
        f"{API}/admin/bookings/{bid}/deposit",
        headers=admin_headers,
        json={"status": "forfeited", "reason": "Damage to bumper"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("deposit_status") == "forfeited", d
    assert d.get("deposit_forfeited_at"), d
    # Forfeit must not attempt refund
    assert d.get("deposit_refund_provider") in (None, ""), d
    assert d.get("deposit_refund_status") in (None, ""), d


def test_deposit_release_no_auto_refund(s, admin_headers):
    bid = _create_paid_rental(s, "no-auto")
    r = s.patch(
        f"{API}/admin/bookings/{bid}/deposit",
        headers=admin_headers,
        json={"status": "released", "reason": "OK", "auto_refund": False},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("deposit_status") == "released", d
    assert d.get("deposit_refund_provider") in (None, ""), d
    assert d.get("deposit_refund_status") in (None, ""), d


# ---------------- PayPal ----------------
def test_paypal_config_public(s):
    r = s.get(f"{API}/paypal/config", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("mode") == "live", d
    assert d.get("configured") is True, d
    assert d.get("client_id"), d
    # Secret must never leak
    keys = [k.lower() for k in d.keys()]
    assert not any("secret" in k for k in keys), d


def test_paypal_create_order_404_unknown_booking(s):
    r = s.post(f"{API}/paypal/create-order", json={"booking_id": "NOPE1234"}, timeout=15)
    assert r.status_code == 404, r.text


def test_paypal_create_order_409_when_paid(s):
    bid = _create_paid_rental(s, "paid")
    r = s.post(f"{API}/paypal/create-order", json={"booking_id": bid}, timeout=20)
    assert r.status_code == 409, r.text


def test_paypal_create_order_returns_order_id(s):
    # Create unpaid rental
    br = s.post(f"{API}/bookings", json=_rental_payload(1, "pp"), timeout=20)
    bid = br.json()["id"]
    r = s.post(f"{API}/paypal/create-order", json={"booking_id": bid}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("order_id"), d
    assert d.get("status") == "CREATED", d


def test_paypal_capture_order_404(s):
    r = s.post(f"{API}/paypal/capture-order/DEFINITELY-NOT-AN-ORDER", timeout=15)
    assert r.status_code == 404, r.text


# ---------------- site-config + logo ----------------
def test_site_config_fields(s):
    r = s.get(f"{API}/site-config", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("logo_url"), d
    assert re.match(r"^/api/uploads/logo-[a-f0-9]+\.(png|jpg|jpeg|webp)$", d["logo_url"]), d["logo_url"]
    # required contact fields (backend key is "phone" not "phone_number")
    for f in ["facebook_url", "whatsapp_number", "paypal_me_url", "zelle_email", "zelle_phone"]:
        assert f in d, f"site-config missing {f}: {d}"
    phone_key = "phone_number" if "phone_number" in d else "phone"
    assert d.get(phone_key), f"no phone in {d}"


def test_uploads_logo_serves_png(s):
    cfg = s.get(f"{API}/site-config", timeout=15).json()
    logo_path = cfg["logo_url"]  # /api/uploads/logo-*.png
    r = s.get(f"{BASE_URL}{logo_path}", timeout=15)
    assert r.status_code == 200, r.text[:200]
    ct = r.headers.get("content-type", "")
    assert "image" in ct, ct
    # PNG magic bytes
    assert r.content[:4] == b"\x89PNG" or r.content[:2] == b"\xff\xd8", r.content[:8]


# ---------------- Saturday blackout ----------------
def test_saturday_blackout_rental(s):
    payload = _rental_payload(1, "sat")
    payload["booking_date"] = SATURDAY
    r = s.post(f"{API}/bookings", json=payload, timeout=15)
    assert r.status_code == 400, r.text
    assert "saturday" in r.text.lower() or "closed" in r.text.lower(), r.text


# ---------------- Cancel policy ----------------
def test_cancel_15pct_when_far_future(s):
    p = _rental_payload(1, "cancel_far")
    p["booking_date"] = FAR_FUTURE
    br = s.post(f"{API}/bookings", json=p, timeout=15)
    assert br.status_code == 200, br.text
    bid = br.json()["id"]

    # Mark paid so refund_estimate computes
    import subprocess
    subprocess.run(["bash", "-lc",
        f'mongosh test_database --quiet --eval \'db.bookings.updateOne({{id: "{bid}"}}, {{$set: {{payment_status: "paid"}}}})\''],
        check=True, timeout=15, capture_output=True)

    r = s.post(f"{API}/bookings/{bid}/cancel", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("eligible_for_refund") is True, d
    total = 79.0 + 150.0
    assert float(d["cancellation_fee"]) == pytest.approx(total * 0.15, abs=0.01), d
    assert float(d["refund_estimate"]) == pytest.approx(total * 0.85, abs=0.01), d


def test_cancel_no_refund_within_48h(s):
    from datetime import datetime, timezone, timedelta
    soon = (datetime.now(timezone.utc) + timedelta(hours=12)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    # avoid saturday
    dt = datetime.now(timezone.utc) + timedelta(hours=12)
    if dt.weekday() == 5:  # Saturday
        dt += timedelta(days=1)
    soon = dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    p = _taxi_payload(1, "cancel_soon")
    p["booking_date"] = soon
    br = s.post(f"{API}/bookings", json=p, timeout=15)
    assert br.status_code == 200, br.text
    bid = br.json()["id"]

    import subprocess
    subprocess.run(["bash", "-lc",
        f'mongosh test_database --quiet --eval \'db.bookings.updateOne({{id: "{bid}"}}, {{$set: {{payment_status: "paid"}}}})\''],
        check=True, timeout=15, capture_output=True)

    r = s.post(f"{API}/bookings/{bid}/cancel", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("eligible_for_refund") is False, d
    # Non-refundable within 48h: full total kept as fee; refund_estimate = 0
    assert float(d["refund_estimate"]) == pytest.approx(0.0), d


# ---------------- Notifications smoke (no throw on paid rental) ----------------
def test_notifications_do_not_500_on_paid_rental(s):
    """Create a zelle rental — booking creation triggers notify path but must not 500."""
    r = s.post(f"{API}/bookings", json=_rental_payload(1, "notify"), timeout=25)
    # notification errors are swallowed; 200 is the guarantee
    assert r.status_code == 200, r.text
    assert r.json().get("id")
