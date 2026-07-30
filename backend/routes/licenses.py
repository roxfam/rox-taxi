"""Licenses router — driver-license upload, admin review, guest wallet.

Endpoints:
    GET    /bookings/{id}/license/status             — public: pending/approved/rejected
    POST   /bookings/{id}/license                    — public: upload front/back/selfie
    GET    /bookings/{id}/wallet-license-preview     — public: does guest have saved license?
    POST   /bookings/{id}/reuse-wallet-license       — public: apply saved license to booking
    GET    /admin/licenses/quick-approve/{id}        — HTML one-tap approve from SMS/email
    GET    /my/license-wallet                        — customer: their saved wallet
    POST   /my/license-wallet/rotate                 — customer: upload fresh license
    DELETE /my/license-wallet                        — customer: clear wallet
    GET    /admin/licenses                           — admin: review queue
    POST   /admin/bookings/{id}/license/approve      — admin: approve
    POST   /admin/bookings/{id}/license/reject       — admin: reject + notify guest
    PATCH  /admin/bookings/{id}/license/fields       — admin: fix OCR fields

Wired up by server.py via `configure()` + `include_router()`. All helpers
(_get_booking_by_token, _save_wallet_license, _lookup_wallet_license,
_save_license_image, _license_action_page, _run_license_ai, etc.) are passed
in from server.py so this module stays free of circular imports.
"""
import logging
import os
import secrets as _secrets_lib
import uuid
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field


_log = logging.getLogger("rox.licenses")

# --- injected via configure() at app startup ---
_db = None
_now_iso: Callable = lambda: ""
_clean: Callable = lambda x: x
_require_admin: Callable = lambda: None
_get_current_user: Callable = lambda: None
_get_booking_by_token: Callable = None
_save_wallet_license: Callable = None
_lookup_wallet_license: Callable = None
_approved_rental_count: Callable = None
_is_trusted_traveller: Callable = None
_save_license_image: Callable = None
_run_license_ai: Callable = None
_license_action_page: Callable = None
_license_upload_link: Callable = None
_license_expires_before_pickup: Callable = None
_parse_iso_dt: Callable = None
_send_admin_push: Callable = None
_secrets_store = None
_admin_email: str = ""
_whatsapp_number: str = ""


def configure(**kw):
    """Called once at app startup with all shared dependencies."""
    g = globals()
    for k, v in kw.items():
        g["_" + k] = v


router = APIRouter()


# Late-binding Depends wrappers — call the current global refs at REQUEST
# time. Naive Depends(_require_admin) / Depends(_get_current_user) capture
# the initial `lambda: None` at module-load time and bypass auth.
def _require_admin_dep(authorization: Optional[str] = Header(None)):
    return _require_admin(authorization) if callable(_require_admin) else None


async def _current_user_dep(request):
    if _get_current_user is None or _get_current_user is (lambda: None):
        return None
    return await _get_current_user(request)


def _require():
    return Depends(_require_admin_dep)


def _current_user():
    return Depends(_current_user_dep)


# ─── Public: license status + upload ─────────────────────────────────


@router.get("/bookings/{booking_id}/license/status")
async def license_status(booking_id: str, t: str):
    b = await _get_booking_by_token(booking_id, t)
    lic = b.get("license") or {}
    return {
        "booking_id": b["id"],
        "customer_name": b.get("customer_name"),
        "item_name": b.get("item_name"),
        "booking_date": b.get("booking_date"),
        "has_license": bool(lic.get("front_url") or lic.get("back_url") or lic.get("selfie_url")),
        "status": lic.get("status") or "not_uploaded",
        "rejection_reason": lic.get("rejection_reason"),
        "uploaded_at": lic.get("uploaded_at"),
        "reviewed_at": lic.get("reviewed_at"),
        "expiry_date": lic.get("expiry_date"),
        "license_number": lic.get("license_number"),
        "name_on_license": lic.get("name_on_license"),
    }


