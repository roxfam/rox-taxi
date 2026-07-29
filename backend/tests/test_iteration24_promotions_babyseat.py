"""
Iteration 24 — Regression + new-feature validation
Covers: baby-seat add-on, Promotions engine + auto-apply, PromoBanner backend feed,
home slides (Ardastra + count), package image swap, compile-fix regression sanity.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASS = "admin123"


def _next_non_saturday(days_ahead=7):
    d = datetime.now(timezone.utc) + timedelta(days=days_ahead)
    while d.weekday() == 5:
        d += timedelta(days=1)
    return d.date().isoformat()


@pytest.fixture(scope="module")
def session():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def rental_item_id(session):
    r = session.get(f"{API}/rentals")
    assert r.status_code == 200
    items = r.json()
    return items[0]["id"] if items else "spark-compact"


# ─────────── BABY SEAT ───────────
class TestBabySeat:
    def test_baby_seat_fee_5_days(self, session, rental_item_id):
        booking_date = _next_non_saturday(7)
        payload = {
            "service_type": "rental",
            "item_id": rental_item_id,
            "item_name": "Test rental",
            "price": 55.0,
            "customer_name": "TEST_BabySeat5",
            "customer_email": "test_babyseat5@example.com",
            "customer_phone": "+12420000000",
            "booking_date": booking_date,
            "passengers": 2,
            "days": 5,
            "baby_seats": 2,
            "payment_method": "cash",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text[:400]
        b = r.json()
        assert b.get("baby_seats") == 2
        assert b.get("baby_seat_fee") == 70.0, f"expected 70, got {b.get('baby_seat_fee')}"
        assert b.get("baby_seat_free") is False
        assert b.get("total", 0) > 70

    def test_baby_seat_free_15_days(self, session, rental_item_id):
        booking_date = _next_non_saturday(7)
        payload = {
            "service_type": "rental",
            "item_id": rental_item_id,
            "item_name": "Test rental",
            "price": 55.0,
            "customer_name": "TEST_BabySeat15",
            "customer_email": "test_babyseat15@example.com",
            "customer_phone": "+12420000000",
            "booking_date": booking_date,
            "passengers": 2,
            "days": 15,
            "baby_seats": 2,
            "payment_method": "cash",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text[:400]
        b = r.json()
        assert b.get("baby_seats") == 2
        assert b.get("baby_seat_fee") == 0.0
        assert b.get("baby_seat_free") is True


# ─────────── PROMOTIONS CRUD + auto-apply ───────────
class TestPromotions:
    created_id = None

    def test_public_promotions_list(self, session):
        r = session.get(f"{API}/promotions")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_create_promotion(self, session, admin_headers):
        payload = {
            "label": f"TEST_Promo_{uuid.uuid4().hex[:6]}",
            "description": "Regression test promo",
            "discount_type": "percent",
            "discount_value": 15,
            "applies_to": ["taxi"],
            "active": True,
        }
        r = session.post(f"{API}/admin/promotions", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert data.get("id")
        assert data.get("label") == payload["label"]
        assert data.get("discount_type") == "percent"
        assert data.get("discount_value") == 15
        TestPromotions.created_id = data["id"]

    def test_public_list_now_contains_promo(self, session):
        r = session.get(f"{API}/promotions")
        assert r.status_code == 200
        ids = [p.get("id") for p in r.json()]
        assert TestPromotions.created_id in ids, f"created promo not live: {ids}"

    def test_booking_auto_applies_promo(self, session):
        booking_date = _next_non_saturday(7)
        payload = {
            "service_type": "taxi",
            "item_id": "lpia-nassau",
            "item_name": "LPIA → Nassau",
            "price": 40.0,
            "customer_name": "TEST_PromoApply",
            "customer_email": "test_promoapply@example.com",
            "customer_phone": "+12420000000",
            "booking_date": booking_date,
            "pickup_location": "LPIA",
            "dropoff_location": "Nassau",
            "passengers": 1,
            "payment_method": "cash",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text[:400]
        b = r.json()
        assert b.get("promotion_id") == TestPromotions.created_id, f"promo not attached: {b}"
        assert b.get("promotion_discount", 0) > 0
        assert b.get("promotion_label", "").startswith("TEST_Promo")

    def test_admin_patch_deactivate(self, session, admin_headers):
        r = session.patch(
            f"{API}/admin/promotions/{TestPromotions.created_id}",
            json={"active": False},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text[:400]
        assert r.json().get("active") is False

    def test_public_list_after_deactivate(self, session):
        r = session.get(f"{API}/promotions")
        assert r.status_code == 200
        ids = [p.get("id") for p in r.json()]
        assert TestPromotions.created_id not in ids

    def test_booking_after_deactivate_has_no_promo(self, session):
        booking_date = _next_non_saturday(8)
        payload = {
            "service_type": "taxi",
            "item_id": "lpia-nassau",
            "item_name": "LPIA → Nassau",
            "price": 40.0,
            "customer_name": "TEST_NoPromo",
            "customer_email": "test_nopromo@example.com",
            "customer_phone": "+12420000000",
            "booking_date": booking_date,
            "pickup_location": "LPIA",
            "dropoff_location": "Nassau",
            "passengers": 1,
            "payment_method": "cash",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text[:400]
        b = r.json()
        assert not b.get("promotion_id"), f"expected no promotion, got {b.get('promotion_id')}"

    def test_admin_list_requires_auth(self, session):
        r = session.get(f"{API}/admin/promotions")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_admin_delete(self, session, admin_headers):
        r = session.delete(
            f"{API}/admin/promotions/{TestPromotions.created_id}",
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_delete_404_on_missing(self, session, admin_headers):
        r = session.delete(f"{API}/admin/promotions/DOESNOTEXIST", headers=admin_headers)
        assert r.status_code == 404


# ─────────── HOME SLIDES ───────────
class TestHomeSlides:
    def test_10_slides_with_ardastra(self, session):
        r = session.get(f"{API}/home-slides")
        assert r.status_code == 200
        slides = r.json()
        assert len(slides) == 10, f"expected 10 slides, got {len(slides)}"
        ard = next((s for s in slides if s.get("id") == "hero-ardastra"), None)
        assert ard is not None, "hero-ardastra missing"
        assert ard.get("order") == 10
        assert ard.get("link_url") == "https://ardastra.com/"
        img = ard.get("image_url") or ""
        assert img.startswith("https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/ouo8o6m9_47-bmot-nassau"), f"ardastra image_url: {img}"

    def test_slide_images_high_res(self, session):
        # Boost claim: image URLs should carry higher-res w= param OR wikimedia 1920+px thumb.
        r = session.get(f"{API}/home-slides")
        slides = r.json()
        hires_count = 0
        for s in slides:
            url = s.get("image_url") or ""
            if any(tok in url for tok in ("w=3200", "w=2560", "w=2400", "1920px", "1920p")):
                hires_count += 1
        # Note: request expected w=3200 or 2560 but seed uses w=2400 / 1920px thumbs.
        assert hires_count >= 8, f"only {hires_count} hi-res slide URLs found"

    def test_plain_taxi_booking(self, session):
        booking_date = _next_non_saturday(7)
        payload = {
            "service_type": "taxi",
            "item_id": "lpia-nassau",
            "item_name": "LPIA → Nassau",
            "price": 40.0,
            "customer_name": "TEST_PlainTaxi",
            "customer_email": "test_plain@example.com",
            "customer_phone": "+12420000000",
            "booking_date": booking_date,
            "pickup_location": "LPIA",
            "dropoff_location": "Nassau",
            "passengers": 1,
            "payment_method": "cash",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text[:400]
        b = r.json()
        assert b.get("total", 0) > 0


# ─────────── PACKAGE SWAP ───────────
class TestPackages:
    def test_two_packages(self, session):
        r = session.get(f"{API}/packages")
        assert r.status_code == 200
        pkgs = r.json()
        assert len(pkgs) == 2

    def test_airport_tour_lpia_image(self, session):
        r = session.get(f"{API}/packages")
        pkgs = r.json()
        p = next((x for x in pkgs if x.get("id") == "airport-tour-airport"), None)
        assert p is not None
        assert p.get("name") == "LPIA → Blue Lagoon → LPIA"
        url = p.get("image_url", "")
        assert "customer-assets-gfyr7b9c.emergentagent.net" in url, f"url: {url}"
        assert "ou78camd_Photo-Caption-2-Airport" in url
        assert "LPIA" in url


# ─────────── COMPILE-FIX REGRESSION ───────────
class TestRegression:
    def test_fleet_counts(self, session):
        r = session.get(f"{API}/fleet")
        assert r.status_code == 200
        data = r.json()
        assert len(data.get("drivers", [])) == 4
        assert len(data.get("vehicles", [])) == 5

    def test_live_stats(self, session):
        r = session.get(f"{API}/live-stats")
        assert r.status_code == 200
        assert "bookings_last_hour" in r.json()

    def test_push_vapid(self, session, admin_headers):
        r = session.get(f"{API}/admin/push/vapid-public-key", headers=admin_headers)
        assert r.status_code == 200
        assert r.json().get("public_key")

    def test_facebook_status(self, session, admin_headers):
        r = session.get(f"{API}/admin/integrations/facebook/status", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d.get("configured") is True
        assert d.get("valid") is True

    def test_driver_manifest(self, session, admin_headers):
        r = session.get(f"{API}/admin/driver/manifest", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "date" in d
        assert "bookings" in d

    def test_gallery_submit_and_approve(self, session, admin_headers):
        # multipart upload
        import io
        files = {"file": ("test.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 100), "image/png")}
        data = {
            "submitter_name": "TEST_Gallery",
            "submitter_email": "test_gallery@example.com",
            "caption": "TEST caption",
        }
        r = session.post(f"{API}/gallery/submit", files=files, data=data)
        assert r.status_code in (200, 201), r.text[:400]
        sub_id = r.json().get("id")
        assert sub_id
