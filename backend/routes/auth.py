"""Auth router — admin JWT + customer sessions (Emergent Google OAuth + email/password).

Endpoints:
    POST /auth/login        — admin JWT login (returns bearer token)
    POST /auth/session      — Emergent Google OAuth: exchange session_id for cookie
    POST /auth/register     — customer email/password signup (with referral)
    POST /auth/login-email  — customer email/password login
    GET  /auth/me           — current session's user
    POST /auth/heartbeat    — keep session alive (idle window)
    POST /auth/logout       — end session, clear cookie

get_current_user + require_admin stay in server.py (used by many routes).
Auth-only helpers (_hash_password, _verify_password, _create_customer_session,
_set_session_cookie, make_admin_token) live here.
"""
import hashlib
import os
import secrets
import uuid
from datetime import timedelta
from typing import Callable, Optional

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field


# ─── Cloudflare Turnstile verification ────────────────────────────────
# Guards signup/login/forgot-password from bots. If TURNSTILE_SECRET_KEY
# is unset, verification is skipped (allows local dev + preview without
# hitting Cloudflare).
_TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def _verify_turnstile(token: str, request: Request, action_label: str) -> None:
    secret = (os.environ.get("TURNSTILE_SECRET_KEY") or "").strip()
    if not secret:
        return  # not configured — fail open in dev/preview
    if not token:
        raise HTTPException(400, "CAPTCHA verification required. Please complete the challenge.")
    ip = ""
    if request is not None:
        xff = request.headers.get("x-forwarded-for", "")
        ip = (xff.split(",")[0].strip() if xff else (request.client.host if request.client else ""))
    payload = {"secret": secret, "response": token}
    if ip:
        payload["remoteip"] = ip
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(_TURNSTILE_VERIFY_URL, data=payload)
            data = r.json() if r.status_code == 200 else {}
    except Exception:  # noqa: BLE001
        raise HTTPException(503, "CAPTCHA service unavailable. Please try again.")
    if not data.get("success"):
        raise HTTPException(400, "CAPTCHA verification failed. Please try again.")


# --- injected via configure() ---
_db = None
_now_iso: Callable = lambda: ""
_now_utc: Callable = lambda: None
_get_current_user: Callable = lambda: None
_new_referral_code: Callable = lambda: ""
_jwt_secret: str = ""
_admin_email: str = ""
_admin_password_hash: str = ""
_idle_timeout_minutes: int = 60


def configure(**kw):
    g = globals()
    for k, v in kw.items():
        g["_" + k] = v


router = APIRouter()


# ─── Models ──────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CustomerRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=200)
    name: str = Field("", max_length=100)
    referral_code: Optional[str] = Field(None, max_length=32)
    turnstile_token: Optional[str] = Field(None, max_length=2048)


class CustomerLoginRequest(BaseModel):
    email: EmailStr
    password: str
    turnstile_token: Optional[str] = Field(None, max_length=2048)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    turnstile_token: Optional[str] = Field(None, max_length=2048)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=16, max_length=200)
    password: str = Field(..., min_length=6, max_length=200)


# ─── Auth helpers (auth-only) ────────────────────────────────────────


def make_admin_token(email: str) -> str:
    payload = {"sub": email, "role": "admin", "exp": _now_utc() + timedelta(days=7)}
    return jwt.encode(payload, _jwt_secret, algorithm="HS256")


def _hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:  # noqa: BLE001
        return False


# ─── Password-reset helpers ───────────────────────────────────────────
# We store the SHA-256 hash of the reset token in Mongo (not the raw token).
# Anyone with DB read access still can't hijack a reset because the raw
# token only ever lives in the user's inbox + the URL they click.
def _generate_reset_token() -> str:
    """32 URL-safe bytes ≈ 43 chars. Cryptographically random."""
    return secrets.token_urlsafe(32)


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _site_base_url() -> str:
    """Base URL for links inside password-reset emails. Defaults to the
    live production domain; overridable via SITE_BASE_URL env for QA."""
    import os
    return (os.environ.get("SITE_BASE_URL") or "https://roxtaxi.com").rstrip("/")


# ─── Suspicious-login detection ──────────────────────────────────────
# Two prior-session comparators — a new city (from IP geo cache) or a
# fundamentally different device signature (browser+OS from UA) counts
# as "suspicious" and triggers a one-shot alert email to the account
# owner. We deliberately do NOT alert on IP change alone (mobile networks
# rotate IPs freely) or minor UA version bumps (Chrome auto-updates).

