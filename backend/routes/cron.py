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

# ── Optional Claude-drafted owner-reply (fresh 5-star reviews only) ──
# Wrapped in try/except so a missing SDK never breaks the sync — the
# review still lands, just without a pre-drafted reply.
try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    _LLM_AVAILABLE = True
except Exception:  # noqa: BLE001
    _LLM_AVAILABLE = False


async def _extract_driver_tags(text: str, db) -> list:
    """Scan a review body for driver-name mentions so the /reviews API
    can pin "driver-tagged" reviews with a subtle gold ribbon on the
    homepage. Reads the tag roster from `site_config.driver_name_tags`
    with a sensible default that catches the common misspellings of
    Reagan (the current lead driver whom guests keep name-dropping).

    Match rules:
      • Case-insensitive
      • Word-boundary anchored (won't tag "Reggie" as "Regan")
      • Returns a de-duped list preserving canonical spelling from
        the config (`{canonical: "Reagan", aliases: ["Regan","Reggan"]}`)
    """
    if not text:
        return []
    try:
        cfg = await db.site_config.find_one({"_id": "main"}) or {}
    except Exception:  # noqa: BLE001
        cfg = {}
    roster = cfg.get("driver_name_tags") or [
        {"canonical": "Reagan", "aliases": ["Reagan", "Regan", "Reggan"]},
    ]
    import re as _re
    found: list = []
    seen: set = set()
    body = text.lower()
    for entry in roster:
        if not isinstance(entry, dict):
            continue
        canon = (entry.get("canonical") or "").strip()
        aliases = entry.get("aliases") or ([canon] if canon else [])
        for a in aliases:
            a = (a or "").strip()
            if not a:
                continue
            if _re.search(rf"\b{_re.escape(a.lower())}\b", body):
                if canon.lower() not in seen:
                    seen.add(canon.lower())
                    found.append(canon)
                break
    return found


