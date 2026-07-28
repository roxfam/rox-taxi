from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request, Response, Cookie, UploadFile, File
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
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from fastapi.responses import StreamingResponse
from notifications import notify_booking_confirmed, notify_owner_booking_created
import paypal_client
from seed_data import TOURS_SEED, TAXI_SERVICES, RENTALS_SEED, CURRENT_RENTAL_IDS, HOME_SLIDES_SEED
from pdf_utils import build_wedding_pdf, build_receipt_pdf
from routes import payments as payments_module
from routes import admin as admin_module

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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
    "You are Roxi, the friendly live-chat concierge for Rox Taxi Service and Tours based in Nassau, "
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
    notes: Optional[str] = None
    payment_method: str
    round_trip: Optional[bool] = False  # taxi: same-day return, 10% off both legs
    tip_amount: Optional[float] = Field(0, ge=0, le=1000)


LUGGAGE_FEE_USD = 3.0
LUGGAGE_MAX = 10
EXTRA_PASSENGER_FEE_USD = 5.0
EXTRA_PASSENGER_INCLUDED = 2  # first 2 passengers included in the flat fare; each additional adds the fee
RENTAL_DEPOSIT_USD = 150.0  # refundable security deposit applied automatically to every car rental booking
ADDITIONAL_DRIVER_FEE_USD = 25.0  # flat fee per extra registered driver on a car rental
ADDITIONAL_DRIVER_MAX = 4
RENTAL_MIN_DAYS = 2  # 2-day minimum booking policy for car rentals
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
    if service_type not in CLOSED_APPLIES_TO:
        return
    try:
        start = _parse_booking_date(booking_date)
    except Exception:
        return
    for offset in range(max(1, int(days or 1))):
        d = (start + timedelta(days=offset)).date()
        if d.weekday() in CLOSED_WEEKDAYS:
            raise HTTPException(
                400,
                f"We are closed on Saturdays. Please choose a different date (issue on {d.isoformat()}).",
            )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CustomerRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=200)


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
    """Customer email/password signup. Auto-links past bookings by email."""
    email = req.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing and existing.get("password_hash"):
        raise HTTPException(400, "An account with this email already exists. Please sign in.")

    ts = now_iso()
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"password_hash": _hash_password(req.password), "name": req.name,
                      "provider": "email" if not existing.get("provider") else "both",
                      "updated_at": ts}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": req.name, "picture": "",
            "password_hash": _hash_password(req.password), "provider": "email",
            "created_at": ts,
        })

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


# ---------------- Seed content (Nassau / Paradise Island focus) ----------------
# Catalog seed data lives in seed_data.py to keep this file lean.


@app.on_event("startup")
async def seed_db():
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


# ---------------- Public catalog ----------------

@api_router.get("/tours")
async def list_tours():
    docs = await db.tours.find({"active": True}).to_list(200)
    return [annotate_promo(clean(d)) for d in docs]


@api_router.get("/taxi-services")
async def list_taxi():
    docs = await db.taxi_services.find({}).to_list(200)
    return [annotate_promo(clean(d)) for d in docs]


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
    """Aggregated public photo feed: home carousel slides + every active catalog
    item's image (tours, rentals, taxi) + every admin-uploaded photo in the
    /uploads dir (excluding site logos). Deduped by URL, tagged with category
    so the frontend can offer filter chips (Tours / Rentals / Taxi / Nassau /
    Studio). This lets us reuse existing catalog uploads + the admin thumbnail
    library for the Gallery tab without a dedicated `gallery` collection."""

    seen: dict[str, dict] = {}

    def _add(url, category, title):
        if not url or url in seen:
            return
        seen[url] = {"url": url, "category": category, "title": title}

    for d in await db.home_slides.find({"active": True}).sort("order", 1).to_list(50):
        _add(d.get("image_url"), "nassau", d.get("title") or "Nassau")
    for d in await db.tours.find({"active": True}).to_list(200):
        _add(d.get("image_url"), "tours", d.get("name"))
    for d in await db.rentals.find({"active": True}).to_list(200):
        _add(d.get("image_url"), "rentals", d.get("name"))
    for d in await db.taxi_services.find({}).to_list(200):
        _add(d.get("image_url"), "taxi", d.get("name"))

    # Admin-uploaded thumbnails (from Image Manager). We exclude `logo-*` files
    # because those are branding assets, not gallery-worthy photos.
    if UPLOAD_DIR.exists():
        photo_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
        for p in sorted(UPLOAD_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if not p.is_file() or p.suffix.lower() not in photo_exts:
                continue
            if p.name.startswith("logo-"):
                continue
            # Pretty title from the slug (`cat-my-photo-abc123.jpg` -> "My Photo").
            stem = p.stem
            for prefix in ("cat-", "img-", "photo-"):
                if stem.startswith(prefix):
                    stem = stem[len(prefix):]
                    break
            if "-" in stem:
                stem = stem.rsplit("-", 1)[0]  # trim the 6-char uuid suffix
            title = stem.replace("-", " ").replace("_", " ").strip().title() or p.name
            _add(f"/api/uploads/{p.name}", "studio", title)

    return list(seen.values())


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
    booking = req.model_dump()
    booking["id"] = str(uuid.uuid4())[:8].upper()
    booking["status"] = "pending_payment" if req.payment_method == "stripe" else "confirmed"
    booking["payment_status"] = "pending"
    booking["created_at"] = now_iso()
    booking["updated_at"] = now_iso()

    # Base: taxi/tour = fixed price; rental = price * days
    base = float(req.price) * max(1, req.days or 1)

    luggage_fee = 0.0
    passenger_fee = 0.0
    deposit_amount = 0.0
    additional_driver_fee = 0.0
    bridge_toll_fee = 0.0
    if req.service_type == "taxi":
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
    if req.service_type == "rental":
        deposit_amount = RENTAL_DEPOSIT_USD
        booking["deposit_amount"] = deposit_amount
        booking["deposit_status"] = "held"  # released back to customer after vehicle return
        extra_drivers = max(0, min(int(req.additional_drivers or 0), ADDITIONAL_DRIVER_MAX))
        additional_driver_fee = extra_drivers * ADDITIONAL_DRIVER_FEE_USD
        booking["additional_drivers"] = extra_drivers
        booking["additional_driver_fee"] = additional_driver_fee

    booking["total"] = round(base + luggage_fee + passenger_fee + deposit_amount + additional_driver_fee + bridge_toll_fee, 2)

    await db.bookings.insert_one(booking)
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
        "closed_policy": "Taxi service and car rentals are closed on Saturdays.",
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
    """Public cancel endpoint. Applies 15% fee when ≥48hr notice, else no refund."""
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
        "payment_status": doc.get("payment_status"),
        "message": (
            f"Cancelled with {round(hours_until,1)}h notice. Refund estimate: ${refund:.2f} (fee ${fee:.2f})."
            if paid and eligible else
            "Cancelled. Refund not eligible — booking was within the 48-hour window."
            if paid and not eligible else
            "Cancelled. No payment had been received."
        ),
    }


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
        "place": "Rox Taxi Service and Tours",
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
            "We received your message — Rox Taxi Service and Tours",
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
    return {"service": "Rox Taxi Service and Tours Bahamas API", "status": "running", "focus": "Nassau & Paradise Island"}


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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
