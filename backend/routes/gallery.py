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
import asyncio
import html as _html
import io as _io
import json as _json
import uuid
from typing import Callable, Awaitable, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response
from PIL import Image, ImageOps
import httpx


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

    # Nudge attribution — if this submitter's email matches a booking that got
    # a post-trip photo nudge in the last 7 days, tag the submission so we can
    # prove the funnel is working in the admin dashboard. Also copies the
    # A/B variant assigned to that booking so the stats endpoint can split.
    if doc["submitter_email"]:
        try:
            from datetime import datetime, timedelta, timezone
            cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            b = await _db.bookings.find_one(
                {
                    "customer_email": doc["submitter_email"],
                    "photo_nudge_sent_at": {"$gte": cutoff},
                },
                sort=[("photo_nudge_sent_at", -1)],
            )
            if b:
                await _db.gallery_submissions.update_one(
                    {"id": sub_id},
                    {"$set": {
                        "attributed_nudge_booking_id": b["id"],
                        "attributed_nudge_sent_at": b.get("photo_nudge_sent_at"),
                        "attributed_nudge_variant": b.get("photo_nudge_variant"),
                    }},
                )
        except Exception:  # noqa: BLE001
            pass

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


@router.post("/admin/gallery/{sub_id}/pin")
async def admin_pin_submission(sub_id: str, _admin: str = _require()):
    """Toggle pin state — pinned photos always surface first in /api/gallery
    (used on home, footer, groups strip). Idempotent.

    On pin (not unpin), the guest email + Facebook auto-post are DEFERRED by
    30 seconds via `asyncio.create_task` so the admin can hit the "Unpin"
    action on the toast to cancel both side effects (the deferred worker
    re-checks `is_pinned` before firing). One accidental pin no longer spams
    the guest with an email and floods the FB page with a post.
    """
    doc = await _db.gallery_submissions.find_one({"id": sub_id, "status": "approved"})
    if not doc:
        raise HTTPException(404, "Approved submission not found")
    new_pinned = not bool(doc.get("is_pinned"))
    update = {"is_pinned": new_pinned}
    if new_pinned:
        update["pinned_at"] = _now_iso()
    else:
        update["pinned_at"] = None
    await _db.gallery_submissions.update_one({"id": sub_id}, {"$set": update})

    scheduled = False
    UNDO_WINDOW = 30
    if new_pinned and (not doc.get("featured_notified_at") or not doc.get("featured_fb_posted_at")):
        asyncio.create_task(_fire_pin_side_effects_after_delay(sub_id, delay_seconds=UNDO_WINDOW))
        scheduled = True

    return {
        "id": sub_id,
        "is_pinned": new_pinned,
        "side_effects_scheduled": scheduled,
        "undo_window_seconds": UNDO_WINDOW if scheduled else 0,
    }


async def _fire_pin_side_effects_after_delay(sub_id: str, delay_seconds: int = 30):
    """Sleep for the undo window, then re-check `is_pinned` and fire the
    guest email + Facebook post only if the photo is still pinned. Silent
    no-op if the admin unpinned during the window. Both side effects remain
    idempotent via `featured_notified_at` / `featured_fb_posted_at`."""
    try:
        await asyncio.sleep(delay_seconds)
    except asyncio.CancelledError:
        return

    doc = await _db.gallery_submissions.find_one({"id": sub_id, "status": "approved"})
    if not doc or not doc.get("is_pinned"):
        return  # admin unpinned — skip both side effects

    # Guest email
    if doc.get("submitter_email") and not doc.get("featured_notified_at"):
        try:
            from notifications import send_featured_notification
            r = send_featured_notification(doc)
            if r.get("sent"):
                await _db.gallery_submissions.update_one(
                    {"id": sub_id},
                    {"$set": {"featured_notified_at": _now_iso(), "featured_notify_result": r}},
                )
        except Exception as e:  # noqa: BLE001
            if _logger:
                _logger.warning(f"delayed featured-notify failed: {e}")

    # Facebook auto-post — refresh doc so the email flag added above is visible
    doc = await _db.gallery_submissions.find_one({"id": sub_id, "status": "approved"})
    if not doc or not doc.get("is_pinned"):
        return
    if not doc.get("featured_fb_posted_at"):
        try:
            from facebook import post_pinned_photo_to_facebook
            deep_link = f"https://roxtaxi.com/api/og/photo/{sub_id}"
            r = await post_pinned_photo_to_facebook(
                image_url=doc.get("url", ""),
                submitter_name=doc.get("submitter_name", ""),
                guest_caption=doc.get("caption", ""),
                deep_link=deep_link,
            )
            if r.get("ok"):
                await _db.gallery_submissions.update_one(
                    {"id": sub_id},
                    {"$set": {"featured_fb_posted_at": _now_iso(), "featured_fb_post_id": r.get("post_id")}},
                )
        except Exception as e:  # noqa: BLE001
            if _logger:
                _logger.warning(f"delayed featured-fb post failed: {e}")


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



