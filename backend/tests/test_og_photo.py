"""Regression tests for the OG-per-photo landing page.

The `/api/og/photo/<id>` endpoint returns a minimal HTML page whose OG
meta tags reference the specific guest photo. Social crawlers scrape
this URL and show a photo-specific link preview; humans get an instant
JS + meta-refresh redirect to `/gallery?photo=<id>`.
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="module")
def existing_photo_id():
    r = requests.get(f"{BASE_URL}/api/gallery", timeout=10)
    r.raise_for_status()
    guests = [p for p in r.json() if p.get("category") == "guests" and p.get("id")]
    if not guests:
        pytest.skip("No approved guest photos in dataset")
    return guests[0]["id"]


def test_returns_html_with_og_image_pointing_at_the_actual_photo(existing_photo_id):
    r = requests.get(f"{BASE_URL}/api/og/photo/{existing_photo_id}", timeout=10)
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "").lower()
    body = r.text
    m = re.search(r'<meta property="og:image" content="([^"]+)"', body)
    assert m, "og:image meta tag missing"
    assert m.group(1).startswith("http"), "og:image must be an absolute URL for crawlers"


def test_includes_canonical_pointing_at_spa_url(existing_photo_id):
    r = requests.get(f"{BASE_URL}/api/og/photo/{existing_photo_id}", timeout=10)
    assert f"/gallery?photo={existing_photo_id}" in r.text
    # meta-refresh redirect present
    assert "http-equiv=\"refresh\"" in r.text
    # JS redirect present for browsers that ignore meta-refresh
    assert "window.location.replace" in r.text


def test_missing_photo_returns_404():
    r = requests.get(f"{BASE_URL}/api/og/photo/definitely-not-a-real-id-xyz", timeout=10)
    assert r.status_code == 404


def test_includes_twitter_card_meta(existing_photo_id):
    body = requests.get(f"{BASE_URL}/api/og/photo/{existing_photo_id}", timeout=10).text
    assert 'name="twitter:card" content="summary_large_image"' in body
    assert 'name="twitter:image"' in body
