"""Google Business Profile OAuth + review-reply router.

Two-step flow:
  1. Owner clicks "Connect Google Business" in admin
     → GET  /admin/gbp/oauth/start   redirects to Google
     → GET  /admin/gbp/oauth/callback stores access + refresh tokens in
       site_config.gbp_tokens, plus the primary account+location IDs
  2. Owner clicks "Post reply to Google" under any 5★ review
     → POST /admin/reviews/{id}/post-to-google
       - Refreshes the access token when < 60s from expiry
       - Fetches recent reviews from mybusiness.googleapis.com/v4
       - Matches the local review by author + rating + fuzzy text
       - PUTs the owner_reply_draft to /reply on the matched review

Prereqs the owner must complete once:
  • Enable "Google My Business API" in their GCP project
  • Submit the GBP access-request form (60+ day approval)
  • Create a Web-application OAuth client with the callback URL
  • Paste GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET in .env

All Google credentials stay server-side. Nothing is ever sent to the
browser except a boolean "connected" status and the account label.
"""
import os
import secrets
import time
from typing import Optional, Callable
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

# ── shared state (populated by server.py via configure) ──────────────
_db = None
_now_iso: Callable = lambda: ""
_require_admin: Optional[Callable] = None


def configure(*, db, now_iso: Callable, require_admin: Callable):
    global _db, _now_iso, _require_admin
    _db = db
    _now_iso = now_iso
    _require_admin = require_admin


router = APIRouter()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GBP_SCOPE = "https://www.googleapis.com/auth/business.manage"


def _admin_dep(authorization: Optional[str] = Header(None)) -> str:
    if _require_admin is None:
        raise HTTPException(500, "Admin dependency not configured")
    return _require_admin(authorization)


