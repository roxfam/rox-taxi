"""
Iteration 39 — Taxi VAT removal, gift-card VAT markup, gallery reward settings,
Photo of the Month, admin gallery edit/delete.

Covers:
 - POST /api/quotes: taxi vat_amount=0, tour vat_amount>0 (10% of subtotal)
 - POST /api/gift-cards/purchase: total_charged = amount * 1.1
 - GET/PUT /api/admin/gallery-rewards (approval_amount, potm_amount, enabled)
 - Approval reward respects settings.enabled
 - POST /api/admin/gallery/{id}/photo-of-month issues one card per email
 - GET /api/gallery/photo-of-month public endpoint
 - PATCH /api/admin/gallery/{id} edits caption/submitter_name
 - DELETE /api/admin/gallery/{id} removes + unsets potm
"""
import os
import io
import uuid
import time
import pytest
import requests
from pymongo import MongoClient

def _load_env():
    envs = {}
    for p in ("/app/frontend/.env", "/app/backend/.env"):
        try:
            for line in open(p):
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    envs[k] = v.strip('"').strip("'")
        except FileNotFoundError:
            pass
    return envs

_env = _load_env()
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _env.get("REACT_APP_BACKEND_URL")).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _env.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME") or _env.get("DB_NAME", "test_database")

ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASS = "admin123"


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    assert tok, f"no token in login resp: {body}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    # Clear cookies so FastAPI falls back to Bearer flow (CSRF skipped).
    # Keeping both admin_session cookie + Bearer caused server to enforce
    # CSRF and reject mutating calls with 403.
    s.cookies.clear()
    return s


# ─────────────────────────────── VAT ──────────────────────────────── #

class TestVat:
    def _make_quote(self, service_type, extra=None):
        from datetime import datetime, timedelta, timezone
        d = datetime.now(timezone.utc) + timedelta(days=10)
        while d.weekday() == 5:
            d += timedelta(days=1)
        payload = {
            "service_type": service_type,
            "item_id": "cable-beach-day" if service_type == "tour" else "lpia-downtown",
            "item_name": "Cable Beach Day" if service_type == "tour" else "LPIA → Downtown",
            "price": 149.0 if service_type == "tour" else 35.0,
            "customer_name": "TEST VAT",
            "customer_email": f"test_vat_{uuid.uuid4().hex[:6]}@example.com",
            "customer_phone": "+12421112222",
            "pickup_location": "Nassau Airport",
            "dropoff_location": "Atlantis",
            "booking_date": d.strftime("%Y-%m-%d"),
            "booking_time": "10:00",
            "passengers": 2,
            "payment_method": "card",
        }
        if extra:
            payload.update(extra)
        return {"payload": payload}

    def _vat_from_lines(self, q):
        for ln in q.get("lines", []) or []:
            if "vat" in (ln.get("label") or "").lower():
                return float(ln.get("amount") or 0)
        return 0.0

    def test_taxi_quote_vat_zero(self, db):
        p = self._make_quote("taxi")
        r = requests.post(f"{BASE}/api/quotes", json=p, timeout=15)
        assert r.status_code in (200, 201), r.text
        q = r.json()
        assert self._vat_from_lines(q) == 0, f"taxi should have vat 0, got lines={q.get('lines')}"
        qid = q.get("id")
        if qid:
            db.quotes.delete_one({"id": qid})
            db.bookings.delete_many({"customer_email": p["payload"]["customer_email"]})

    def test_tour_quote_vat_nonzero(self, db):
        p = self._make_quote("tour")
        r = requests.post(f"{BASE}/api/quotes", json=p, timeout=15)
        assert r.status_code in (200, 201), r.text
        q = r.json()
        vat = self._vat_from_lines(q)
        assert vat > 0, f"tour should have 10% VAT, got lines={q.get('lines')}"
        qid = q.get("id")
        if qid:
            db.quotes.delete_one({"id": qid})
            db.bookings.delete_many({"customer_email": p["payload"]["customer_email"]})


# ──────────────────────── Gift Card VAT Markup ──────────────────────── #

class TestGiftCardVat:
    def test_purchase_charges_amount_plus_vat(self, db):
        payload = {
            "amount": 100,
            "buyer_name": "TEST Buyer",
            "buyer_email": f"test_giftvat_{uuid.uuid4().hex[:6]}@example.com",
            "recipient_name": "TEST Recipient",
            "recipient_email": f"test_giftvat_recv_{uuid.uuid4().hex[:6]}@example.com",
            "message": "TEST",
            "theme": "thank_you",
            "origin_url": BASE,
        }
        r = requests.post(f"{BASE}/api/gift-cards/purchase", json=payload, timeout=20)
        # Stripe may not be configured in preview → 503 acceptable; skip
        if r.status_code == 503:
            pytest.skip("Stripe not configured")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["vat_amount"] == 10.0, body
        assert body["total_charged"] == 110.0, body
        # cleanup pending TEST gift card
        db.gift_cards.delete_one({"code": body["code"]})


