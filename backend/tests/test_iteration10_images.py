"""Iteration 10 backend tests: catalog image manager endpoints + iter9 regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# 1x1 transparent PNG
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


# ---------- Auth guards ----------
class TestAuth:
    def test_get_requires_auth(self):
        assert requests.get(f"{API}/admin/images").status_code == 401

    def test_post_requires_auth(self):
        r = requests.post(f"{API}/admin/images", files={"file": ("a.png", PNG_BYTES, "image/png")})
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        assert requests.delete(f"{API}/admin/images/nope.png").status_code == 401


# ---------- Upload / list / get / delete ----------
class TestImagesCrud:
    uploaded_name = None

    def test_upload_png_ok(self, auth):
        r = requests.post(
            f"{API}/admin/images",
            headers=auth,
            files={"file": ("test image.png", PNG_BYTES, "image/png")},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["name"].startswith("cat-")
        assert j["url"] == f"/api/uploads/{j['name']}"
        assert j["size"] == len(PNG_BYTES)
        assert "content_type" in j
        TestImagesCrud.uploaded_name = j["name"]

    def test_upload_rejects_txt(self, auth):
        r = requests.post(
            f"{API}/admin/images",
            headers=auth,
            files={"file": ("bad.txt", b"hello", "text/plain")},
        )
        assert r.status_code == 400

    def test_upload_rejects_oversize(self, auth):
        # Test at the 8MB boundary by monkey — actually generate 8MB+1
        big = b"\x89PNG\r\n\x1a\n" + b"0" * (8 * 1024 * 1024)
        r = requests.post(
            f"{API}/admin/images",
            headers=auth,
            files={"file": ("big.png", big, "image/png")},
        )
        assert r.status_code == 400

    def test_list_images_newest_first(self, auth):
        r = requests.get(f"{API}/admin/images", headers=auth)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        assert TestImagesCrud.uploaded_name is not None
        names = [i["name"] for i in arr]
        assert TestImagesCrud.uploaded_name in names
        # Newest first: our upload should be at index 0
        assert arr[0]["name"] == TestImagesCrud.uploaded_name
        for it in arr:
            assert "name" in it and "url" in it and "size" in it and "modified_at" in it

    def test_serve_uploaded_file(self):
        name = TestImagesCrud.uploaded_name
        assert name
        r = requests.get(f"{API}/uploads/{name}")
        assert r.status_code == 200
        assert r.content == PNG_BYTES
        assert "image" in r.headers.get("content-type", "").lower()

    def test_delete_traversal_returns_404(self, auth):
        r = requests.delete(f"{API}/admin/images/{'..%2Fserver.py'}", headers=auth)
        assert r.status_code == 404

    def test_delete_nonexistent_returns_404(self, auth):
        r = requests.delete(f"{API}/admin/images/does-not-exist.png", headers=auth)
        assert r.status_code == 404

    def test_delete_ok(self, auth):
        name = TestImagesCrud.uploaded_name
        r = requests.delete(f"{API}/admin/images/{name}", headers=auth)
        assert r.status_code == 200
        assert r.json() == {"deleted": True, "name": name}
        # confirm gone
        r2 = requests.get(f"{API}/uploads/{name}")
        assert r2.status_code == 404


# ---------- Iteration 9 regression ----------
class TestRegression:
    def test_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@roxtaxi.com", "password": "admin123"})
        assert r.status_code == 200

    def test_bookings(self, auth):
        r = requests.get(f"{API}/admin/bookings", headers=auth)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats(self, auth):
        r = requests.get(f"{API}/admin/stats", headers=auth)
        assert r.status_code == 200

    def test_site_config_put(self, auth):
        r = requests.put(f"{API}/admin/site-config", headers=auth, json={"phone": "+1 (242) 555-0100"})
        assert r.status_code == 200
        assert r.json().get("phone") == "+1 (242) 555-0100"

    def test_catalog_list(self, auth):
        # Public catalog endpoints (fallback: /api/{kind})
        for path in ("tours", "taxi-services", "rentals"):
            r = requests.get(f"{API}/{path}")
            assert r.status_code == 200, f"{path}: {r.status_code}"
