"""Admin router — booking management, catalog CRUD, deposits, notifications.

Wired up by server.py via `configure()` + `include_router()`. Follows the same
factory-configure pattern as routes/payments.py to keep imports one-directional
and avoid circular deps.
"""
from typing import Optional, Dict, Any, List
from pathlib import Path
import logging
import uuid

from fastapi import APIRouter, HTTPException, Depends, Header, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel


# ---- shared state populated by server.py ------------------------------------
_db = None
_now_iso = None
_clean = None
_require_admin = None
_notify_fn = None
_attempt_deposit_refund = None
_upload_dir: Path = Path("/tmp")


def configure(*, db, now_iso, clean, require_admin, notify_fn, attempt_deposit_refund, upload_dir):
    """Called once at app startup."""
    global _db, _now_iso, _clean, _require_admin, _notify_fn, _attempt_deposit_refund, _upload_dir
    _db = db
    _now_iso = now_iso
    _clean = clean
    _require_admin = require_admin
    _notify_fn = notify_fn
    _attempt_deposit_refund = attempt_deposit_refund
    _upload_dir = upload_dir


router = APIRouter()


# ---- request models ---------------------------------------------------------
class BookingStatusUpdate(BaseModel):
    status: str


class DepositUpdate(BaseModel):
    status: str  # 'released' | 'forfeited' | 'held'
    reason: Optional[str] = None
    auto_refund: bool = True


class ItemUpsert(BaseModel):
    name: str
    description: str
    price: float
    duration: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    seats: Optional[int] = None
    active: bool = True
    # Rental-specific fields — surfaced on rental cards.
    year: Optional[int] = None
    make: Optional[str] = None
    model: Optional[str] = None
    color: Optional[str] = None
    body: Optional[str] = None
    # Taxi-specific
    route: Optional[str] = None
    # Tour-specific
    location: Optional[str] = None
    featured: Optional[bool] = None


class PriceUpdate(BaseModel):
    price: float
    reason: Optional[str] = None


class SiteConfigUpdate(BaseModel):
    zelle_email: Optional[str] = None
    zelle_phone: Optional[str] = None
    facebook_url: Optional[str] = None
    messenger_url: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    paypal_me_url: Optional[str] = None
    tripadvisor_url: Optional[str] = None
    google_reviews_url: Optional[str] = None
    logo_url: Optional[str] = None
    notify_email_enabled: Optional[bool] = None
    notify_sms_enabled: Optional[bool] = None


class ContactMessageStatusUpdate(BaseModel):
    status: str  # 'new' | 'replied' | 'archived'


class GroupInquiryStatusUpdate(BaseModel):
    status: str



# ---- Dependency shim so this router can reuse server.py's require_admin ----
def _admin_dep(authorization: Optional[str] = Header(None)) -> str:
    if _require_admin is None:
        raise HTTPException(500, "Admin dependency not configured")
    return _require_admin(authorization)


# ============================================================================
# Booking management — MUST be registered BEFORE the /admin/{kind} catch-all
# ============================================================================

@router.get("/admin/bookings")
async def admin_list_bookings(_: str = Depends(_admin_dep)):
    docs = await _db.bookings.find({}).sort("created_at", -1).to_list(1000)
    return [_clean(d) for d in docs]