def _device_signature(ua: str) -> str:
    """Coarse browser+OS fingerprint. Chrome 132 → Chrome 133 stays 'Chrome on macOS'."""
    # Reuse the existing UI-friendly parser — its browser/OS bucketing is
    # exactly the granularity we want for "same device" comparison.
    return _parse_ua(ua)


async def _maybe_send_suspicious_login_alert(*, user_id: str, method: str,
                                             ip: str, ua: str, when_iso: str,
                                             event_id) -> None:
    """Compare this brand-new session against the user's most recent prior
    login. If either the city OR the device signature is meaningfully
    different, fire a one-time alert email to the account owner and stamp
    the login_events doc so we never re-alert the same session."""
    try:
        # Find the most recent PRIOR login event (exclude the one we just wrote).
        prior = await _db.login_events.find_one(
            {"user_id": user_id, "action": "login", "_id": {"$ne": event_id}},
            sort=[("at", -1)],
        )
        # First-ever login — don't alarm the user about their own signup.
        if not prior:
            return

        prior_ip = (prior.get("ip") or "").strip()
        prior_ua = (prior.get("user_agent") or "").strip()

        # If we don't have anything to compare against (older sessions
        # pre-date the ip/ua columns) skip silently — a single legacy
        # alert about "your first ever recorded device" is just noise.
        if not prior_ip and not prior_ua:
            return

        cur_geo = await _geo_for_ip(ip)
        prior_geo = await _geo_for_ip(prior_ip) if prior_ip else {"city": "", "country": ""}

        cur_city = (cur_geo.get("city") or "").strip().lower()
        prior_city = (prior_geo.get("city") or "").strip().lower()
        cur_device = _device_signature(ua)
        prior_device = _device_signature(prior_ua)

        new_city = bool(cur_city) and bool(prior_city) and cur_city != prior_city
        new_device = bool(cur_device) and bool(prior_device) and cur_device != prior_device

        if not (new_city or new_device):
            return

        # Fetch user to get the email + display name
        user = await _db.users.find_one({"user_id": user_id})
        if not user or not user.get("email"):
            return

        loc_parts = [cur_geo.get("city"), cur_geo.get("country")]
        try:
            from notifications import send_suspicious_login_alert
            result = send_suspicious_login_alert(
                to_email=user["email"],
                name=user.get("name", ""),
                method=method.capitalize() if method else "Email",
                city=loc_parts[0] or "",
                country=loc_parts[1] or "",
                device=cur_device,
                ip=ip or "unknown",
                when_iso=when_iso,
                sessions_url=f"{_site_base_url()}/my-bookings#sessions",
            )
        except Exception:  # noqa: BLE001
            result = {"sent": False, "provider": "none", "error": "send_failed"}

        await _db.login_events.update_one(
            {"_id": event_id},
            {"$set": {
                "suspicious_alert_sent": bool(result.get("sent")),
                "suspicious_alert_at": _now_iso(),
                "suspicious_alert_reason": (
                    "new_city+new_device" if new_city and new_device
                    else ("new_city" if new_city else "new_device")
                ),
                "suspicious_alert_result": result,
            }},
        )
    except Exception:  # noqa: BLE001
        # Never let a security-alert bug hurt the login itself.
        return


async def _create_customer_session(user_id: str, method: str, request: Optional["Request"] = None) -> str:
    session_token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    ts = _now_iso()
    ua = ""
    ip = ""
    if request is not None:
        ua = (request.headers.get("user-agent") or "")[:400]
        # Prefer the leftmost XFF entry (real client), else socket peer
        xff = request.headers.get("x-forwarded-for", "")
        ip = (xff.split(",")[0].strip() if xff else (request.client.host if request.client else ""))[:64]
    await _db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "auth_method": method,
        "user_agent": ua,
        "ip": ip,
        "expires_at": (_now_utc() + timedelta(days=7)).isoformat(),
        "last_activity_at": ts,
        "created_at": ts,
    })
    await _db.users.update_one(
        {"user_id": user_id},
        {"$set": {"last_login_at": ts, "last_login_method": method}},
    )
    event_result = await _db.login_events.insert_one({
        "user_id": user_id, "action": "login", "method": method, "at": ts,
        "ip": ip, "user_agent": ua,
    })
    # Suspicious-login check runs in the background so login stays fast.
    try:
        import asyncio as _aio
        _aio.create_task(_maybe_send_suspicious_login_alert(
            user_id=user_id, method=method, ip=ip, ua=ua,
            when_iso=ts, event_id=event_result.inserted_id,
        ))
    except Exception:  # noqa: BLE001
        pass
    return session_token


