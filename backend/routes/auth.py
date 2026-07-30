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
import uuid
from datetime import timedelta
from typing import Callable, Optional

import bcrypt
import httpx
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field


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


class CustomerLoginRequest(BaseModel):
    email: EmailStr
    password: str


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


async def _create_customer_session(user_id: str, method: str) -> str:
    session_token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    ts = _now_iso()
    await _db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "auth_method": method,
        "expires_at": (_now_utc() + timedelta(days=7)).isoformat(),
        "last_activity_at": ts,
        "created_at": ts,
    })
    await _db.users.update_one(
        {"user_id": user_id},
        {"$set": {"last_login_at": ts, "last_login_method": method}},
    )
    await _db.login_events.insert_one({
        "user_id": user_id, "action": "login", "method": method, "at": ts,
    })
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
    })
    await _db.login_events.insert_one({
        "user_id": user_id, "action": "login", "method": "google", "at": ts,
    })

    _set_session_cookie(response, session_token)

    user = await _db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}


@router.post("/auth/register")
async def customer_register(req: CustomerRegisterRequest, response: Response):
    """Customer email/password signup. Auto-links past bookings by email.

    Referral: an optional `referral_code` in the payload links this new
    account back to the referrer. The credit unlocks after this user's
    FIRST paid booking (see `_apply_referral_conversion_if_paid`).
    """
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

    token = await _create_customer_session(user_id, "email")
    _set_session_cookie(response, token)
    user = await _db.users.find_one({"user_id": user_id}, {"_id": 0})
    user.pop("password_hash", None)
    return {"user": user}


@router.post("/auth/login-email")
async def customer_login_email(req: CustomerLoginRequest, response: Response):
    """Customer email/password login."""
    email = req.email.lower()
    user = await _db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(401, "Invalid email or password")
    if not _verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = await _create_customer_session(user["user_id"], "email")
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
