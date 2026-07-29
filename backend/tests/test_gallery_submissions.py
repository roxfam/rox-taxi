"""Tests for guest gallery submission + admin approval workflow."""
import io
import os
import time
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASSWORD = "admin123"


def _png_bytes(size=(400, 300), color=(120, 180, 220)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    buf.seek(0)
    return buf


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ─── Public: submit gallery photo ─────────────────────────────────────
class TestGallerySubmit:
    def test_submit_valid_image(self):
        files = {"file": ("trip.png", _png_bytes(), "image/png")}
        data = {"submitter_name": "TEST_Guest", "submitter_email": "test@example.com", "caption": "TEST_amazing tour"}
        r = requests.post(f"{BASE_URL}/api/gallery/submit", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "pending"
        assert "id" in j and isinstance(j["id"], str) and len(j["id"]) > 0
        pytest.submission_id = j["id"]

    def test_submit_rejects_non_image_mime(self):
        files = {"file": ("bad.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/gallery/submit", files=files, timeout=20)
        assert r.status_code == 400
        assert "image" in r.text.lower()

    def test_submit_rejects_oversized(self):
        # 9MB payload with image/png mime — server should reject at >8MB
        big = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * (9 * 1024 * 1024))
        files = {"file": ("big.png", big, "image/png")}
        r = requests.post(f"{BASE_URL}/api/gallery/submit", files=files, timeout=60)
        assert r.status_code == 400
        assert "large" in r.text.lower() or "8" in r.text

    def test_submit_missing_file(self):
        r = requests.post(f"{BASE_URL}/api/gallery/submit", data={"caption": "no file"}, timeout=20)
        assert r.status_code == 422  # FastAPI validation


# ─── Admin: pending list + auth guard ─────────────────────────────────
class TestAdminGalleryAuth:
    def test_pending_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/gallery/pending", timeout=20)
        assert r.status_code in (401, 403)

    def test_approve_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/admin/gallery/nonexistent/approve", timeout=20)
        assert r.status_code in (401, 403)

    def test_reject_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/admin/gallery/nonexistent/reject", timeout=20)
        assert r.status_code in (401, 403)


# ─── Admin workflow: approve & reject ─────────────────────────────────
class TestAdminGalleryFlow:
    def test_pending_contains_submission(self, admin_headers):
        assert hasattr(pytest, "submission_id"), "submit test must run first"
        r = requests.get(f"{BASE_URL}/api/admin/gallery/pending", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()]
        assert pytest.submission_id in ids

    def test_approve_publishes_to_gallery(self, admin_headers):
        sid = pytest.submission_id
        r = requests.post(f"{BASE_URL}/api/admin/gallery/{sid}/approve", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"

        # Confirm no longer pending
        pend = requests.get(f"{BASE_URL}/api/admin/gallery/pending", headers=admin_headers, timeout=20).json()
        assert sid not in [d["id"] for d in pend]

        # Confirm appears in public /api/gallery under "guests" category
        time.sleep(0.5)
        pub = requests.get(f"{BASE_URL}/api/gallery", timeout=20)
        assert pub.status_code == 200
        guests = [item for item in pub.json() if item.get("category") == "guests"]
        assert any("guest_" in (g.get("url") or "") for g in guests), f"no guest photos in gallery: sample={guests[:3]}"

    def test_approve_idempotent_returns_404(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/gallery/{pytest.submission_id}/approve", headers=admin_headers, timeout=20)
        assert r.status_code == 404  # already approved, no longer pending

    def test_reject_flow(self, admin_headers):
        # Submit fresh photo → reject → verify not in public gallery
        files = {"file": ("rej.png", _png_bytes(color=(200, 50, 50)), "image/png")}
        data = {"submitter_name": "TEST_ToReject", "caption": "TEST_reject-me"}
        s = requests.post(f"{BASE_URL}/api/gallery/submit", files=files, data=data, timeout=30)
        assert s.status_code == 200
        rid = s.json()["id"]

        r = requests.post(f"{BASE_URL}/api/admin/gallery/{rid}/reject", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"

        # Not in pending
        pend = requests.get(f"{BASE_URL}/api/admin/gallery/pending", headers=admin_headers, timeout=20).json()
        assert rid not in [d["id"] for d in pend]

        # Not in public gallery
        pub = requests.get(f"{BASE_URL}/api/gallery", timeout=20).json()
        for item in pub:
            assert rid not in (item.get("url") or "")

    def test_reject_nonexistent_returns_404(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/gallery/does_not_exist_xyz/reject", headers=admin_headers, timeout=20)
        assert r.status_code == 404
