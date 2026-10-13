"""Gift-card redemption: validate (expiry), apply to a booking, restore on cancel."""
import asyncio
import html as _html
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter()
_db = None
_now_iso = None
_mark_paid = None
_require_admin = None


def configure(*, db, now_iso, mark_paid, require_admin=None):
    global _db, _now_iso, _mark_paid, _require_admin
    _db, _now_iso, _mark_paid, _require_admin = db, now_iso, mark_paid, require_admin


async def _admin_dep(request: Request, authorization: Optional[str] = Header(None),
                     x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token")):
    return await _require_admin(request, authorization, x_csrf_token)


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


EXPIRY_REMINDER_DAYS = 30

GIFT_THEMES = {
    "classic": {"kicker": "Toes in the Sandy Turquoise of Cable Beach, Nassau", "headline": "You've been <em>gifted</em> a Rox beach day.",
                "subject": "🌴 You've been gifted a Rox beach day", "grad": "#0B3B5C,#128C7E", "accent": "#F7E6C6",
                "cta": "Pick your beach day →", "cta_path": "/tours/cable-beach-day", "pdf_title": "You've been <i>gifted</i><br/>a Rox beach day."},
    "birthday": {"kicker": "Happy Birthday from The Bahamas", "headline": "Happy <em>birthday</em>! Your island treat is here.",
                 "subject": "🎂 Happy birthday! A Rox gift card for you", "grad": "#E86A3C,#D4A94A", "accent": "#FFF1C9",
                 "cta": "Plan your birthday treat →", "cta_path": "/tours", "pdf_title": "Happy <i>birthday</i>!<br/>Your island treat."},
    "honeymoon": {"kicker": "Congratulations to the newlyweds", "headline": "For your <em>honeymoon</em> in paradise.",
                  "subject": "💍 A honeymoon gift for your Bahamas trip", "grad": "#7A2E4D,#E8A0A8", "accent": "#FFE3E8",
                  "cta": "Plan your romantic day →", "cta_path": "/tours", "pdf_title": "For your <i>honeymoon</i><br/>in paradise."},
    "thank_you": {"kicker": "With gratitude", "headline": "<em>Thank you</em>, enjoy a little island magic.",
                  "subject": "🙏 A thank-you gift: Rox gift card inside", "grad": "#0B3B5C,#3C6E91", "accent": "#D4E8F7",
                  "cta": "Choose your ride or tour →", "cta_path": "/tours", "pdf_title": "<i>Thank you</i>.<br/>Enjoy some island magic."},
    "anniversary": {"kicker": "Happy Anniversary", "headline": "Celebrate your <em>love</em> in paradise.",
                    "subject": "❤️ Happy anniversary! A Rox gift card for you", "grad": "#8B1E3F,#D4A94A", "accent": "#FFE0B8",
                    "cta": "Plan your anniversary day →", "cta_path": "/tours", "pdf_title": "Celebrate your <i>love</i><br/>in paradise."},
    "wedding": {"kicker": "Congratulations on your wedding", "headline": "Here's to <em>forever</em>, island style.",
                "subject": "👰 A wedding gift for your Bahamas celebration", "grad": "#5B6B8C,#E8D5B0", "accent": "#FFF6E0",
                "cta": "Plan your celebration →", "cta_path": "/groups", "pdf_title": "Here's to <i>forever</i>,<br/>island style."},
    "graduation": {"kicker": "Congratulations, graduate", "headline": "You <em>did it</em>! Time to celebrate.",
                   "subject": "🎓 Congrats, grad! A Rox gift card for you", "grad": "#1E3A8A,#D4A94A", "accent": "#FDE68A",
                   "cta": "Pick your celebration →", "cta_path": "/tours", "pdf_title": "You <i>did it</i>!<br/>Time to celebrate."},
    "holiday": {"kicker": "Season's Greetings from The Bahamas", "headline": "A <em>holiday</em> gift in the sunshine.",
                "subject": "🎄 Happy holidays! A Rox gift card for you", "grad": "#14532D,#B91C1C", "accent": "#FDE68A",
                "cta": "Plan your island holiday →", "cta_path": "/tours", "pdf_title": "A <i>holiday</i> gift<br/>in the sunshine."},
    "mothers_day": {"kicker": "Happy Mother's Day", "headline": "For the <em>best mom</em>, a day in paradise.",
                    "subject": "🌸 Happy Mother's Day! A Rox gift card for you", "grad": "#BE185D,#F9A8D4", "accent": "#FFF1F7",
                    "cta": "Plan her perfect day →", "cta_path": "/tours/cable-beach-day", "pdf_title": "For the <i>best mom</i>,<br/>a day in paradise."},
    "just_because": {"kicker": "A little something for you", "headline": "<em>Just because</em> you deserve it.",
                     "subject": "🌺 A surprise Rox gift card, just because", "grad": "#0E7490,#5EEAD4", "accent": "#CCFBF1",
                     "cta": "Treat yourself →", "cta_path": "/tours", "pdf_title": "<i>Just because</i><br/>you deserve it."},
}


def gift_theme(gc: dict) -> dict:
    return GIFT_THEMES.get(gc.get("theme") or "classic", GIFT_THEMES["classic"])


def _expiry_email(gc: dict) -> tuple:
    from routes.payment_digest import _site_url  # noqa: PLC0415
    name = _html.escape((gc.get("recipient_name") or "").split(" ")[0] or "there")
    bal = float(gc.get("balance") or 0)
    when = expiry_label(gc).replace("Valid until ", "")
    url = f"{_site_url()}/tours"
    subject = f"Your ${bal:.0f} Rox gift card expires {when}"
    html = f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0F172A">
  <div style="background:#0B3B5C;color:#fff;padding:24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:22px">Don't let your gift card expire</h1>
  </div>
  <div style="border:1px solid #E2E8F0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
    <p>Hi {name},</p>
    <p>Your Rox gift card still has <b>${bal:.2f}</b> left and expires on <b>{when}</b>.</p>
    <p style="font-family:Menlo,monospace;font-size:20px;letter-spacing:2px;background:#FBF7EF;padding:12px;text-align:center;border-radius:8px">{_html.escape(gc['code'])}</p>
    <p>Use it on any taxi, tour, car rental, Cable Beach day or group booking. Just enter the code at checkout.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="{url}" style="background:#E86A3C;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:bold">Book Now</a>
    </p>
    <p style="color:#64748B;font-size:12px">Gift cards are non-refundable and can't be used after the expiry date.</p>
  </div>
</div>"""
    text = f"Your Rox gift card {gc['code']} has ${bal:.2f} left and expires {when}. Book now: {url}"
    return subject, html, text


async def run_expiry_reminders() -> int:
    """Email holders of active cards with balance that expire within 30 days. Once per card."""
    from notifications import send_email  # noqa: PLC0415
    now = datetime.now(timezone.utc)
    q = {"status": "active", "balance": {"$gt": 0}, "expiry_reminder_sent_at": {"$exists": False},
         "expires_at": {"$gt": now.isoformat(), "$lte": (now + timedelta(days=EXPIRY_REMINDER_DAYS)).isoformat()}}
    sent = 0
    async for gc in _db.gift_cards.find(q).limit(50):
        to = gc.get("recipient_email") or gc.get("buyer_email")
        if not to:
            continue
        claim = await _db.gift_cards.update_one(
            {"code": gc["code"], "expiry_reminder_sent_at": {"$exists": False}},
            {"$set": {"expiry_reminder_sent_at": _now_iso()}})
        if not claim.modified_count:
            continue
        subject, html, text = _expiry_email(gc)
        try:
            res = await asyncio.to_thread(send_email, to, subject, html, text, "info")
            ok = bool((res or {}).get("sent"))
        except Exception as e:  # noqa: BLE001
            logging.warning("gift expiry email err: %s", e)
            ok = False
        await _db.gift_cards.update_one({"code": gc["code"]}, {"$set": {"expiry_reminder_ok": ok}})
        sent += int(ok)
    return sent


async def expiry_reminder_loop() -> None:
    while True:
        try:
            await run_expiry_reminders()
        except Exception as e:  # noqa: BLE001
            logging.warning("gift expiry tick err: %s", e)
        await asyncio.sleep(3600)


@router.get("/admin/gift-cards/report")
async def gift_card_report(_admin=Depends(_admin_dep)):
    now = datetime.now(timezone.utc)
    soon = (now + timedelta(days=EXPIRY_REMINDER_DAYS)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()
    sold = await _db.gift_cards.find({"status": {"$in": ["active", "used"]}}, {"_id": 0}).to_list(5000)
    redeemed = sum(sum(float(r.get("amount") or 0) for r in (g.get("redemptions") or [])) for g in sold)
    live = [g for g in sold if not is_expired(g)]
    expired = [g for g in sold if is_expired(g)]
    expiring = sorted(
        [g for g in live if g.get("expires_at") and g["expires_at"] <= soon and float(g.get("balance") or 0) > 0],
        key=lambda g: g["expires_at"])
    paid = [g for g in sold if g.get("source") != "photo_reward"]
    return {
        "sold_count": len(paid),
        "sold_value": round(sum(float(g.get("amount") or 0) for g in paid), 2),
        "sold_30d_count": sum(1 for g in paid if (g.get("created_at") or "") >= month_ago),
        "sold_30d_value": round(sum(float(g.get("amount") or 0) for g in paid if (g.get("created_at") or "") >= month_ago), 2),
        "rewards_issued": len(sold) - len(paid),
        "redeemed_value": round(redeemed, 2),
        "outstanding_balance": round(sum(float(g.get("balance") or 0) for g in live), 2),
        "expired_unused": round(sum(float(g.get("balance") or 0) for g in expired), 2),
        "expiring_soon": [{"code": g["code"], "balance": g.get("balance"), "expires_at": g["expires_at"],
                           "recipient_email": g.get("recipient_email"),
                           "reminded": bool(g.get("expiry_reminder_sent_at"))} for g in expiring[:50]],
        "recent": [{"code": g["code"], "amount": g.get("amount"), "balance": g.get("balance"),
                    "recipient_email": g.get("recipient_email"), "recipient_phone": g.get("recipient_phone"),
                    "theme": g.get("theme") or "classic", "scheduled_send_at": g.get("scheduled_send_at"),
                    "delivered_at": g.get("delivered_at"), "resent_at": g.get("resent_at")}
                   for g in sorted(sold, key=lambda g: g.get("created_at") or "", reverse=True)[:25]],
    }


@router.post("/admin/gift-cards/{code}/resend")
async def resend_gift_card(code: str, _admin=Depends(_admin_dep)):
    gc = await _db.gift_cards.find_one({"code": code.upper().strip()})
    if not gc:
        raise HTTPException(404, "Gift card not found")
    if gc.get("status") != "active":
        raise HTTPException(400, "Only paid (active) gift cards can be resent")
    from server import _send_gift_voucher_email  # noqa: PLC0415
    rep = await _send_gift_voucher_email(gc)
    upd = {"resent_at": _now_iso(), "last_resend_report": rep}
    if not gc.get("delivered_at") and rep.get("sent"):
        upd["delivered_at"] = _now_iso()
    await _db.gift_cards.update_one({"code": gc["code"]}, {"$set": upd})
    return {"sent": bool(rep.get("sent")), "sms": bool((rep.get("sms") or {}).get("sent")),
            "to": gc.get("recipient_email"), "error": rep.get("error")}


PHOTO_REWARD_USD = 5.0


async def issue_photo_reward(sub: dict) -> Optional[str]:
    """$5 thank-you gift card the first time a guest's photo is approved (one per email)."""
    email = (sub.get("submitter_email") or "").lower().strip()
    if not email:
        return None
    if await _db.gift_cards.find_one({"source": "photo_reward", "recipient_email": email}, {"_id": 1}):
        return None
    from server import _new_gift_code, _send_gift_voucher_email  # noqa: PLC0415
    now = datetime.now(timezone.utc)
    gc = {
        "code": _new_gift_code(), "amount": PHOTO_REWARD_USD, "balance": PHOTO_REWARD_USD, "status": "active",
        "source": "photo_reward", "submission_id": sub.get("id"), "theme": "thank_you",
        "buyer_name": "Rox Taxi & Tours", "buyer_email": "",
        "recipient_name": sub.get("submitter_name") or "", "recipient_email": email,
        "message": "Thank you for sharing your Bahamas photo with us! Here's a little something toward your next ride.",
        "created_at": now.isoformat(), "expires_at": (now + timedelta(days=365)).isoformat(),
        "non_refundable": True, "redemptions": [],
    }
    await _db.gift_cards.insert_one(dict(gc))
    try:
        rep = await _send_gift_voucher_email(gc)
        await _db.gift_cards.update_one({"code": gc["code"]}, {"$set": {"delivered_at": _now_iso() if rep.get("sent") else None}})
    except Exception as e:  # noqa: BLE001
        logging.warning("photo reward email err: %s", e)
    return gc["code"]


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
