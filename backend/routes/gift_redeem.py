"""Gift-card redemption: validate (expiry), apply to a booking, restore on cancel."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()
_db = None
_now_iso = None
_mark_paid = None


def configure(*, db, now_iso, mark_paid):
    global _db, _now_iso, _mark_paid
    _db, _now_iso, _mark_paid = db, now_iso, mark_paid


def is_expired(gc: dict) -> bool:
    exp = gc.get("expires_at")
    if not exp:
        return False
    dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)) <= datetime.now(timezone.utc)


def expiry_label(gc: dict) -> str:
    exp = gc.get("expires_at")
    if not exp:
        return "Never expires"
    return "Valid until " + datetime.fromisoformat(str(exp).replace("Z", "+00:00")).strftime("%b %d, %Y")


async def validate(code: str) -> dict:
    gc = await _db.gift_cards.find_one({"code": (code or "").upper().strip()})
    if not gc:
        raise HTTPException(404, "Gift card not found")
    if gc.get("status") != "active":
        raise HTTPException(400, f"Gift card is not active (status: {gc.get('status')})")
    if is_expired(gc):
        raise HTTPException(400, "This gift card has expired")
    if float(gc.get("balance") or 0) <= 0:
        raise HTTPException(400, "Gift card has no remaining balance")
    return gc


async def redeem(code: str, booking_id: str, max_amount: float) -> float:
    """Atomically deduct up to max_amount; returns amount deducted."""
    gc = await validate(code)
    amt = round(min(float(gc["balance"]), max_amount), 2)
    if amt <= 0:
        return 0.0
    res = await _db.gift_cards.update_one(
        {"code": gc["code"], "status": "active", "balance": {"$gte": amt}},
        {"$inc": {"balance": -amt},
         "$push": {"redemptions": {"booking_id": booking_id, "amount": amt, "at": _now_iso()}}},
    )
    if not res.modified_count:
        raise HTTPException(409, "Gift card balance changed — please try again")
    return amt


async def restore_for_booking(booking: dict) -> float:
    """Return a cancelled booking's gift credit to the card (no cash refund). Idempotent."""
    amt = round(float(booking.get("gift_credit") or 0), 2)
    code = booking.get("gift_code")
    if amt <= 0 or not code:
        return 0.0
    claim = await _db.bookings.update_one(
        {"id": booking["id"], "gift_restored_at": {"$exists": False}},
        {"$set": {"gift_restored_at": _now_iso(), "gift_restored_amount": amt}},
    )
    if not claim.modified_count:
        return 0.0
    await _db.gift_cards.update_one(
        {"code": code},
        {"$inc": {"balance": amt},
         "$push": {"redemptions": {"booking_id": booking["id"], "amount": -amt, "at": _now_iso(), "note": "restored on cancel"}}},
    )
    return amt


async def settle_if_zero(booking_id: str) -> bool:
    """Gift covered the whole total → confirm without card payment."""
    b = await _db.bookings.find_one({"id": booking_id}, {"total": 1, "payment_status": 1})
    if b and float(b.get("total") or 0) <= 0.001 and b.get("payment_status") != "paid":
        await _db.bookings.update_one({"id": booking_id}, {"$set": {"payment_method": "gift_card", "deposit_amount": 0}})
        await _mark_paid(f"gift_{booking_id}", booking_id)
        return True
    return False


class ApplyGiftRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=32)


@router.post("/bookings/{booking_id}/apply-gift")
async def apply_gift(booking_id: str, req: ApplyGiftRequest):
    b = await _db.bookings.find_one({"id": booking_id.upper()}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b.get("status") == "cancelled" or b.get("payment_status") == "paid":
        raise HTTPException(400, "This booking can no longer take a gift card")
    if b.get("gift_code") and b.get("gift_code") != req.code.upper().strip():
        raise HTTPException(400, "A gift card is already applied to this booking")
    total = round(float(b.get("total") or b.get("total_price") or 0), 2)
    if total <= 0:
        raise HTTPException(400, "Nothing left to pay on this booking")
    amt = await redeem(req.code, b["id"], total)
    new_total = round(total - amt, 2)
    upd = {"gift_code": req.code.upper().strip(), "gift_credit": round(float(b.get("gift_credit") or 0) + amt, 2),
           "total": new_total, "updated_at": _now_iso()}
    if b.get("balance_due"):
        upd["balance_due"] = round(max(0.0, float(b["balance_due"]) - amt), 2)
    await _db.bookings.update_one({"id": b["id"]}, {"$set": upd})
    paid = await settle_if_zero(b["id"])
    try:
        if paid:
            from notifications import notify_owner_activity  # noqa: PLC0415
            notify_owner_activity("gift_card", f"🎁 Booking {b['id']} fully paid by gift card (${amt:.2f})")
    except Exception as e:  # noqa: BLE001
        logging.warning("gift owner notify err: %s", e)
    fresh = await _db.bookings.find_one({"id": b["id"]}, {"_id": 0})
    return {"applied": amt, "total": new_total, "paid": paid, "booking": fresh}


async def apply_on_create(booking: dict, code: Optional[str], computed_total: float) -> float:
    """Used by create flows before insert: deducts and stamps booking fields."""
    if not code:
        return 0.0
    amt = await redeem(code, booking["id"], computed_total)
    booking["gift_code"] = code.upper().strip()
    booking["gift_credit"] = amt
    return amt
