# Iteration 40: gallery adjust (enhance/rotate/revert), PATCH tour_id, reward-info, PayPal create-order
import io
import os
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "roxfam2509@gmail.com", "password": "admin123"}


def _jpeg(w=320, h=200, color=(90, 140, 200)):
    b = io.BytesIO()
    Image.new("RGB", (w, h), color).save(b, format="JPEG")
    b.seek(0)
    return b


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    if r.status_code != 200:
        pytest.skip("admin login failed")
    d = r.json()
    return d.get("token") or d.get("access_token")


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def sub(H):
    r = requests.post(f"{API}/gallery/submit", files={"file": ("t.jpg", _jpeg(), "image/jpeg")},
                      data={"submitter_name": "TEST_iter40", "caption": "TEST caption"}, timeout=30)
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    yield sid
    requests.delete(f"{API}/admin/gallery/{sid}", headers=H, timeout=20)


# Public reward info
def test_reward_info():
    r = requests.get(f"{API}/gallery/reward-info", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["enabled"], bool) and isinstance(d["amount"], float)


# Adjust auth
def test_adjust_requires_admin(sub):
    r = requests.post(f"{API}/admin/gallery/{sub}/adjust", json={"action": "enhance"}, timeout=20)
    assert r.status_code == 401


def test_adjust_invalid_action(sub, H):
    r = requests.post(f"{API}/admin/gallery/{sub}/adjust", json={"action": "blur"}, headers=H, timeout=20)
    assert r.status_code == 422


def test_adjust_unknown_id(H):
    r = requests.post(f"{API}/admin/gallery/nope000000/adjust", json={"action": "enhance"}, headers=H, timeout=20)
    assert r.status_code == 404


# Enhance -> rotate -> revert flow with file checks
def test_enhance_rotate_revert(sub, H):
    r = requests.post(f"{API}/admin/gallery/{sub}/adjust", json={"action": "enhance"}, headers=H, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["enhanced"] is True
    assert d["original_filename"] != d["filename"]
    assert "_id" not in d
    enh_url = d["url"]
    assert requests.get(f"{BASE_URL}{enh_url}", timeout=20).status_code == 200

    r = requests.post(f"{API}/admin/gallery/{sub}/adjust", json={"action": "rotate_right"}, headers=H, timeout=30)
    assert r.status_code == 200
    d2 = r.json()
    assert d2["enhanced"] is True
    img = Image.open(io.BytesIO(requests.get(f"{BASE_URL}{d2['url']}", timeout=20).content))
    assert img.size == (200, 320)
    # previous edited file removed
    assert requests.get(f"{BASE_URL}{enh_url}", timeout=20).status_code == 404

    r = requests.post(f"{API}/admin/gallery/{sub}/adjust", json={"action": "rotate_left"}, headers=H, timeout=30)
    assert r.status_code == 200
    img = Image.open(io.BytesIO(requests.get(f"{BASE_URL}{r.json()['url']}", timeout=20).content))
    assert img.size == (320, 200)

    r = requests.post(f"{API}/admin/gallery/{sub}/adjust", json={"action": "revert"}, headers=H, timeout=30)
    assert r.status_code == 200
    d3 = r.json()
    assert d3["filename"] == d3["original_filename"]
    assert d3["enhanced"] is False
    assert requests.get(f"{BASE_URL}{d3['url']}", timeout=20).status_code == 200


# PATCH tour_id tagging
def test_patch_tour_id(sub, H):
    r = requests.patch(f"{API}/admin/gallery/{sub}", json={"tour_id": "blue-lagoon"}, headers=H, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["tour_id"] == "blue-lagoon" and r.json()["tour_name"]
    r = requests.patch(f"{API}/admin/gallery/{sub}", json={"tour_id": "no-such-tour"}, headers=H, timeout=20)
    assert r.status_code == 404
    r = requests.patch(f"{API}/admin/gallery/{sub}", json={"tour_id": ""}, headers=H, timeout=20)
    assert r.status_code == 200 and r.json()["tour_id"] == ""
    r = requests.patch(f"{API}/admin/gallery/{sub}", json={"caption": "TEST edited", "tour_id": "blue-lagoon"}, headers=H, timeout=20)
    assert r.status_code == 200 and r.json()["caption"] == "TEST edited"
    pend = requests.get(f"{API}/admin/gallery/pending", headers=H, timeout=20).json()
    me = [p for p in pend if p["id"] == sub][0]
    assert me["tour_id"] == "blue-lagoon" and me["caption"] == "TEST edited"


def test_patch_requires_admin(sub):
    r = requests.patch(f"{API}/admin/gallery/{sub}", json={"tour_id": "blue-lagoon"}, timeout=20)
    assert r.status_code == 401


# Sample tagged photo exposes tour info publicly
def test_public_gallery_tagged_sample():
    d = requests.get(f"{API}/gallery", timeout=20).json()
    s = [p for p in d if p.get("id") == "00569f2ec997"]
    assert s and s[0]["trip_type"] == "tour" and s[0]["trip_id"] == "blue-lagoon"


# PayPal create-order (LIVE, called once, never followed)
def test_paypal_create_order_once(H):
    if not os.environ.get("RUN_LIVE_PAYPAL"):
        pytest.skip("LIVE PayPal: set RUN_LIVE_PAYPAL=1 to run (then delete the created payment_transactions row)")
    bid = "CB-6N6MRQ26"
    b = requests.get(f"{API}/bookings/{bid}", timeout=20)
    if b.status_code != 200 or b.json().get("payment_status") == "paid":
        pytest.skip("pending booking not available")
    r = requests.post(f"{API}/paypal/create-order", json={"booking_id": bid, "origin_url": BASE_URL}, timeout=40)
    assert r.status_code == 200, r.text
    d = r.json()
    print("PAYPAL_ORDER_ID", d["order_id"])
    assert d["approve_url"].startswith("https://www.paypal.com/checkoutnow")
    assert d["status"] in ("CREATED", "PAYER_ACTION_REQUIRED")


def test_paypal_create_order_missing_booking():
    r = requests.post(f"{API}/paypal/create-order", json={"booking_id": "CB-NOPE0000", "origin_url": BASE_URL}, timeout=20)
    assert r.status_code == 404


def test_paypal_capture_unknown_order():
    r = requests.post(f"{API}/paypal/capture-order/NOTANORDER123", timeout=20)
    assert r.status_code == 404