def _oauth_creds():
    cid = (os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or "").strip()
    sec = (os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET") or "").strip()
    redirect = (os.environ.get("GOOGLE_OAUTH_REDIRECT_URI") or "").strip()
    if not redirect:
        # Fall back to backend URL from env when explicit not set.
        base = (os.environ.get("PUBLIC_BACKEND_URL") or "").strip()
        if base:
            redirect = f"{base.rstrip('/')}/api/admin/gbp/oauth/callback"
    return cid, sec, redirect


# ── Status endpoint ──────────────────────────────────────────────────
@router.get("/admin/gbp/status")
async def gbp_status(_: str = Depends(_admin_dep)):
    cid, sec, redirect = _oauth_creds()
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    tokens = (cfg.get("gbp_tokens") or {}) if isinstance(cfg.get("gbp_tokens"), dict) else {}
    return {
        "oauth_configured": bool(cid and sec and redirect),
        "connected": bool(tokens.get("refresh_token")),
        "account_id": tokens.get("account_id"),
        "location_id": tokens.get("location_id"),
        "account_label": tokens.get("account_label"),
        "location_label": tokens.get("location_label"),
        "connected_at": tokens.get("connected_at"),
        "redirect_uri": redirect,
    }


# ── OAuth kickoff ────────────────────────────────────────────────────
@router.get("/admin/gbp/oauth/start")
async def gbp_oauth_start(state: Optional[str] = None, _: str = Depends(_admin_dep)):
    cid, _sec, redirect = _oauth_creds()
    if not cid or not redirect:
        raise HTTPException(400, "GOOGLE_OAUTH_CLIENT_ID / redirect URI not configured")
    csrf = secrets.token_urlsafe(24)
    # Stash the CSRF token server-side keyed by a short-lived record so
    # the callback can validate. Owner-only endpoint so simple keying is
    # fine — no per-user separation needed for this single-tenant flow.
    await _db.site_config.update_one(
        {"_id": "main"},
        {"$set": {"gbp_oauth_pending": {"csrf": csrf, "ts": time.time(), "state": state or ""}}},
        upsert=True,
    )
    params = {
        "client_id": cid,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": GBP_SCOPE,
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",  # force refresh_token on subsequent connects
        "state": csrf,
    }
    return {"authorize_url": f"{GOOGLE_AUTH_URL}?{urlencode(params)}"}


@router.get("/admin/gbp/oauth/callback")
async def gbp_oauth_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        return RedirectResponse("/admin?gbp=error&reason=" + error, status_code=302)
    cid, sec, redirect = _oauth_creds()
    if not cid or not sec or not redirect:
        raise HTTPException(400, "OAuth not configured")
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    pending = cfg.get("gbp_oauth_pending") or {}
    if not code or not state or state != pending.get("csrf"):
        raise HTTPException(400, "Invalid OAuth state")
    if time.time() - (pending.get("ts") or 0) > 900:  # 15 min window
        raise HTTPException(400, "OAuth request expired — please reconnect")
    # Exchange code → tokens
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code, "client_id": cid, "client_secret": sec,
            "redirect_uri": redirect, "grant_type": "authorization_code",
        })
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"Google token exchange failed: {r.text[:300]}")
    data = r.json()
    refresh = data.get("refresh_token")
    if not refresh:
        raise HTTPException(400, "Google didn't return a refresh_token — revoke prior grant and reconnect")
    tokens = {
        "access_token": data["access_token"],
        "refresh_token": refresh,
        "expires_at": time.time() + int(data.get("expires_in") or 3600),
        "connected_at": _now_iso(),
    }
    # Best-effort: fetch the primary account + location so the reply
    # endpoint doesn't need to prompt the owner for IDs.
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            acc_r = await client.get(
                "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            if acc_r.status_code == 200:
                accs = (acc_r.json() or {}).get("accounts") or []
                if accs:
                    a = accs[0]
                    tokens["account_id"] = (a.get("name") or "").split("/")[-1]
                    tokens["account_label"] = a.get("accountName") or a.get("name")
                    # Fetch locations for that account
                    loc_r = await client.get(
                        f"https://mybusinessbusinessinformation.googleapis.com/v1/{a.get('name')}/locations?readMask=name,title,storefrontAddress",
                        headers={"Authorization": f"Bearer {tokens['access_token']}"},
                    )
                    if loc_r.status_code == 200:
                        locs = (loc_r.json() or {}).get("locations") or []
                        if locs:
                            l = locs[0]
                            tokens["location_id"] = (l.get("name") or "").split("/")[-1]
                            tokens["location_label"] = l.get("title") or l.get("name")
    except Exception:  # noqa: BLE001
        pass
    await _db.site_config.update_one(
        {"_id": "main"},
        {"$set": {"gbp_tokens": tokens}, "$unset": {"gbp_oauth_pending": ""}},
    )
    # Bounce back into admin panel with a success flash
    return RedirectResponse("/admin?gbp=connected", status_code=302)


@router.post("/admin/gbp/disconnect")
async def gbp_disconnect(_: str = Depends(_admin_dep)):
    await _db.site_config.update_one(
        {"_id": "main"},
        {"$unset": {"gbp_tokens": "", "gbp_oauth_pending": ""}},
    )
    return {"disconnected": True}


async def _fresh_access_token() -> str:
    """Returns a live access token, refreshing when < 60s from expiry."""
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    tokens = cfg.get("gbp_tokens") or {}
    if not tokens.get("refresh_token"):
        raise HTTPException(401, "Google Business Profile not connected")
    if tokens.get("expires_at", 0) > time.time() + 60 and tokens.get("access_token"):
        return tokens["access_token"]
    cid, sec, _ = _oauth_creds()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id": cid, "client_secret": sec,
            "refresh_token": tokens["refresh_token"], "grant_type": "refresh_token",
        })
    if r.status_code != 200:
        raise HTTPException(401, f"Google refresh failed: {r.text[:200]}")
    data = r.json()
    new_token = data["access_token"]
    await _db.site_config.update_one(
        {"_id": "main"},
        {"$set": {
            "gbp_tokens.access_token": new_token,
            "gbp_tokens.expires_at": time.time() + int(data.get("expires_in") or 3600),
        }},
    )
    return new_token


