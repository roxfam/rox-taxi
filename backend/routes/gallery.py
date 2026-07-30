"""Gallery router — public photo submissions + admin approve/reject/reshare.

Endpoints:
    POST   /gallery/submit                              — public: guest uploads a photo
    GET    /admin/gallery/pending                       — admin queue
    POST   /admin/gallery/{sub_id}/approve              — admin approves + auto-posts to FB
    POST   /admin/gallery/{sub_id}/reject               — admin rejects + deletes file
    GET    /admin/gallery/approved                      — admin list with FB post-status
    POST   /admin/gallery/{sub_id}/repost-facebook      — admin manual retry
    GET    /admin/integrations/facebook/status          — diagnostics

All Facebook auto-post triggers live here now. Wired up by server.py via
`configure()` + `include_router()`.
"""
import uuid
from typing import Callable, Awaitable, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile


_db = None
_clean: Callable = lambda x: x
_now_iso: Callable = lambda: ""
_require_admin: Callable = lambda: None
_send_admin_push: Callable[..., Awaitable] = None
_post_gallery_to_fb: Callable[..., Awaitable] = None
_facebook_status: Callable[..., Awaitable] = None
_upload_dir: Path = None
_logger = None


def configure(*, db, clean, now_iso, require_admin, send_admin_push,
              post_gallery_to_fb, facebook_status, upload_dir: Path, logger):
    """Called once at app startup."""
    global _db, _clean, _now_iso, _require_admin, _send_admin_push
    global _post_gallery_to_fb, _facebook_status, _upload_dir, _logger
    _db = db
    _clean = clean
    _now_iso = now_iso
    _require_admin = require_admin
    _send_admin_push = send_admin_push
    _post_gallery_to_fb = post_gallery_to_fb
    _facebook_status = facebook_status
    _upload_dir = upload_dir
    _logger = logger


router = APIRouter()


# Late-binding Depends wrapper — calls the current global _require_admin
# at REQUEST time. Naive Depends(_require_admin) captures the initial
# `lambda: None` at module-load time and bypasses auth.
def _require_admin_dep(authorization: Optional[str] = Header(None)):
    return _require_admin(authorization) if callable(_require_admin) else None


def _require():
    return Depends(_require_admin_dep)


@router.post("/gallery/submit")
async def submit_gallery_photo(
    file: UploadFile = File(...),
    submitter_name: str = Form(""),
    submitter_email: str = Form(""),
    caption: str = Form(""),
):
    """Public: guests upload their trip photos. Goes into `pending` queue awaiting admin approval."""
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    contents = await file.read()
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 8MB)")
    ext = (file.filename or "photo.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic", "heif"):
        ext = "jpg"
    sub_id = uuid.uuid4().hex[:12]
    filename = f"guest_{sub_id}.{ext}"
    (_upload_dir / filename).write_bytes(contents)
    doc = {
        "id": sub_id,
        "url": f"/api/uploads/{filename}",
        "filename": filename,
        "submitter_name": (submitter_name or "").strip()[:80] or "Anonymous guest",
        "submitter_email": (submitter_email or "").strip().lower()[:120],
        "caption": (caption or "").strip()[:200],
        "status": "pending",
        "created_at": _now_iso(),
    }
    await _db.gallery_submissions.insert_one(doc)
    # Fire-and-forget admin push — never let a push failure block the response
    try:
        await _send_admin_push(
            title="New guest photo submitted",
            body=f"{doc['submitter_name']} sent a photo — review it in the admin panel.",
            url="/admin/manage?tab=gallery",
            tag=f"gallery-{sub_id}",
        )
    except Exception:  # noqa: BLE001
        pass
    return {"id": sub_id, "status": "pending", "message": "Thanks — we'll review your photo and post it soon."}


@router.get("/admin/gallery/pending")
async def admin_list_pending(_admin: str = _require()):
    docs = await _db.gallery_submissions.find({"status": "pending"}).sort("created_at", 1).to_list(200)
    return [_clean(d) for d in docs]