@router.get("/og/tour/{tour_id}", response_class=HTMLResponse)
async def og_tour_page(tour_id: str):
    """Server-rendered Open Graph landing page for a specific tour so
    WhatsApp / Facebook / Twitter previews show the actual excursion
    image + name + price instead of the generic site logo. Same pattern
    as /og/photo/{sub_id} — instant meta-refresh redirect for humans."""
    tour = await _db.tours.find_one({"id": tour_id})
    if not tour:
        raise HTTPException(404, "Tour not found")

    name = (tour.get("name") or "Nassau tour").strip()
    price = tour.get("price")
    duration = (tour.get("duration") or "").strip()
    location = (tour.get("location") or "Nassau, Bahamas").strip()

    price_str = f"from ${price}" if price else ""
    subtitle_bits = [b for b in (duration, price_str) if b]
    subtitle = " · ".join(subtitle_bits) or "Booked in 60 seconds"
    description = _html.escape(
        (tour.get("description") or f"Book {name} with Rox Taxi & Tours — fixed Bahamian tariff, live GPS tracking, licensed drivers.")[:200]
    )
    canonical = f"https://roxtaxi.com/tours?tour={tour_id}"
    canonical_esc = _html.escape(canonical, quote=True)
    js_redirect = _json.dumps(canonical)
    title = _html.escape(f"{name} — {subtitle}")
    og_image_url = f"https://roxtaxi.com/api/og/tour/{tour_id}/image.jpg"
    og_image_esc = _html.escape(og_image_url, quote=True)

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title} — Rox Taxi &amp; Tours</title>
<link rel="canonical" href="{canonical_esc}">
<meta name="description" content="{description}">

<meta property="og:type" content="product">
<meta property="og:url" content="{canonical_esc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="{og_image_esc}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{title}">
<meta property="og:site_name" content="Rox Taxi Service &amp; Tours">
<meta property="product:price:amount" content="{price or ''}">
<meta property="product:price:currency" content="USD">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{og_image_esc}">

<meta http-equiv="refresh" content="0;url={canonical_esc}">
<script>window.location.replace({js_redirect});</script>
<style>body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:2rem;color:#0B3B5C;background:#FAF9F6;}}a{{color:#D4A94A;font-weight:600;}}</style>
</head>
<body>
  <p>Loading tour… <a href="{canonical_esc}">Click here if you aren't redirected</a>.</p>