@router.post("/bookings/{booking_id}/license")
async def upload_license(
    booking_id: str,
    t: str = Form(...),
    front: Optional[UploadFile] = File(None),
    back: Optional[UploadFile] = File(None),
    selfie: Optional[UploadFile] = File(None),
    name_on_license: str = Form(""),
    license_number: str = Form(""),
    expiry_date: str = Form(""),
):
    b = await _get_booking_by_token(booking_id, t)
    if not (front or back or selfie):
        raise HTTPException(400, "Upload at least one photo (front, back, or selfie).")

    lic = dict(b.get("license") or {})
    for side, f in (("front", front), ("back", back), ("selfie", selfie)):
        if not f:
            continue
        if not (f.content_type or "").startswith("image/"):
            raise HTTPException(400, f"{side.title()} must be an image file")
        contents = await f.read()
        if len(contents) > 8 * 1024 * 1024:
            raise HTTPException(400, f"{side.title()} image too large (max 8MB)")
        lic[f"{side}_url"] = _save_license_image(booking_id, side, f, contents)

    lic["status"] = "pending"
    lic["uploaded_at"] = _now_iso()
    lic["name_on_license"] = (name_on_license or "").strip()[:80]
    lic["license_number"] = (license_number or "").strip()[:40]
    lic["expiry_date"] = (expiry_date or "").strip()[:20]
    lic.pop("rejection_reason", None)

    admin_approve_token = b.get("admin_approve_token") or _secrets_lib.token_urlsafe(16)

    await _db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"license": lic, "admin_approve_token": admin_approve_token, "updated_at": _now_iso()}},
    )

    try:
        from notifications import send_email as _send_email, send_sms as _send_sms
        base = (_secrets_store.get_secret("PUBLIC_SITE_URL", "") or os.environ.get("PUBLIC_SITE_URL", "") or "https://roxtaxi.com").rstrip("/")
        review_url = f"{base}/admin/manage?tab=licenses"
        approve_url = f"{base}/api/admin/licenses/quick-approve/{booking_id}?token={admin_approve_token}"
        summary = (
            f"Driver's license pending review.\n\n"
            f"Booking : {b['id']}\n"
            f"Guest   : {b.get('customer_name','')} <{b.get('customer_email','')}>\n"
            f"Phone   : {b.get('customer_phone','')}\n"
            f"Vehicle : {b.get('item_name','')}\n"
            f"Pickup  : {b.get('booking_date','')}\n"
            f"Review  : {review_url}\n"
            f"One-tap approve: {approve_url}"
        )
        html = (
            f"<p><strong>Driver's license pending review.</strong></p>"
            f"<pre style='background:#f8f5ee;padding:12px;border-radius:8px;'>{summary}</pre>"
            f"<p style='margin-top:16px;'>"
            f"<a href='{approve_url}' style='display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;margin-right:8px;'>One-tap approve →</a>"
            f"<a href='{review_url}' style='display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;'>Open admin review</a>"
            f"</p>"
        )
        if _admin_email:
            _send_email(_admin_email, f"Driver's license pending review · {b['id']}", html, summary, category="info")
        admin_sms_number = (_secrets_store.get_secret("ADMIN_SMS_NUMBER") or _whatsapp_number or "").strip()
        if admin_sms_number:
            _send_sms(
                admin_sms_number,
                f"🪪 License uploaded · {b['id']} · {b.get('customer_name','')}\nApprove: {approve_url}\nReview: {review_url}",
            )
    except Exception as e:  # noqa: BLE001
        _log.warning("license admin notify err: %s", e)

    try:
        await _send_admin_push(
            title="Driver's license pending review",
            body=f"{b.get('customer_name','A guest')} uploaded their license for {b['id']}.",
            url="/admin/manage?tab=licenses",
            tag=f"license-{booking_id}",
        )
    except Exception:  # noqa: BLE001
        pass

    # Fire the AI OCR in the background — never blocks the upload response.
    try:
        import asyncio
        asyncio.create_task(_run_license_ai(booking_id, lic))
    except Exception as e:  # noqa: BLE001
        _log.warning("license ai schedule err: %s", e)

    return {"ok": True, "status": "pending", "message": "Thanks — we'll review your license and confirm within a few hours."}