@router.patch("/admin/bookings/{booking_id}/status")
async def admin_update_status(booking_id: str, req: BookingStatusUpdate, _: str = Depends(_admin_dep)):
    res = await _db.bookings.update_one(
        {"id": booking_id.upper()},
        {"$set": {"status": req.status, "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Booking not found")
    doc = await _db.bookings.find_one({"id": booking_id.upper()})
    return _clean(doc)


@router.patch("/admin/bookings/{booking_id}/deposit")
async def admin_update_deposit(booking_id: str, req: DepositUpdate, admin_email: str = Depends(_admin_dep)):
    """Release the deposit back to the customer, or forfeit it (damage/late/etc.).

    When auto_refund=True on release we call payments_module.attempt_deposit_refund
    to send the money back via the same provider used for the original booking.
    """
    valid = {"held", "released", "forfeited"}
    if req.status not in valid:
        raise HTTPException(422, f"status must be one of {sorted(valid)}")
    doc = await _db.bookings.find_one({"id": booking_id.upper()})
    if not doc:
        raise HTTPException(404, "Booking not found")
    if not doc.get("deposit_amount"):
        raise HTTPException(400, "This booking has no security deposit")

    now = _now_iso()
    update: Dict[str, Any] = {
        "deposit_status": req.status,
        "deposit_updated_at": now,
        "deposit_updated_by": admin_email,
        "updated_at": now,
    }
    if req.reason:
        update["deposit_reason"] = req.reason
    if req.status == "released":
        update["deposit_released_at"] = now
    elif req.status == "forfeited":
        update["deposit_forfeited_at"] = now

    refund_info: Dict[str, Any] = {}
    if req.status == "released" and req.auto_refund:
        refund_info = await _attempt_deposit_refund(
            booking=doc,
            amount=float(doc["deposit_amount"]),
            reason=req.reason or "Deposit released — vehicle returned in good condition",
        )
        update["deposit_refund_provider"] = refund_info.get("provider")
        update["deposit_refund_status"] = "succeeded" if refund_info.get("refunded") else "failed"
        if refund_info.get("refund_id"):
            update["deposit_refund_id"] = refund_info["refund_id"]
        if refund_info.get("error"):
            update["deposit_refund_error"] = refund_info["error"]

    await _db.bookings.update_one({"id": booking_id.upper()}, {"$set": update})
    doc = await _db.bookings.find_one({"id": booking_id.upper()})
    result = _clean(doc)
    if refund_info:
        result["refund_info"] = refund_info
    return result


@router.post("/admin/bookings/{booking_id}/resend-notification")
async def admin_resend_notification(booking_id: str, body: Optional[Dict[str, Any]] = None, _: str = Depends(_admin_dep)):
    """Manually re-send the booking-confirmation email + SMS.

    Body: `{ "force": bool }` — bypasses the notify_email_enabled/notify_sms_enabled
    site-config toggles when true.
    """
    booking = await _db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    force = bool((body or {}).get("force"))
    if force:
        prefs = {"notify_email_enabled": True, "notify_sms_enabled": True}
    else:
        prefs = await _db.site_config.find_one({"_id": "main"}) or {}
    try:
        report = _notify_fn(_clean(dict(booking)), prefs)
    except Exception as e:  # noqa: BLE001
        logging.warning("resend notify err: %s", e)
        raise HTTPException(500, f"Notification error: {e}") from e
    notified_at = _now_iso()
    await _db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"notification_status": report, "notified_at": notified_at}},
    )
    return {"booking_id": booking["id"], "notification_status": report, "notified_at": notified_at, "forced": force}


@router.get("/admin/stats")
async def admin_stats(_: str = Depends(_admin_dep)):
    total = await _db.bookings.count_documents({})
    paid = await _db.bookings.count_documents({"payment_status": "paid"})
    pending = await _db.bookings.count_documents({"status": {"$in": ["pending_payment", "confirmed"]}})
    active = await _db.bookings.count_documents({"status": {"$in": ["driver_assigned", "en_route"]}})
    revenue_cursor = _db.bookings.aggregate([
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "sum": {"$sum": "$total"}}},
    ])
    revenue_docs = await revenue_cursor.to_list(1)
    revenue = revenue_docs[0]["sum"] if revenue_docs else 0

    deposits_held = await _db.bookings.count_documents({"deposit_status": "held", "deposit_amount": {"$gt": 0}})
    deposits_released = await _db.bookings.count_documents({"deposit_status": "released"})
    deposits_forfeited = await _db.bookings.count_documents({"deposit_status": "forfeited"})
    held_cursor = _db.bookings.aggregate([
        {"$match": {"deposit_status": "held", "deposit_amount": {"$gt": 0}}},
        {"$group": {"_id": None, "sum": {"$sum": "$deposit_amount"}}},
    ])
    held_docs = await held_cursor.to_list(1)
    deposits_held_amount = held_docs[0]["sum"] if held_docs else 0

    return {
        "total": total, "paid": paid, "pending": pending, "active": active,
        "revenue": revenue,
        "deposits_held": deposits_held,
        "deposits_released": deposits_released,
        "deposits_forfeited": deposits_forfeited,
        "deposits_held_amount": deposits_held_amount,
    }