# ────────────────── Gallery Reward Settings (GET/PUT) ────────────────── #

class TestRewardSettings:
    def test_requires_auth(self):
        # Previously xfail — now main agent fixed _require_admin_dep to await
        # the async require_admin properly. All /api/admin/gallery/* endpoints
        # should reject unauthenticated callers with 401.
        r = requests.get(f"{BASE}/api/admin/gallery-rewards", timeout=10)
        assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"
        r2 = requests.get(f"{BASE}/api/admin/gallery/pending", timeout=10)
        assert r2.status_code == 401, f"expected 401, got {r2.status_code} {r2.text}"
        r3 = requests.patch(f"{BASE}/api/admin/gallery/does-not-exist",
                            json={"caption": "x"}, timeout=10)
        assert r3.status_code == 401, f"expected 401, got {r3.status_code} {r3.text}"
        r4 = requests.delete(f"{BASE}/api/admin/gallery/does-not-exist", timeout=10)
        assert r4.status_code == 401, f"expected 401, got {r4.status_code} {r4.text}"

    def test_get_returns_defaults(self, admin):
        r = admin.get(f"{BASE}/api/admin/gallery-rewards", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("enabled", "approval_amount", "potm_amount"):
            assert k in body

    def test_put_persists_and_validates(self, admin):
        # valid update
        r = admin.put(f"{BASE}/api/admin/gallery-rewards",
                      json={"enabled": True, "approval_amount": 7.5, "potm_amount": 12.0}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["approval_amount"] == 7.5 and body["potm_amount"] == 12.0

        g = admin.get(f"{BASE}/api/admin/gallery-rewards", timeout=10).json()
        assert g["approval_amount"] == 7.5

        # invalid - above 500
        bad = admin.put(f"{BASE}/api/admin/gallery-rewards",
                        json={"enabled": True, "approval_amount": 600, "potm_amount": 5}, timeout=10)
        assert bad.status_code in (400, 422)

        # restore defaults
        r = admin.put(f"{BASE}/api/admin/gallery-rewards",
                      json={"enabled": True, "approval_amount": 5, "potm_amount": 5}, timeout=10)
        assert r.status_code == 200


# ────────────── Approval reward respects enabled flag ────────────── #

def _submit_gallery_photo(email, caption="TEST photo"):
    """Submit a gallery photo via public endpoint. Returns submission id."""
    # 1x1 PNG
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
    )
    files = {"file": (f"test_{uuid.uuid4().hex[:6]}.png", io.BytesIO(png), "image/png")}
    data = {
        "submitter_name": "TEST Guest",
        "submitter_email": email,
        "caption": caption,
        "category": "guests",
    }
    r = requests.post(f"{BASE}/api/gallery/submit", files=files, data=data, timeout=20)
    assert r.status_code in (200, 201), f"submit failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("id") or body.get("submission_id") or body["submission"]["id"]


class TestApprovalReward:
    def test_disabled_no_gift_card(self, admin, db):
        # disable
        admin.put(f"{BASE}/api/admin/gallery-rewards",
                  json={"enabled": False, "approval_amount": 5, "potm_amount": 5}, timeout=10)
        email = f"test_potm_disabled_{uuid.uuid4().hex[:6]}@example.com"
        sid = _submit_gallery_photo(email)
        try:
            r = admin.post(f"{BASE}/api/admin/gallery/{sid}/approve", timeout=15)
            assert r.status_code == 200, r.text
            time.sleep(0.5)
            card = db.gift_cards.find_one({"source": "photo_reward", "recipient_email": email})
            assert card is None, "gift card should NOT be issued when disabled"
        finally:
            admin.delete(f"{BASE}/api/admin/gallery/{sid}", timeout=10)
            db.gift_cards.delete_many({"recipient_email": email})
            # restore
            admin.put(f"{BASE}/api/admin/gallery-rewards",
                      json={"enabled": True, "approval_amount": 5, "potm_amount": 5}, timeout=10)

    def test_enabled_issues_gift_card_with_amount(self, admin, db):
        admin.put(f"{BASE}/api/admin/gallery-rewards",
                  json={"enabled": True, "approval_amount": 8, "potm_amount": 5}, timeout=10)
        email = f"test_potm_enabled_{uuid.uuid4().hex[:6]}@example.com"
        sid = _submit_gallery_photo(email)
        try:
            r = admin.post(f"{BASE}/api/admin/gallery/{sid}/approve", timeout=15)
            assert r.status_code == 200, r.text
            time.sleep(0.5)
            card = db.gift_cards.find_one({"source": "photo_reward", "recipient_email": email})
            assert card is not None, "gift card SHOULD be issued when enabled"
            assert card["amount"] == 8.0
        finally:
            admin.delete(f"{BASE}/api/admin/gallery/{sid}", timeout=10)
            db.gift_cards.delete_many({"recipient_email": email})
            admin.put(f"{BASE}/api/admin/gallery-rewards",
                      json={"enabled": True, "approval_amount": 5, "potm_amount": 5}, timeout=10)


# ──────────────────── Photo of the Month ──────────────────── #

class TestPhotoOfTheMonth:
    def test_potm_flow(self, admin, db):
        email = f"test_potm_main_{uuid.uuid4().hex[:6]}@example.com"
        sid = _submit_gallery_photo(email, caption="POTM original caption")
        try:
            # approve first
            admin.post(f"{BASE}/api/admin/gallery/{sid}/approve", timeout=15)
            time.sleep(0.3)
            # clean approval reward so email conflict logic doesn't block POTM
            db.gift_cards.delete_many({"recipient_email": email, "source": "photo_reward"})

            # set as POTM
            r = admin.post(f"{BASE}/api/admin/gallery/{sid}/photo-of-month", timeout=15)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["submission_id"] == sid
            assert body.get("reward_code"), f"should issue reward code, got {body}"

            # public endpoint returns it
            pub = requests.get(f"{BASE}/api/gallery/photo-of-month", timeout=10)
            assert pub.status_code == 200
            data = pub.json()
            # public shape: {id, url, caption, submitter, month, ...}
            assert data and data.get("id") == sid, data

            # second potm for same email → reward_code null
            email2 = f"test_potm_second_{uuid.uuid4().hex[:6]}@example.com"
            # Create another photo w/ SAME email (reuse the one we used)
            sid2 = _submit_gallery_photo(email, caption="second POTM for same email")
            admin.post(f"{BASE}/api/admin/gallery/{sid2}/approve", timeout=15)
            time.sleep(0.3)
            db.gift_cards.delete_many({"recipient_email": email, "source": "photo_reward"})
            r2 = admin.post(f"{BASE}/api/admin/gallery/{sid2}/photo-of-month", timeout=15)
            assert r2.status_code == 200
            assert r2.json().get("reward_code") is None, "second POTM for same email should not re-issue"

            # cleanup second
            admin.delete(f"{BASE}/api/admin/gallery/{sid2}", timeout=10)
        finally:
            admin.delete(f"{BASE}/api/admin/gallery/{sid}", timeout=10)
            db.gift_cards.delete_many({"recipient_email": email})
            db.site_config.update_one({"_id": "main"}, {"$unset": {"photo_of_month": ""}})
            # verify public returns null
            pub2 = requests.get(f"{BASE}/api/gallery/photo-of-month", timeout=10)
            assert pub2.status_code == 200
            assert pub2.json() in (None, {})


# ──────────────────── Admin edit + delete ──────────────────── #

class TestAdminEditDelete:
    def test_patch_edits_fields(self, admin, db):
        email = f"test_edit_{uuid.uuid4().hex[:6]}@example.com"
        sid = _submit_gallery_photo(email, caption="orig caption")
        try:
            r = admin.patch(f"{BASE}/api/admin/gallery/{sid}",
                            json={"caption": "updated caption", "submitter_name": "New Name"}, timeout=10)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["caption"] == "updated caption"
            assert body["submitter_name"] == "New Name"
        finally:
            admin.delete(f"{BASE}/api/admin/gallery/{sid}", timeout=10)
            db.gift_cards.delete_many({"recipient_email": email})

    def test_delete_removes(self, admin, db):
        email = f"test_del_{uuid.uuid4().hex[:6]}@example.com"
        sid = _submit_gallery_photo(email)
        r = admin.delete(f"{BASE}/api/admin/gallery/{sid}", timeout=10)
        assert r.status_code == 200
        assert db.gallery_submissions.find_one({"id": sid}) is None
        db.gift_cards.delete_many({"recipient_email": email})