@router.get("/admin/licenses/quick-approve/{booking_id}", response_class=HTMLResponse)
async def admin_quick_approve_license(booking_id: str, token: str = ""):
    b = await _db.bookings.find_one({"id": booking_id, "service_type": "rental"})
    if not b or not b.get("admin_approve_token") or b["admin_approve_token"] != token:
        return HTMLResponse(_license_action_page("Link invalid or expired", "This one-tap approve link has already been used or was tampered with. Open the admin panel to review manually.", danger=True), status_code=401)
    lic = b.get("license") or {}
    if not (lic.get("front_url") or lic.get("back_url") or lic.get("selfie_url")):
        return HTMLResponse(_license_action_page("Nothing uploaded yet", "This booking has no license images yet.", danger=True), status_code=404)
    if lic.get("status") == "approved":
        return HTMLResponse(_license_action_page("Already approved", f"Booking {booking_id} was already approved. No action taken."))
    ts = _now_iso()
    await _db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "license.status": "approved",
            "license.reviewed_at": ts,
            "license.reviewed_by": "sms-quick-approve",
            "license.rejection_reason": None,
        }, "$unset": {"admin_approve_token": ""}},
    )
    try:
        from notifications import send_email as _send_email
        if b.get("customer_email"):
            _send_email(
                b["customer_email"],
                f"Driver's license approved · Rox rental {booking_id}",
                f"<p>Hi {b.get('customer_name','')},</p><p>Your driver's license has been approved. You're all set for pickup on <b>{b.get('booking_date','')}</b>.</p><p>— Rox Taxi Service &amp; Tours</p>",
                f"Hi {b.get('customer_name','')}, your driver's license has been approved. — Rox",
                category="confirmation",
            )
    except Exception as e:  # noqa: BLE001
        _log.warning("quick-approve notify err: %s", e)
    try:
        fresh = await _db.bookings.find_one({"id": booking_id})
        if fresh:
            await _save_wallet_license(fresh)
    except Exception as e:  # noqa: BLE001
        _log.warning("wallet save err (quick approve): %s", e)
    return HTMLResponse(_license_action_page(
        f"License approved · {booking_id}",
        f"You approved {b.get('customer_name','the guest')}'s driver's license for {b.get('item_name','their rental')} on {b.get('booking_date','')}. A confirmation email has been sent.",
    ))


# ─── Wallet: preview & reuse for the currently-booking guest ────────


@router.get("/bookings/{booking_id}/wallet-license-preview")
async def wallet_license_preview(booking_id: str, t: str):
    b = await _get_booking_by_token(booking_id, t)
    email = b.get("customer_email", "")
    wallet = await _lookup_wallet_license(email)
    trusted = await _is_trusted_traveller(email)
    if not wallet:
        return {"has_wallet": False, "is_trusted": trusted, "approved_rentals": await _approved_rental_count(email)}
    return {
        "has_wallet": True,
        "is_trusted": trusted,
        "approved_rentals": await _approved_rental_count(email),
        "name_on_license": wallet.get("name_on_license", ""),
        "license_number_masked": (wallet.get("license_number", "")[:3] + "•••" + wallet.get("license_number", "")[-2:]) if wallet.get("license_number") else "",
        "expiry_date": wallet.get("expiry_date", ""),
        "state_or_country": wallet.get("state_or_country", ""),
        "approved_at": wallet.get("approved_at"),
    }