class PostReplyIn(BaseModel):
    comment: Optional[str] = None  # override draft if provided


@router.post("/admin/reviews/{review_id}/post-to-google")
async def gbp_post_reply(review_id: str, req: PostReplyIn, _: str = Depends(_admin_dep)):
    """Post the owner_reply_draft to Google Business Profile.

    Matches the local review to Google's MyBusiness v4 review resource
    by scanning the location's recent reviews and comparing on
    author_name + rating + text prefix. Once matched, we PUT the reply
    and cache the MyBusiness review_name on the local doc so subsequent
    edits don't need to re-scan.
    """
    local = await _db.reviews.find_one({"id": review_id})
    if not local:
        raise HTTPException(404, "Review not found")
    comment = (req.comment or local.get("owner_reply_draft") or "").strip()
    if not comment:
        raise HTTPException(400, "No reply draft to post — draft one first")
    if len(comment) > 4096:
        raise HTTPException(400, "Reply exceeds 4096 characters")

    token = await _fresh_access_token()
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    tokens = cfg.get("gbp_tokens") or {}
    account = tokens.get("account_id")
    location = tokens.get("location_id")
    if not account or not location:
        raise HTTPException(400, "GBP account/location not resolved — reconnect Google")

    # If we've already cached the MyBusiness review name from a prior
    # post, skip the scan.
    mb_name = local.get("mybusiness_review_name")
    if not mb_name:
        list_url = (
            f"https://mybusiness.googleapis.com/v4/accounts/{account}"
            f"/locations/{location}/reviews?pageSize=50&orderBy=updateTime%20desc"
        )
        async with httpx.AsyncClient(timeout=20) as client:
            lr = await client.get(list_url, headers={"Authorization": f"Bearer {token}"})
        if lr.status_code != 200:
            raise HTTPException(lr.status_code, f"Google list-reviews failed: {lr.text[:200]}")
        candidates = (lr.json() or {}).get("reviews") or []
        target_author = (local.get("author_name") or "").strip().lower()
        target_rating = int(local.get("rating") or 0)
        target_prefix = (local.get("text") or "").strip()[:40].lower()
        for c in candidates:
            author = ((c.get("reviewer") or {}).get("displayName") or "").strip().lower()
            # Google encodes rating as string "FIVE"/"FOUR"; convert.
            rating_map = {"ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}
            rating = rating_map.get(c.get("starRating", ""), 0)
            body = (c.get("comment") or "").strip()[:40].lower()
            if author == target_author and rating == target_rating and body == target_prefix:
                mb_name = c.get("name")
                break
        if not mb_name:
            raise HTTPException(404, "Couldn't match this review on Google — it may have been deleted, or the location/account ID is wrong")

    # Post the reply
    put_url = f"https://mybusiness.googleapis.com/v4/{mb_name}/reply"
    async with httpx.AsyncClient(timeout=20) as client:
        pr = await client.put(put_url, headers={
            "Authorization": f"Bearer {token}", "Content-Type": "application/json",
        }, json={"comment": comment})
    if pr.status_code >= 400:
        raise HTTPException(pr.status_code, f"Google reply-post failed: {pr.text[:300]}")

    result = pr.json() if pr.headers.get("content-type", "").startswith("application/json") else {}
    await _db.reviews.update_one(
        {"id": review_id},
        {"$set": {
            "mybusiness_review_name": mb_name,
            "owner_reply_posted_at": _now_iso(),
            "owner_reply_posted_comment": comment,
            "owner_reply_moderation_state": result.get("reviewReplyState") or result.get("comment") and "APPROVED" or "PENDING",
        }},
    )
    return {"posted": True, "review_id": review_id, "mybusiness_review_name": mb_name}