def _set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key="session_token", value=token, httponly=True, secure=True,
        samesite="none", path="/", max_age=60 * 60 * 24 * 7,
    )


# ─── Endpoints ───────────────────────────────────────────────────────


# Late-binding Depends wrapper — calls the current global _get_current_user
# at REQUEST time. Naive Depends(_get_current_user) captures the initial
# `lambda: None` at module-load time and bypasses session auth.
async def _current_user_dep(request: Request):
    return await _get_current_user(request)


def _current_user():
    return Depends(_current_user_dep)


@router.post("/auth/login")
async def admin_login(req: LoginRequest):
    if req.email.lower() != _admin_email.lower():
        raise HTTPException(401, "Invalid credentials")
    if not bcrypt.checkpw(req.password.encode(), _admin_password_hash.encode()):
        raise HTTPException(401, "Invalid credentials")
    return {"token": make_admin_token(req.email), "email": req.email}


@router.post("/auth/session")
async def process_google_session(request: Request, response: Response):
    """Exchange Emergent session_id (from URL fragment) for a session_token cookie."""
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(400, "Missing session id")

    async with httpx.AsyncClient(timeout=15.0) as ac:
        r = await ac.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session")
    data = r.json()
    email = data["email"].lower()
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data["session_token"]
    ts = _now_iso()

    existing = await _db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await _db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "updated_at": ts,
                      "last_login_at": ts, "last_login_method": "google"}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await _db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "provider": "google", "created_at": ts,
            "last_login_at": ts, "last_login_method": "google",
        })

    await _db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token, "auth_method": "google",
        "expires_at": (_now_utc() + timedelta(days=7)).isoformat(),
        "last_activity_at": ts, "created_at": ts,
        "ip": ((request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                if request.headers.get("x-forwarded-for") else
                (request.client.host if request.client else ""))[:64]),
        "user_agent": (request.headers.get("user-agent") or "")[:400],
    })
    google_ip = ((request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                  if request.headers.get("x-forwarded-for") else
                  (request.client.host if request.client else ""))[:64])
    google_ua = (request.headers.get("user-agent") or "")[:400]
    event_result = await _db.login_events.insert_one({
        "user_id": user_id, "action": "login", "method": "google", "at": ts,
        "ip": google_ip, "user_agent": google_ua,
    })
    try:
        import asyncio as _aio
        _aio.create_task(_maybe_send_suspicious_login_alert(
            user_id=user_id, method="google", ip=google_ip, ua=google_ua,
            when_iso=ts, event_id=event_result.inserted_id,
        ))
    except Exception:  # noqa: BLE001
        pass

    _set_session_cookie(response, session_token)

    user = await _db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}


