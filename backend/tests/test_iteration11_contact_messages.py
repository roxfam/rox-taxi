"""Iteration 11 backend tests: POST /api/contact, admin contact-messages CRUD,
google_reviews_url in site-config, plus iter10 regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PNG_BYTES = bytes.fromhex(
    "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
    "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
)


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@roxtaxi.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Public POST /api/contact ---------------------------------------------
class TestContactPost:
    created_id = None

    def test_post_contact_ok(self):
        payload = {
            "name": "TEST_Alice",
            "email": "TEST_alice@example.com",
            "phone": "+12421234567",
            "subject": "TEST inquiry",
            "message": "Hello, this is a test message from iteration 11.",
        }
        r = requests.post(f"{API}/contact", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["id"].startswith("CT-"), j
        assert j["status"] == "new"
        assert j["name"] == "TEST_Alice"
        assert j["email"] == "TEST_alice@example.com"
        TestContactPost.created_id = j["id"]

    def test_post_contact_invalid_email(self):
        r = requests.post(f"{API}/contact", json={
            "name": "TEST_Bob", "email": "not-an-email", "message": "hi"
        })
        assert r.status_code == 422

    def test_post_contact_missing_message(self):
        r = requests.post(f"{API}/contact", json={
            "name": "TEST_Bob", "email": "bob@example.com"
        })
        assert r.status_code == 422


# ---- Admin: contact-messages endpoints ------------------------------------
class TestAdminContactMessages:
    def test_list_requires_auth(self):
        assert requests.get(f"{API}/admin/contact-messages").status_code == 401

    def test_patch_requires_auth(self):
        r = requests.patch(f"{API}/admin/contact-messages/CT-NONE/status", json={"status": "replied"})
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        assert requests.delete(f"{API}/admin/contact-messages/CT-NONE").status_code == 401

    def test_list_newest_first_contains_created(self, auth):
        r = requests.get(f"{API}/admin/contact-messages", headers=auth)
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        cid = TestContactPost.created_id
        assert cid, "No contact created earlier"
        ids = [d["id"] for d in arr]
        assert cid in ids
        # newest-first: created message should be at index 0 (we just created it)
        assert arr[0]["id"] == cid
        # ensure no mongo _id leak
        for d in arr[:5]:
            assert "_id" not in d

    def test_patch_status_replied(self, auth):
        cid = TestContactPost.created_id
        r = requests.patch(f"{API}/admin/contact-messages/{cid}/status", headers=auth,
                           json={"status": "replied"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "replied"

    def test_patch_invalid_status(self, auth):
        cid = TestContactPost.created_id
        r = requests.patch(f"{API}/admin/contact-messages/{cid}/status", headers=auth,
                           json={"status": "bogus"})
        assert r.status_code == 422

    def test_patch_unknown_id(self, auth):
        r = requests.patch(f"{API}/admin/contact-messages/CT-DOESNOTEXIST/status",
                           headers=auth, json={"status": "replied"})
        assert r.status_code == 404

    def test_delete_unknown_id(self, auth):
        r = requests.delete(f"{API}/admin/contact-messages/CT-DOESNOTEXIST", headers=auth)
        assert r.status_code == 404

    def test_delete_ok(self, auth):
        cid = TestContactPost.created_id
        r = requests.delete(f"{API}/admin/contact-messages/{cid}", headers=auth)
        assert r.status_code == 200
        j = r.json()
        assert j.get("deleted") is True
        # confirm gone
        r2 = requests.get(f"{API}/admin/contact-messages", headers=auth)
        assert cid not in [d["id"] for d in r2.json()]


# ---- Site config: google_reviews_url --------------------------------------
class TestSiteConfigGoogleReviews:
    def test_put_google_reviews_url(self, auth):
        url = "https://example.com/rox-google-reviews"
        r = requests.put(f"{API}/admin/site-config", headers=auth,
                         json={"google_reviews_url": url})
        assert r.status_code == 200, r.text
        assert r.json().get("google_reviews_url") == url
        # GET public site-config
        r2 = requests.get(f"{API}/site-config")
        assert r2.status_code == 200
        assert r2.json().get("google_reviews_url") == url


# ---- Iteration 10 regression ---------------------------------------------
class TestIter10Regression:
    uploaded_name = None

    def test_upload_png(self, auth):
        r = requests.post(f"{API}/admin/images", headers=auth,
                          files={"file": ("iter11.png", PNG_BYTES, "image/png")})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["name"].startswith("cat-")
        TestIter10Regression.uploaded_name = j["name"]

    def test_list_images(self, auth):
        r = requests.get(f"{API}/admin/images", headers=auth)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_serve_upload(self):
        n = TestIter10Regression.uploaded_name
        r = requests.get(f"{API}/uploads/{n}")
        assert r.status_code == 200
        assert r.content == PNG_BYTES

    def test_delete_image(self, auth):
        n = TestIter10Regression.uploaded_name
        r = requests.delete(f"{API}/admin/images/{n}", headers=auth)
        assert r.status_code == 200

    def test_catalog_public(self):
        for path in ("tours", "taxi-services", "rentals"):
            r = requests.get(f"{API}/{path}")
            assert r.status_code == 200, path
