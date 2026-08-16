"""Post-trip tip top-up flow.

Cron fires 15 min after `status=completed` → sends SMS with a signed link.
Guest lands on `/tip-topup?id=X&t=Y`, hits POST to add a tip amount.
No new payment infra — the additional tip is treated as a "pledge" that
the admin/driver reconciles on their side (cash / Venmo / Zelle).
Admin gets a real-time SMS whenever a top-up is submitted.
"""
import hmac
import hashlib
import os
from datetime import datetime, timezone, timedelta
from typing import Callable, Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel, Field


# ---- shared state populated by server.py -----------------------------------
_db = None
_now_iso: Callable = lambda: datetime.now(timezone.utc).isoformat()
_public_base_url: str = "https://roxtaxi.com"


def configure(*, db, now_iso, public_base_url: Optional[str] = None):
    global _db, _now_iso, _public_base_url
    _db = db
    _now_iso = now_iso
    if public_base_url:
        _public_base_url = public_base_url.rstrip("/")


router = APIRouter()


# ── Tokens ──────────────────────────────────────────────────────────────────
def _tip_token(booking_id: str) -> str:
    """Deterministic 16-char HMAC token so the SMS link is unforgeable
    but no session/DB lookup is needed to verify. Rotating the secret
    invalidates every outstanding link."""
    secret = (
        os.environ.get("BOOKING_LINK_SECRET")
        or os.environ.get("WEBHOOK_CRON_SECRET")
        or "rox-tip-fallback"
    ).strip()
    return hmac.new(
        secret.encode("utf-8"),
        f"tip-topup:{booking_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:16]


def _verify_tip_token(booking_id: str, token: str) -> bool:
    return bool(token) and hmac.compare_digest(_tip_token(booking_id), token.strip())


# ── Public endpoints ────────────────────────────────────────────────────────
class TipTopupSubmit(BaseModel):
    amount: float = Field(..., ge=1, le=500)
    method: Optional[str] = Field(default="cash", max_length=20)  # cash|zelle|venmo|card|paypal
    note: Optional[str] = Field(default=None, max_length=200)


@router.get("/bookings/{booking_id}/tip-topup-info")
async def tip_topup_info(booking_id: str, t: str):
    if _db is None:
        raise HTTPException(500, "DB not configured")
    if not _verify_tip_token(booking_id, t):
        raise HTTPException(401, "Invalid link")
    b = await _db.bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Booking not found")
    return {
        "id": b["id"],
        "customer_name": b.get("customer_name", ""),
        "item_name": b.get("item_name", ""),
        "booking_date": b.get("booking_date", ""),
        "current_tip": round(float(b.get("tip_amount") or 0), 2),
        "current_topup": round(float(b.get("tip_topup_pledged") or 0), 2),
        "driver_name": b.get("driver_name") or b.get("assigned_driver") or "",
        "status": b.get("status"),
    }


@router.post("/bookings/{booking_id}/tip-topup")
async def tip_topup_submit(booking_id: str, t: str, req: TipTopupSubmit):
    if _db is None:
        raise HTTPException(500, "DB not configured")
    if not _verify_tip_token(booking_id, t):
        raise HTTPException(401, "Invalid link")
    b = await _db.bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Booking not found")
    new_total = round(float(b.get("tip_topup_pledged") or 0) + float(req.amount), 2)
    if new_total > 500:
        raise HTTPException(400, "Total top-up cannot exceed $500")
    await _db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "tip_topup_pledged": new_total,
            "tip_topup_method": (req.method or "cash").lower(),
            "tip_topup_note": (req.note or "").strip(),
            "tip_topup_submitted_at": _now_iso(),
        }},
    )
    # Fire-and-forget admin SMS so the owner + driver know a top-up
    # landed. Errors swallowed — pledge succeeds regardless.
    try:
        from notifications import send_sms  # local import: server-side only
        admin_sms = (
            os.environ.get("ADMIN_SMS_TO")
            or os.environ.get("ADMIN_PHONE")
            or ""
        ).strip()
        if admin_sms:
            send_sms(
                admin_sms,
                f"Rox tip top-up: {b.get('customer_name','Guest')} pledged +${req.amount:.2f} ({req.method or 'cash'}) on booking {booking_id}. Pledged total: ${new_total:.2f}",
            )
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "pledged_total": new_total}


# ── Cron ────────────────────────────────────────────────────────────────────
async def _send_tip_bump_bg() -> None:
    """Background worker — finds bookings where:
      • status == "completed"
      • service_type in taxi/tour (rentals have no driver)
      • completed_at is between 15 minutes and 24 hours ago
      • tip_bump_sms_sent_at is not set (idempotent)
      • customer_phone is present
    …and sends the SMS with a signed link.
    """
    if _db is None:
        return
    try:
        from notifications import send_sms  # local: only when actually sending
    except Exception:  # noqa: BLE001
        return
    now = datetime.now(timezone.utc)
    cutoff_max = (now - timedelta(minutes=15)).isoformat()
    cutoff_min = (now - timedelta(hours=24)).isoformat()
    query = {
        "status": "completed",
        "service_type": {"$in": ["taxi", "tour"]},
        "customer_phone": {"$exists": True, "$nin": [None, ""]},
        "completed_at": {"$gte": cutoff_min, "$lte": cutoff_max},
        "tip_bump_sms_sent_at": {"$exists": False},
    }
    async for b in _db.bookings.find(query).limit(50):
        try:
            bid = b["id"]
            token = _tip_token(bid)
            link = f"{_public_base_url}/tip-topup?id={bid}&t={token}"
            driver = b.get("driver_name") or b.get("assigned_driver") or "your driver"
            sms = (
                f"Rox Taxi: hope you loved your ride! If {driver} went above and beyond, "
                f"top up their tip in 30 seconds: {link}"
            )
            result = send_sms(b["customer_phone"], sms)
            await _db.bookings.update_one(
                {"id": bid},
                {"$set": {
                    "tip_bump_sms_sent_at": _now_iso(),
                    "tip_bump_sms_result": result if isinstance(result, dict) else {"ok": bool(result)},
                }},
            )
        except Exception as ex:  # noqa: BLE001
            try:
                await _db.bookings.update_one(
                    {"id": b.get("id")},
                    {"$set": {"tip_bump_sms_error": str(ex)[:200]}},
                )
            except Exception:  # noqa: BLE001
                pass


def _check_cron_auth(authorization: Optional[str]) -> None:
    secret = (os.environ.get("WEBHOOK_CRON_SECRET") or "").strip()
    if not secret:
        raise HTTPException(500, "Cron secret not configured on backend")
    presented = ""
    if authorization and authorization.startswith("Bearer "):
        presented = authorization[7:].strip()
    if not presented or not hmac.compare_digest(presented, secret):
        raise HTTPException(401, "Invalid cron auth")


@router.post("/cron/send-tip-bump-sms")
async def cron_send_tip_bump(
    background: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    x_webhook_id: Optional[str] = Header(None),
):
    _check_cron_auth(authorization)
    background.add_task(_send_tip_bump_bg)
    return {"accepted": True, "kind": "tip_bump_sms", "run_id": x_webhook_id}
