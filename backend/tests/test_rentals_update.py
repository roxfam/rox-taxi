"""Tests for updated rental data (Compact Spark, Sedan Versa) and bookings still work."""
import os
import re
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bahamas-taxi-tours.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _get_rentals():
    r = requests.get(f"{API}/rentals", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    return data


def test_compact_spark_updated():
    rentals = _get_rentals()
    spark = next((x for x in rentals if x.get("id") == "spark-compact"), None)
    assert spark is not None, "spark-compact not found"
    assert "2019" in spark.get("name", "") and "Spark" in spark.get("name", ""), f"name={spark.get('name')}"
    assert spark.get("color", "").lower() == "white", f"color={spark.get('color')}"
    assert "1630019636119-6f3b65ce35dd" in spark.get("image_url", ""), f"image_url={spark.get('image_url')}"


def test_sedan_versa_renamed():
    rentals = _get_rentals()
    versa = next((x for x in rentals if x.get("id") == "versa-white"), None)
    assert versa is not None, "versa-white not found"
    assert "2021" in versa.get("name", "") and "Versa" in versa.get("name", "")
    assert versa.get("make") == "Nissan"
    assert versa.get("model") == "Versa"
    assert versa.get("year") == 2021
    assert versa.get("color", "").lower() == "white"
    assert "1557775209-f28ede453ae3" in versa.get("image_url", "")


def test_old_sentra_orange_removed():
    rentals = _get_rentals()
    ids = [x.get("id") for x in rentals]
    assert "sentra-orange" not in ids, f"sentra-orange still present: ids={ids}"


def test_image_urls_return_200_image_content():
    rentals = _get_rentals()
    spark = next(x for x in rentals if x.get("id") == "spark-compact")
    versa = next(x for x in rentals if x.get("id") == "versa-white")
    for url in [spark["image_url"], versa["image_url"]]:
        # HEAD first, fallback to GET
        r = requests.head(url, timeout=30, allow_redirects=True)
        if r.status_code != 200:
            r = requests.get(url, timeout=30, stream=True)
        assert r.status_code == 200, f"{url} => {r.status_code}"
        ctype = r.headers.get("Content-Type", "")
        assert ctype.startswith("image/"), f"{url} => content-type {ctype}"


def _create_booking(item_id):
    rentals = _get_rentals()
    rental = next(x for x in rentals if x.get("id") == item_id)
    price = rental.get("price_per_day") or rental.get("price") or rental.get("daily_rate")
    payload = {
        "service_type": "rental",
        "item_id": item_id,
        "customer_name": "TEST User",
        "customer_email": "test_rental@example.com",
        "customer_phone": "+12425551234",
        "booking_date": "2026-06-22",  # Monday, non-Saturday
        "pickup_time": "10:00",
        "days": 2,
        "notes": "TEST booking",
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=30)
    return r, price


def test_booking_spark_compact():
    r, price = _create_booking("spark-compact")
    assert r.status_code in (200, 201), f"status={r.status_code} body={r.text}"
    body = r.json()
    if price is not None:
        expected = price * 2 + 150
        total = body.get("total_price") or body.get("total") or body.get("amount")
        assert total == expected, f"expected total={expected}, got {total} (body={body})"


def test_booking_versa_white():
    r, price = _create_booking("versa-white")
    assert r.status_code in (200, 201), f"status={r.status_code} body={r.text}"
    body = r.json()
    if price is not None:
        expected = price * 2 + 150
        total = body.get("total_price") or body.get("total") or body.get("amount")
        assert total == expected, f"expected total={expected}, got {total} (body={body})"