</body>
</html>"""
    return HTMLResponse(content=body)


@router.get("/og/tour/{tour_id}/image.jpg")
async def og_tour_image(tour_id: str):
    """Composite the tour's hero image with a gold price ribbon + title
    band at 1200x630 so social previews look bespoke. Uses PIL + the
    same request pipeline as /og/photo/*.
    """
    import io as _io
    tour = await _db.tours.find_one({"id": tour_id})
    if not tour:
        raise HTTPException(404, "Tour not found")
    src_url = (tour.get("image_url") or "").strip()
    if not src_url:
        raise HTTPException(404, "Tour has no image")

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as ac:
            r = await ac.get(src_url)
        r.raise_for_status()
        img = Image.open(_io.BytesIO(r.content)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Couldn't fetch tour image: {e}") from e

    # Fit the source to 1200x630 (cover / center-crop).
    fitted = ImageOps.fit(img, (1200, 630), method=Image.LANCZOS, centering=(0.5, 0.4))

    # Compose gradient overlay + branded footer bar.
    from PIL import ImageDraw, ImageFont
    canvas = fitted.copy()
    draw = ImageDraw.Draw(canvas, "RGBA")
    # Bottom-gradient scrim so the title always reads over the photo.
    for y in range(300, 630):
        alpha = int(((y - 300) / 330) * 210)
        draw.line([(0, y), (1200, y)], fill=(11, 25, 44, alpha))
    # Gold left accent bar
    draw.rectangle((0, 500, 12, 620), fill=(212, 169, 74, 255))

    # Title text — falls back gracefully if the OS lacks the font file.
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 56)
        sub_font   = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",     28)
        brand_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    except Exception:  # noqa: BLE001
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()
        brand_font = ImageFont.load_default()

    name = (tour.get("name") or "Nassau tour")[:60]
    price = tour.get("price")
    duration = tour.get("duration") or ""
    bits = [b for b in (duration, f"from ${price}" if price else "") if b]

    draw.text((32, 500), name, font=title_font, fill=(255, 255, 255))
    if bits:
        draw.text((32, 570), " · ".join(bits), font=sub_font, fill=(245, 225, 164))
    # Brand ribbon top-right
    draw.rectangle((900, 24, 1180, 74), fill=(212, 169, 74, 255))
    draw.text((915, 34), "ROX TAXI · BAHAMAS", font=brand_font, fill=(11, 25, 44))

    buf = _io.BytesIO()
    canvas.save(buf, format="JPEG", quality=85, optimize=True, progressive=True)
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


@router.get("/og/photo/{sub_id}", response_class=HTMLResponse)
async def og_photo_page(sub_id: str):
    """Server-rendered Open Graph landing page for a specific guest photo.

    Purpose: social crawlers (facebookexternalhit, WhatsApp, Twitterbot,
    LinkedInBot) don't execute JavaScript, so a plain `/gallery?photo=<id>`
    share link shows Rox Taxi's generic OG image in the link preview. This
    endpoint returns a minimal HTML page whose <meta property="og:image">
    points at the actual guest photo, giving every share a photo-specific
    preview card. Humans get an instant meta-refresh + JS redirect to the
    SPA URL so the UX is unchanged.
    """
    doc = await _db.gallery_submissions.find_one({"id": sub_id, "status": "approved"})
    if not doc:
        raise HTTPException(404, "Photo not found or not approved")

    raw_url = doc.get("url") or ""
    if raw_url.startswith("http"):
        img_url = raw_url
    else:
        if raw_url.startswith("/uploads/"):
            raw_url = "/api" + raw_url
        img_url = f"https://roxtaxi.com{raw_url}"

    caption = (doc.get("caption") or "A Nassau moment").strip()
    submitter = (doc.get("submitter_name") or "A Rox Taxi guest").strip()
    title = _html.escape(f'"{caption}" — {submitter}')
    description = _html.escape(f"{submitter} shared this moment from their Nassau trip with Rox Taxi & Tours. Book yours today.")
    canonical = f"https://roxtaxi.com/gallery?photo={sub_id}"
    img_url_esc = _html.escape(img_url, quote=True)
    canonical_esc = _html.escape(canonical, quote=True)
    js_redirect = _json.dumps(canonical)

    # Prefer the 1200x630 auto-cropped OG image for local guest uploads so
    # Facebook / WhatsApp / Twitter previews never letterbox or center-crop
    # awkwardly. External-URL photos (unsplash etc) fall back to the raw src.
    og_image_url = (
        f"https://roxtaxi.com/api/og/photo/{sub_id}/image.jpg"
        if not (doc.get("url") or "").startswith("http")
        else img_url
    )
    og_image_esc = _html.escape(og_image_url, quote=True)

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title} — Rox Taxi &amp; Tours</title>
<link rel="canonical" href="{canonical_esc}">
<meta name="description" content="{description}">

<meta property="og:type" content="article">
<meta property="og:url" content="{canonical_esc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="{og_image_esc}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{title}">
<meta property="og:site_name" content="Rox Taxi Service &amp; Tours">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{og_image_esc}">

<meta http-equiv="refresh" content="0;url={canonical_esc}">
<script>window.location.replace({js_redirect});</script>
<style>body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:2rem;color:#0B3B5C;background:#FAF9F6;}}a{{color:#D4A94A;font-weight:600;}}</style>
</head>
<body>
  <p>Loading photo… <a href="{canonical_esc}">Click here if you aren't redirected</a>.</p>
</body>
</html>"""
    return HTMLResponse(content=body)


@router.get("/og/photo/{sub_id}/image.jpg")
async def og_photo_image(sub_id: str):
    """Return the guest photo center-cropped to Facebook's ideal 1200x630
    (1.91:1) landscape ratio as a progressive JPEG. Guarantees link previews
    never letterbox regardless of the original photo's aspect ratio.

    Cached for 24h — the underlying image never changes for a submission id.
    """
    doc = await _db.gallery_submissions.find_one({"id": sub_id, "status": "approved"})
    if not doc:
        raise HTTPException(404, "Photo not found or not approved")

    raw_url = doc.get("url") or ""
    # Local file path — strip either "/uploads/" or "/api/uploads/" prefix
    rel = raw_url.split("/uploads/", 1)[-1] if "/uploads/" in raw_url else ""
    local = _upload_dir / rel if rel else None
    if not local or not local.is_file():
        raise HTTPException(404, "Underlying image file missing")

    try:
        img = Image.open(_io.BytesIO(local.read_bytes()))
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img = ImageOps.fit(img, (1200, 630), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        buf = _io.BytesIO()
        img.save(buf, format="JPEG", quality=88, optimize=True, progressive=True)
        return Response(
            content=buf.getvalue(),
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400, immutable"},
        )
    except Exception as e:  # noqa: BLE001
        if _logger:
            _logger.warning(f"OG crop failed for {sub_id}: {e}")
        # Fall back to raw bytes so the preview never 500s
        return Response(
            content=local.read_bytes(),
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=3600"},
        )