@router.post("/bookings/{booking_id}/reuse-wallet-license")
async def reuse_wallet_license(booking_id: str, t: str = Form(...)):
    b = await _get_booking_by_token(booking_id, t)
    wallet = await _lookup_wallet_license(b.get("customer_email", ""))
    if not wallet:
        raise HTTPException(404, "No saved license on file.")
    lic = {
        "front_url": wallet.get("front_url"),
        "back_url": wallet.get("back_url"),
        "selfie_url": wallet.get("selfie_url"),
        "name_on_license": wallet.get("name_on_license", ""),
        "license_number": wallet.get("license_number", ""),
        "expiry_date": wallet.get("expiry_date", ""),
        "status": "pending",
        "uploaded_at": _now_iso(),
        "from_wallet": True,
    }
    admin_approve_token = b.get("admin_approve_token") or _secrets_lib.token_urlsafe(16)
    await _db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"license": lic, "admin_approve_token": admin_approve_token, "updated_at": _now_iso()}},
    )
    try:
        from notifications import send_email as _send_email, send_sms as _send_sms
        base = (_secrets_store.get_secret("PUBLIC_SITE_URL", "") or os.environ.get("PUBLIC_SITE_URL", "") or "https://roxtaxi.com").rstrip("/")
        approve_url = f"{base}/api/admin/licenses/quick-approve/{booking_id}?token={admin_approve_token}"
        review_url = f"{base}/admin/manage?tab=licenses"
        summary = f"Returning guest reused saved license.\nBooking : {b['id']}\nGuest   : {b.get('customer_name','')}\nApprove : {approve_url}"
        if _admin_email:
            _send_email(_admin_email, f"Wallet license reused · {b['id']}", f"<pre>{summary}</pre>", summary, category="info")
        admin_sms = (_secrets_store.get_secret("ADMIN_SMS_NUMBER") or _whatsapp_number or "").strip()
        if admin_sms:
            _send_sms(admin_sms, f"♻ Wallet license reused · {b['id']} · {b.get('customer_name','')}\nApprove: {approve_url}")
    except Exception as e:  # noqa: BLE001
        _log.warning("wallet reuse notify err: %s", e)
    return {"ok": True, "status": "pending", "from_wallet": True}


# ─── Admin: field editor + review queue + approve/reject ─────────────


class LicenseFieldsPatch(BaseModel):
    name_on_license: Optional[str] = Field(None, max_length=80)
    license_number: Optional[str] = Field(None, max_length=40)
    expiry_date: Optional[str] = Field(None, max_length=20)
    state_or_country: Optional[str] = Field(None, max_length=60)


class LicenseReview(BaseModel):
    reason: Optional[str] = Field(None, max_length=280)


@router.patch("/admin/bookings/{booking_id}/license/fields")
async def admin_edit_license_fields(booking_id: str, patch: LicenseFieldsPatch, _admin: str = _require()):
    """Admin inline-edit of the OCR/guest-entered fields (fixes wrong OCR)."""
    b = await _db.bookings.find_one({"id": booking_id, "service_type": "rental"})
    if not b or not b.get("license"):
        raise HTTPException(404, "License not on this booking")
    clean_patch: Dict[str, Any] = {}
    for f in ("name_on_license", "license_number", "expiry_date", "state_or_country"):
        v = getattr(patch, f, None)
        if v is not None:
            clean_patch[f"license.{f}"] = str(v).strip()
    if not clean_patch:
        return {"ok": True, "noop": True}
    clean_patch["license.edited_at"] = _now_iso()
    await _db.bookings.update_one({"id": booking_id}, {"$set": clean_patch})
    fresh = await _db.bookings.find_one({"id": booking_id})
    return {"ok": True, "license": (fresh or {}).get("license", {})}


@router.get("/admin/licenses")
async def admin_list_licenses(status: Optional[str] = None, _admin: str = _require()):
    query: Dict[str, Any] = {"service_type": "rental"}
    if status in {"pending", "approved", "rejected"}:
        query["license.status"] = status
    elif status == "not_uploaded":
        query["$or"] = [{"license": {"$exists": False}}, {"license.status": {"$exists": False}}]
    docs = await _db.bookings.find(query).sort("created_at", -1).to_list(300)
    out = []
    for d in docs:
        c = _clean(d)
        c["license_expires_before_pickup"] = _license_expires_before_pickup(d)
        out.append(c)
    return out


