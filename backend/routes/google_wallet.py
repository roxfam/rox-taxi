"""Google Wallet boarding pass — signed "Save to Google Wallet" link per booking."""
import json
import os
import time

import jwt
from fastapi import APIRouter, HTTPException

import secrets_store

router = APIRouter()
_db = None


def configure(*, db):
    global _db
    _db = db


def _creds():
    issuer = (secrets_store.get_secret("GOOGLE_WALLET_ISSUER_ID", "") or "").strip()
    raw = (secrets_store.get_secret("GOOGLE_WALLET_SERVICE_ACCOUNT_JSON", "") or "").strip()
    if not issuer or not raw:
        return None
    try:
        sa = json.loads(raw)
        return issuer, sa["client_email"], sa["private_key"]
    except (ValueError, KeyError):
        return None


def _site() -> str:
    return (secrets_store.get_secret("PUBLIC_SITE_URL", "") or os.environ.get("PUBLIC_SITE_URL", "") or "https://roxtaxi.com").rstrip("/")


def _txt(v: str) -> dict:
    return {"defaultValue": {"language": "en-US", "value": v}}


@router.get("/google-wallet/status")
async def google_wallet_status():
    return {"configured": _creds() is not None}


@router.get("/bookings/{booking_id}/google-wallet")
async def google_wallet_link(booking_id: str):
    creds = _creds()
    if not creds:
        raise HTTPException(503, "Google Wallet is not set up yet")
    issuer, sa_email, key = creds
    b = await _db.bookings.find_one({"id": booking_id.upper()})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") in ("cancelled",):
        raise HTTPException(400, "This booking was cancelled")
    from server import _booking_qr_token  # noqa: PLC0415
    site = _site()
    scan_url = f"{site}/driver/scan?b={b['id']}&t={_booking_qr_token(b['id'])}"
    class_id = f"{issuer}.rox_boarding_pass"
    when = f"{b.get('booking_date', '')} {b.get('booking_time') or ''}".strip()
    modules = [{"id": "w", "header": "When", "body": when or "See booking"}]
    if b.get("pickup_location"):
        modules.append({"id": "p", "header": "Pickup", "body": b["pickup_location"][:50]})
    if b.get("dropoff_location"):
        modules.append({"id": "d", "header": "Drop-off", "body": b["dropoff_location"][:50]})
    obj = {
        "id": f"{issuer}.{b['id'].replace('-', '_')}",
        "classId": class_id,
        "state": "ACTIVE",
        "cardTitle": _txt("Rox Taxi & Tours"),
        "header": _txt((b.get("item_name") or "Rox booking")[:40]),
        "textModulesData": modules,
        "barcode": {"type": "QR_CODE", "value": scan_url, "alternateText": b["id"]},
        "hexBackgroundColor": "#0B3B5C",
    }
    claims = {
        "iss": sa_email, "aud": "google", "typ": "savetowallet", "iat": int(time.time()),
        "origins": [site],
        "payload": {"genericClasses": [{"id": class_id}], "genericObjects": [obj]},
    }
    try:
        token = jwt.encode(claims, key, algorithm="RS256")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Google Wallet key is invalid: {type(e).__name__}") from e
    return {"save_url": f"https://pay.google.com/gp/v/save/{token}"}
