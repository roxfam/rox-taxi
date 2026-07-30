from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request, Response, Cookie, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
import asyncio
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from fastapi.responses import StreamingResponse
from notifications import notify_booking_confirmed, notify_owner_booking_created, send_booking_reminder, send_rental_return_reminder
from facebook import post_gallery_photo_to_facebook, facebook_status
import paypal_client
from seed_data import TOURS_SEED, TAXI_SERVICES, RENTALS_SEED, CURRENT_RENTAL_IDS, HOME_SLIDES_SEED
from pdf_utils import build_wedding_pdf, build_receipt_pdf
from routes import payments as payments_module
from routes import admin as admin_module
import secrets_store

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Wire the DB-backed secrets store early so any module that imports
# `get_secret` after boot resolves overrides from Mongo.
secrets_store.configure(db)

JWT_SECRET = os.environ['JWT_SECRET']
ADMIN_EMAIL = os.environ['ADMIN_EMAIL']
ADMIN_PASSWORD_HASH = os.environ['ADMIN_PASSWORD_HASH']
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')
ZELLE_EMAIL = os.environ.get('ZELLE_EMAIL', '')
ZELLE_PHONE = os.environ.get('ZELLE_PHONE', '')
FACEBOOK_URL = os.environ.get('FACEBOOK_URL', '')
WHATSAPP_NUMBER = os.environ.get('WHATSAPP_NUMBER', '')
PAYPAL_ME_URL = os.environ.get('PAYPAL_ME_URL', '')
TRIPADVISOR_URL = os.environ.get('TRIPADVISOR_URL', '')
PHONE_NUMBER = os.environ.get('PHONE_NUMBER', '')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

CHAT_SYSTEM = (
    "You are Roxi, the friendly live-chat concierge for Rox Taxi Service & Tours based in Nassau, "
    "The Bahamas. Our specialty is taxi service across Nassau and Paradise Island. Be warm, brief and specific.\n\n"
    "TAXI SERVICES (our primary business — Nassau + Paradise Island focus):\n"
    "- LPIA Airport → Downtown Nassau / Cable Beach: $35 (up to 3 pax)\n"
    "- LPIA Airport → Paradise Island / Atlantis / Baha Mar: $45 (bridge toll included)\n"
    "- Cruise Port (Prince George Wharf) → Paradise Island: $25\n"
    "- Paradise Island ↔ Downtown Nassau shuttle: $20 per trip\n"
    "- Nassau city center hourly private charter: $55/hour (2h min)\n"
    "- Group van transfer (up to 8 pax, Nassau/PI): $90\n"
    "EXCURSIONS (departing Nassau / Paradise Island):\n"
    "- Blue Lagoon Island beach day (Nassau harbour): $89 (6h)\n"
    "- Rose Island snorkeling (off Paradise Island): $65 (4h)\n"
    "- Paradise Island / Atlantis city tour: $45 (3h)\n"
    "- Three-island boat hopping from Nassau: $149 (7h)\n"
    "CAR RENTALS (delivered free to LPIA or any Nassau/Paradise Island hotel): Nissan Versa $55/day, "
    "Toyota Corolla $69/day, Toyota RAV4 SUV $115/day, Mercedes GLE $245/day, 12-seater van $175/day.\n\n"
    "Payment: Credit Card & PayPal via Stripe, or Zelle transfer. Book online at /taxi, /tours, /rentals; "
    "track at /track. Facebook: https://www.facebook.com/roxtaxiservice/. Never invent prices or promise "
    "live driver location. If asked something off-topic, politely redirect."
)

app = FastAPI()
api_router = APIRouter(prefix="/api")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    if doc is None:
        return doc
    doc.pop("_id", None)
    return doc


# Reasons that trigger the strike-through "sale" badge on public pages.
_PROMO_KEYWORDS = ("promo", "sale", "discount", "special")


def annotate_promo(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Attach `promo` metadata when the latest price_history entry looks like a
    real promo: reason contains one of the keywords AND the change was a
    decrease AND the current price still equals the entry's new_price."""
    if doc is None:
        return doc
    ph = doc.get("price_history") or []
    if not ph:
        return doc
    latest = max(ph, key=lambda h: h.get("changed_at") or "")
    reason = (latest.get("reason") or "").lower()
    if not any(w in reason for w in _PROMO_KEYWORDS):
        return doc
    old = latest.get("old_price")
    new = latest.get("new_price")
    if old is None or new is None or new >= old:
        return doc
    if abs(float(doc.get("price") or 0) - float(new)) > 0.001:
        return doc
    doc["promo"] = {
        "is_promo": True,
        "original_price": float(old),
        "reason": latest.get("reason"),
        "changed_at": latest.get("changed_at"),
    }
    return doc


# ---------------- Models ----------------

class BookingCreate(BaseModel):
    service_type: str
    item_id: str
    item_name: str
    price: float
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    booking_date: str
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    passengers: int = Field(..., ge=1, le=20)  # mandatory
    days: Optional[int] = 1
    extra_luggage: Optional[int] = 0
    additional_drivers: Optional[int] = Field(0, ge=0, le=4)
    baby_seats: Optional[int] = Field(0, ge=0, le=3)
    notes: Optional[str] = None
    payment_method: str
    round_trip: Optional[bool] = False  # taxi: same-day return, 10% off both legs
    tip_amount: Optional[float] = Field(0, ge=0, le=1000)
    flight_number: Optional[str] = Field(None, max_length=12)
    gift_code: Optional[str] = Field(None, max_length=32)


LUGGAGE_FEE_USD = 3.0
LUGGAGE_MAX = 10
EXTRA_PASSENGER_FEE_USD = 5.0
EXTRA_PASSENGER_INCLUDED = 2  # first 2 passengers included in the flat fare; each additional adds the fee
RENTAL_DEPOSIT_USD = 150.0  # refundable security deposit applied automatically to every car rental booking
ADDITIONAL_DRIVER_FEE_USD = 25.0  # flat fee per extra registered driver on a car rental
ADDITIONAL_DRIVER_MAX = 4
RENTAL_MIN_DAYS = 2  # 2-day minimum booking policy for car rentals
BABY_SEAT_FEE_USD = 7.0
BABY_SEAT_MAX = 3
BABY_SEAT_FREE_AFTER_DAYS = 14  # 14+ day rentals include baby seats free
PARADISE_BRIDGE_TOLL_USD = 2.0  # $2 bridge toll auto-added to any taxi fare crossing to Paradise Island / Atlantis
ROUND_TRIP_DISCOUNT_PCT = 0.10  # 10% off when a taxi is booked as a same-day round trip
# Multi-day rental discount tiers — applied to price*days base (not deposit / add-ons).
RENTAL_DISCOUNT_TIERS = [(14, 0.12), (7, 0.07), (5, 0.03)]


def _rental_discount_pct(days: int) -> float:
    for threshold, pct in RENTAL_DISCOUNT_TIERS:
        if days >= threshold:
            return pct
    return 0.0

# Days closed (weekly). Python weekday: Monday=0..Sunday=6. Saturday=5.
CANCELLATION_FEE_PCT = 0.15  # 15% cancellation fee
CANCELLATION_NOTICE_HOURS = 48  # 48-hour notice required for eligible refund

CLOSED_WEEKDAYS = {5}
CLOSED_APPLIES_TO = {"taxi", "rental"}


def _parse_booking_date(s: str) -> datetime:
    """Best-effort ISO parse of 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' etc."""
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return datetime.fromisoformat(s)


def _validate_open_day(service_type: str, booking_date: str, days: int = 1):
    """Reject bookings whose PICKUP day falls on a closed weekday.

    For rentals only the pickup day is checked — drop-off / return on a
    Saturday IS allowed. Customers may keep the car through Saturday and
    return it that day (agreed hand-off at their hotel or airport).
    Taxi rides always have days=1 so this is a single-day check.
    Also honours admin-managed `blackout_dates` in site_config.
    """
    if service_type not in CLOSED_APPLIES_TO:
        return
    try:
        start = _parse_booking_date(booking_date)
    except Exception:
        return
    d = start.date()
    if d.weekday() in CLOSED_WEEKDAYS:
        raise HTTPException(
            400,
            f"We are closed on Saturdays for pickup. Please choose a different pickup date (requested {d.isoformat()}). Saturday drop-off is fine.",
        )
    # Blackout dates (holidays, family days) — cached briefly to avoid DB hit
    global _BLACKOUT_CACHE
    if _BLACKOUT_CACHE is None or (datetime.now(timezone.utc).timestamp() - _BLACKOUT_CACHE.get("_ts", 0)) > 60:
        _refresh_blackout_cache_sync()
    if d.isoformat() in (_BLACKOUT_CACHE or {}).get("dates", set()):
        raise HTTPException(
            400,
            f"We're offline on {d.isoformat()} — please pick another day. Contact us if urgent.",
        )


_BLACKOUT_CACHE: Optional[Dict[str, Any]] = None


def _refresh_blackout_cache_sync():
    """Sync helper to reload blackout dates from site_config. Called from the
    validator which runs inside an async context — this is safe because motor
    exposes sync helpers via `create_task` but we simplify by using a plain
    module-level cache and reload every 60 seconds."""
    global _BLACKOUT_CACHE
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            fut = asyncio.ensure_future(db.site_config.find_one({"_id": "main"}))
            # Best-effort — if we're inside a task, just skip refresh this call.
            _BLACKOUT_CACHE = _BLACKOUT_CACHE or {"_ts": 0, "dates": set()}
            return
    except Exception:  # noqa: BLE001
        pass


async def refresh_blackout_cache():
    """Async version — call after admin updates blackout_dates."""
    global _BLACKOUT_CACHE
    doc = await db.site_config.find_one({"_id": "main"}) or {}
    dates = set(doc.get("blackout_dates") or [])
    _BLACKOUT_CACHE = {"_ts": datetime.now(timezone.utc).timestamp(), "dates": dates}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CustomerRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=200)
    referral_code: Optional[str] = Field(None, max_length=20)


class CustomerLoginRequest(BaseModel):
    email: EmailStr
    password: str


class ContactMessage(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    subject: Optional[str] = "General inquiry"
    message: str


class DriverPing(BaseModel):
    """Driver-side geolocation ping. Auth is soft — the driver receives a short-lived
    tracking URL containing the booking_id at dispatch time. In a future iteration
    we can rotate a signed token per shift."""
    booking_id: str
    lat: float
    lng: float
    accuracy_m: Optional[float] = None
    heading: Optional[float] = None
    speed_mps: Optional[float] = None


class GiftCardPurchaseRequest(BaseModel):
    amount: float = Field(..., ge=25, le=1000)
    buyer_name: str = Field(..., min_length=1, max_length=100)
    buyer_email: EmailStr
    recipient_email: EmailStr
    recipient_name: Optional[str] = Field(None, max_length=100)
    message: Optional[str] = Field(None, max_length=400)
    origin_url: str


class GiftCardRedeemRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=32)


class GroupInquiryCreate(BaseModel):
    event_type: str  # wedding | corporate | family_reunion | cruise_group | bachelor | other
    event_date: str  # ISO date
    guest_count: int = Field(..., ge=2, le=500)
    needs: List[str] = []  # ["taxi","tours","rentals"]
    budget_range: Optional[str] = None
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    notes: Optional[str] = None
    package: Optional[Dict[str, Any]] = None  # wedding-builder structured selection
    estimated_total: Optional[float] = None


class TaxiQuoteRequest(BaseModel):
    """Fixed-rate lookup — user picks From + To, we match against known routes."""
    from_location: str = Field(..., min_length=1, max_length=200)
    to_location: str = Field(..., min_length=1, max_length=200)


class TaxiCustomQuoteRequest(BaseModel):
    """Fallback: customer requests a custom quote for a route we don't list."""
    from_location: str = Field(..., min_length=1, max_length=200)
    to_location: str = Field(..., min_length=1, max_length=200)
    customer_name: str = Field(..., min_length=1, max_length=100)
    customer_email: EmailStr
    customer_phone: str = Field(..., min_length=5, max_length=40)
    passengers: int = Field(1, ge=1, le=20)
    when: Optional[str] = None  # optional date/time
    notes: Optional[str] = None


# ---------------- Admin JWT auth ----------------

def make_admin_token(email: str) -> str:
    payload = {"sub": email, "role": "admin", "exp": now_utc() + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def require_admin(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    if payload.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    return payload["sub"]


@api_router.post("/auth/login")
async def admin_login(req: LoginRequest):
    if req.email.lower() != ADMIN_EMAIL.lower():
        raise HTTPException(401, "Invalid credentials")
    if not bcrypt.checkpw(req.password.encode(), ADMIN_PASSWORD_HASH.encode()):
        raise HTTPException(401, "Invalid credentials")
    return {"token": make_admin_token(req.email), "email": req.email}


# ---------------- Customer Google Auth (Emergent Managed) ----------------
# REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

IDLE_TIMEOUT_MINUTES = 60


def _hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:  # noqa: BLE001
        return False


async def _create_customer_session(user_id: str, method: str) -> str:
    """Create a user_sessions row for either google or email auth and return the token."""
    session_token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    ts = now_iso()
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "auth_method": method,
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
        "last_activity_at": ts,
        "created_at": ts,
    })
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"last_login_at": ts, "last_login_method": method}},
    )
    await db.login_events.insert_one({
        "user_id": user_id, "action": "login", "method": method, "at": ts,
    })
    return session_token


def _set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key="session_token", value=token, httponly=True, secure=True,
        samesite="none", path="/", max_age=60 * 60 * 24 * 7,
    )


async def get_current_user(request: Request):
    """Resolve customer from session_token cookie OR Authorization: Bearer header.
    Enforces 1-hour idle timeout — sessions with no activity for 60min are killed."""
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth.split(" ", 1)[1]
    if not token:
        raise HTTPException(401, "Not authenticated")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")

    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        await db.user_sessions.delete_one({"session_token": token})
        raise HTTPException(401, "Session expired")

    # 1-hour idle enforcement
    last_act = session.get("last_activity_at") or session.get("created_at")
    if last_act:
        try:
            last_dt = datetime.fromisoformat(last_act) if isinstance(last_act, str) else last_act
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            if (now_utc() - last_dt) > timedelta(minutes=IDLE_TIMEOUT_MINUTES):
                await db.user_sessions.delete_one({"session_token": token})
                await db.login_events.insert_one({
                    "user_id": session["user_id"], "action": "auto_logout_idle",
                    "method": session.get("auth_method"), "at": now_iso(),
                })
                raise HTTPException(401, "Session idle timeout")
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001
            pass

    # Refresh activity timestamp
    await db.user_sessions.update_one(
        {"session_token": token},
        {"$set": {"last_activity_at": now_iso()}},
    )

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    user.pop("password_hash", None)
    user["idle_timeout_minutes"] = IDLE_TIMEOUT_MINUTES
    return user


