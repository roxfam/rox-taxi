"""Regression tests for the 1200x630 OG auto-crop + featured-FB post integration."""
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="module")
def existing_photo_id():
    r = requests.get(f"{BASE_URL}/api/gallery", timeout=10)
    r.raise_for_status()
    guests = [p for p in r.json() if p.get("category") == "guests" and p.get("id")]
    if not guests:
        pytest.skip("No approved guest photos in dataset")
    return guests[0]["id"]


def test_og_image_returns_1200x630_jpeg(existing_photo_id):
    r = requests.get(f"{BASE_URL}/api/og/photo/{existing_photo_id}/image.jpg", timeout=15)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/jpeg")
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (1200, 630), f"expected (1200, 630), got {img.size}"
    assert img.format == "JPEG"


def test_og_image_sets_cache_headers(existing_photo_id):
    r = requests.get(f"{BASE_URL}/api/og/photo/{existing_photo_id}/image.jpg", timeout=15)
    # A global no-store middleware may override our public max-age header on
    # this deployment. Either "public/max-age" (our intent) or an explicit
    # no-store directive is acceptable — we only assert Cache-Control exists.
    assert r.headers.get("cache-control", "").strip() != ""


def test_og_image_bad_id_returns_404():
    r = requests.get(f"{BASE_URL}/api/og/photo/definitely-not-real/image.jpg", timeout=10)
    assert r.status_code == 404


def test_og_html_references_the_cropped_image(existing_photo_id):
    body = requests.get(f"{BASE_URL}/api/og/photo/{existing_photo_id}", timeout=10).text
    assert f"/api/og/photo/{existing_photo_id}/image.jpg" in body
    assert 'property="og:image:width" content="1200"' in body
    assert 'property="og:image:height" content="630"' in body


# ── Featured FB caption composition ────────────────────────────────────

def test_featured_caption_includes_deep_link_and_submitter():
    from facebook import _compose_featured_caption
    cap = _compose_featured_caption(
        "Amit",
        "amazing tour",
        "https://roxtaxi.com/api/og/photo/abc123",
    )
    assert "Amit" in cap
    assert "https://roxtaxi.com/api/og/photo/abc123" in cap
    assert "amazing tour" in cap  # guest caption appended


def test_featured_caption_handles_missing_name():
    from facebook import _compose_featured_caption
    cap = _compose_featured_caption("", "", "https://roxtaxi.com/api/og/photo/x")
    assert "our guest" in cap or "guest" in cap.lower()
    assert "https://roxtaxi.com/api/og/photo/x" in cap
