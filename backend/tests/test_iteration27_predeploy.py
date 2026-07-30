"""
Iteration 27 — PRE-DEPLOY regression gate.
Covers the 8 features shipped this session + regression of core endpoints.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
import requests
import pytest

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASS = "admin123"


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def rental_id():
    r = requests.get(f"{API}/rentals", timeout=15)
    assert r.status_code == 200
    rentals = r.json()
    assert rentals, "No rentals available"
    return rentals[0]["id"]


def _register_customer(referral_code=None):
    """Returns (response, email, session_requests). Cookie is stored in session."""
    email = f"test_iter27_{uuid.uuid4().hex[:8]}@example.com"
    payload = {"email": email, "password": "Test1234!", "name": "TEST Iter27"}
    if referral_code:
        payload["referral_code"] = referral_code
    sess = requests.Session()
    r = sess.post(f"{API}/auth/register", json=payload, timeout=15)
    return r, email, sess


def _next_non_saturday(days_ahead=7):
    d = datetime.now(timezone.utc) + timedelta(days=days_ahead)
    while d.weekday() == 5:
        d += timedelta(days=1)
    return d.date().isoformat()


# ===========  REGRESSION GATE — Core public endpoints  ===========

@pytest.mark.parametrize("path", [
    "/tours", "/rentals", "/taxi-services", "/site-config",
    "/gallery", "/packages", "/promotions", "/cities", "/blackout-dates",
])
def test_public_endpoint_200(path):
    r = requests.get(f"{API}{path}", timeout=15)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"
    r.json()  # must be valid JSON


def test_admin_login_returns_jwt():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body.get("token"), str) and len(body["token"]) > 20


def test_taxi_booking_still_works():
    r = requests.get(f"{API}/taxi-services", timeout=15)
    svc = r.json()[0]
    payload = {
        "service_type": "taxi",
        "item_id": svc["id"],
        "item_name": svc.get("name") or "Test route",
        "price": float(svc.get("price") or 25.0),
        "customer_name": "TEST Iter27 taxi",
        "customer_email": "test_iter27_taxi@example.com",
        "customer_phone": "+12420000000",
        "booking_date": _next_non_saturday(3),
        "passengers": 2,
        "payment_method": "cash",
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=20)
    assert r.status_code == 200, r.text[:300]
    b = r.json()
    assert b.get("id")
    assert b.get("total") is not None or b.get("price") is not None


# ===========  FLEET CLEANUP  ===========

def test_fleet_endpoint_removed():
    r = requests.get(f"{API}/fleet", timeout=10)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}"


def test_admin_fleet_endpoint_removed(admin_headers):
    r = requests.put(f"{API}/admin/fleet", json={}, headers=admin_headers, timeout=10)
    assert r.status_code in (404, 405), f"Expected 404/405, got {r.status_code}"


# ===========  MULTI-CITY  ===========

def test_cities_list():
    r = requests.get(f"{API}/cities", timeout=10)
    data = r.json()
    cities = data.get("cities") or data
    assert len(cities) == 4
    slugs = {c["slug"] for c in cities}
    assert {"nassau", "freeport", "exuma", "andros"} == slugs
    nassau = next(c for c in cities if c["slug"] == "nassau")
    assert nassau["active"] is True


@pytest.mark.parametrize("slug", ["freeport", "exuma", "andros"])
def test_waitlist_accepts_valid_city(slug):
    email = f"test_iter27_wl_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{API}/waitlist", json={"email": email, "city": slug}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True


def test_waitlist_rejects_unknown_city():
    r = requests.post(f"{API}/waitlist", json={"email": "test_iter27_bad@example.com", "city": "atlantis"}, timeout=10)
    assert r.status_code == 400


# ===========  REFERRALS  ===========

def test_referral_summary_requires_auth():
    r = requests.get(f"{API}/referrals/summary", timeout=10)
    assert r.status_code in (401, 403)


def test_referral_flow_end_to_end():
    # 1. Register referrer
    r_referrer, referrer_email, ref_sess = _register_customer()
    assert r_referrer.status_code == 200, r_referrer.text

    # 2. Get referrer summary → code
    r = ref_sess.get(f"{API}/referrals/summary", timeout=10)
    assert r.status_code == 200, r.text
    summary = r.json()
    for k in ["code", "referral_link", "total_referred", "total_converted",
              "credits_earned", "credit_balance", "next_reward_at"]:
        assert k in summary, f"Missing key {k}"
    code = summary["code"]
    assert code.startswith("ROX-")
    baseline_referred = summary["total_referred"]

    # 3. Register referee with valid code
    r_ref, _, _ = _register_customer(referral_code=code)
    assert r_ref.status_code == 200, r_ref.text

    # 4. Verify total_referred incremented
    r2 = ref_sess.get(f"{API}/referrals/summary", timeout=10)
    assert r2.json()["total_referred"] == baseline_referred + 1


def test_referral_invalid_code_silently_ignored():
    r, _, _ = _register_customer(referral_code="ROX-DOESNOTEXIST")
    assert r.status_code == 200, r.text


# ===========  PER-VEHICLE BLACKOUTS  ===========

def test_blackout_add_and_book_blocked(admin_headers, rental_id):
    target_date = _next_non_saturday(30)
    r0 = requests.get(f"{API}/rentals", timeout=15)
    orig = next(x for x in r0.json() if x["id"] == rental_id)
    orig_blk = list(orig.get("blackout_dates") or [])

    def _payload(blk):
        return {
            "name": orig["name"],
            "description": orig.get("description") or "TEST",
            "price": float(orig.get("price") or 55.0),
            "duration": orig.get("duration"),
            "image_url": orig.get("image_url"),
            "category": orig.get("category"),
            "seats": orig.get("seats"),
            "active": orig.get("active", True),
            "year": orig.get("year"),
            "make": orig.get("make"),
            "model": orig.get("model"),
            "color": orig.get("color"),
            "body": orig.get("body"),
            "blackout_dates": blk,
        }

    try:
        new_blk = list(set(orig_blk + [target_date]))
        r = requests.put(f"{API}/admin/rentals/{rental_id}",
                         headers=admin_headers,
                         json=_payload(new_blk), timeout=15)
        assert r.status_code in (200, 204), f"PUT rental blackout {r.status_code}: {r.text[:300]}"

        # Try to book that date -> should 400
        payload = {
            "service_type": "rental",
            "item_id": rental_id,
            "item_name": orig.get("name") or "TestRental",
            "price": float(orig.get("price") or 55.0),
            "customer_name": "TEST Iter27 blk",
            "customer_email": "test_iter27_blk@example.com",
            "customer_phone": "+12420000000",
            "booking_date": target_date,
            "passengers": 1,
            "days": 2,
            "payment_method": "cash",
        }
        rb = requests.post(f"{API}/bookings", json=payload, timeout=15)
        assert rb.status_code == 400, f"Expected 400, got {rb.status_code}: {rb.text[:300]}"
        assert target_date in rb.text, f"Clashing date not in error: {rb.text[:300]}"
    finally:
        requests.put(f"{API}/admin/rentals/{rental_id}",
                     headers=admin_headers,
                     json=_payload(orig_blk), timeout=15)


# ===========  BULK BLACKOUT  ===========

def test_bulk_blackout_add_and_remove(admin_headers):
    start = (datetime.now(timezone.utc) + timedelta(days=200)).date().isoformat()
    end = (datetime.now(timezone.utc) + timedelta(days=201)).date().isoformat()

    # ADD (all rentals - no category)
    r = requests.post(f"{API}/admin/rentals/bulk-blackout",
                      headers=admin_headers,
                      json={"start_date": start, "end_date": end, "action": "add",
                            "reason": "TEST Iter27 maintenance"}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body.get("affected", 0) >= 0
    assert body["dates"] == [start, end]

    # REMOVE
    r2 = requests.post(f"{API}/admin/rentals/bulk-blackout",
                       headers=admin_headers,
                       json={"start_date": start, "end_date": end, "action": "remove",
                             "reason": "TEST Iter27 cleanup"}, timeout=20)
    assert r2.status_code == 200
    assert r2.json()["ok"] is True


def test_bulk_blackout_invalid_range(admin_headers):
    end = (datetime.now(timezone.utc) + timedelta(days=200)).date().isoformat()
    start = (datetime.now(timezone.utc) + timedelta(days=205)).date().isoformat()
    r = requests.post(f"{API}/admin/rentals/bulk-blackout",
                      headers=admin_headers,
                      json={"start_date": start, "end_date": end, "action": "add"}, timeout=15)
    assert r.status_code == 400


# ===========  RENTAL EXTENSION  ===========

def test_extend_quote_requires_auth():
    r = requests.post(f"{API}/my/bookings/some-id/extend/quote", json={"additional_days": 1}, timeout=10)
    assert r.status_code in (401, 403)


def test_extend_quote_unknown_booking_404():
    _, email, sess = _register_customer()
    r = sess.post(f"{API}/my/bookings/nonexistent-xyz/extend/quote",
                  json={"additional_days": 1}, timeout=10)
    assert r.status_code == 404


def test_extend_quote_unpaid_400():
    """Create a real rental booking, then try to extend before paying → expect 400."""
    _, email, sess = _register_customer()
    # Create booking
    r = requests.get(f"{API}/rentals", timeout=10)
    rental = r.json()[0]
    payload = {
        "service_type": "rental",
        "item_id": rental["id"],
        "item_name": rental["name"],
        "price": float(rental.get("price") or 55.0),
        "customer_name": "TEST Iter27 ext",
        "customer_email": email,
        "customer_phone": "+12420000000",
        "booking_date": _next_non_saturday(60),
        "passengers": 1,
        "days": 2,
        "payment_method": "cash",
    }
    rb = requests.post(f"{API}/bookings", json=payload, timeout=15)
    assert rb.status_code == 200, rb.text[:300]
    booking_id = rb.json()["id"]

    rq = sess.post(f"{API}/my/bookings/{booking_id}/extend/quote",
                   json={"additional_days": 1}, timeout=10)
    # Unpaid → 400 with "Pay the original booking first"
    assert rq.status_code == 400, f"Expected 400 got {rq.status_code}: {rq.text[:200]}"


# ===========  ADMIN TOKENS PANEL  ===========

def test_tokens_panel_lists_29(admin_headers):
    r = requests.get(f"{API}/admin/tokens", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    tokens = r.json()["tokens"]
    assert len(tokens) == 29
    groups = {t["group"] for t in tokens}
    for g in ["Facebook", "Twilio SMS", "Email", "Stripe", "PayPal",
              "AviationStack", "Emergent LLM", "Web Push", "Google OAuth"]:
        assert g in groups


def test_tokens_facebook_status(admin_headers):
    r = requests.get(f"{API}/admin/tokens/facebook/status", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert any(k in data for k in ("ok", "error", "status"))


def test_tokens_put_and_delete_safe_key(admin_headers):
    key = "FB_SITE_URL"
    r0 = requests.get(f"{API}/admin/tokens", headers=admin_headers, timeout=10)
    orig = next(t for t in r0.json()["tokens"] if t["key"] == key)
    try:
        r = requests.put(f"{API}/admin/tokens", headers=admin_headers,
                         json={"key": key, "value": "https://TEST-iter27.example"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        r2 = requests.get(f"{API}/admin/tokens", headers=admin_headers, timeout=10)
        entry = next(t for t in r2.json()["tokens"] if t["key"] == key)
        assert entry["db_override"] is True
    finally:
        rd = requests.delete(f"{API}/admin/tokens/{key}", headers=admin_headers, timeout=10)
        assert rd.status_code == 200