@router.post("/admin/bookings/{booking_id}/license/approve")
async def admin_approve_license(booking_id: str, admin_email: str = _require()):
    b = await _db.bookings.find_one({"id": booking_id, "service_type": "rental"})
    lic = (b or {}).get("license") or {}
    if not b or (not lic.get("front_url") and not lic.get("back_url") and not lic.get("selfie_url")):
        raise HTTPException(404, "License not uploaded for this booking")
    ts = _now_iso()
    await _db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "license.status": "approved",
            "license.reviewed_at": ts,
            "license.reviewed_by": admin_email,
            "license.rejection_reason": None,
        }},
    )
    try:
        from notifications import send_email as _send_email
        if b.get("customer_email"):
            _send_email(
                b["customer_email"],
                f"Driver's license approved · Rox rental {booking_id}",
                f"<p>Hi {b.get('customer_name','')},</p><p>Your driver's license has been approved. You're all set for pickup on <b>{b.get('booking_date','')}</b>.</p><p>— Rox Taxi Service &amp; Tours</p>",
                f"Hi {b.get('customer_name','')}, your driver's license has been approved for rental {booking_id}. — Rox",
                category="confirmation",
            )
    except Exception as e:  # noqa: BLE001
        _log.warning("license approve notify err: %s", e)
    try:
        fresh = await _db.bookings.find_one({"id": booking_id})
        if fresh:
            await _save_wallet_license(fresh)
    except Exception as e:  # noqa: BLE001
        _log.warning("wallet save err (admin approve): %s", e)
    return {"ok": True, "status": "approved"}


@router.post("/admin/bookings/{booking_id}/license/reject")
async def admin_reject_license(booking_id: str, req: LicenseReview, admin_email: str = _require()):
    b = await _db.bookings.find_one({"id": booking_id, "service_type": "rental"})
    if not b:
        raise HTTPException(404, "Booking not found")
    ts = _now_iso()
    reason = (req.reason or "").strip() or "License image unclear or invalid — please re-upload a clearer photo."
    await _db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "license.status": "rejected",
            "license.reviewed_at": ts,
            "license.reviewed_by": admin_email,
            "license.rejection_reason": reason,
        }},
    )
    try:
        from notifications import send_email as _send_email, send_sms as _send_sms
        link = _license_upload_link(booking_id, b.get("license_upload_token") or "")
        if b.get("customer_email"):
            _send_email(
                b["customer_email"],
                f"Please re-upload your driver's license · Rox rental {booking_id}",
                f"<p>Hi {b.get('customer_name','')},</p><p>We couldn't approve your license: <em>{reason}</em></p><p><a href='{link}' style='display:inline-block;background:#D4A94A;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;'>Re-upload license →</a></p><p>— Rox Taxi Service &amp; Tours</p>",
                f"Hi {b.get('customer_name','')}, we couldn't approve your license: {reason}\nRe-upload: {link}\n— Rox",
                category="confirmation",
            )
        if b.get("customer_phone"):
            _send_sms(b["customer_phone"], f"Rox rental {booking_id}: We need a clearer license photo. Re-upload: {link}")
    except Exception as e:  # noqa: BLE001
        _log.warning("license reject notify err: %s", e)
    return {"ok": True, "status": "rejected", "reason": reason}


# ─── Customer wallet endpoints ───────────────────────────────────────


@router.get("/my/license-wallet")
async def my_license_wallet(user: Dict[str, Any] = _current_user()):
    from datetime import datetime, timezone
    email = (user.get("email") or "").strip().lower()
    u = await _db.users.find_one({"email": email})
    w = (u or {}).get("license_wallet")
    if not w:
        return {"has_wallet": False}
    exp = _parse_iso_dt(w.get("expiry_date"))
    now_d = datetime.now(timezone.utc).date()
    expired = bool(exp and exp.date() < now_d)
    days_to_expiry = int((exp.date() - now_d).days) if exp else None
    return {
        "has_wallet": True,
        "expired": expired,
        "days_to_expiry": days_to_expiry,
        "expires_soon": bool(exp and not expired and (exp.date() - now_d).days <= 30),
        "name_on_license": w.get("name_on_license", ""),
        "license_number_masked": (w.get("license_number", "")[:3] + "•••" + w.get("license_number", "")[-2:]) if w.get("license_number") else "",
        "expiry_date": w.get("expiry_date", ""),
        "state_or_country": w.get("state_or_country", ""),
        "approved_at": w.get("approved_at"),
        "front_url": w.get("front_url"),
        "selfie_url": w.get("selfie_url"),
        "updated_at": (u or {}).get("license_wallet_updated_at"),
    }