@api_router.post("/auth/session")
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
    ts = now_iso()

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "updated_at": ts, "last_login_at": ts, "last_login_method": "google"}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "provider": "google", "created_at": ts,
            "last_login_at": ts, "last_login_method": "google",
        })

    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token, "auth_method": "google",
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
        "last_activity_at": ts, "created_at": ts,
    })
    await db.login_events.insert_one({
        "user_id": user_id, "action": "login", "method": "google", "at": ts,
    })

    _set_session_cookie(response, session_token)

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}


@api_router.post("/auth/register")
async def customer_register(req: CustomerRegisterRequest, response: Response):
    """Customer email/password signup. Auto-links past bookings by email.

    Referral: an optional `referral_code` in the payload links this new
    account back to the referrer. The credit unlocks after this user's
    FIRST paid booking (see `_apply_referral_conversion_if_paid`).
    """
    email = req.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing and existing.get("password_hash"):
        raise HTTPException(400, "An account with this email already exists. Please sign in.")

    ts = now_iso()
    # Look up referrer if a code was supplied — MUST resolve before we create
    # the user record so we can store `referred_by` from day one.
    referred_by: Optional[str] = None
    if req.referral_code:
        rc = req.referral_code.strip().upper()
        if rc:
            ref = await db.users.find_one({"referral_code": rc})
            if ref and ref["email"] != email:
                referred_by = ref["user_id"]
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"password_hash": _hash_password(req.password), "name": req.name,
                      "provider": "email" if not existing.get("provider") else "both",
                      "updated_at": ts}},
        )
        # Retro-fit referral_code + referred_by if never set.
        if not existing.get("referral_code"):
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"referral_code": _new_referral_code()}},
            )
        if referred_by and not existing.get("referred_by"):
            await db.users.update_one({"user_id": user_id}, {"$set": {"referred_by": referred_by}})
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
        await db.users.insert_one(insert_doc)

    token = await _create_customer_session(user_id, "email")
    _set_session_cookie(response, token)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user.pop("password_hash", None)
    return {"user": user}


@api_router.post("/auth/login-email")
async def customer_login_email(req: CustomerLoginRequest, response: Response):
    """Customer email/password login."""
    email = req.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(401, "Invalid email or password")
    if not _verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = await _create_customer_session(user["user_id"], "email")
    _set_session_cookie(response, token)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"user": user}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/heartbeat")
async def heartbeat(user: dict = Depends(get_current_user)):
    """Called by frontend on activity to keep session alive within idle window.
    The get_current_user dep already refreshes last_activity_at."""
    return {"ok": True, "idle_timeout_minutes": IDLE_TIMEOUT_MINUTES}


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        session = await db.user_sessions.find_one({"session_token": token})
        if session:
            await db.login_events.insert_one({
                "user_id": session["user_id"], "action": "logout",
                "method": session.get("auth_method"), "at": now_iso(),
            })
            await db.users.update_one(
                {"user_id": session["user_id"]},
                {"$set": {"last_logout_at": now_iso()}},
            )
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


@api_router.get("/my/bookings")
async def my_bookings(user: dict = Depends(get_current_user)):
    docs = await db.bookings.find({"customer_email": user["email"]}).sort("created_at", -1).to_list(200)
    return [clean(d) for d in docs]


# ─── Referral rewards ────────────────────────────────────────────────
# One code per user (auto-generated on signup, format ROX-XXXX). A referral
# converts on the referee's FIRST paid booking. Every 5th conversion unlocks
# a $25 credit for the referrer, accumulated in `users.credit_balance`.

REFERRAL_REWARD_USD = 25.0
REFERRAL_REWARD_EVERY = 5


def _new_referral_code() -> str:
    import secrets, string
    chars = string.ascii_uppercase + string.digits
    tail = "".join(secrets.choice(chars) for _ in range(6))
    return f"ROX-{tail}"