# ============================================================================
# Group inquiries admin — also literal routes, registered before catch-all
# ============================================================================

@router.get("/admin/group-inquiries")
async def admin_list_group_inquiries(_: str = Depends(_admin_dep)):
    docs = await _db.group_inquiries.find({}).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]


@router.patch("/admin/group-inquiries/{inquiry_id}/status")
async def admin_update_group_status(inquiry_id: str, req: GroupInquiryStatusUpdate, _: str = Depends(_admin_dep)):
    res = await _db.group_inquiries.update_one(
        {"id": inquiry_id.upper()},
        {"$set": {"status": req.status, "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Inquiry not found")
    doc = await _db.group_inquiries.find_one({"id": inquiry_id.upper()})
    return _clean(doc)


# ---- Admin: contact-form messages ------------------------------------------

@router.get("/admin/contact-messages")
async def admin_list_contact_messages(_: str = Depends(_admin_dep)):
    docs = await _db.contact_messages.find({}).sort("created_at", -1).to_list(500)
    return [_clean(d) for d in docs]


@router.patch("/admin/contact-messages/{msg_id}/status")
async def admin_update_contact_status(msg_id: str, req: ContactMessageStatusUpdate, _: str = Depends(_admin_dep)):
    if req.status not in {"new", "replied", "archived"}:
        raise HTTPException(422, "status must be new | replied | archived")
    res = await _db.contact_messages.update_one(
        {"id": msg_id.upper()},
        {"$set": {"status": req.status, "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Message not found")
    doc = await _db.contact_messages.find_one({"id": msg_id.upper()})
    return _clean(doc)


@router.delete("/admin/contact-messages/{msg_id}")
async def admin_delete_contact_message(msg_id: str, _: str = Depends(_admin_dep)):
    res = await _db.contact_messages.delete_one({"id": msg_id.upper()})
    if res.deleted_count == 0:
        raise HTTPException(404, "Message not found")
    return {"deleted": True, "id": msg_id.upper()}


# ---- Admin: notification delivery report (CSV export) ---------------------

@router.get("/admin/notifications/report.csv")
async def admin_notifications_report(
    days: int = 30,
    _: str = Depends(_admin_dep),
):
    """Stream a CSV of every booking's notification delivery status.

    Query param `days` filters to bookings created in the last N days (default 30).
    Columns: booking_id, customer_name, customer_email, customer_phone,
    booking_service, booking_date, booking_total, payment_method, payment_status,
    booking_status, created_at, notified_at, email_enabled, email_sent,
    email_provider, email_error, sms_enabled, sms_sent, sms_provider, sms_error.
    """
    import csv, io
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 365)))).isoformat()
    cursor = _db.bookings.find({"created_at": {"$gte": cutoff}}).sort("created_at", -1)
    docs = await cursor.to_list(5000)

    def rows():
        buf = io.StringIO()
        writer = csv.writer(buf)
        header = [
            "booking_id", "customer_name", "customer_email", "customer_phone",
            "booking_service", "booking_date", "booking_total",
            "payment_method", "payment_status", "booking_status",
            "created_at", "notified_at",
            "email_enabled", "email_sent", "email_provider", "email_error",
            "sms_enabled", "sms_sent", "sms_provider", "sms_error",
        ]
        writer.writerow(header)
        yield buf.getvalue()
        buf.seek(0); buf.truncate(0)

        for d in docs:
            ns = d.get("notification_status") or {}
            em = ns.get("email") or {}
            sm = ns.get("sms") or {}
            writer.writerow([
                d.get("id", ""),
                d.get("customer_name", ""),
                d.get("customer_email", ""),
                d.get("customer_phone", ""),
                d.get("item_name", ""),
                d.get("booking_date", ""),
                d.get("total", ""),
                d.get("payment_method", ""),
                d.get("payment_status", ""),
                d.get("status", ""),
                d.get("created_at", ""),
                d.get("notified_at", ""),
                em.get("enabled", ""),
                em.get("sent", ""),
                em.get("provider", ""),
                em.get("error", ""),
                sm.get("enabled", ""),
                sm.get("sent", ""),
                sm.get("provider", ""),
                sm.get("error", ""),
            ])
            yield buf.getvalue()
            buf.seek(0); buf.truncate(0)

    filename = f"rox-notifications-{days}d-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.csv"
    return StreamingResponse(
        rows(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/admin/notifications/summary")
async def admin_notifications_summary(days: int = 30, _: str = Depends(_admin_dep)):
    """Rolling stats — used by the admin dashboard 'Deliverability' widget."""
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 365)))).isoformat()
    docs = await _db.bookings.find({"created_at": {"$gte": cutoff}, "notification_status": {"$exists": True}}).to_list(5000)

    total = len(docs)
    email_sent = sum(1 for d in docs if (d.get("notification_status") or {}).get("email", {}).get("sent"))
    email_failed = sum(1 for d in docs if not (d.get("notification_status") or {}).get("email", {}).get("sent") and (d.get("notification_status") or {}).get("email", {}).get("enabled"))
    sms_sent = sum(1 for d in docs if (d.get("notification_status") or {}).get("sms", {}).get("sent"))
    sms_failed = sum(1 for d in docs if not (d.get("notification_status") or {}).get("sms", {}).get("sent") and (d.get("notification_status") or {}).get("sms", {}).get("enabled"))
    return {
        "days": days,
        "bookings_with_notifications": total,
        "email_sent": email_sent,
        "email_failed": email_failed,
        "sms_sent": sms_sent,
        "sms_failed": sms_failed,
        "email_success_rate": round(100 * email_sent / max(1, email_sent + email_failed), 1),
        "sms_success_rate": round(100 * sms_sent / max(1, sms_sent + sms_failed), 1),
    }


