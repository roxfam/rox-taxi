"""Iteration 22 tests — admin approved gallery list, repost-facebook endpoint,
and end-to-end submit→approve→gallery-live flow.

Facebook is currently scope-blocked (missing pages_manage_posts). We assert:
  - facebook.ok == False
  - error contains 'pages_manage_posts' or 'permission'
Non-Facebook fields must still be correct.
"""
import io
import os
import time
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "roxfam2509@gmail.com"
ADMIN_PASSWORD = "admin123"


def _png_bytes(size=(600, 400), color=(200, 120, 60)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    buf.seek(0)
    return buf


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token: {data}"
    return {"Authorization": f"Bearer {tok}"}


class TestAdminApprovedList:
    def test_unauthenticated_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/gallery/approved", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_authenticated_returns_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/gallery/approved", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        # If any items exist, structural validation
        for it in data:
            assert "id" in it
            assert it.get("status") == "approved"
            # facebook_* fields may be None but keys should exist (or safely absent for legacy)
            # Just ensure no mongo _id leak
            assert "_id" not in it

    def test_sorted_by_approved_at_desc(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/gallery/approved", headers=admin_headers, timeout=20)
        data = r.json()
        approved_ats = [it.get("approved_at") for it in data if it.get("approved_at")]
        if len(approved_ats) >= 2:
            assert approved_ats == sorted(approved_ats, reverse=True), "not sorted DESC"


class TestRepostEndpoint:
    def test_repost_nonexistent_returns_404(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery/nonexistent-id-xyz/repost-facebook",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 404

    def test_repost_unauth_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/admin/gallery/whatever/repost-facebook", timeout=15)
        assert r.status_code in (401, 403)


class TestEndToEndApproveFlow:
    def test_full_flow(self, admin_headers):
        # 1) SUBMIT
        files = {"file": ("iter22.png", _png_bytes(), "image/png")}
        data = {"submitter_name": "TEST_Iter22Guest", "submitter_email": "iter22@example.com", "caption": "TEST_iter22_e2e"}
        r = requests.post(f"{BASE_URL}/api/gallery/submit", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        sub = r.json()
        assert sub["status"] == "pending"
        sub_id = sub["id"]

        # 2) APPROVE
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery/{sub_id}/approve",
            headers=admin_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "approved"
        assert body["id"] == sub_id
        fb = body.get("facebook", {})
        assert fb.get("ok") is False, f"expected FB ok=false (scope-blocked): {fb}"
        err = (fb.get("error") or "").lower()
        assert ("pages_manage_posts" in err) or ("permission" in err) or ("scope" in err), (
            f"expected scope-related error, got: {fb.get('error')}"
        )

        # 3) Public /api/gallery includes the photo under guests
        r = requests.get(f"{BASE_URL}/api/gallery", timeout=20)
        assert r.status_code == 200
        gallery = r.json()
        # Response may be a dict {items: [...]} or a list — handle both.
        items = gallery.get("items") if isinstance(gallery, dict) else gallery
        assert isinstance(items, list)
        guests = [it for it in items if (it.get("category") == "guests")]
        # Find our submission (by id or url match)
        matched = [it for it in guests if sub_id in (it.get("url") or "") or it.get("id") == sub_id]
        assert matched, f"submission {sub_id} not found in public gallery guests: {len(guests)} guest items"

        # 4) Admin approved list includes it with facebook fields set
        r = requests.get(f"{BASE_URL}/api/admin/gallery/approved", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        approved_list = r.json()
        ours = next((x for x in approved_list if x["id"] == sub_id), None)
        assert ours, f"submission {sub_id} not in approved list"
        assert ours.get("facebook_posted") is False
        assert ours.get("facebook_attempted_at"), "facebook_attempted_at should be set"
        assert "pages_manage_posts" in (ours.get("facebook_error") or "").lower() or \
               "permission" in (ours.get("facebook_error") or "").lower()
        first_attempt_at = ours["facebook_attempted_at"]

        # 5) Sleep briefly then repost — attempted_at must update to newer value
        time.sleep(1.5)
        r = requests.post(
            f"{BASE_URL}/api/admin/gallery/{sub_id}/repost-facebook",
            headers=admin_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        rp = r.json()
        assert rp["id"] == sub_id
        rp_fb = rp.get("facebook", {})
        assert rp_fb.get("ok") is False
        # Verify updated timestamp via GET
        r = requests.get(f"{BASE_URL}/api/admin/gallery/approved", headers=admin_headers, timeout=20)
        after = next((x for x in r.json() if x["id"] == sub_id), None)
        assert after is not None
        second_attempt_at = after["facebook_attempted_at"]
        assert second_attempt_at > first_attempt_at, (
            f"attempted_at should be newer after repost: {first_attempt_at} -> {second_attempt_at}"
        )

        # Cleanup: reject to remove file (not strictly necessary but keeps DB tidy)
        # We leave it approved so subsequent test runs can inspect it if needed.