async def _apply_referral_conversion_if_paid(booking_id: str) -> Optional[dict]:
    """Called by payments._mark_paid after a booking transitions to paid.
    Two responsibilities:
      1. Referral conversion — mark first-paid + credit referrer every Nth
      2. Deduct any `referral_credit` pending on this booking from the
         referee's own credit_balance (so cancelled/failed checkouts never
         burn credits).
    Idempotent — safe to call multiple times per booking.
    """
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        return None

    # ── (2) Deduct pending referral credit that was applied at booking time
    if booking.get("referral_credit_pending") and float(booking.get("referral_credit") or 0.0) > 0:
        email = (booking.get("customer_email") or "").lower()
        amt = round(float(booking["referral_credit"]), 2)
        if email:
            r = await db.users.update_one(
                {"email": email, "credit_balance": {"$gte": amt}},
                {"$inc": {"credit_balance": -amt}},
            )
            if r.modified_count:
                await db.bookings.update_one(
                    {"id": booking_id},
                    {"$set": {"referral_credit_pending": False, "referral_credit_deducted_at": now_iso()}},
                )

    # ── (1) Referral conversion — only once per referee
    if booking.get("referral_applied"):
        return None
    email = (booking.get("customer_email") or "").lower()
    if not email:
        return None
    referee = await db.users.find_one({"email": email})
    if not referee or not referee.get("referred_by"):
        return None
    # First paid booking only.
    prior_paid = await db.bookings.count_documents({
        "customer_email": email,
        "payment_status": "paid",
        "id": {"$ne": booking_id},
    })
    if prior_paid > 0:
        # Mark applied so we don't re-check every future payment.
        await db.bookings.update_one({"id": booking_id}, {"$set": {"referral_applied": True}})
        return None
    referrer_id = referee["referred_by"]
    ts = now_iso()
    await db.referrals.insert_one({
        "referrer_id": referrer_id, "referee_id": referee["user_id"],
        "referee_email": email, "booking_id": booking_id,
        "converted_at": ts, "credit_awarded": 0.0,
    })
    # Count total conversions for the referrer and award every Nth.
    conv_count = await db.referrals.count_documents({"referrer_id": referrer_id})
    credit_awarded = REFERRAL_REWARD_USD if conv_count > 0 and conv_count % REFERRAL_REWARD_EVERY == 0 else 0.0
    if credit_awarded > 0:
        await db.users.update_one({"user_id": referrer_id}, {"$inc": {"credit_balance": credit_awarded}})
        await db.referrals.update_one(
            {"referrer_id": referrer_id, "booking_id": booking_id},
            {"$set": {"credit_awarded": credit_awarded, "unlock_number": conv_count // REFERRAL_REWARD_EVERY}},
        )
    await db.bookings.update_one({"id": booking_id}, {"$set": {"referral_applied": True}})
    return {"referrer_id": referrer_id, "conv_count": conv_count, "credit_awarded": credit_awarded}


@api_router.get("/referrals/summary")
async def referral_summary(user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"user_id": user["user_id"]}) or {}
    code = doc.get("referral_code")
    if not code:
        code = _new_referral_code()
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral_code": code}})
    total_referred = await db.users.count_documents({"referred_by": user["user_id"]})
    total_converted = await db.referrals.count_documents({"referrer_id": user["user_id"]})
    credits_earned = round(REFERRAL_REWARD_USD * (total_converted // REFERRAL_REWARD_EVERY), 2)
    next_reward_at = REFERRAL_REWARD_EVERY - (total_converted % REFERRAL_REWARD_EVERY) if total_converted else REFERRAL_REWARD_EVERY
    return {
        "code": code,
        "referral_link": f"https://roxtaxi.com/signup?ref={code}",
        "total_referred": total_referred,
        "total_converted": total_converted,
        "credits_earned": credits_earned,
        "credit_balance": round(float(doc.get("credit_balance") or 0.0), 2),
        "next_reward_at": next_reward_at,
        "reward_per_unlock_usd": REFERRAL_REWARD_USD,
        "unlock_every": REFERRAL_REWARD_EVERY,
    }


# ─── Multi-city foundation ────────────────────────────────────────────
# Nassau is the flagship (active + inventoried). Other cities show a
# "Coming soon" splash with an email-capture wait-list until inventory is
# seeded. `active=True` means the switcher takes the guest to the main site.

CITIES = [
    {"slug": "nassau",   "name": "Nassau", "tagline": "The flagship — Paradise Island, cruise port, LPIA.", "active": True,  "path": "/"},
    {"slug": "freeport", "name": "Freeport", "tagline": "Grand Bahama's beach-town gateway.",              "active": False, "path": "/cities/freeport"},
    {"slug": "exuma",    "name": "Exuma",  "tagline": "Swimming pigs, sandbars and turquoise cays.",       "active": False, "path": "/cities/exuma"},
    {"slug": "andros",   "name": "Andros", "tagline": "The largest island — blue holes and bonefishing.",  "active": False, "path": "/cities/andros"},
]


@api_router.get("/cities")
async def list_cities():
    return {"cities": CITIES}


class WaitlistEntry(BaseModel):
    email: EmailStr
    city: str = Field(..., max_length=40)
    name: Optional[str] = Field(None, max_length=80)


@api_router.post("/waitlist")
async def join_waitlist(req: WaitlistEntry):
    slug = req.city.strip().lower()
    if slug not in {c["slug"] for c in CITIES}:
        raise HTTPException(400, "Unknown city")
    await db.waitlist.update_one(
        {"email": req.email.lower(), "city": slug},
        {"$setOnInsert": {
            "email": req.email.lower(), "city": slug, "name": req.name,
            "joined_at": now_iso(),
        }},
        upsert=True,
    )
    return {"ok": True, "city": slug, "message": f"You're on the {slug.title()} wait-list — we'll email you when we launch."}


# ─── Rental extension — guest self-serve extend flow ─────────────────────
# Quote endpoint computes the extra-days cost (respecting multi-day discount
# tiers) WITHOUT a fresh security deposit — the original deposit stays held
# on the parent booking until the (now longer) rental is completed.

class RentalExtendQuote(BaseModel):
    additional_days: int = Field(..., ge=1, le=30)


def _compute_extension_amount(booking: dict, additional_days: int) -> Dict[str, Any]:
    """Return {extra_cost, new_days, new_return_date, discount_pct_before, discount_pct_after}."""
    orig_days = int(booking.get("days") or 1)
    new_days = orig_days + additional_days
    daily = float(booking.get("price") or 0.0)
    orig_pct = _rental_discount_pct(orig_days)
    new_pct = _rental_discount_pct(new_days)
    # Fair pricing: charge additional_days × daily, but re-apply the (possibly
    # better) tier that unlocks with the new total length across the extension.
    extra_gross = round(daily * additional_days, 2)
    extra_discount = round(extra_gross * new_pct, 2)
    extra_cost = round(extra_gross - extra_discount, 2)
    pickup_dt = _parse_booking_date(booking["booking_date"])
    return {
        "orig_days": orig_days,
        "new_days": new_days,
        "additional_days": additional_days,
        "daily_price": daily,
        "extra_gross": extra_gross,
        "extra_discount": extra_discount,
        "extra_cost": extra_cost,
        "orig_discount_pct": orig_pct,
        "new_discount_pct": new_pct,
        "new_return_date": (pickup_dt + timedelta(days=new_days)).date().isoformat(),
    }


async def _check_extension_blackouts(booking: dict, additional_days: int):
    """Reject if any day of the extension window matches a vehicle or
    site-wide blackout. Raises HTTPException(400) with clashing dates."""
    orig_days = int(booking.get("days") or 1)
    pickup = _parse_booking_date(booking["booking_date"]).date()
    veh = await db.rentals.find_one({"id": booking.get("item_id")}) or {}
    veh_blk = set(veh.get("blackout_dates") or [])
    cfg = await db.site_config.find_one({"_id": "main"}) or {}
    site_blk = set(cfg.get("blackout_dates") or [])
    clashes = []
    for i in range(orig_days, orig_days + additional_days):
        d = (pickup + timedelta(days=i)).isoformat()
        if d in veh_blk or d in site_blk:
            clashes.append(d)
    if clashes:
        raise HTTPException(400, f"Extension blocked — vehicle unavailable on {', '.join(clashes)}.")


@api_router.post("/my/bookings/{booking_id}/extend/quote")
async def rental_extend_quote(booking_id: str, req: RentalExtendQuote, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id, "customer_email": user["email"]})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.get("service_type") != "rental":
        raise HTTPException(400, "Only rentals can be extended")
    if booking.get("status") in {"cancelled", "completed"}:
        raise HTTPException(400, f"Cannot extend a {booking['status']} booking")
    if booking.get("payment_status") != "paid":
        raise HTTPException(400, "Pay the original booking first, then extend.")
    await _check_extension_blackouts(booking, req.additional_days)
    quote = _compute_extension_amount(booking, req.additional_days)
    quote["deposit_note"] = "Your existing security deposit stays held on the original booking — no new deposit charged."
    return quote


class RentalExtendCheckout(BaseModel):
    additional_days: int = Field(..., ge=1, le=30)
    origin_url: str


@api_router.post("/my/bookings/{booking_id}/extend/checkout")
async def rental_extend_checkout(booking_id: str, req: RentalExtendCheckout, request: Request, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id, "customer_email": user["email"]})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.get("service_type") != "rental" or booking.get("status") in {"cancelled", "completed"} or booking.get("payment_status") != "paid":
        raise HTTPException(400, "Booking is not eligible for extension.")
    await _check_extension_blackouts(booking, req.additional_days)
    quote = _compute_extension_amount(booking, req.additional_days)
    if quote["extra_cost"] <= 0:
        raise HTTPException(400, "Extension amount must be > $0")

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_key = secrets_store.get_secret("STRIPE_API_KEY", "")
    sc = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    ext_id = f"ext_{uuid.uuid4().hex[:10]}"
    success_url = f"{req.origin_url.rstrip('/')}/my-bookings?extended={booking_id}&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{req.origin_url.rstrip('/')}/my-bookings?extend_cancelled={booking_id}"
    checkout_req = CheckoutSessionRequest(
        amount=float(quote["extra_cost"]), currency="usd",
        success_url=success_url, cancel_url=cancel_url,
        metadata={"booking_id": booking_id, "extension_id": ext_id, "kind": "rental_extension"},
    )
    session = await sc.create_checkout_session(checkout_req)
    await db.rental_extensions.insert_one({
        "id": ext_id, "booking_id": booking_id, "customer_email": user["email"],
        "additional_days": req.additional_days, "extra_cost": quote["extra_cost"],
        "quote": quote, "session_id": session.session_id,
        "status": "pending", "created_at": now_iso(),
    })
    await db.payment_transactions.insert_one({
        "session_id": session.session_id, "booking_id": booking_id,
        "kind": "rental_extension", "extension_id": ext_id,
        "amount": float(quote["extra_cost"]), "currency": "usd",
        "status": "initiated", "payment_status": "pending",
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    return {"checkout_url": session.url, "session_id": session.session_id, "extension_id": ext_id, "quote": quote}


async def apply_rental_extension_if_paid(session_id: str) -> bool:
    """Called by _mark_paid when the session belongs to a rental extension.
    Extends the parent booking's `days`, records the extension, keeps the
    original deposit untouched. Idempotent via `applied_at`."""
    ext = await db.rental_extensions.find_one({"session_id": session_id})
    if not ext or ext.get("applied_at"):
        return False
    booking = await db.bookings.find_one({"id": ext["booking_id"]})
    if not booking:
        return False
    add_days = int(ext["additional_days"])
    new_days = int(booking.get("days") or 1) + add_days
    new_total = round(float(booking.get("total") or 0.0) + float(ext["extra_cost"]), 2)
    ts = now_iso()
    entry = {
        "extension_id": ext["id"], "additional_days": add_days,
        "extra_cost": ext["extra_cost"], "applied_at": ts,
        "session_id": session_id,
    }
    await db.bookings.update_one(
        {"id": booking["id"]},
        {
            "$set": {"days": new_days, "total": new_total, "updated_at": ts},
            "$push": {"extensions": entry},
            "$unset": {"return_reminder_sent_at": "", "return_reminder_result": ""},
        },
    )
    await db.rental_extensions.update_one({"id": ext["id"]}, {"$set": {"status": "applied", "applied_at": ts}})
    return True


# ---------------- Seed content (Nassau / Paradise Island focus) ----------------
# Catalog seed data lives in seed_data.py to keep this file lean.


# ─────────────────────────────────────────────────────────────────────────
# Day-of-booking reminder loop
# ─────────────────────────────────────────────────────────────────────────
# Every 10 minutes we scan for bookings whose pickup time is within the next
# 24 hours (and any missed by up to 30 min due to a cron gap), that aren't
# cancelled/completed, and that haven't already been reminded. Sends email +
# SMS to the guest and an SMS to the on-call driver (ADMIN_SMS_NUMBER).
# Idempotency: `reminder_sent_at` is set on the booking doc after a
# successful send so we never double-notify.

REMINDER_LOOKAHEAD_HOURS = 24
REMINDER_INTERVAL_SECONDS = 600  # 10 min


async def _booking_reminder_loop() -> None:
    while True:
        try:
            await _run_reminder_tick()
        except Exception as e:  # noqa: BLE001
            logging.getLogger("rox.reminders").warning("tick error: %s", e)
        await asyncio.sleep(REMINDER_INTERVAL_SECONDS)


async def _run_reminder_tick() -> int:
    """Single reminder scan. Returns the number of reminders sent this tick.
    Broken out so tests can call it deterministically."""
    log = logging.getLogger("rox.reminders")
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(hours=REMINDER_LOOKAHEAD_HOURS)
    grace = now - timedelta(minutes=30)

    cfg = await db.site_config.find_one({"_id": "main"}) or {}
    prefs = {
        "notify_email_enabled": cfg.get("notify_email_enabled", True),
        "notify_sms_enabled":   cfg.get("notify_sms_enabled",   True),
    }
    driver_number = (secrets_store.get_secret("ADMIN_SMS_NUMBER") or WHATSAPP_NUMBER or "").strip() or None

    cur = db.bookings.find({
        "status": {"$nin": ["cancelled", "completed"]},
        "reminder_sent_at": {"$exists": False},
    })
    sent = 0
    async for b in cur:
        try:
            dt = _parse_booking_date(b.get("booking_date", ""))
        except Exception:
            continue
        # Only bookings whose pickup falls in [now - 30m, now + 24h].
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if not (grace <= dt <= cutoff):
            continue
        try:
            report = send_booking_reminder(b, prefs=prefs, driver_number=driver_number)
            await db.bookings.update_one(
                {"id": b["id"]},
                {"$set": {"reminder_sent_at": now.isoformat(), "reminder_result": report}},
            )
            sent += 1
            log.info("reminder sent for %s (email=%s guest_sms=%s driver_sms=%s)",
                     b["id"],
                     report.get("email", {}).get("sent"),
                     report.get("guest_sms", {}).get("sent"),
                     report.get("driver_sms", {}).get("sent"))
        except Exception as e:  # noqa: BLE001
            log.warning("reminder send fail for %s: %s", b.get("id"), e)

    # ── Rental return reminders — fire on the return day ──────────────
    # Return date = booking_date + days. Idempotent via `return_reminder_sent_at`.
    office_phone = (cfg.get("phone") or PHONE_NUMBER or WHATSAPP_NUMBER or "+1 (242) 432-2587").strip()
    cur2 = db.bookings.find({
        "service_type": "rental",
        "status": {"$nin": ["cancelled", "completed"]},
        "return_reminder_sent_at": {"$exists": False},
    })
    async for b in cur2:
        try:
            pickup_dt = _parse_booking_date(b.get("booking_date", ""))
        except Exception:
            continue
        if pickup_dt.tzinfo is None:
            pickup_dt = pickup_dt.replace(tzinfo=timezone.utc)
        days = int(b.get("days") or 1)
        return_dt = pickup_dt + timedelta(days=days)
        # Trigger when the return date falls inside [now - 30m, now + 24h].
        if not (grace <= return_dt <= cutoff):
            continue
        try:
            report = send_rental_return_reminder(
                b,
                return_date_iso=return_dt.isoformat(),
                office_phone=office_phone,
                prefs=prefs,
                driver_number=driver_number,
            )
            await db.bookings.update_one(
                {"id": b["id"]},
                {"$set": {
                    "return_reminder_sent_at": now.isoformat(),
                    "return_reminder_result": report,
                    "return_date": return_dt.isoformat(),
                }},
            )
            sent += 1
            log.info("rental return reminder sent for %s (return=%s)", b["id"], return_dt.date())
        except Exception as e:  # noqa: BLE001
            log.warning("return reminder send fail for %s: %s", b.get("id"), e)
    return sent


@app.on_event("startup")
async def seed_db():
    # Prime the DB-backed secrets store so get_secret() returns admin-managed
    # overrides from the very first request.
    try:
        await secrets_store.prime()
    except Exception as e:  # noqa: BLE001
        logging.warning("secrets_store prime warn: %s", e)
    # Kick off the day-of-booking reminder loop (email + SMS to guest, SMS to
    # driver). Idempotent via `reminder_sent_at` on the booking doc.
    try:
        asyncio.create_task(_booking_reminder_loop())
    except Exception as e:  # noqa: BLE001
        logging.warning("reminder loop start warn: %s", e)
    # Ensure customer auth indexes exist
    try:
        await db.users.create_index("email", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("last_activity_at")
    except Exception as e:  # noqa: BLE001
        logging.warning("auth index create warn: %s", e)
    # Idempotent seed. `price` + `price_history` are ONLY set on first insert so
    # admin-managed price edits survive restarts. Every other field ($set) still
    # tracks the seed file, so image / description tweaks propagate.
    # NOTE: `delete_many` was removed so admin-added items persist across restarts.
    def _split_seed(doc: Dict[str, Any]):
        # `price` is admin-managed after first insert. `seed_price` gets refreshed
        # on every startup so the "Reset to seed default" affordance in the admin
        # UI always references the CURRENT value in seed_data.py.
        preserve_keys = {"price"}
        set_payload = {k: v for k, v in doc.items() if k not in preserve_keys}
        set_payload["seed_price"] = doc.get("price")
        set_on_insert = {"price": doc.get("price"), "price_history": []}
        return set_payload, set_on_insert

    for t in TOURS_SEED:
        set_payload, set_on_insert = _split_seed(t)
        await db.tours.update_one(
            {"id": t["id"]},
            {"$set": set_payload, "$setOnInsert": set_on_insert},
            upsert=True,
        )
    for s in TAXI_SERVICES:
        set_payload, set_on_insert = _split_seed(s)
        await db.taxi_services.update_one(
            {"id": s["id"]},
            {"$set": set_payload, "$setOnInsert": set_on_insert},
            upsert=True,
        )
    for r in RENTALS_SEED:
        set_payload, set_on_insert = _split_seed(r)
        await db.rentals.update_one(
            {"id": r["id"]},
            {"$set": set_payload, "$setOnInsert": set_on_insert},
            upsert=True,
        )
    # Home-page hero slides — $setOnInsert on the whole doc so admin edits win.
    for slide in HOME_SLIDES_SEED:
        await db.home_slides.update_one(
            {"id": slide["id"]},
            {"$setOnInsert": slide},
            upsert=True,
        )
    # site_config doc
    cfg = await db.site_config.find_one({"_id": "main"})
    if not cfg:
        await db.site_config.insert_one({
            "_id": "main",
            "zelle_email": ZELLE_EMAIL, "zelle_phone": ZELLE_PHONE,
            "facebook_url": FACEBOOK_URL, "phone": PHONE_NUMBER or "+1 (242) 000-0000",
            "whatsapp_number": WHATSAPP_NUMBER,
            "paypal_me_url": PAYPAL_ME_URL,
            "tripadvisor_url": TRIPADVISOR_URL,
            "notify_email_enabled": True,
            "notify_sms_enabled": True,
        })
    else:
        # backfill new fields if missing (idempotent)
        patch = {}
        if not cfg.get("whatsapp_number"): patch["whatsapp_number"] = WHATSAPP_NUMBER
        if not cfg.get("paypal_me_url"): patch["paypal_me_url"] = PAYPAL_ME_URL
        if not cfg.get("tripadvisor_url"): patch["tripadvisor_url"] = TRIPADVISOR_URL
        if "notify_email_enabled" not in cfg: patch["notify_email_enabled"] = True
        if "notify_sms_enabled" not in cfg: patch["notify_sms_enabled"] = True
        if patch:
            await db.site_config.update_one({"_id": "main"}, {"$set": patch})

    # ── Fleet (drivers + vehicles) — seeded once, editable via admin ──
    fleet_doc = await db.fleet.find_one({"_id": "main"})
    if not fleet_doc:
        await db.fleet.insert_one({
            "_id": "main",
            "headline": "The team behind",
            "headline_accent": "your ride",
            "subheadline": "Bahamas-licensed. Full insured. Twelve years of Nassau shortcuts.",
            "drivers": [
                {"id": "d-rox",   "name": "Rox (Owner-Driver)",   "photo_url": "",
                 "tagline": "Founder · dispatcher · driver",
                 "years_driving": 12, "languages": ["English", "Bahamian Creole"],
                 "badges": ["TSA-Cleared", "First-Aid", "5★ Owner"],
                 "bio": "Started Rox Taxi with one van and a promise. Still answers the phone."},
                {"id": "d-julien", "name": "Julien W.", "photo_url": "",
                 "tagline": "Airport specialist",
                 "years_driving": 8, "languages": ["English", "French"],
                 "badges": ["TSA-Cleared", "Bilingual"],
                 "bio": "Runs the LPIA + cruise-port morning rush. Ask him about the best conch salad on West Bay."},
                {"id": "d-marcus", "name": "Marcus P.", "photo_url": "",
                 "tagline": "Tour guide certified",
                 "years_driving": 6, "languages": ["English", "Spanish"],
                 "badges": ["Certified Guide", "First-Aid"],
                 "bio": "Blue Lagoon + Atlantis regulars. Grew up on Paradise Island, knows every reef."},
                {"id": "d-nia",    "name": "Nia S.", "photo_url": "",
                 "tagline": "Wedding + private transfers",
                 "years_driving": 5, "languages": ["English"],
                 "badges": ["Wedding-Certified", "Chauffeur"],
                 "bio": "Discreet driver for weddings, honeymoons, and private-jet arrivals."},
            ],
            "vehicles": [
                {"id": "v-minivan", "name": "Toyota Sienna", "year": 2023, "type": "minivan",
                 "capacity": 7, "luggage_capacity": 8, "photo_url": "",
                 "features": ["Air Conditioning", "Free Wi-Fi", "USB charging", "Bottled water"],
                 "tagline": "Our workhorse — great for families & airport runs"},
                {"id": "v-suv", "name": "Chevrolet Suburban", "year": 2022, "type": "suv",
                 "capacity": 6, "luggage_capacity": 7, "photo_url": "",
                 "features": ["Leather", "Tinted windows", "Free Wi-Fi", "USB charging"],
                 "tagline": "Executive SUV for private tours & VIP transfers"},
                {"id": "v-sedan", "name": "Toyota Camry XLE", "year": 2023, "type": "sedan",
                 "capacity": 4, "luggage_capacity": 3, "photo_url": "",
                 "features": ["Air Conditioning", "Free Wi-Fi", "Bluetooth", "USB charging"],
                 "tagline": "Fuel-efficient sedan for solo travelers & couples"},
                {"id": "v-luxury", "name": "Cadillac Escalade", "year": 2024, "type": "luxury",
                 "capacity": 6, "luggage_capacity": 6, "photo_url": "",
                 "features": ["Premium leather", "Chauffeur service", "Champagne cooler", "Panoramic roof"],
                 "tagline": "For weddings, anniversaries & Baha Mar arrivals"},
                {"id": "v-pickup", "name": "Ford F-150 Convoy Truck", "year": 2022, "type": "pickup",
                 "capacity": 5, "luggage_capacity": 4, "photo_url": "",
                 "features": ["Bluetooth", "Bed cover", "Air Conditioning"],
                 "tagline": "For adventurous cruiser rentals — beach kit ready"},
            ],
            "trust_notes": [
                "Every driver: Bahamas Ministry of Tourism licensed",
                "Every vehicle: fully insured with roadside cover",
                "Live GPS tracking on every airport transfer",
                "Cashless payment options: Zelle · PayPal · Stripe · Cash",
            ],
        })
    else:
        # One-shot backfill: split legacy 'headline' that used to include the accent
        if fleet_doc.get("headline") == "The team behind your ride" and not fleet_doc.get("headline_accent"):
            await db.fleet.update_one(
                {"_id": "main"},
                {"$set": {"headline": "The team behind", "headline_accent": "your ride"}},
            )


# ---------------- Public catalog ----------------

@api_router.get("/tours")
async def list_tours():
    docs = await db.tours.find({"active": True}).to_list(200)
    return [annotate_promo(clean(d)) for d in docs]


@api_router.get("/taxi-services")
async def list_taxi_services():
    """Public fixed-fare taxi routes for the /taxi page grid."""
    docs = await db.taxi_services.find({"active": {"$ne": False}}).to_list(200)
    return [annotate_promo(clean(d)) for d in docs]


@api_router.get("/packages")
async def list_packages():
    """Public curated bundles. Each: {id, name, description, items:[{service_type,item_name}], subtotal, package_price, savings}."""
    docs = await db.packages.find({"active": {"$ne": False}}).to_list(50)
    if not docs:
        # Seed default packages if empty (idempotent — inserted once)
        seeds = [
            {"id": "airport-atlantis-airport", "active": True, "featured": True,
             "name": "LPIA → Atlantis → LPIA", "kicker": "Airport round-trip",
             "description": "Airport pickup, Atlantis drop-off, then return airport pickup on your departure day. Bridge tolls both ways included.",
             "items": [
                 {"service_type": "taxi", "item_name": "LPIA → Atlantis / Paradise Island", "price": 47.0},
                 {"service_type": "taxi", "item_name": "Atlantis / Paradise Island → LPIA", "price": 47.0},
             ],
             "subtotal": 94.0, "package_price": 84.0, "savings": 10.0,
             "image_url": "https://images.unsplash.com/photo-1509233725247-49e657c54213?crop=entropy&cs=srgb&fm=jpg&q=85"},
            {"id": "airport-tour-airport", "active": True, "featured": True,
             "name": "LPIA → Blue Lagoon → LPIA", "kicker": "Cruise-week bundle",
             "description": "LPIA transfer, full-day Blue Lagoon Island tour, plus return LPIA transfer for your flight home.",
             "items": [
                 {"service_type": "taxi", "item_name": "LPIA → Downtown Nassau", "price": 40.0},
                 {"service_type": "tour", "item_name": "Blue Lagoon Island Day Pass", "price": 109.0},
                 {"service_type": "taxi", "item_name": "Downtown Nassau → LPIA", "price": 40.0},
             ],
             "subtotal": 189.0, "package_price": 169.0, "savings": 20.0,
             "image_url": "https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/ou78camd_Photo-Caption-2-Airport-stakeholders-gear-up-for-busy-Thanksgiving-weekend-at-LPIA-002.webp"},
        ]
        for s in seeds:
            s["created_at"] = now_iso()
            await db.packages.update_one({"id": s["id"]}, {"$setOnInsert": s}, upsert=True)
        docs = await db.packages.find({"active": {"$ne": False}}).to_list(50)
    return [clean(d) for d in docs]


# ── Gift cards ────────────────────────────────────────────────────────────
def _new_gift_code() -> str:
    """Generates a human-friendly gift-card code like RXT-A9F3-XZ4Q."""
    import secrets, string
    alphabet = string.ascii_uppercase + string.digits
    def block(n): return "".join(secrets.choice(alphabet) for _ in range(n))
    return f"RXT-{block(4)}-{block(4)}"


@api_router.post("/gift-cards/purchase")
async def gift_card_purchase(req: GiftCardPurchaseRequest, request: Request):
    """Creates a pending gift card and a Stripe Checkout Session for it.
    Card is activated when the Stripe webhook confirms payment."""
    stripe_key = os.environ.get("STRIPE_API_KEY", "")
    if not stripe_key:
        raise HTTPException(503, "Stripe not configured")

    code = _new_gift_code()
    ts = now_iso()
    doc = {
        "code": code,
        "amount": round(float(req.amount), 2),
        "balance": round(float(req.amount), 2),
        "buyer_name": req.buyer_name,
        "buyer_email": req.buyer_email.lower(),
        "recipient_name": req.recipient_name or "",
        "recipient_email": req.recipient_email.lower(),
        "message": req.message or "",
        "status": "pending",   # → 'active' after Stripe webhook
        "created_at": ts,
    }
    await db.gift_cards.insert_one(doc)

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    sc = StripeCheckout(api_key=stripe_key, webhook_url=webhook_url)
    session = await sc.create_checkout_session(CheckoutSessionRequest(
        amount=float(req.amount), currency="usd",
        success_url=f"{req.origin_url}/gift-cards/success?code={code}",
        cancel_url=f"{req.origin_url}/gift-cards?cancelled=1",
        metadata={"gift_code": code, "type": "gift_card", "buyer_email": req.buyer_email},
    ))
    await db.gift_cards.update_one({"code": code}, {"$set": {"stripe_session_id": session.session_id, "updated_at": now_iso()}})
    return {"checkout_url": session.url, "code": code}


@api_router.get("/gift-cards/{code}")
async def gift_card_balance(code: str):
    doc = await db.gift_cards.find_one({"code": code.upper().strip()})
    if not doc:
        raise HTTPException(404, "Gift card not found")
    return {
        "code": doc["code"],
        "amount": doc.get("amount"),
        "balance": doc.get("balance"),
        "status": doc.get("status"),
        "recipient_name": doc.get("recipient_name") or None,
    }


@api_router.post("/gift-cards/redeem-check")
async def gift_card_redeem_check(req: GiftCardRedeemRequest):
    """Validate a code + return current balance. Actual deduction happens at booking-create time."""
    doc = await db.gift_cards.find_one({"code": req.code.upper().strip()})
    if not doc:
        raise HTTPException(404, "Gift card not found")
    if doc.get("status") != "active":
        raise HTTPException(400, f"Gift card is not active (status: {doc.get('status')})")
    if float(doc.get("balance", 0)) <= 0:
        raise HTTPException(400, "Gift card has no remaining balance")
    return {"code": doc["code"], "balance": float(doc.get("balance", 0)), "status": "active"}



# ---- Taxi custom-route quote lookup ----------------------------------------
# Every fixed-fare service in db.taxi_services has a name like
# "LPIA Airport → Downtown Nassau" or "Cable Beach ↔ Downtown". We normalise
# both endpoints to a canonical `location tag` so a customer can pick From/To
# from a dropdown and instantly see the matching fare. Bidirectional routes
# (↔) match either direction. Unknown routes fall through to a "Request a
# quote" form which stores an inquiry + pings the owner via SMS/email.
TAXI_LOCATIONS = [
    {"tag": "lpia",         "label": "LPIA — Nassau Airport",             "keywords": ["lpia", "airport", "l.p.i.a"]},
    {"tag": "cruise_port",  "label": "Nassau Cruise Port",                "keywords": ["cruise port", "prince george", "festival place"]},
    {"tag": "downtown",     "label": "Downtown Nassau / Bay Street",      "keywords": ["downtown", "bay street"]},
    {"tag": "cable_beach",  "label": "Cable Beach",                       "keywords": ["cable beach"]},
    {"tag": "baha_mar",     "label": "Baha Mar / SLS / Grand Hyatt",      "keywords": ["baha mar", "sls", "grand hyatt", "rosewood"]},
    {"tag": "paradise",     "label": "Paradise Island / Atlantis",        "keywords": ["paradise island", "atlantis"]},
    {"tag": "fish_fry",     "label": "Arawak Cay Fish Fry",               "keywords": ["fish fry", "arawak"]},
    {"tag": "montague",     "label": "Montague Beach",                    "keywords": ["montague"]},
    {"tag": "lyford",       "label": "Lyford Cay",                        "keywords": ["lyford"]},
    {"tag": "adelaide",     "label": "Adelaide Village / South West",     "keywords": ["adelaide"]},
    {"tag": "compass",      "label": "Compass Point / West Bay",          "keywords": ["compass point", "west bay"]},
    {"tag": "junkanoo",     "label": "Junkanoo Beach",                    "keywords": ["junkanoo"]},
    {"tag": "cabbage_beach","label": "Cabbage Beach",                     "keywords": ["cabbage"]},
    {"tag": "any_hotel",    "label": "My Nassau hotel (any)",             "keywords": ["any nassau hotel", "hotel"]},
]


def _match_location_tag(text: str) -> Optional[str]:
    t = (text or "").lower()
    # Longest keyword first so "cable beach" wins over "beach".
    all_keywords = []
    for loc in TAXI_LOCATIONS:
        for kw in loc["keywords"]:
            all_keywords.append((len(kw), kw, loc["tag"]))
    all_keywords.sort(reverse=True)
    for _, kw, tag in all_keywords:
        if kw in t:
            return tag
    return None


def _service_endpoints(service: Dict[str, Any]) -> Dict[str, Any]:
    name = (service.get("route") or service.get("name") or "")
    bidirectional = "↔" in name
    from_side, to_side = name, ""
    for sep in ["↔", "→", "->"]:
        if sep in name:
            parts = name.split(sep, 1)
            from_side, to_side = parts[0], parts[1]
            break
    return {
        "from_tag": _match_location_tag(from_side),
        "to_tag": _match_location_tag(to_side),
        "bidirectional": bidirectional,
    }


@api_router.get("/taxi/locations")
async def taxi_locations():
    """Public list of canonical taxi endpoints used by the From/To picker."""
    return TAXI_LOCATIONS


@api_router.post("/taxi/quote")
async def taxi_quote(req: TaxiQuoteRequest):
    """Match the user's From + To against known fixed-rate routes."""
    from_tag = _match_location_tag(req.from_location)
    to_tag = _match_location_tag(req.to_location)
    if not from_tag or not to_tag:
        return {"matched": False, "reason": "unknown_location",
                "message": "We couldn't recognize one of your locations. Request a custom quote below."}
    if from_tag == to_tag:
        return {"matched": False, "reason": "same_location",
                "message": "Pickup and dropoff look like the same location."}

    services = await db.taxi_services.find({}).to_list(200)
    for s in services:
        ep = _service_endpoints(s)
        if not ep["from_tag"] or not ep["to_tag"]:
            continue
        forward = ep["from_tag"] == from_tag and ep["to_tag"] == to_tag
        reverse = ep["bidirectional"] and ep["from_tag"] == to_tag and ep["to_tag"] == from_tag
        if forward or reverse:
            return {
                "matched": True,
                "service": annotate_promo(clean(s)),
                "direction": "forward" if forward else "reverse",
                "from_tag": from_tag,
                "to_tag": to_tag,
            }

    hourly = await db.taxi_services.find_one({"id": "hourly-charter"})
    return {
        "matched": False,
        "reason": "no_fixed_rate",
        "message": "No fixed fare for this exact route yet — request a custom quote below or book our hourly charter.",
        "fallback": annotate_promo(clean(hourly)) if hourly else None,
        "from_tag": from_tag,
        "to_tag": to_tag,
    }


@api_router.post("/taxi/quote-request")
async def taxi_custom_quote_request(req: TaxiCustomQuoteRequest):
    """Persist a custom-quote request and alert the owner."""
    doc = req.model_dump()
    doc["id"] = "QR-" + uuid.uuid4().hex[:8].upper()
    doc["status"] = "new"
    doc["created_at"] = now_iso()
    await db.taxi_quote_requests.insert_one(doc)

    try:
        from notifications import send_email, send_sms
        summary = (
            f"New custom taxi quote request ({doc['id']})\n"
            f"From: {req.from_location}\nTo: {req.to_location}\n"
            f"Passengers: {req.passengers}\n"
            f"When: {req.when or 'flexible'}\n"
            f"Guest: {req.customer_name} <{req.customer_email}> / {req.customer_phone}\n"
            f"Notes: {req.notes or '—'}"
        )
        if ADMIN_EMAIL:
            send_email(ADMIN_EMAIL, f"Custom quote request {doc['id']}", f"<pre>{summary}</pre>", summary)
        admin_sms = os.environ.get("ADMIN_SMS_NUMBER", "").strip()
        if admin_sms:
            send_sms(admin_sms, f"Rox custom quote {doc['id']}: {req.from_location} → {req.to_location} · {req.passengers}pax · {req.customer_name} {req.customer_phone}")
        send_email(
            req.customer_email,
            f"We got your quote request — Rox Taxi ({doc['id']})",
            f"<p>Hi {req.customer_name},</p><p>Thanks for reaching out. We'll reply within the hour with a price for <b>{req.from_location} → {req.to_location}</b>.</p>",
            f"Hi {req.customer_name}, thanks — we'll reply within the hour with a price for {req.from_location} → {req.to_location}.",
        )
    except Exception as e:  # noqa: BLE001
        logging.getLogger(__name__).warning("quote-request notify err: %s", e)

    return clean(doc)


@api_router.get("/rentals")
async def list_rentals():
    docs = await db.rentals.find({"active": True}).to_list(200)
    return [annotate_promo(clean(d)) for d in docs]


@api_router.get("/home-slides")
async def list_home_slides():
    """Public feed for the home page hero carousel — sorted by admin-set order."""
    docs = await db.home_slides.find({"active": True}).sort("order", 1).to_list(50)
    return [clean(d) for d in docs]


@api_router.get("/gallery")
async def list_gallery():
    """Aggregated public photo feed — home carousel + catalog images + admin
    uploads + APPROVED customer-submitted photos.

    Legacy guest uploads stored their URL as `/uploads/<file>`. The static
    handler lives at `/api/uploads/<file>` today, so we normalise those URLs
    at read time — old approvals keep rendering without a data migration.
    """

    def _canonicalise(url: str) -> str:
        if url and url.startswith("/uploads/"):
            return "/api" + url
        return url

    seen: dict[str, dict] = {}

    def _add(url, category, title, submitter=None):
        url = _canonicalise(url or "")
        if not url or url in seen:
            return
        entry = {"url": url, "category": category, "title": title}
        if submitter: entry["submitter"] = submitter
        seen[url] = entry

    for d in await db.home_slides.find({"active": True}).sort("order", 1).to_list(50):
        _add(d.get("image_url"), "nassau", d.get("title") or "Nassau")
    for d in await db.tours.find({"active": True}).to_list(200):
        _add(d.get("image_url"), "tours", d.get("name"))
    for d in await db.rentals.find({"active": True}).to_list(200):
        _add(d.get("image_url"), "rentals", d.get("name"))
    for d in await db.taxi_services.find({"active": True}).to_list(200):
        _add(d.get("image_url"), "taxi", d.get("name"))
    # Approved customer submissions
    for d in await db.gallery_submissions.find({"status": "approved"}).sort("approved_at", -1).to_list(200):
        _add(d.get("url"), "guests", d.get("caption") or "Guest moment", submitter=d.get("submitter_name"))
    return list(seen.values())


# ── Web Push helper (defined before endpoints that call it) ────────────
async def _send_admin_push(*, title: str, body: str, url: str = "/admin", tag: Optional[str] = None) -> int:
    """Broadcasts a Web Push to every stored admin subscription. Returns delivered count.
    Dead subscriptions (410 Gone) are cleaned up automatically."""
    priv = os.environ.get("VAPID_PRIVATE_KEY", "")
    subj = os.environ.get("VAPID_SUBJECT", "mailto:admin@example.com")
    if not priv:
        return 0
    try:
        from pywebpush import webpush, WebPushException  # local import so missing lib doesn't crash server boot
    except Exception:  # noqa: BLE001
        logger.warning("pywebpush not installed — skipping push")
        return 0
    subs = await db.push_subscriptions.find({}).to_list(200)
    if not subs:
        return 0
    import json as _json
    payload = _json.dumps({"title": title, "body": body, "url": url, "tag": tag or "rox-taxi"})
    delivered = 0
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                data=payload,
                vapid_private_key=priv,
                vapid_claims={"sub": subj},
                ttl=3600,
            )
            delivered += 1
        except WebPushException as e:
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code in (404, 410):
                # Subscription is dead — drop it
                await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
            logger.info(f"push send failed {code}: {e}")
        except Exception as e:  # noqa: BLE001
            logger.info(f"push send error: {e}")
    return delivered


# ── Customer gallery submissions ─────────────────────────────────────────
@api_router.post("/gallery/submit")
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
    (UPLOAD_DIR / filename).write_bytes(contents)
    doc = {
        "id": sub_id,
        "url": f"/api/uploads/{filename}",
        "filename": filename,
        "submitter_name": (submitter_name or "").strip()[:80] or "Anonymous guest",
        "submitter_email": (submitter_email or "").strip().lower()[:120],
        "caption": (caption or "").strip()[:200],
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.gallery_submissions.insert_one(doc)
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


@api_router.get("/admin/gallery/pending")
async def admin_list_pending(_admin: str = Depends(require_admin)):
    docs = await db.gallery_submissions.find({"status": "pending"}).sort("created_at", 1).to_list(200)
    return [clean(d) for d in docs]


@api_router.post("/admin/gallery/{sub_id}/approve")
async def admin_approve_submission(sub_id: str, _admin: str = Depends(require_admin)):
    r = await db.gallery_submissions.update_one(
        {"id": sub_id, "status": "pending"},
        {"$set": {"status": "approved", "approved_at": now_iso()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Submission not found or not pending")
    # Auto-post to Facebook (best-effort — approval succeeds either way)
    doc = await db.gallery_submissions.find_one({"id": sub_id})
    fb_result = {"ok": False, "post_id": None, "error": "not_attempted"}
    try:
        fb_result = await post_gallery_photo_to_facebook(
            image_url=doc.get("url", ""),
            submitter_name=doc.get("submitter_name", ""),
            guest_caption=doc.get("caption", ""),
        )
        await db.gallery_submissions.update_one(
            {"id": sub_id},
            {"$set": {
                "facebook_posted": fb_result.get("ok", False),
                "facebook_post_id": fb_result.get("post_id"),
                "facebook_error": fb_result.get("error"),
                "facebook_attempted_at": now_iso(),
            }},
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"facebook autopost failed: {e}")
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


@api_router.get("/admin/integrations/facebook/status")
async def admin_facebook_status(_admin: str = Depends(require_admin)):
    """Diagnostics — is the Facebook page token still valid and reachable?"""
    return await facebook_status()


@api_router.get("/admin/gallery/approved")
async def admin_list_approved(_admin: str = Depends(require_admin)):
    """Approved submissions with Facebook post-status for the admin panel repost UI."""
    docs = await db.gallery_submissions.find({"status": "approved"}).sort("approved_at", -1).to_list(200)
    return [clean(d) for d in docs]


@api_router.post("/admin/gallery/{sub_id}/repost-facebook")
async def admin_repost_facebook(sub_id: str, _admin: str = Depends(require_admin)):
    """Manually retry the Facebook post for an already-approved submission.
    Works whether the previous post attempt succeeded or failed."""
    doc = await db.gallery_submissions.find_one({"id": sub_id, "status": "approved"})
    if not doc:
        raise HTTPException(404, "Approved submission not found")
    result = await post_gallery_photo_to_facebook(
        image_url=doc.get("url", ""),
        submitter_name=doc.get("submitter_name", ""),
        guest_caption=doc.get("caption", ""),
    )
    await db.gallery_submissions.update_one(
        {"id": sub_id},
        {"$set": {
            "facebook_posted": result.get("ok", False),
            "facebook_post_id": result.get("post_id"),
            "facebook_error": result.get("error"),
            "facebook_attempted_at": now_iso(),
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


@api_router.post("/admin/gallery/{sub_id}/reject")
async def admin_reject_submission(sub_id: str, _admin: str = Depends(require_admin)):
    doc = await db.gallery_submissions.find_one({"id": sub_id})
    if not doc:
        raise HTTPException(404, "Submission not found")
    # Delete file from disk + mark rejected
    try:
        (UPLOAD_DIR / doc["filename"]).unlink(missing_ok=True)
    except Exception:  # noqa: BLE001
        pass
    await db.gallery_submissions.update_one({"id": sub_id}, {"$set": {"status": "rejected", "rejected_at": now_iso()}})
    return {"id": sub_id, "status": "rejected"}


# ── Broken-image detector ──────────────────────────────────────────────
# Scans every user-facing image URL across home slides, tours, taxi
# services, rentals and approved gallery submissions, HEAD-checks them
# concurrently, and returns everything that failed (status != 2xx or
# network timeout). Powers the "Image Health" panel in /admin/manage.

def _abs_image_url(url: str) -> str:
    """Turn a stored image_url into a fully-qualified URL suitable for
    HEAD. Legacy `/uploads/*` and `/api/uploads/*` are joined against the
    PUBLIC_SITE_URL so we can verify them from the backend host too."""
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    base = (os.environ.get("PUBLIC_SITE_URL") or "http://127.0.0.1:8001").rstrip("/")
    if url.startswith("/uploads/"):
        url = "/api" + url
    if not url.startswith("/"):
        url = "/" + url
    return base + url


async def _check_one_image(client: httpx.AsyncClient, entry: dict) -> dict:
    url = entry.get("_check_url") or entry["url"]
    try:
        r = await client.head(url, follow_redirects=True, timeout=8.0)
        # Some CDNs (incl. Unsplash + Wikimedia) 405/403 on HEAD but 200 on GET.
        if r.status_code in (403, 405):
            r = await client.get(url, follow_redirects=True, timeout=8.0)
        entry["status_code"] = r.status_code
        entry["ok"] = 200 <= r.status_code < 400
        entry["error"] = None if entry["ok"] else f"HTTP {r.status_code}"
    except Exception as e:  # noqa: BLE001
        entry["status_code"] = 0
        entry["ok"] = False
        entry["error"] = str(e)[:200] or "network error"
    entry.pop("_check_url", None)
    return entry


@api_router.get("/admin/images/scan")
async def admin_scan_images(_admin: str = Depends(require_admin)):
    """Return a list of every image URL used across the customer-facing
    catalog + gallery, annotated with reachability status. Broken items
    surface first so operators can spot 404s at a glance."""
    entries: list[dict] = []

    for d in await db.home_slides.find({}).sort("order", 1).to_list(100):
        if d.get("image_url"):
            entries.append({
                "source": "home_slide", "item_id": d.get("id"),
                "title": d.get("title") or "Home slide",
                "url": d.get("image_url"),
                "_check_url": _abs_image_url(d.get("image_url")),
                "admin_url": "/admin/manage?tab=home_slides",
            })
    for d in await db.tours.find({}).to_list(300):
        if d.get("image_url"):
            entries.append({
                "source": "tour", "item_id": d.get("id"),
                "title": d.get("name") or "Tour",
                "url": d.get("image_url"),
                "_check_url": _abs_image_url(d.get("image_url")),
                "admin_url": "/admin/manage?tab=tours",
            })
    for d in await db.rentals.find({}).to_list(300):
        if d.get("image_url"):
            entries.append({
                "source": "rental", "item_id": d.get("id"),
                "title": d.get("name") or "Rental",
                "url": d.get("image_url"),
                "_check_url": _abs_image_url(d.get("image_url")),
                "admin_url": "/admin/manage?tab=rentals",
            })
    for d in await db.taxi_services.find({}).to_list(300):
        if d.get("image_url"):
            entries.append({
                "source": "taxi_service", "item_id": d.get("id"),
                "title": d.get("name") or "Taxi service",
                "url": d.get("image_url"),
                "_check_url": _abs_image_url(d.get("image_url")),
                "admin_url": "/admin/manage?tab=taxi_services",
            })
    for d in await db.gallery_submissions.find({"status": "approved"}).sort("approved_at", -1).to_list(300):
        if d.get("url"):
            entries.append({
                "source": "guest_photo", "item_id": d.get("id"),
                "title": d.get("caption") or f"Guest photo by {d.get('submitter_name') or 'guest'}",
                "url": d.get("url"),
                "_check_url": _abs_image_url(d.get("url")),
                "admin_url": "/admin/manage?tab=gallery",
            })

    # Concurrent HEAD checks (bounded to prevent overwhelming remote CDNs)
    sem = asyncio.Semaphore(16)
    async with httpx.AsyncClient(headers={"User-Agent": "RoxTaxi-ImageHealth/1.0"}) as client:
        async def _bounded(e: dict) -> dict:
            async with sem:
                return await _check_one_image(client, e)
        results = await asyncio.gather(*[_bounded(e) for e in entries])

    broken = [r for r in results if not r["ok"]]
    return {
        "scanned_at": now_iso(),
        "total": len(results),
        "broken_count": len(broken),
        "broken": broken,
        "all": results,
    }


# ── Web Push notifications (admin-only alerts) ─────────────────────────
# Owner installs the site as a PWA / grants notification permission once,
# then gets a phone-native push every time a customer books, submits a
# photo, or a new contact message arrives. Free forever — no Twilio spend.
@api_router.get("/admin/push/vapid-public-key")
async def push_vapid_public_key(_admin: str = Depends(require_admin)):
    key = os.environ.get("VAPID_PUBLIC_KEY", "")
    if not key:
        raise HTTPException(503, "Push not configured — set VAPID_PUBLIC_KEY in backend/.env")
    return {"public_key": key}


@api_router.post("/admin/push/subscribe")
async def push_subscribe(sub: Dict[str, Any], _admin: str = Depends(require_admin)):
    """Persist the browser's PushSubscription so we can send from the server."""
    endpoint = (sub or {}).get("endpoint")
    keys = (sub or {}).get("keys") or {}
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(400, "Invalid subscription payload")
    doc = {
        "endpoint": endpoint,
        "keys": keys,
        "user_agent": (sub or {}).get("user_agent", ""),
        "created_at": now_iso(),
    }
    await db.push_subscriptions.update_one({"endpoint": endpoint}, {"$set": doc}, upsert=True)
    return {"ok": True}


@api_router.post("/admin/push/unsubscribe")
async def push_unsubscribe(sub: Dict[str, Any], _admin: str = Depends(require_admin)):
    endpoint = (sub or {}).get("endpoint")
    if endpoint:
        await db.push_subscriptions.delete_one({"endpoint": endpoint})
    return {"ok": True}


@api_router.post("/admin/push/test")
async def push_test(_admin: str = Depends(require_admin)):
    """Sends a hello-world push to every registered admin device."""
    sent = await _send_admin_push(
        title="Rox Taxi — test notification",
        body="If you see this, push notifications are working. 🎉",
        url="/admin",
        tag="rox-push-test",
    )
    return {"sent": sent}


# ── Driver manifest (today's assigned bookings) ────────────────────────
@api_router.get("/admin/driver/manifest")
async def driver_manifest(
    date: Optional[str] = None,
    _admin: str = Depends(require_admin),
):
    """Returns bookings scheduled for the given day (default today, America/Nassau).
    Ordered by booking_date ASC. Used by /driver/manifest mobile page."""
    if date:
        try:
            target = datetime.fromisoformat(date).date()
        except Exception:
            raise HTTPException(400, "date must be YYYY-MM-DD")
    else:
        # Nassau is UTC-5 year-round (no DST) — cheap approx w/o pulling pytz
        target = (datetime.now(timezone.utc) + timedelta(hours=-5)).date()
    day_start = datetime.combine(target, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    day_end = datetime.combine(target, datetime.max.time(), tzinfo=timezone.utc).isoformat()
    active_statuses = ["confirmed", "driver_assigned", "en_route", "arrived", "completed", "pending_payment"]
    cursor = db.bookings.find({
        "booking_date": {"$gte": day_start, "$lte": day_end},
        "status": {"$in": active_statuses},
    }).sort("booking_date", 1)
    docs = await cursor.to_list(200)
    return {"date": target.isoformat(), "bookings": [clean(d) for d in docs]}


@api_router.get("/rentals/{rental_id}/availability")
async def rental_availability(rental_id: str):
    """Return blackout date ranges for a rental — dates already booked."""
    active_statuses = ["confirmed", "driver_assigned", "en_route", "arrived", "pending_payment"]
    docs = await db.bookings.find({
        "service_type": "rental",
        "item_id": rental_id,
        "status": {"$in": active_statuses},
    }).to_list(500)

    blackouts = []
    for b in docs:
        try:
            start = datetime.fromisoformat(b["booking_date"].replace("Z", "+00:00")) if "T" in b["booking_date"] else datetime.fromisoformat(b["booking_date"])
        except Exception:  # noqa: BLE001
            continue
        days = int(b.get("days") or 1)
        end = start + timedelta(days=max(1, days))
        blackouts.append({
            "booking_id": b["id"],
            "start": start.date().isoformat(),
            "end": end.date().isoformat(),
            "days": days,
        })
    # sort by start date
    blackouts.sort(key=lambda x: x["start"])
    return {"rental_id": rental_id, "blackouts": blackouts}


@api_router.get("/site-config")
async def site_config():
    cfg = await db.site_config.find_one({"_id": "main"})
    if not cfg:
        cfg = {"facebook_url": FACEBOOK_URL, "zelle_email": ZELLE_EMAIL, "zelle_phone": ZELLE_PHONE, "phone": ""}
    else:
        cfg.pop("_id", None)
    # Auto-derive Messenger deep link (m.me/<slug>) from the Facebook page URL if the
    # admin hasn't set one explicitly. Handoff-to-Messenger button uses this.
    if not cfg.get("messenger_url"):
        fb = cfg.get("facebook_url") or ""
        # Extract page slug from https://facebook.com/<slug>[/]
        slug = ""
        if fb:
            try:
                path = fb.split("://", 1)[-1].split("/", 1)[-1]
                slug = path.strip("/").split("/")[0]
            except Exception:  # noqa: BLE001
                slug = ""
        if slug:
            cfg["messenger_url"] = f"https://m.me/{slug}"
    return cfg


# ---------------- Bookings ----------------

@api_router.post("/bookings")
async def create_booking(req: BookingCreate):
    _validate_open_day(req.service_type, req.booking_date, req.days or 1)
    if req.service_type == "rental" and (req.days or 0) < RENTAL_MIN_DAYS:
        raise HTTPException(
            400,
            f"Car rentals have a {RENTAL_MIN_DAYS}-day minimum. Please increase the number of days.",
        )
    # ── Per-vehicle blackout check (rentals only) ────────────────────────
    # Reject the booking if ANY day between pickup and return matches a date
    # in that specific rental's blackout_dates array (car in service, already
    # held offline, etc.). Admin manages this list from /admin/manage?tab=rentals.
    if req.service_type == "rental":
        rental_doc = await db.rentals.find_one({"id": req.item_id})
        vehicle_blackouts = set((rental_doc or {}).get("blackout_dates") or [])
        if vehicle_blackouts:
            try:
                start_dt = _parse_booking_date(req.booking_date).date()
                span_days = max(1, int(req.days or 1))
                clashes = [
                    (start_dt + timedelta(days=i)).isoformat()
                    for i in range(span_days)
                    if (start_dt + timedelta(days=i)).isoformat() in vehicle_blackouts
                ]
                if clashes:
                    raise HTTPException(
                        400,
                        f"This vehicle is unavailable on {', '.join(clashes)}. "
                        f"Please pick different dates or another vehicle.",
                    )
            except HTTPException:
                raise
            except Exception:  # noqa: BLE001
                pass
    booking = req.model_dump()
    booking["id"] = str(uuid.uuid4())[:8].upper()
    booking["status"] = "pending_payment" if req.payment_method == "stripe" else "confirmed"
    booking["payment_status"] = "pending"
    booking["created_at"] = now_iso()
    booking["updated_at"] = now_iso()

    # Base: taxi/tour = fixed price; rental = price * days
    base = float(req.price) * max(1, req.days or 1)
    round_trip_fare_addition = 0.0
    round_trip_discount = 0.0
    rental_discount = 0.0
    tip_amount = round(float(req.tip_amount or 0.0), 2)

    luggage_fee = 0.0
    passenger_fee = 0.0
    deposit_amount = 0.0
    additional_driver_fee = 0.0
    bridge_toll_fee = 0.0
    if req.service_type == "taxi":
        if req.flight_number:
            booking["flight_number"] = req.flight_number.strip().upper().replace(" ", "")
        extra = max(0, min(int(req.extra_luggage or 0), LUGGAGE_MAX))
        luggage_fee = extra * LUGGAGE_FEE_USD
        booking["luggage_fee"] = luggage_fee
        booking["extra_luggage"] = extra
        if int(req.passengers) > EXTRA_PASSENGER_INCLUDED:
            passenger_fee = (int(req.passengers) - EXTRA_PASSENGER_INCLUDED) * EXTRA_PASSENGER_FEE_USD
        booking["passenger_fee"] = passenger_fee
        # Auto-add $2 Paradise Island bridge toll for any taxi trip crossing the
        # bridge to Paradise Island / Atlantis. Detected by keyword match on
        # the service name OR dropoff location so it works for both packaged
        # and free-form routes.
        _combined = f"{req.item_name} {req.dropoff_location or ''} {req.pickup_location or ''}".lower()
        if any(k in _combined for k in ("paradise island", "atlantis", "→ paradise", "-> paradise")):
            bridge_toll_fee = PARADISE_BRIDGE_TOLL_USD
            booking["bridge_toll_fee"] = bridge_toll_fee
            _existing = str(req.notes or "").strip()
            _toll_note = f"⚠ Includes ${PARADISE_BRIDGE_TOLL_USD:.0f} Paradise Island bridge toll pass (round-trip). Toll billed to driver at the crossing and reimbursed on this booking."
            booking["notes"] = (_existing + " · " + _toll_note).strip(" ·") if _existing else _toll_note
        # Round-trip: charge the fare twice, then apply 10% off both legs.
        if req.round_trip:
            round_trip_fare_addition = base
            round_trip_discount = round((base * 2) * ROUND_TRIP_DISCOUNT_PCT, 2)
            booking["round_trip"] = True
            booking["round_trip_discount"] = round_trip_discount
    if req.service_type == "rental":
        deposit_amount = RENTAL_DEPOSIT_USD
        booking["deposit_amount"] = deposit_amount
        booking["deposit_status"] = "held"  # released back to customer after vehicle return
        extra_drivers = max(0, min(int(req.additional_drivers or 0), ADDITIONAL_DRIVER_MAX))
        additional_driver_fee = extra_drivers * ADDITIONAL_DRIVER_FEE_USD
        booking["additional_drivers"] = extra_drivers
        booking["additional_driver_fee"] = additional_driver_fee
        # Baby seat add-on: $7/day/seat, free when rental is 14+ days
        seat_count = max(0, min(int(req.baby_seats or 0), BABY_SEAT_MAX))
        rental_days = int(req.days or 1)
        if seat_count > 0:
            booking["baby_seats"] = seat_count
            if rental_days >= BABY_SEAT_FREE_AFTER_DAYS:
                baby_seat_fee = 0.0
                booking["baby_seat_free"] = True
            else:
                baby_seat_fee = round(seat_count * BABY_SEAT_FEE_USD * rental_days, 2)
                booking["baby_seat_free"] = False
            booking["baby_seat_fee"] = baby_seat_fee
        # Multi-day discount tiers on the base rental price*days portion.
        _pct = _rental_discount_pct(int(req.days or 1))
        if _pct > 0:
            rental_discount = round(base * _pct, 2)
            booking["rental_discount"] = rental_discount
            booking["rental_discount_pct"] = _pct

    if tip_amount > 0:
        booking["tip_amount"] = tip_amount

    computed_total = round(
        base + round_trip_fare_addition - round_trip_discount - rental_discount
        + luggage_fee + passenger_fee + deposit_amount + additional_driver_fee
        + bridge_toll_fee + tip_amount + booking.get("baby_seat_fee", 0.0),
        2,
    )

    # ── Admin-run promotion auto-apply ──────────────────────────────────
    # If any active promotion matches the service type + is within its
    # start/end window, apply the largest discount. Percent promos are
    # applied to the pre-discount base (before rental discount); fixed
    # promos come off the computed_total directly. Excludes deposit + tip.
    promo = await _best_active_promo(req.service_type)
    promo_discount = 0.0
    if promo:
        discountable = round(max(0.0, computed_total - deposit_amount - tip_amount), 2)
        if promo.get("discount_type") == "percent":
            promo_discount = round(discountable * (float(promo.get("discount_value", 0)) / 100.0), 2)
        else:
            promo_discount = round(min(float(promo.get("discount_value", 0)), discountable), 2)
        if promo_discount > 0:
            booking["promotion_id"] = promo.get("id")
            booking["promotion_label"] = promo.get("label")
            booking["promotion_discount"] = promo_discount
            computed_total = round(computed_total - promo_discount, 2)

    # ── Gift-card redemption ────────────────────────────────────────────
    gift_credit = 0.0
    if req.gift_code:
        code = req.gift_code.upper().strip()
        gc = await db.gift_cards.find_one({"code": code, "status": "active"})
        if not gc:
            raise HTTPException(400, "Gift card not found or not active")
        bal = float(gc.get("balance", 0.0))
        if bal <= 0:
            raise HTTPException(400, "Gift card has no remaining balance")
        gift_credit = round(min(bal, computed_total), 2)
        booking["gift_code"] = code
        booking["gift_credit"] = gift_credit
        # Deduct from card + record redemption
        await db.gift_cards.update_one(
            {"code": code},
            {"$inc": {"balance": -gift_credit},
             "$push": {"redemptions": {"booking_id": booking["id"], "amount": gift_credit, "at": now_iso()}}},
        )

    # ── Referral-reward credit auto-apply ────────────────────────────────
    # If the customer email maps to a user with a `credit_balance > 0`, apply
    # up to the remaining total (after promo + gift). The balance is only
    # deducted from the user record when the booking actually pays (see
    # payments._mark_paid → deduct_referral_credit_if_paid), so cancellations
    # / failed checkouts don't burn credits.
    referral_credit = 0.0
    remaining = round(max(0.0, computed_total - gift_credit), 2)
    if remaining > 0 and req.customer_email:
        user_doc = await db.users.find_one({"email": req.customer_email.lower()})
        avail = round(float((user_doc or {}).get("credit_balance") or 0.0), 2)
        if avail > 0:
            referral_credit = round(min(avail, remaining), 2)
            booking["referral_credit"] = referral_credit
            booking["referral_credit_pending"] = True   # deducted on payment

    booking["total"] = round(max(0.0, computed_total - gift_credit - referral_credit), 2)

    await db.bookings.insert_one(booking)
    # Admin push — never let a push failure block the response
    try:
        await _send_admin_push(
            title=f"New booking · {booking['id']}",
            body=f"{booking.get('customer_name','A guest')} booked {booking.get('item_name','a service')} — ${booking.get('total',0):.2f}",
            url="/admin",
            tag=f"booking-{booking['id']}",
        )
    except Exception:  # noqa: BLE001
        pass
    # Fire owner SMS alert for EVERY new booking (regardless of payment method).
    # We swallow errors so a Twilio hiccup can't block a successful reservation.
    try:
        owner_sms = notify_owner_booking_created(clean(dict(booking)))
        if owner_sms.get("sent"):
            logging.info("owner alert sent for booking %s", booking["id"])
    except Exception as e:  # noqa: BLE001
        logging.warning("owner alert err: %s", e)
    if req.payment_method == "zelle":
        try:
            prefs = await db.site_config.find_one({"_id": "main"}) or {}
            report = notify_booking_confirmed(clean(dict(booking)), prefs)
            notified_at = now_iso()
            await db.bookings.update_one(
                {"id": booking["id"]},
                {"$set": {"notification_status": report, "notified_at": notified_at}},
            )
            booking["notification_status"] = report
            booking["notified_at"] = notified_at
        except Exception as e:  # noqa: BLE001
            logging.warning("notify err: %s", e)
    return clean(booking)


@api_router.get("/fees")
async def get_fees():
    """Public fee reference for the frontend."""
    return {
        "luggage_fee_usd": LUGGAGE_FEE_USD,
        "luggage_max": LUGGAGE_MAX,
        "luggage_policy": "First checked bag and carry-on are free. Additional bags $3 each.",
        "extra_passenger_fee_usd": EXTRA_PASSENGER_FEE_USD,
        "extra_passenger_included": EXTRA_PASSENGER_INCLUDED,
        "passenger_policy": f"Taxi flat rate covers up to {EXTRA_PASSENGER_INCLUDED} passengers. Each additional passenger is +${EXTRA_PASSENGER_FEE_USD:.0f}.",
        "rental_deposit_usd": RENTAL_DEPOSIT_USD,
        "rental_deposit_policy": (
            f"A refundable security deposit of ${RENTAL_DEPOSIT_USD:.0f} is added automatically to every car "
            "rental booking. It is released back to the customer after the vehicle is returned undamaged, with a "
            "full tank and on time."
        ),
        "additional_driver_fee_usd": ADDITIONAL_DRIVER_FEE_USD,
        "additional_driver_max": ADDITIONAL_DRIVER_MAX,
        "additional_driver_policy": (
            f"Each additional registered driver on a car rental is ${ADDITIONAL_DRIVER_FEE_USD:.0f} (max "
            f"{ADDITIONAL_DRIVER_MAX} additional drivers). The primary driver is always included."
        ),
        "rental_min_days": RENTAL_MIN_DAYS,
        "rental_min_days_policy": (
            f"Car rentals have a {RENTAL_MIN_DAYS}-day minimum booking period."
        ),
        "paradise_bridge_toll": PARADISE_BRIDGE_TOLL_USD,
        "paradise_bridge_toll_policy": (
            f"A ${PARADISE_BRIDGE_TOLL_USD:.0f} bridge toll pass fee is automatically added to any taxi fare going to Paradise Island or Atlantis."
        ),
        "round_trip_discount_pct": ROUND_TRIP_DISCOUNT_PCT,
        "round_trip_policy": f"Book taxi pickup + return on the same day for {int(ROUND_TRIP_DISCOUNT_PCT*100)}% off both legs.",
        "rental_discount_tiers": [
            {"min_days": d, "pct": p, "label": f"{int(p*100)}% off {d}+ days"} for d, p in RENTAL_DISCOUNT_TIERS
        ],
        "closed_weekdays": sorted(CLOSED_WEEKDAYS),
        "closed_weekdays_labels": ["Saturday"],
        "closed_policy": "Taxi service and car-rental pickups are closed on Saturdays. Rental drop-offs on Saturdays ARE allowed.",
        "closed_applies_to": sorted(CLOSED_APPLIES_TO),
        "cancellation_fee_pct": CANCELLATION_FEE_PCT,
        "cancellation_notice_hours": CANCELLATION_NOTICE_HOURS,
        "cancellation_policy": (
            f"Cancellations made at least {CANCELLATION_NOTICE_HOURS} hours before the service will be refunded "
            f"minus a {int(CANCELLATION_FEE_PCT*100)}% cancellation fee. Cancellations within "
            f"{CANCELLATION_NOTICE_HOURS} hours are non-refundable."
        ),
    }


@api_router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str):
    """Public cancel endpoint. Applies 15% fee when ≥48hr notice, else no refund.
    When eligible AND payment was via Stripe or PayPal, automatically fires the
    provider's refund API. Zelle refunds must be handled manually by owner."""
    doc = await db.bookings.find_one({"id": booking_id.upper()})
    if not doc:
        raise HTTPException(404, "Booking not found")
    if doc.get("status") == "cancelled":
        raise HTTPException(400, "Booking already cancelled")
    if doc.get("status") == "completed":
        raise HTTPException(400, "Cannot cancel a completed booking")

    try:
        service_dt = _parse_booking_date(doc["booking_date"])
    except Exception:
        raise HTTPException(400, "Cannot parse booking date")
    if service_dt.tzinfo is None:
        service_dt = service_dt.replace(tzinfo=timezone.utc)

    hours_until = (service_dt - now_utc()).total_seconds() / 3600.0
    eligible = hours_until >= CANCELLATION_NOTICE_HOURS

    total = float(doc.get("total") or 0.0)
    paid = doc.get("payment_status") == "paid"
    fee = round(total * CANCELLATION_FEE_PCT, 2) if eligible else (total if paid else 0.0)
    refund = round(max(0.0, total - fee), 2) if paid else 0.0

    # ── AUTO-REFUND — fire provider API when eligible + paid ───────────────
    refund_result: Dict[str, Any] = {"attempted": False}
    pay_method = (doc.get("payment_method") or "").lower()
    if paid and eligible and refund > 0.01:
        refund_result["attempted"] = True
        refund_result["method"] = pay_method
        try:
            if pay_method == "stripe" and doc.get("stripe_session_id"):
                async with httpx.AsyncClient(timeout=15.0) as ac:
                    # Stripe: retrieve session to get payment_intent, then refund
                    s = await ac.get(
                        f"https://api.stripe.com/v1/checkout/sessions/{doc['stripe_session_id']}",
                        auth=(os.environ.get("STRIPE_API_KEY", ""), ""),
                    )
                    intent_id = (s.json() or {}).get("payment_intent")
                    if intent_id:
                        r = await ac.post(
                            "https://api.stripe.com/v1/refunds",
                            data={"payment_intent": intent_id, "amount": str(int(refund * 100))},
                            auth=(os.environ.get("STRIPE_API_KEY", ""), ""),
                        )
                        j = r.json()
                        refund_result.update({"ok": r.status_code == 200, "id": j.get("id"), "status": j.get("status")})
            elif pay_method in ("paypal_checkout", "paypal") and doc.get("paypal_capture_id"):
                # PayPal refund via REST — /v2/payments/captures/{id}/refund
                try:
                    from paypal_client import _base_url as _pp_base, _access_token
                    async with httpx.AsyncClient(timeout=15.0) as ac:
                        tok = await _access_token()
                        r = await ac.post(
                            f"{_pp_base()}/v2/payments/captures/{doc['paypal_capture_id']}/refund",
                            headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
                            json={"amount": {"value": f"{refund:.2f}", "currency_code": "USD"}, "note_to_payer": "Rox Taxi — booking cancellation refund"},
                        )
                        j = r.json()
                        refund_result.update({"ok": r.status_code in (200, 201), "id": j.get("id"), "status": j.get("status")})
                except Exception as e:  # noqa: BLE001
                    refund_result.update({"ok": False, "error": f"paypal client err: {e}"})
            else:
                refund_result.update({"ok": False, "reason": "Manual refund required (Zelle or unsupported method)"})
        except Exception as e:  # noqa: BLE001
            # Log full error internally, expose only sanitised summary to public.
            logging.getLogger(__name__).warning("refund err on %s: %s", doc.get("id"), e)
            refund_result.update({"ok": False, "error": "Refund could not be processed automatically — owner will refund manually."})

    await db.bookings.update_one(
        {"id": doc["id"]},
        {"$set": {
            "status": "cancelled",
            "cancellation": {
                "cancelled_at": now_iso(),
                "hours_notice": round(hours_until, 2),
                "eligible_for_refund": eligible,
                "fee": fee,
                "refund_estimate": refund,
                "fee_pct": CANCELLATION_FEE_PCT,
                "refund_result": refund_result,
            },
            "updated_at": now_iso(),
        }},
    )
    return {
        "id": doc["id"],
        "status": "cancelled",
        "hours_notice": round(hours_until, 2),
        "eligible_for_refund": eligible,
        "cancellation_fee": fee,
        "refund_estimate": refund,
        "refund_result": refund_result,
        "payment_status": doc.get("payment_status"),
        "message": (
            f"Cancelled with {round(hours_until,1)}h notice. Refund estimate: ${refund:.2f} (fee ${fee:.2f})."
            if paid and eligible else
            "Cancelled. Refund not eligible — booking was within the 48-hour window."
            if paid and not eligible else
            "Cancelled. No payment had been received."
        ),
    }


@api_router.get("/blackout-dates")
async def public_blackout_dates():
    doc = await db.site_config.find_one({"_id": "main"}) or {}
    return {"blackout_dates": doc.get("blackout_dates") or []}


class BlackoutDatesUpdate(BaseModel):
    dates: List[str] = Field(..., description="ISO date strings YYYY-MM-DD")


@api_router.post("/admin/blackout-dates")
async def admin_set_blackout_dates(req: BlackoutDatesUpdate, _admin: dict = Depends(require_admin)):
    valid = []
    for d in req.dates:
        try:
            datetime.strptime(d, "%Y-%m-%d")
            valid.append(d)
        except Exception:  # noqa: BLE001
            pass
    valid = sorted(set(valid))
    await db.site_config.update_one({"_id": "main"}, {"$set": {"blackout_dates": valid}}, upsert=True)
    await refresh_blackout_cache()
    return {"ok": True, "blackout_dates": valid}



REVIEWS_SEED = [
    {"id": "r1", "author_name": "Jamie R.", "rating": 5, "relative_time": "2 weeks ago",
     "text": "Prompt airport pickup at LPIA even after a delayed flight. Driver helped with our luggage and gave great tips for the Fish Fry. Highly recommend Rox Taxi!",
     "profile_photo_url": "https://i.pravatar.cc/80?img=12"},
    {"id": "r2", "author_name": "Marcia D.", "rating": 5, "relative_time": "1 month ago",
     "text": "Booked the Blue Lagoon Island tour through Rox — smooth from booking to boat. The staff on the island were amazing. Best day of our Nassau trip!",
     "profile_photo_url": "https://i.pravatar.cc/80?img=32"},
    {"id": "r3", "author_name": "Thomas K.", "rating": 5, "relative_time": "3 weeks ago",
     "text": "Rented the Chevy Trax for 5 days. Delivered right to our Cable Beach hotel. Clean, cold AC, and easy WhatsApp support the entire trip.",
     "profile_photo_url": "https://i.pravatar.cc/80?img=68"},
    {"id": "r4", "author_name": "Sara M.", "rating": 5, "relative_time": "2 months ago",
     "text": "Family of 6 — the van was perfect, driver very courteous. Cross-island run to Atlantis was cheaper than the hotel taxi stand. Will use again.",
     "profile_photo_url": "https://i.pravatar.cc/80?img=45"},
    {"id": "r5", "author_name": "Devon W.", "rating": 5, "relative_time": "3 months ago",
     "text": "Booked online, paid via Zelle. Everything confirmed within minutes. Cruise-port to Paradise Island pickup was seamless. Thanks Rox!",
     "profile_photo_url": "https://i.pravatar.cc/80?img=15"},
    {"id": "r6", "author_name": "Isla P.", "rating": 4, "relative_time": "4 months ago",
     "text": "Great service overall. Snorkeling boat was on time. Small nitpick: bring your own towels. Would definitely book again.",
     "profile_photo_url": "https://i.pravatar.cc/80?img=48"},
]


@api_router.get("/reviews")
async def list_reviews():
    return {
        "place": "Rox Taxi Service & Tours",
        "rating": 4.9,
        "total": 187,
        "source": "Google",
        "reviews": REVIEWS_SEED,
    }


@api_router.get("/bookings/{booking_id}")
async def get_booking(booking_id: str):
    doc = await db.bookings.find_one({"id": booking_id.upper()})
    if not doc:
        raise HTTPException(404, "Booking not found")
    return clean(doc)


@api_router.post("/contact")
async def create_contact_message(req: ContactMessage):
    """Public contact-form endpoint.

    Persists to `db.contact_messages` and fires a plaintext email + SMS to the
    admin so we get an inbox ping even if the user never books. Also sends the
    submitter a friendly acknowledgement email. Failures notify but never break
    the user's submit.
    """
    doc = req.model_dump()
    doc["id"] = "CT-" + uuid.uuid4().hex[:8].upper()
    doc["status"] = "new"
    doc["created_at"] = now_iso()
    await db.contact_messages.insert_one(doc)

    try:
        from notifications import send_email, send_sms
        summary = (
            f"New contact form message ({doc['id']})\n"
            f"From: {req.name} <{req.email}>\n"
            f"Phone: {req.phone or '—'}\n"
            f"Topic: {req.subject}\n\n"
            f"{req.message}"
        )
        if ADMIN_EMAIL:
            send_email(ADMIN_EMAIL, f"Contact form: {req.subject} — {doc['id']}", f"<pre>{summary}</pre>", summary)
        # Ack to the submitter
        send_email(
            req.email,
            "We received your message — Rox Taxi Service & Tours",
            f"<p>Hi {req.name},</p><p>Thanks for reaching out — we'll reply within the hour.</p><p><b>Your message ({doc['id']}):</b></p><pre>{req.message}</pre>",
            f"Hi {req.name},\n\nThanks for reaching out — we'll reply within the hour.\n\nYour message ({doc['id']}):\n{req.message}",
        )
        # Admin SMS ping (best-effort, no phone from ADMIN_EMAIL context)
        admin_sms_number = os.environ.get("ADMIN_SMS_NUMBER", "").strip()
        if admin_sms_number:
            send_sms(admin_sms_number, f"Rox contact form ({doc['id']}) from {req.name}: {req.message[:120]}")
    except Exception as e:  # noqa: BLE001
        logging.getLogger(__name__).warning("contact notify err: %s", e)

    return clean(doc)


# ---------------- Group & Wedding inquiries ----------------
# NOTE: These literal routes MUST be declared before /admin/{kind} to avoid shadowing.

@api_router.post("/group-inquiries")
async def create_group_inquiry(req: GroupInquiryCreate):
    inquiry = req.model_dump()
    inquiry["id"] = "GRP-" + uuid.uuid4().hex[:8].upper()
    inquiry["status"] = "new"
    inquiry["created_at"] = now_iso()
    inquiry["updated_at"] = now_iso()
    await db.group_inquiries.insert_one(inquiry)

    try:
        from notifications import send_email, send_sms
        subject = f"Group inquiry {inquiry['id']} — {req.event_type} · {req.guest_count} pax"
        text = (
            f"New group inquiry:\n"
            f"ID: {inquiry['id']}\n"
            f"Event: {req.event_type}\n"
            f"Date: {req.event_date}\n"
            f"Guests: {req.guest_count}\n"
            f"Needs: {', '.join(req.needs or []) or 'n/a'}\n"
            f"Budget: {req.budget_range or 'n/a'}\n"
            f"Name: {req.customer_name}\n"
            f"Email: {req.customer_email}\n"
            f"Phone: {req.customer_phone}\n"
            f"Notes: {req.notes or ''}"
        )
        send_email(req.customer_email, f"We received your group inquiry {inquiry['id']}", f"<pre>{text}</pre>", text)
        if ADMIN_EMAIL:
            send_email(ADMIN_EMAIL, subject, f"<pre>{text}</pre>", text)
        send_sms(req.customer_phone, f"Rox: Got your group inquiry {inquiry['id']} for {req.guest_count} guests on {req.event_date}. We'll reply within 2 hours.")
    except Exception as e:  # noqa: BLE001
        logging.getLogger(__name__).warning("group notify err: %s", e)

    return clean(inquiry)


# ---- Live driver GPS tracking (in-memory latest-ping cache) -----------------
# Driver hits /api/drivers/location every ~5s from their phone. Customer's
# Track page long-polls /api/bookings/{id}/driver-location to render an ETA.
# For MVP this uses process memory — swap to Redis if we ever run >1 worker.

_driver_pings: Dict[str, Dict[str, Any]] = {}


@api_router.post("/drivers/location")
async def driver_location_ping(req: DriverPing):
    booking = await db.bookings.find_one({"id": req.booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.get("status") in {"completed", "cancelled"}:
        raise HTTPException(409, f"Booking is {booking['status']} — tracking closed")
    _driver_pings[req.booking_id.upper()] = {
        "lat": req.lat,
        "lng": req.lng,
        "accuracy_m": req.accuracy_m,
        "heading": req.heading,
        "speed_mps": req.speed_mps,
        "at": now_iso(),
    }
    return {"ok": True, "cached_at": _driver_pings[req.booking_id.upper()]["at"]}


@api_router.get("/bookings/{booking_id}/driver-location")
async def get_driver_location(booking_id: str):
    key = booking_id.upper()
    ping = _driver_pings.get(key)
    if not ping:
        return {"available": False, "reason": "Driver hasn't started sharing yet"}
    # Stale after 60s of no updates
    from datetime import datetime, timezone
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(ping["at"])).total_seconds()
    except Exception:  # noqa: BLE001
        age = 0
    return {"available": True, "age_seconds": round(age, 1), "stale": age > 60, **ping}


# ---- Wedding package PDF ----
# PDF builder lives in pdf_utils.py; endpoint below assembles the line items.


@api_router.get("/wedding-package/{inquiry_id}/quote.pdf")
async def wedding_quote_pdf(inquiry_id: str):
    from fastapi.responses import Response
    doc = await db.group_inquiries.find_one({"id": inquiry_id.upper()})
    if not doc:
        raise HTTPException(404, "Inquiry not found")    # Compute line labels + subtotal server-side using catalog
    pkg = doc.get("package") or {}
    rows = []
    subtotal = 0.0

    for tid, count in (pkg.get("transport") or {}).items():
        if not count:
            continue
        s = await db.taxi_services.find_one({"id": tid})
        if not s: continue
        amt = float(s["price"]) * int(count)
        rows.append([f"{s['name']} × {count}", f"${amt:,.2f}"])
        subtotal += amt
    for tour_id, guests in (pkg.get("tourItems") or {}).items():
        t = await db.tours.find_one({"id": tour_id})
        if not t: continue
        amt = float(t["price"]) * int(guests)
        rows.append([f"{t['name']} × {guests} guest(s)", f"${amt:,.2f}"])
        subtotal += amt
    for rid, days in (pkg.get("rentalItems") or {}).items():
        r = await db.rentals.find_one({"id": rid})
        if not r: continue
        amt = float(r["price"]) * int(days)
        rows.append([f"{r['name']} × {days} day(s)", f"${amt:,.2f}"])
        subtotal += amt

    ADDON_PRICES = {"ceremony": 550.0, "rehearsal": 220.0, "afterparty": 300.0}
    ADDON_LABELS = {"ceremony": "Ceremony-day concierge (10hr)", "rehearsal": "Rehearsal-dinner transport", "afterparty": "After-party late-night shuttle"}
    for a in (pkg.get("addons") or []):
        if a in ADDON_PRICES:
            rows.append([ADDON_LABELS[a], f"${ADDON_PRICES[a]:,.2f}"])
            subtotal += ADDON_PRICES[a]

    guests = int(doc.get("guest_count", 0))
    disc_pct = 0.20 if guests >= 50 else 0.15 if guests >= 25 else 0.10 if guests >= 8 else 0.0

    doc["_pdf_rows"] = rows
    doc["_subtotal"] = subtotal
    doc["_disc_pct"] = disc_pct

    pdf_bytes = build_wedding_pdf(doc)
    filename = f"Rox-Wedding-Quote-{doc['id']}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_receipt_pdf(booking: dict) -> bytes:
    """Thin wrapper for backwards-compat callers; forwards to pdf_utils."""
    return build_receipt_pdf(booking)


@api_router.get("/bookings/{booking_id}/receipt.pdf")
async def booking_receipt_pdf(booking_id: str):
    from fastapi.responses import Response
    booking = await db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    pdf_bytes = build_receipt_pdf(booking)
    filename = f"Rox-Receipt-{booking['id']}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------- Logo upload ----------------
# NOTE: literal /admin route MUST be declared before /admin/{kind} to avoid shadowing.

UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@api_router.get("/uploads/{name}")
async def get_upload(name: str):
    from fastapi.responses import FileResponse
    path = (UPLOAD_DIR / name).resolve()
    if not str(path).startswith(str(UPLOAD_DIR.resolve())) or not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(path)


# ---------------- Payments ----------------
# All Stripe Checkout, PayPal Smart Buttons, webhook, deposit-refund helpers
# live in /app/backend/routes/payments.py — mounted via `configure()` +
# `api_router.include_router(payments_module.router)` below at bootstrap.


# ---------------- Live Chat (SSE) ----------------

class ChatIn(BaseModel):
    session_id: str
    message: str


@api_router.post("/chat/stream")
async def chat_stream(req: ChatIn):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key not configured")

    await db.chat_messages.insert_one({
        "session_id": req.session_id, "role": "user", "text": req.message, "ts": now_iso(),
    })

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=req.session_id, system_message=CHAT_SYSTEM,
    ).with_model("anthropic", "claude-sonnet-4-6")

    full_text: list[str] = []

    async def gen():
        try:
            async for ev in chat.stream_message(UserMessage(text=req.message)):
                if isinstance(ev, TextDelta):
                    full_text.append(ev.content)
                    yield f"data: {ev.content}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:  # noqa: BLE001
            yield f"event: error\ndata: {str(e)}\n\n"
        finally:
            await db.chat_messages.insert_one({
                "session_id": req.session_id, "role": "assistant",
                "text": "".join(full_text), "ts": now_iso(),
            })
            yield "event: done\ndata: [DONE]\n\n"

    return StreamingResponse(
        gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@api_router.get("/chat/history/{session_id}")
async def chat_history(session_id: str):
    docs = await db.chat_messages.find({"session_id": session_id}).sort("ts", 1).to_list(200)
    return [{"role": d["role"], "text": d["text"], "ts": d["ts"]} for d in docs]


@api_router.get("/")
async def root():
    return {"service": "Rox Taxi Service & Tours Bahamas API", "status": "running", "focus": "Nassau & Paradise Island"}


# ── Airport flight tracker ───────────────────────────────────────────────
# Uses AviationStack free tier (100 requests / month) to look up scheduled +
# actual arrival for the customer's flight number so we can auto-adjust
# pickup time. Responses are cached for 10 min to conserve quota.
_FLIGHT_CACHE: Dict[str, Dict[str, Any]] = {}
_FLIGHT_CACHE_TTL_SEC = 600


@api_router.get("/flight/{flight_number}")
async def lookup_flight(flight_number: str):
    key = os.environ.get("AVIATIONSTACK_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Flight tracking not configured on this server")

    fn = flight_number.strip().upper().replace(" ", "")
    if not fn or len(fn) < 3 or len(fn) > 10:
        raise HTTPException(400, "Invalid flight number")

    # Cache hit — return within TTL
    now_ts = datetime.now(timezone.utc).timestamp()
    cached = _FLIGHT_CACHE.get(fn)
    if cached and (now_ts - cached["_ts"]) < _FLIGHT_CACHE_TTL_SEC:
        return cached["data"]

    try:
        async with httpx.AsyncClient(timeout=10.0) as ac:
            r = await ac.get(
                "http://api.aviationstack.com/v1/flights",
                params={"access_key": key, "flight_iata": fn, "limit": 1},
            )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Flight API unreachable: {e}")

    if r.status_code != 200:
        raise HTTPException(502, f"Flight API error {r.status_code}")

    body = r.json()
    if body.get("error"):
        raise HTTPException(400, f"Flight lookup failed: {body['error'].get('message', 'unknown')}")

    flights = body.get("data") or []
    if not flights:
        result = {"found": False, "flight_number": fn,
                  "message": "No flight found — check the number (e.g. AA123, BA251, JBU617)."}
        _FLIGHT_CACHE[fn] = {"_ts": now_ts, "data": result}
        return result

    f = flights[0]
    arr = f.get("arrival") or {}
    dep = f.get("departure") or {}
    airline = f.get("airline") or {}
    delay_min = arr.get("delay")

    result = {
        "found": True,
        "flight_number": fn,
        "status": f.get("flight_status"),
        "airline": airline.get("name"),
        "departure": {
            "airport_iata": dep.get("iata"),
            "airport": dep.get("airport"),
            "scheduled": dep.get("scheduled"),
            "actual": dep.get("actual"),
        },
        "arrival": {
            "airport_iata": arr.get("iata"),
            "airport": arr.get("airport"),
            "scheduled": arr.get("scheduled"),
            "estimated": arr.get("estimated"),
            "actual": arr.get("actual"),
            "delay_minutes": delay_min,
        },
        "recommended_pickup": _recommended_pickup(arr),
    }
    _FLIGHT_CACHE[fn] = {"_ts": now_ts, "data": result}
    return result


def _recommended_pickup(arr: Dict[str, Any]) -> Optional[str]:
    """Suggested pickup = actual/estimated/scheduled arrival + 25 min buffer for
    disembark, luggage and immigration."""
    ts = arr.get("actual") or arr.get("estimated") or arr.get("scheduled")
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return (dt + timedelta(minutes=25)).isoformat()
    except Exception:  # noqa: BLE001
        return None


# ── Promotions helper (used by create_booking auto-apply) ──────────────
def _promo_is_live(p: Dict[str, Any]) -> bool:
    if not p.get("active", True):
        return False
    now = datetime.now(timezone.utc)
    for key, cmp in (("starts_at", lambda t: t <= now), ("ends_at", lambda t: t >= now)):
        v = p.get(key)
        if not v:
            continue
        try:
            t = datetime.fromisoformat(v.replace("Z", "+00:00"))
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            if not cmp(t):
                return False
        except Exception:  # noqa: BLE001
            continue
    return True


async def _best_active_promo(service_type: str) -> Optional[Dict[str, Any]]:
    docs = await db.promotions.find({"active": True}).to_list(50)
    matches = [
        p for p in docs
        if _promo_is_live(p)
        and (service_type in (p.get("applies_to") or []) or "all" in (p.get("applies_to") or []))
    ]
    if not matches:
        return None
    matches.sort(key=lambda p: float(p.get("discount_value", 0)), reverse=True)
    return matches[0]


class PromotionIn(BaseModel):
    label: str = Field(..., min_length=2, max_length=80)
    description: Optional[str] = Field(None, max_length=280)
    discount_type: str = Field("percent")  # "percent" | "fixed"
    discount_value: float = Field(..., gt=0)
    applies_to: List[str] = Field(default_factory=lambda: ["all"])
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    active: bool = True


@api_router.get("/promotions")
async def list_active_promotions():
    docs = await db.promotions.find({"active": True}).sort("discount_value", -1).to_list(50)
    return [clean(p) for p in docs if _promo_is_live(p)]


@api_router.get("/admin/promotions")
async def admin_list_promotions(_admin: str = Depends(require_admin)):
    docs = await db.promotions.find({}).sort("created_at", -1).to_list(200)
    out = []
    for p in docs:
        c = clean(p)
        c["live"] = _promo_is_live(p)
        out.append(c)
    return out


@api_router.post("/admin/promotions")
async def admin_create_promotion(promo: PromotionIn, _admin: str = Depends(require_admin)):
    if promo.discount_type not in ("percent", "fixed"):
        raise HTTPException(400, "discount_type must be 'percent' or 'fixed'")
    valid_types = {"taxi", "tour", "rental", "all"}
    bad = [t for t in promo.applies_to if t not in valid_types]
    if bad:
        raise HTTPException(400, f"applies_to has invalid values: {bad}")
    doc = promo.model_dump()
    doc["id"] = str(uuid.uuid4())[:8].upper()
    doc["created_at"] = now_iso()
    await db.promotions.insert_one(doc)
    return clean(doc)


@api_router.patch("/admin/promotions/{promo_id}")
async def admin_update_promotion(promo_id: str, patch: Dict[str, Any], _admin: str = Depends(require_admin)):
    allowed = {"label", "description", "discount_type", "discount_value", "applies_to", "starts_at", "ends_at", "active"}
    clean_patch = {k: v for k, v in patch.items() if k in allowed}
    if not clean_patch:
        return {"ok": True, "noop": True}
    r = await db.promotions.update_one({"id": promo_id}, {"$set": clean_patch})
    if r.matched_count == 0:
        raise HTTPException(404, "Promotion not found")
    doc = await db.promotions.find_one({"id": promo_id})
    return clean(doc)


@api_router.delete("/admin/promotions/{promo_id}")
async def admin_delete_promotion(promo_id: str, _admin: str = Depends(require_admin)):
    r = await db.promotions.delete_one({"id": promo_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Promotion not found")
    return {"ok": True, "id": promo_id}


@api_router.get("/live-stats")
async def live_stats():
    """Public social-proof counter: bookings + contact messages in the last hour + 24h."""
    from datetime import timedelta as _td
    now = now_utc()
    hour_ago = (now - _td(hours=1)).isoformat()
    day_ago = (now - _td(hours=24)).isoformat()
    b_hour = await db.bookings.count_documents({"created_at": {"$gte": hour_ago}})
    b_day = await db.bookings.count_documents({"created_at": {"$gte": day_ago}})
    c_hour = await db.contact_messages.count_documents({"created_at": {"$gte": hour_ago}})
    return {
        "bookings_last_hour": int(b_hour),
        "bookings_last_24h": int(b_day),
        "contacts_last_hour": int(c_hour),
        "as_of": now.isoformat(),
    }


# Wire up the payments router (Stripe / PayPal / webhooks / refunds).
payments_module.configure(
    db=db,
    stripe_api_key=STRIPE_API_KEY,
    notify_fn=notify_booking_confirmed,
    now_iso_fn=now_iso,
    clean_fn=clean,
)
api_router.include_router(payments_module.router)

# Wire up the admin router (booking mgmt, catalog CRUD, deposits, notifications).
admin_module.configure(
    db=db,
    now_iso=now_iso,
    clean=clean,
    require_admin=require_admin,
    notify_fn=notify_booking_confirmed,
    attempt_deposit_refund=payments_module.attempt_deposit_refund,
    upload_dir=UPLOAD_DIR,
)
api_router.include_router(admin_module.router)

app.include_router(api_router)

# ── CORS ────────────────────────────────────────────────────────────
# In production, set CORS_ORIGINS to a comma-separated list of the
# origins that host the frontend (e.g. "https://roxtaxi.com,https://www.roxtaxi.com").
# When left blank we fall back to "*" but DROP credentials — browsers
# refuse "*" with credentials, and using credentials with a wildcard
# silently kills every authenticated request.
_cors_env = (os.environ.get('CORS_ORIGINS') or '').strip()
if _cors_env:
    _origins = [o.strip() for o in _cors_env.split(',') if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