@router.post("/my/license-wallet/rotate")
async def my_license_wallet_rotate(
    front: Optional[UploadFile] = File(None),
    back: Optional[UploadFile] = File(None),
    selfie: Optional[UploadFile] = File(None),
    name_on_license: str = Form(""),
    license_number: str = Form(""),
    expiry_date: str = Form(""),
    user: Dict[str, Any] = _current_user(),
):
    if not (front or back or selfie):
        raise HTTPException(400, "Upload at least one photo (front, back, or selfie).")
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "Missing email on session")

    stub_id = f"rotate-{uuid.uuid4().hex[:8].upper()}"
    urls: Dict[str, str] = {}
    for side, f in (("front", front), ("back", back), ("selfie", selfie)):
        if not f:
            continue
        if not (f.content_type or "").startswith("image/"):
            raise HTTPException(400, f"{side.title()} must be an image file")
        contents = await f.read()
        if len(contents) > 8 * 1024 * 1024:
            raise HTTPException(400, f"{side.title()} image too large (max 8MB)")
        urls[f"{side}_url"] = _save_license_image(stub_id, side, f, contents)

    ts = _now_iso()
    new_wallet = {
        "front_url": urls.get("front_url"),
        "back_url": urls.get("back_url"),
        "selfie_url": urls.get("selfie_url"),
        "name_on_license": (name_on_license or "").strip()[:80],
        "license_number": (license_number or "").strip()[:40],
        "expiry_date": (expiry_date or "").strip()[:20],
        "state_or_country": "",
        "approved_at": ts,
        "source_booking_id": stub_id,
        "rotated_at": ts,
    }
    u = await _db.users.find_one({"email": email})
    prior = (u or {}).get("license_wallet") or {}
    for k, v in list(new_wallet.items()):
        if v in (None, ""):
            new_wallet[k] = prior.get(k, v)
    await _db.users.update_one(
        {"email": email},
        {"$set": {"license_wallet": new_wallet, "license_wallet_updated_at": ts, "email": email}},
        upsert=True,
    )
    try:
        from notifications import send_email as _send_email, send_sms as _send_sms
        base = (_secrets_store.get_secret("PUBLIC_SITE_URL", "") or os.environ.get("PUBLIC_SITE_URL", "") or "https://roxtaxi.com").rstrip("/")
        review_url = f"{base}/admin/manage?tab=licenses"
        if _admin_email:
            _send_email(_admin_email, f"Wallet license rotated · {email}", f"<p>{user.get('name','')} ({email}) rotated their saved license. Review at their next booking: {review_url}</p>", f"{email} rotated their saved license.", category="info")
        admin_sms = (_secrets_store.get_secret("ADMIN_SMS_NUMBER") or _whatsapp_number or "").strip()
        if admin_sms:
            _send_sms(admin_sms, f"♻ Wallet rotated · {email} — review at next booking: {review_url}")
    except Exception as e:  # noqa: BLE001
        _log.warning("wallet rotate notify err: %s", e)
    return {"ok": True, "rotated_at": ts}


@router.delete("/my/license-wallet")
async def my_license_wallet_clear(user: Dict[str, Any] = _current_user()):
    email = (user.get("email") or "").strip().lower()
    await _db.users.update_one({"email": email}, {"$unset": {"license_wallet": "", "license_wallet_updated_at": ""}})
    return {"ok": True}