@router.post("/admin/gallery/{sub_id}/approve")
async def admin_approve_submission(sub_id: str, _admin: str = _require()):
    r = await _db.gallery_submissions.update_one(
        {"id": sub_id, "status": "pending"},
        {"$set": {"status": "approved", "approved_at": _now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Submission not found or not pending")
    # Auto-post to Facebook (best-effort — approval succeeds either way)
    doc = await _db.gallery_submissions.find_one({"id": sub_id})
    fb_result = {"ok": False, "post_id": None, "error": "not_attempted"}
    try:
        fb_result = await _post_gallery_to_fb(
            image_url=doc.get("url", ""),
            submitter_name=doc.get("submitter_name", ""),
            guest_caption=doc.get("caption", ""),
        )
        await _db.gallery_submissions.update_one(
            {"id": sub_id},
            {"$set": {
                "facebook_posted": fb_result.get("ok", False),
                "facebook_post_id": fb_result.get("post_id"),
                "facebook_error": fb_result.get("error"),
                "facebook_attempted_at": _now_iso(),
            }},
        )
    except Exception as e:  # noqa: BLE001
        _logger.warning(f"facebook autopost failed: {e}")
        fb_result = {"ok": False, "post_id": None, "error": f"exception:{e}"}
    # Push notify the admin about the outcome
    try:
        if fb_result.get("ok"):
            await _send_admin_push(
                title="Guest photo published ✓",
                body=f"Posted to Facebook — {doc.get('submitter_name','guest')}'s photo is live.",
                url="/admin/manage?tab=gallery",
                tag=f"fb-{sub_id}",
            )
        else:
            reason = fb_result.get("error", "unknown")
            if reason not in ("not_configured", "disabled"):
                await _send_admin_push(
                    title="Facebook post failed",
                    body=f"Photo approved locally, but Facebook returned: {reason}",
                    url="/admin/manage?tab=gallery",
                    tag=f"fb-fail-{sub_id}",
                )
    except Exception:  # noqa: BLE001
        pass
    return {"id": sub_id, "status": "approved", "facebook": fb_result}


@router.get("/admin/integrations/facebook/status")
async def admin_facebook_status(_admin: str = _require()):
    """Diagnostics — is the Facebook page token still valid and reachable?"""
    return await _facebook_status()


@router.get("/admin/gallery/approved")
async def admin_list_approved(_admin: str = _require()):
    """Approved submissions with Facebook post-status for the admin panel repost UI."""
    docs = await _db.gallery_submissions.find({"status": "approved"}).sort("approved_at", -1).to_list(200)
    return [_clean(d) for d in docs]


@router.post("/admin/gallery/{sub_id}/repost-facebook")
async def admin_repost_facebook(sub_id: str, _admin: str = _require()):
    """Manually retry the Facebook post for an already-approved submission.
    Works whether the previous post attempt succeeded or failed."""
    doc = await _db.gallery_submissions.find_one({"id": sub_id, "status": "approved"})
    if not doc:
        raise HTTPException(404, "Approved submission not found")
    result = await _post_gallery_to_fb(
        image_url=doc.get("url", ""),
        submitter_name=doc.get("submitter_name", ""),
        guest_caption=doc.get("caption", ""),
    )
    await _db.gallery_submissions.update_one(
        {"id": sub_id},
        {"$set": {
            "facebook_posted": result.get("ok", False),
            "facebook_post_id": result.get("post_id"),
            "facebook_error": result.get("error"),
            "facebook_attempted_at": _now_iso(),
        }},
    )
    try:
        if result.get("ok"):
            await _send_admin_push(
                title="Guest photo re-posted ✓",
                body=f"{doc.get('submitter_name','guest')}'s photo is now live on Facebook.",
                url="/admin/manage?tab=gallery",
                tag=f"fb-repost-{sub_id}",
            )
    except Exception:  # noqa: BLE001
        pass
    return {"id": sub_id, "facebook": result}


@router.post("/admin/gallery/{sub_id}/reject")
async def admin_reject_submission(sub_id: str, _admin: str = _require()):
    doc = await _db.gallery_submissions.find_one({"id": sub_id})
    if not doc:
        raise HTTPException(404, "Submission not found")
    # Delete file from disk + mark rejected
    try:
        (_upload_dir / doc["filename"]).unlink(missing_ok=True)
    except Exception:  # noqa: BLE001
        pass
    await _db.gallery_submissions.update_one(
        {"id": sub_id}, {"$set": {"status": "rejected", "rejected_at": _now_iso()}},
    )
    return {"id": sub_id, "status": "rejected"}