# ============================================================================
# Logo upload + site config (literal routes)
# ============================================================================

@router.post("/admin/upload-logo")
async def upload_logo(file: UploadFile = File(...), _: str = Depends(_admin_dep)):
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type. Use {', '.join(sorted(allowed))}")

    name = f"logo-{uuid.uuid4().hex[:8]}{ext}"
    dest = _upload_dir / name
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Logo must be ≤ 5MB")
    dest.write_bytes(content)

    url = f"/api/uploads/{name}"
    await _db.site_config.update_one({"_id": "main"}, {"$set": {"logo_url": url}}, upsert=True)
    return {"logo_url": url}


# ---- Catalog image manager -------------------------------------------------
# General-purpose image upload/list/delete so admins can manage the photo
# library used by tours / taxi / rentals / carousel via the /admin/manage UI.

@router.post("/admin/images")
async def upload_catalog_image(file: UploadFile = File(...), _: str = Depends(_admin_dep)):
    """Upload a catalog image (any tour / taxi / rental / carousel photo)."""
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type. Use {', '.join(sorted(allowed))}")

    content = await file.read()
    max_bytes = 8 * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(400, "Image must be ≤ 8MB")

    # Sanitize original stem into a slug so admins can find images by name later.
    import re as _re
    stem = Path(file.filename or "image").stem
    slug = _re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("-")[:40] or "image"
    name = f"cat-{slug}-{uuid.uuid4().hex[:6]}{ext}"

    dest = _upload_dir / name
    dest.write_bytes(content)
    return {
        "name": name,
        "url": f"/api/uploads/{name}",
        "size": len(content),
        "content_type": file.content_type,
    }


@router.get("/admin/images")
async def list_catalog_images(_: str = Depends(_admin_dep)):
    """List every uploaded image in the upload dir, newest first."""
    if not _upload_dir.exists():
        return []
    exts = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}
    items = []
    for p in _upload_dir.iterdir():
        if p.is_file() and p.suffix.lower() in exts:
            stat = p.stat()
            items.append({
                "name": p.name,
                "url": f"/api/uploads/{p.name}",
                "size": stat.st_size,
                "modified_at": stat.st_mtime,
            })
    items.sort(key=lambda x: x["modified_at"], reverse=True)
    return items


@router.delete("/admin/images/{name}")
async def delete_catalog_image(name: str, _: str = Depends(_admin_dep)):
    """Delete an uploaded image. Traversal-guarded via resolve() compare."""
    path = (_upload_dir / name).resolve()
    if not str(path).startswith(str(_upload_dir.resolve())) or not path.exists():
        raise HTTPException(404, "Image not found")
    path.unlink()
    return {"deleted": True, "name": name}