@router.post("/auth/register")
async def customer_register(req: CustomerRegisterRequest, request: Request, response: Response):
    """Customer email/password signup. Auto-links past bookings by email.

    Referral: an optional `referral_code` in the payload links this new
    account back to the referrer. The credit unlocks after this user's
    FIRST paid booking (see `_apply_referral_conversion_if_paid`).
    """
    await _verify_turnstile(req.turnstile_token or "", request, "signup")
    email = req.email.lower()
    existing = await _db.users.find_one({"email": email})
    if existing and existing.get("password_hash"):
        raise HTTPException(400, "An account with this email already exists. Please sign in.")

    ts = _now_iso()
    referred_by: Optional[str] = None
    if req.referral_code:
        rc = req.referral_code.strip().upper()
        if rc:
            ref = await _db.users.find_one({"referral_code": rc})
            if ref and ref["email"] != email:
                referred_by = ref["user_id"]
    if existing:
        user_id = existing["user_id"]
        await _db.users.update_one(
            {"user_id": user_id},
            {"$set": {"password_hash": _hash_password(req.password), "name": req.name,
                      "provider": "email" if not existing.get("provider") else "both",
                      "updated_at": ts}},
        )
        if not existing.get("referral_code"):
            await _db.users.update_one(
                {"user_id": user_id},
                {"$set": {"referral_code": _new_referral_code()}},
            )
        if referred_by and not existing.get("referred_by"):
            await _db.users.update_one({"user_id": user_id}, {"$set": {"referred_by": referred_by}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        insert_doc = {
            "user_id": user_id, "email": email, "name": req.name, "picture": "",
            "password_hash": _hash_password(req.password), "provider": "email",
            "referral_code": _new_referral_code(),
            "credit_balance": 0.0,
            "created_at": ts,
        }
        if referred_by:
            insert_doc["referred_by"] = referred_by
        await _db.users.insert_one(insert_doc)

    token = await _create_customer_session(user_id, "email", request=request)
    _set_session_cookie(response, token)
    user = await _db.users.find_one({"user_id": user_id}, {"_id": 0})
    user.pop("password_hash", None)
    return {"user": user}


@router.post("/auth/login-email")
async def customer_login_email(req: CustomerLoginRequest, request: Request, response: Response):
    """Customer email/password login."""
    await _verify_turnstile(req.turnstile_token or "", request, "login")
    email = req.email.lower()
    user = await _db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(401, "Invalid email or password")
    if not _verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = await _create_customer_session(user["user_id"], "email", request=request)
    _set_session_cookie(response, token)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"user": user}


@router.get("/auth/me")
async def me(user: dict = _current_user()):
    return user


@router.post("/auth/heartbeat")
async def heartbeat(user: dict = _current_user()):
    """Called by frontend on activity to keep session alive within idle window.
    The get_current_user dep already refreshes last_activity_at."""
    return {"ok": True, "idle_timeout_minutes": _idle_timeout_minutes}


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        session = await _db.user_sessions.find_one({"session_token": token})
        if session:
            await _db.login_events.insert_one({
                "user_id": session["user_id"], "action": "logout",
                "method": session.get("auth_method"), "at": _now_iso(),
            })
            await _db.users.update_one(
                {"user_id": session["user_id"]},
                {"$set": {"last_logout_at": _now_iso()}},
            )
        await _db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


@router.post("/auth/logout-everywhere")
async def logout_everywhere(user: dict = _current_user(), response: Response = None):
    """Wipe every active session for the current user across all devices.

    Same session-annihilating behaviour as a successful password reset, but
    the user keeps their existing password. Handy for the "I lost my phone /
    used a hotel PC" scenario. Returns the count of sessions killed.
    """
    result = await _db.user_sessions.delete_many({"user_id": user["user_id"]})
    await _db.login_events.insert_one({
        "user_id": user["user_id"],
        "action": "logout_everywhere",
        "sessions_killed": result.deleted_count,
        "at": _now_iso(),
    })
    await _db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_logout_at": _now_iso(), "last_logout_everywhere_at": _now_iso()}},
    )
    if response is not None:
        response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True, "sessions_killed": result.deleted_count}


# ─── Active sessions (signed-in devices) ──────────────────────────────


def _parse_ua(ua: str) -> str:
    """Best-effort browser + OS label from a User-Agent string."""
    ua = ua or ""
    browser = "Browser"
    if "Chrome" in ua and "Edg" not in ua and "OPR" not in ua:
        browser = "Chrome"
    elif "Firefox" in ua:
        browser = "Firefox"
    elif "Safari" in ua and "Chrome" not in ua:
        browser = "Safari"
    elif "Edg" in ua:
        browser = "Edge"
    elif "OPR" in ua or "Opera" in ua:
        browser = "Opera"
    os_name = "Unknown"
    if "iPhone" in ua or "iPad" in ua or "iOS" in ua:
        os_name = "iOS"
    elif "Android" in ua:
        os_name = "Android"
    elif "Macintosh" in ua or "Mac OS" in ua:
        os_name = "macOS"
    elif "Windows" in ua:
        os_name = "Windows"
    elif "Linux" in ua:
        os_name = "Linux"
    return f"{browser} on {os_name}" if os_name != "Unknown" else browser


async def _geo_for_ip(ip: str) -> dict:
    """Look up cached geo for an IP. Analytics.py writes rows keyed by _id=ip
    with a nested {geo: {...}} sub-doc. Returns {city, region, country} or
    empty strings when we've never seen the IP before (no upstream call — we
    don't want to slow down login by more than one Mongo hit)."""
    if not ip:
        return {"city": "", "region": "", "country": ""}
    doc = await _db.visitor_geo_cache.find_one({"_id": ip})
    if not doc:
        return {"city": "", "region": "", "country": ""}
    g = doc.get("geo") or doc
    return {"city": g.get("city", ""), "region": g.get("region", ""), "country": g.get("country", "")}


async def _city_for_ip(ip: str) -> str:
    g = await _geo_for_ip(ip)
    parts = [g.get("city"), g.get("region"), g.get("country")]
    parts = [p for p in parts if p]
    return ", ".join(parts[:2])


