"""Facebook Graph API — auto-post approved guest gallery photos to the
Rox Taxi Service Facebook page.

Contract used by server.py:
    from facebook import post_gallery_photo_to_facebook
    result = await post_gallery_photo_to_facebook(image_url, submitter_name, caption)
    # result = {"ok": bool, "post_id": str|None, "error": str|None}

Never raises — always returns a result dict so a Facebook outage / bad token
can't break the gallery-approval flow.
"""
from __future__ import annotations

import io
import logging
import os
import random
from pathlib import Path

import httpx
from PIL import Image, ImageOps

logger = logging.getLogger("rox.facebook")

# ── Caption rotation (3 templates, chosen at random per post) ─────────
CAPTION_TEMPLATES = [
    "📸 From our guest {name} — book your Nassau ride at {website}",
    "Beautiful moment captured by {name} 🇧🇸 · Ride with Rox Taxi Service: +1 (242) 432-2587 · {website}",
    "Thanks {name} for sharing! Ready for your own Bahamas adventure? Book at {website} #Nassau #Bahamas #RoxTaxi",
]

# Facebook's recommended Open Graph landscape image is 1200x630 (1.91:1).
# Anything narrower or taller gets center-cropped by Facebook — often awkwardly.
# We pre-crop here to guarantee the framing we want.
FB_TARGET_WIDTH = 1200
FB_TARGET_HEIGHT = 630

UPLOAD_DIR = Path("/app/backend/uploads")


def _cfg() -> dict:
    return {
        "page_id": os.environ.get("FB_PAGE_ID", ""),
        "token": os.environ.get("FB_PAGE_ACCESS_TOKEN", ""),
        "version": os.environ.get("FB_GRAPH_VERSION", "v20.0"),
        "enabled": os.environ.get("FB_AUTOPOST_ENABLED", "true").lower() == "true",
        "website": os.environ.get("FB_SITE_URL", "https://roxtaxi.com"),
    }


def _compose_caption(submitter_name: str, guest_caption: str, website: str) -> str:
    """Rotate through the 3 approved templates + append the guest's own caption if any."""
    name = (submitter_name or "").strip() or "our guest"
    base = random.choice(CAPTION_TEMPLATES).format(name=name, website=website)
    guest = (guest_caption or "").strip()
    return f"{base}\n\n\"{guest}\"" if guest else base


def _optimise_for_facebook(image_bytes: bytes) -> tuple[bytes, str]:
    """Return (jpeg_bytes, mime) center-cropped to 1200x630 (1.91:1).

    Preserves EXIF orientation, converts alpha PNGs to white-backed JPEG, and
    only up/down-scales when needed. On any decoding failure we fall back to
    the original bytes so we never block a post over a Pillow hiccup.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)  # respect phone camera rotation
        if img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        # Center-crop to target aspect ratio then resize
        img = ImageOps.fit(
            img,
            (FB_TARGET_WIDTH, FB_TARGET_HEIGHT),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=88, optimize=True, progressive=True)
        return buf.getvalue(), "image/jpeg"
    except Exception as e:  # noqa: BLE001
        logger.warning("facebook crop failed, using original: %s", e)
        return image_bytes, "image/jpeg"


async def post_gallery_photo_to_facebook(
    *, image_url: str, submitter_name: str = "", guest_caption: str = ""
) -> dict:
    """Publishes a photo (with caption) to the Rox Taxi Service Facebook page.

    image_url — the /uploads/<filename> path stored on the gallery submission.
                We resolve it to an absolute path on disk, auto-crop it to
                Facebook's 1200x630 sweet spot, and upload the bytes so
                Facebook doesn't need to fetch from our preview host.
    """
    cfg = _cfg()
    if not cfg["enabled"]:
        return {"ok": False, "post_id": None, "error": "disabled"}
    if not cfg["page_id"] or not cfg["token"]:
        return {"ok": False, "post_id": None, "error": "not_configured"}

    # Resolve local file for upload
    rel = image_url.lstrip("/").removeprefix("uploads/")
    local = UPLOAD_DIR / rel
    if not local.is_file():
        return {"ok": False, "post_id": None, "error": f"file_not_found:{rel}"}

    caption = _compose_caption(submitter_name, guest_caption, cfg["website"])
    endpoint = f"https://graph.facebook.com/{cfg['version']}/{cfg['page_id']}/photos"
    optimised_bytes, mime = _optimise_for_facebook(local.read_bytes())

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            files = {"source": (f"rox_{local.stem}_fb.jpg", optimised_bytes, mime)}
            data = {"caption": caption, "access_token": cfg["token"], "published": "true"}
            resp = await client.post(endpoint, data=data, files=files)
        body = resp.json()
    except Exception as e:  # noqa: BLE001 — Facebook must never bring down the request
        logger.warning("facebook post threw: %s", e)
        return {"ok": False, "post_id": None, "error": f"exception:{type(e).__name__}"}

    if resp.status_code >= 400 or "error" in body:
        err = (body.get("error") or {}).get("message", f"http_{resp.status_code}")
        logger.warning("facebook post failed: %s | %s", resp.status_code, body)
        return {"ok": False, "post_id": None, "error": err}

    post_id = body.get("post_id") or body.get("id")
    logger.info("facebook post ok: %s", post_id)
    return {"ok": True, "post_id": post_id, "error": None, "caption": caption}


async def facebook_status() -> dict:
    """Read-only sanity check — reports whether the token is valid + which page it targets."""
    cfg = _cfg()
    if not cfg["page_id"] or not cfg["token"]:
        return {"configured": False, "reason": "missing_env"}
    endpoint = f"https://graph.facebook.com/{cfg['version']}/{cfg['page_id']}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(endpoint, params={"fields": "id,name,fan_count", "access_token": cfg["token"]})
        body = r.json()
    except Exception as e:  # noqa: BLE001
        return {"configured": True, "reachable": False, "error": str(e)}
    if r.status_code >= 400 or "error" in body:
        return {"configured": True, "reachable": True, "valid": False, "error": (body.get("error") or {}).get("message", "unknown")}
    return {"configured": True, "reachable": True, "valid": True, "page": body, "enabled": cfg["enabled"]}