@router.put("/admin/site-config")
async def admin_update_site(req: SiteConfigUpdate, _: str = Depends(_admin_dep)):
    payload = {k: v for k, v in req.model_dump().items() if v is not None}
    if payload:
        await _db.site_config.update_one({"_id": "main"}, {"$set": payload}, upsert=True)
    cfg = await _db.site_config.find_one({"_id": "main"})
    cfg.pop("_id", None)
    return cfg


# ============================================================================
# Catalog CRUD (catch-all patterns — registered LAST so specific routes win)
# ============================================================================

def _coll_by_kind(kind: str):
    return {"tours": _db.tours, "taxi_services": _db.taxi_services, "rentals": _db.rentals}.get(kind)


@router.post("/admin/{kind}")
async def admin_create_item(kind: str, item: ItemUpsert, admin_email: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    doc = {k: v for k, v in item.model_dump().items() if v is not None}
    doc["id"] = f"{kind[:3]}-{uuid.uuid4().hex[:8]}"
    doc["created_at"] = _now_iso()
    # Seed an initial price_history entry so audit trail starts from birth.
    doc["price_history"] = [{
        "old_price": None,
        "new_price": float(item.price),
        "reason": "Item created",
        "changed_by": admin_email,
        "changed_at": _now_iso(),
    }]
    await coll.insert_one(doc)
    return _clean(doc)


@router.get("/admin/{kind}")
async def admin_list_items(kind: str, _: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    docs = await coll.find({}).to_list(500)
    return [_clean(d) for d in docs]


@router.put("/admin/{kind}/{item_id}")
async def admin_update_item(kind: str, item_id: str, item: ItemUpsert, admin_email: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    existing = await coll.find_one({"id": item_id})
    if not existing:
        raise HTTPException(404, "Item not found")

    payload = {k: v for k, v in item.model_dump().items() if v is not None}
    payload["updated_at"] = _now_iso()

    # If price changed via the full-form save, log the change in price_history.
    update_ops: Dict[str, Any] = {"$set": payload}
    old_price = float(existing.get("price") or 0)
    new_price = float(item.price)
    if abs(old_price - new_price) > 0.001:
        update_ops["$push"] = {"price_history": {
            "old_price": old_price,
            "new_price": new_price,
            "reason": "Edited via full form",
            "changed_by": admin_email,
            "changed_at": _now_iso(),
        }}
    await coll.update_one({"id": item_id}, update_ops)
    doc = await coll.find_one({"id": item_id})
    return _clean(doc)


@router.patch("/admin/{kind}/{item_id}/price")
async def admin_update_price(kind: str, item_id: str, req: PriceUpdate, admin_email: str = Depends(_admin_dep)):
    """Dedicated price-change endpoint that appends to price_history.

    Kept separate from the full PUT so the admin UI can offer a lightweight
    'change price + reason' flow without re-sending the entire item payload.
    """
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    if req.price is None or req.price <= 0:
        raise HTTPException(422, "Price must be a positive number")
    doc = await coll.find_one({"id": item_id})
    if not doc:
        raise HTTPException(404, "Item not found")

    old_price = float(doc.get("price") or 0)
    new_price = float(req.price)
    if abs(old_price - new_price) < 0.001:
        raise HTTPException(400, "New price is identical to the current price")

    entry = {
        "old_price": old_price,
        "new_price": new_price,
        "reason": (req.reason or "").strip() or "No reason provided",
        "changed_by": admin_email,
        "changed_at": _now_iso(),
    }
    await coll.update_one(
        {"id": item_id},
        {
            "$set": {"price": new_price, "updated_at": _now_iso()},
            "$push": {"price_history": entry},
        },
    )
    doc = await coll.find_one({"id": item_id})
    return _clean(doc)


@router.get("/admin/{kind}/{item_id}/price-history")
async def admin_price_history(kind: str, item_id: str, _: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    doc = await coll.find_one({"id": item_id})
    if not doc:
        raise HTTPException(404, "Item not found")
    history = list(doc.get("price_history") or [])
    history.sort(key=lambda h: h.get("changed_at") or "", reverse=True)
    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "current_price": doc.get("price"),
        "history": history,
    }


@router.delete("/admin/{kind}/{item_id}")
async def admin_delete_item(kind: str, item_id: str, _: str = Depends(_admin_dep)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    res = await coll.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Item not found")
    return {"deleted": True}
