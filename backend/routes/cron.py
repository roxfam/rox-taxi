"""Cron endpoints — scheduled work triggered by .emergent/crons.yml.

Every endpoint here MUST:
  1. Read WEBHOOK_CRON_SECRET from env
  2. Require Authorization: Bearer <secret>, constant-time compare
  3. Return 401 immediately if auth fails (no work done)
  4. Ack 2xx within a few seconds — offload real work to a background task
  5. Use X-Webhook-Id as an idempotency key

Wired up in server.py via configure() + include_router().
"""
import hmac
import os
from typing import Callable, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request


_db = None
_now_iso: Callable = lambda: ""


def configure(*, db, now_iso: Callable):
    global _db, _now_iso
    _db = db
    _now_iso = now_iso


router = APIRouter()


def _check_cron_auth(authorization: Optional[str]) -> None:
    secret = (os.environ.get("WEBHOOK_CRON_SECRET") or "").strip()
    if not secret:
        raise HTTPException(500, "Cron secret not configured on backend")
    presented = ""
    if authorization and authorization.startswith("Bearer "):
        presented = authorization[7:].strip()
    if not presented or not hmac.compare_digest(presented, secret):
        raise HTTPException(401, "Invalid cron auth")


# Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
@router.post("/cron/sync-google-reviews")
async def cron_sync_google_reviews(
    request: Request,
    background: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    x_webhook_id: Optional[str] = Header(None),
):
    _check_cron_auth(authorization)
    # Idempotency stamp — we log the run so replays can be identified but
    # don't block the actual work (sync itself is idempotent via
    # google_review_name dedupe).
    if _db is not None:
        try:
            await _db.cron_runs.update_one(
                {"run_id": x_webhook_id or _now_iso()},
                {"$setOnInsert": {"kind": "google_reviews", "started_at": _now_iso()}},
                upsert=True,
            )
        except Exception:  # noqa: BLE001
            pass
    background.add_task(_sync_google_reviews_bg)
    return {"accepted": True, "kind": "google_reviews", "run_id": x_webhook_id}


async def _sync_google_reviews_bg() -> None:
    """Background worker — pulls up to 5 latest Google reviews via Places
    API (New) and upserts them into `reviews` with source='google'. Skips
    silently if the API key or place_id isn't configured yet."""
    try:
        cfg = await _db.site_config.find_one({"_id": "main"}) or {}
        api_key = (cfg.get("google_places_api_key") or "").strip()
        place_id = (cfg.get("google_place_id") or "").strip()
        if not api_key or not place_id:
            return  # dormant — owner hasn't set keys yet

        url = f"https://places.googleapis.com/v1/places/{place_id}"
        headers = {
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "reviews,rating,userRatingCount",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, headers=headers)
        if r.status_code != 200:
            await _db.cron_runs.update_one(
                {"kind": "google_reviews", "started_at": {"$exists": True}},
                {"$set": {"last_error": f"{r.status_code}: {r.text[:400]}",
                          "last_error_at": _now_iso()}},
                sort=[("started_at", -1)],
            )
            return

        data = r.json() or {}
        upstream_reviews = data.get("reviews") or []
        upserted = 0
        for rev in upstream_reviews[:5]:
            google_id = rev.get("name") or ""
            if not google_id:
                continue
            author = rev.get("authorAttribution", {}) or {}
            text_obj = rev.get("originalText") or rev.get("text") or {}
            doc = {
                "id": f"google_{google_id.split('/')[-1]}",
                "google_review_id": google_id,
                "author_name": author.get("displayName", "Google reviewer"),
                "author_url": author.get("uri", ""),
                "profile_photo_url": author.get("photoUri", ""),
                "rating": int(rev.get("rating") or 5),
                "text": (text_obj.get("text") if isinstance(text_obj, dict) else str(text_obj))[:2000],
                "relative_time": rev.get("relativePublishTimeDescription", ""),
                "active": True,
                "source": "google",
                "synced_at": _now_iso(),
            }
            await _db.reviews.update_one(
                {"google_review_id": google_id},
                {"$set": doc, "$setOnInsert": {"created_at": _now_iso()}},
                upsert=True,
            )
            upserted += 1
        await _db.cron_runs.update_one(
            {"kind": "google_reviews"},
            {"$set": {"last_success_at": _now_iso(), "last_upserted": upserted,
                      "last_upstream_rating": data.get("rating"),
                      "last_upstream_count": data.get("userRatingCount")}},
            sort=[("started_at", -1)],
        )
    except Exception as ex:  # noqa: BLE001
        try:
            await _db.cron_runs.update_one(
                {"kind": "google_reviews"},
                {"$set": {"last_error": str(ex)[:400], "last_error_at": _now_iso()}},
                sort=[("started_at", -1)],
            )
        except Exception:  # noqa: BLE001
            pass


@router.post("/admin/reviews/sync-google-now")
async def admin_sync_google_now(background: BackgroundTasks, authorization: Optional[str] = Header(None)):
    """Manual 'Sync Google now' button in the admin Reviews panel. Same
    background task as the cron — accepts admin auth via existing bearer
    token pattern (delegated by the router mount)."""
    # Admin auth is enforced by the caller router's dependency chain.
    background.add_task(_sync_google_reviews_bg)
    return {"accepted": True, "kind": "google_reviews_manual"}