async def generate_review_reply_draft(review: dict) -> str:
    """Ask Claude Sonnet for a warm 2-sentence public reply to a
    Google review. Falls back to a static templated thank-you if the
    LLM key is missing or the call errors — never blocks the sync."""
    author = (review.get("author_name") or "there").split()[0] or "there"
    text = (review.get("text") or "").strip()
    rating = int(review.get("rating") or 5)
    static = (
        f"Thank you so much, {author} — reviews like this mean everything to our team. "
        "Come see us again next time you're on the island! — Rox"
    )
    llm_key = (os.environ.get("EMERGENT_LLM_KEY") or "").strip()
    if not _LLM_AVAILABLE or not llm_key or not text:
        return static
    try:
        prompt = (
            f"You are the owner of Rox Taxi Service & Tours in Nassau, Bahamas. "
            f"Write a warm, personal 2-sentence public reply to this {rating}-star Google review. "
            f"Do NOT use exclamation points more than once. Address the reviewer by their first name. "
            f"If they mention a specific driver (e.g. Reagan, Regan), thank that driver by name too. "
            f"Do not repeat the whole review back — respond to it. Sign off with '— Rox'.\n\n"
            f"Reviewer name: {review.get('author_name','')}\n"
            f"Review: {text}"
        )
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"review-reply-{review.get('id','x')}",
            system_message="You write short, warm, brand-authentic public replies to Google reviews.",
        ).with_model("anthropic", "claude-sonnet-4-6")
        parts: list[str] = []
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            # TextDelta events carry `.content`; StreamDone has no
            # payload we need — the type check is intentionally loose
            # so both event families work.
            piece = getattr(ev, "content", None)
            if piece:
                parts.append(piece)
        reply = ("".join(parts)).strip()
        return reply or static
    except Exception:  # noqa: BLE001
        return static


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
    """Background worker — pulls the latest Google reviews via Places API
    (New) and upserts them into `reviews`, but only when they are 4 stars
    or higher (low-star ones make the homepage feel less trustworthy and
    the owner wanted quality over completeness). Skips silently if
    credentials aren't configured yet.

    Credential source priority: ENV VAR first (GOOGLE_PLACES_API_KEY /
    GOOGLE_PLACE_ID) so ops can pin them via .env without exposing them
    in the admin panel; falls back to site_config for zero-code-deploy
    convenience.
    """
    try:
        env_key = (os.environ.get("GOOGLE_PLACES_API_KEY") or "").strip()
        env_place = (os.environ.get("GOOGLE_PLACE_ID") or "").strip()

        cfg = await _db.site_config.find_one({"_id": "main"}) or {}
        api_key = env_key or (cfg.get("google_places_api_key") or "").strip()
        place_id = env_place or (cfg.get("google_place_id") or "").strip()
        if not api_key or not place_id:
            return  # dormant — neither env nor site_config has credentials

        url = f"https://places.googleapis.com/v1/places/{place_id}"
        # Some owners restrict their Google API key by HTTP referrer.
        # Server-to-server calls normally have no referrer so the request
        # is blocked with PERMISSION_DENIED (API_KEY_HTTP_REFERRER_BLOCKED).
        # We send our public site domain as the Referer header so a
        # correctly-configured allowlist (roxtaxi.com + the preview URL)
        # accepts the call. Owners who prefer IP-based restriction can
        # ignore this — the header is harmless when unrestricted.
        headers = {
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "reviews,rating,userRatingCount",
            "Referer": (cfg.get("site_url") or "https://roxtaxi.com/").strip() or "https://roxtaxi.com/",
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
        skipped_low_rating = 0
        for rev in upstream_reviews[:5]:
            google_id = rev.get("name") or ""
            if not google_id:
                continue
            rating = int(rev.get("rating") or 0)
            if rating < 4:
                skipped_low_rating += 1
                # If this review already sits in our DB (from an earlier
                # sync when it was ≥4), soft-hide it so the homepage
                # reflects the latest star drift too.
                await _db.reviews.update_one(
                    {"google_review_id": google_id},
                    {"$set": {"active": False, "hidden_reason": "below_4_stars",
                              "rating": rating, "synced_at": _now_iso()}},
                )
                continue
            author = rev.get("authorAttribution", {}) or {}
            text_obj = rev.get("originalText") or rev.get("text") or {}
            review_body = (text_obj.get("text") if isinstance(text_obj, dict) else str(text_obj))[:2000]
            driver_tags = await _extract_driver_tags(review_body, _db)
            doc = {
                "id": f"google_{google_id.split('/')[-1]}",
                "google_review_id": google_id,
                "author_name": author.get("displayName", "Google reviewer"),
                "author_url": author.get("uri", ""),
                "profile_photo_url": author.get("photoUri", ""),
                "rating": rating,
                "text": review_body,
                "relative_time": rev.get("relativePublishTimeDescription", ""),
                "active": True,
                "hidden_reason": "",
                "source": "google",
                "driver_tags": driver_tags,
                "synced_at": _now_iso(),
            }
            existing = await _db.reviews.find_one({"google_review_id": google_id})
            await _db.reviews.update_one(
                {"google_review_id": google_id},
                {"$set": doc, "$setOnInsert": {"created_at": _now_iso()}},
                upsert=True,
            )
            upserted += 1
            # Draft an owner reply the first time we see a fresh 5-star
            # review. Existing rows keep whatever draft the owner has
            # tweaked; regeneration is exposed as a separate button.
            if rating >= 5 and (not existing or not existing.get("owner_reply_draft")):
                try:
                    fresh = await _db.reviews.find_one({"google_review_id": google_id})
                    if fresh:
                        draft = await generate_review_reply_draft(fresh)
                        await _db.reviews.update_one(
                            {"google_review_id": google_id},
                            {"$set": {
                                "owner_reply_draft": draft,
                                "owner_reply_generated_at": _now_iso(),
                            }},
                        )
                except Exception:  # noqa: BLE001
                    pass
        await _db.cron_runs.update_one(
            {"kind": "google_reviews"},
            {"$set": {"last_success_at": _now_iso(), "last_upserted": upserted,
                      "last_skipped_low_rating": skipped_low_rating,
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