@router.get("/auth/sessions")
async def list_sessions(request: Request, user: dict = _current_user()):
    """List every active session for the current user for the devices card."""
    current = request.cookies.get("session_token", "")
    sessions = []
    async for s in _db.user_sessions.find({"user_id": user["user_id"]}).sort("last_activity_at", -1):
        token = s.get("session_token", "")
        sessions.append({
            "id": token[:16],
            "current": token == current,
            "device": _parse_ua(s.get("user_agent", "")),
            "location": await _city_for_ip(s.get("ip", "")),
            "auth_method": s.get("auth_method", "email"),
            "last_activity_at": s.get("last_activity_at"),
            "created_at": s.get("created_at"),
        })
    return {"sessions": sessions}


@router.post("/auth/sessions/{session_prefix}/revoke")
async def revoke_session(session_prefix: str, user: dict = _current_user()):
    """Revoke one specific session by its ID prefix. Scoped to the current
    user_id so nobody can knock out someone else's session."""
    if not session_prefix or len(session_prefix) < 8:
        raise HTTPException(400, "Invalid session id")
    result = await _db.user_sessions.delete_one({
        "user_id": user["user_id"],
        "session_token": {"$regex": f"^{session_prefix}"},
    })
    if result.deleted_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}



# ─── Password reset (self-serve) ──────────────────────────────────────


@router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, request: Request):
    """Kick off a password-reset flow.

    Always returns the same generic response whether or not the email is
    registered — prevents user-enumeration. Rate-limited per email (max 3
    per hour) via a `password_reset_attempts` audit collection with TTL.
    """
    await _verify_turnstile(req.turnstile_token or "", request, "forgot_password")
    from datetime import datetime, timezone
    email = req.email.lower().strip()
    now = datetime.now(timezone.utc)
    generic_reply = {"ok": True, "message": "If that email is registered, a reset link is on its way."}

    # Per-email rate limit — 3 reset requests / hour
    one_hour_ago = (now - timedelta(hours=1)).isoformat()
    recent = await _db.password_reset_attempts.count_documents({
        "email": email,
        "created_at": {"$gte": one_hour_ago},
    })
    if recent >= 3:
        # Silent — still return generic reply so we don't leak that the email is real
        return generic_reply

    await _db.password_reset_attempts.insert_one({
        "email": email,
        "ip": (request.client.host if request.client else "") or request.headers.get("x-forwarded-for", ""),
        "created_at": now.isoformat(),
    })

    user = await _db.users.find_one({"email": email})
    if user and user.get("password_hash"):
        # Generate + persist a single-use, hashed, 60-minute reset token
        raw_token = _generate_reset_token()
        token_hash = _hash_reset_token(raw_token)
        expires_at = (now + timedelta(minutes=60)).isoformat()
        await _db.password_reset_tokens.insert_one({
            "token_hash": token_hash,
            "user_id": user["user_id"],
            "email": email,
            "expires_at": expires_at,
            "used_at": None,
            "created_at": now.isoformat(),
        })
        reset_url = f"{_site_base_url()}/reset-password?token={raw_token}"
        try:
            from notifications import send_password_reset_email
            send_password_reset_email(
                to_email=email,
                name=user.get("name", ""),
                reset_url=reset_url,
                expires_in_minutes=60,
            )
        except Exception:  # noqa: BLE001
            pass  # never leak send failures

    return generic_reply


@router.post("/auth/reset-password")
async def reset_password(req: ResetPasswordRequest, response: Response):
    """Consume a reset token and set the user's new password.

    - Token is hashed (SHA-256) before lookup; raw token is never persisted
    - Must not be expired
    - Must not have been used before (single-use)
    - Successful reset also invalidates all existing sessions for that user
    """
    from datetime import datetime, timezone
    token_hash = _hash_reset_token(req.token)
    doc = await _db.password_reset_tokens.find_one({"token_hash": token_hash})
    if not doc:
        raise HTTPException(400, "This reset link is invalid or has already been used.")
    if doc.get("used_at"):
        raise HTTPException(400, "This reset link has already been used. Request a new one.")
    if doc.get("expires_at") and doc["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(400, "This reset link has expired. Request a new one.")

    user = await _db.users.find_one({"user_id": doc["user_id"]})
    if not user:
        raise HTTPException(400, "Account no longer exists.")

    ts = _now_iso()
    await _db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": _hash_password(req.password), "password_reset_at": ts, "updated_at": ts}},
    )
    await _db.password_reset_tokens.update_one(
        {"token_hash": token_hash},
        {"$set": {"used_at": ts}},
    )
    # Kill any existing sessions so an attacker's stolen cookie doesn't survive a reset
    await _db.user_sessions.delete_many({"user_id": user["user_id"]})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True, "message": "Password updated. Please sign in with your new password."}
