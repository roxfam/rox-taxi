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
from notifications import notify_booking_confirmed
import paypal_client
from seed_data import TOURS_SEED, TAXI_SERVICES, RENTALS_SEED, CURRENT_RENTAL_IDS
from pdf_utils import build_wedding_pdf, build_receipt_pdf

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


LUGGAGE_FEE_USD = 3.0
LUGGAGE_MAX = 10
EXTRA_PASSENGER_FEE_USD = 5.0
EXTRA_PASSENGER_INCLUDED = 2  # first 2 passengers included in the flat fare; each additional adds the fee
RENTAL_DEPOSIT_USD = 150.0  # refundable security deposit applied automatically to every car rental booking
ADDITIONAL_DRIVER_FEE_USD = 25.0  # flat fee per extra registered driver on a car rental
ADDITIONAL_DRIVER_MAX = 4

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


class BookingStatusUpdate(BaseModel):
    status: str


class DepositUpdate(BaseModel):
    status: str  # 'released' | 'forfeited' | 'held'
    reason: Optional[str] = None
    auto_refund: bool = True  # attempt automatic refund via Stripe/PayPal on release


class CheckoutRequest(BaseModel):
    booking_id: str
    origin_url: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ItemUpsert(BaseModel):
    name: str
    description: str
    price: float
    duration: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    seats: Optional[int] = None
    active: bool = True


class SiteConfigUpdate(BaseModel):
    zelle_email: Optional[str] = None
    zelle_phone: Optional[str] = None
    facebook_url: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    paypal_me_url: Optional[str] = None
    tripadvisor_url: Optional[str] = None
    logo_url: Optional[str] = None
    notify_email_enabled: Optional[bool] = None
    notify_sms_enabled: Optional[bool] = None


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


class GroupInquiryStatusUpdate(BaseModel):
    status: str  # new | contacted | quoted | won | lost


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

async def get_current_user(request: Request):
    """Resolve customer from session_token cookie OR Authorization: Bearer header."""
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
        raise HTTPException(401, "Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
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

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "updated_at": now_iso()}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": now_iso(),
        })

    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
        "created_at": now_iso(),
    })

    response.set_cookie(
        key="session_token", value=session_token, httponly=True, secure=True,
        samesite="none", path="/", max_age=60 * 60 * 24 * 7,
    )

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
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
    # Reseed catalog every startup with the Nassau/PI-focused data (idempotent via upsert-by-id)
    for t in TOURS_SEED:
        await db.tours.update_one({"id": t["id"]}, {"$set": t}, upsert=True)
    # remove legacy tour ids no longer in seed
    await db.tours.delete_many({"id": {"$nin": [t["id"] for t in TOURS_SEED]}})
    for s in TAXI_SERVICES:
        await db.taxi_services.update_one({"id": s["id"]}, {"$set": s}, upsert=True)
    await db.taxi_services.delete_many({"id": {"$nin": [s["id"] for s in TAXI_SERVICES]}})
    for r in RENTALS_SEED:
        await db.rentals.update_one({"id": r["id"]}, {"$set": r}, upsert=True)
    # remove legacy rental IDs no longer in seed
    await db.rentals.delete_many({"id": {"$nin": list(CURRENT_RENTAL_IDS)}})
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
    return [clean(d) for d in docs]


@api_router.get("/taxi-services")
async def list_taxi():
    docs = await db.taxi_services.find({}).to_list(200)
    return [clean(d) for d in docs]


@api_router.get("/rentals")
async def list_rentals():
    docs = await db.rentals.find({"active": True}).to_list(200)
    return [clean(d) for d in docs]


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
        return {"facebook_url": FACEBOOK_URL, "zelle_email": ZELLE_EMAIL, "zelle_phone": ZELLE_PHONE, "phone": ""}
    cfg.pop("_id", None)
    return cfg


# ---------------- Bookings ----------------

@api_router.post("/bookings")
async def create_booking(req: BookingCreate):
    _validate_open_day(req.service_type, req.booking_date, req.days or 1)
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
    if req.service_type == "taxi":
        extra = max(0, min(int(req.extra_luggage or 0), LUGGAGE_MAX))
        luggage_fee = extra * LUGGAGE_FEE_USD
        booking["luggage_fee"] = luggage_fee
        booking["extra_luggage"] = extra
        if int(req.passengers) > EXTRA_PASSENGER_INCLUDED:
            passenger_fee = (int(req.passengers) - EXTRA_PASSENGER_INCLUDED) * EXTRA_PASSENGER_FEE_USD
        booking["passenger_fee"] = passenger_fee
    if req.service_type == "rental":
        deposit_amount = RENTAL_DEPOSIT_USD
        booking["deposit_amount"] = deposit_amount
        booking["deposit_status"] = "held"  # released back to customer after vehicle return
        extra_drivers = max(0, min(int(req.additional_drivers or 0), ADDITIONAL_DRIVER_MAX))
        additional_driver_fee = extra_drivers * ADDITIONAL_DRIVER_FEE_USD
        booking["additional_drivers"] = extra_drivers
        booking["additional_driver_fee"] = additional_driver_fee

    booking["total"] = round(base + luggage_fee + passenger_fee + deposit_amount + additional_driver_fee, 2)

    await db.bookings.insert_one(booking)
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


@api_router.get("/admin/bookings")
async def admin_list_bookings(_: str = Depends(require_admin)):
    docs = await db.bookings.find({}).sort("created_at", -1).to_list(1000)
    return [clean(d) for d in docs]


@api_router.patch("/admin/bookings/{booking_id}/status")
async def admin_update_status(booking_id: str, req: BookingStatusUpdate, _: str = Depends(require_admin)):
    res = await db.bookings.update_one(
        {"id": booking_id.upper()},
        {"$set": {"status": req.status, "updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Booking not found")
    doc = await db.bookings.find_one({"id": booking_id.upper()})
    return clean(doc)


@api_router.patch("/admin/bookings/{booking_id}/deposit")
async def admin_update_deposit(booking_id: str, req: DepositUpdate, admin_email: str = Depends(require_admin)):
    """Release the deposit back to the customer, or forfeit it (damage/late/etc.).

    If ``auto_refund=True`` and the deposit is being released, we try to refund
    the deposit amount via the same payment provider used for the original booking
    (Stripe for card payments, PayPal for PayPal Checkout). Zelle / PayPal.me
    stay manual. The refund result is stored on the booking regardless of outcome.
    """
    valid = {"held", "released", "forfeited"}
    if req.status not in valid:
        raise HTTPException(422, f"status must be one of {sorted(valid)}")
    doc = await db.bookings.find_one({"id": booking_id.upper()})
    if not doc:
        raise HTTPException(404, "Booking not found")
    if not doc.get("deposit_amount"):
        raise HTTPException(400, "This booking has no security deposit")

    now = now_iso()
    update: Dict[str, Any] = {
        "deposit_status": req.status,
        "deposit_updated_at": now,
        "deposit_updated_by": admin_email,
        "updated_at": now,
    }
    if req.reason:
        update["deposit_reason"] = req.reason
    if req.status == "released":
        update["deposit_released_at"] = now
    elif req.status == "forfeited":
        update["deposit_forfeited_at"] = now

    refund_info: Dict[str, Any] = {}
    if req.status == "released" and req.auto_refund:
        refund_info = await _attempt_deposit_refund(
            booking=doc,
            amount=float(doc["deposit_amount"]),
            reason=req.reason or "Deposit released — vehicle returned in good condition",
        )
        update["deposit_refund_provider"] = refund_info.get("provider")
        update["deposit_refund_status"] = "succeeded" if refund_info.get("refunded") else "failed"
        if refund_info.get("refund_id"):
            update["deposit_refund_id"] = refund_info["refund_id"]
        if refund_info.get("error"):
            update["deposit_refund_error"] = refund_info["error"]

    await db.bookings.update_one({"id": booking_id.upper()}, {"$set": update})
    doc = await db.bookings.find_one({"id": booking_id.upper()})
    result = clean(doc)
    if refund_info:
        result["refund_info"] = refund_info
    return result


@api_router.get("/admin/stats")
async def admin_stats(_: str = Depends(require_admin)):
    total = await db.bookings.count_documents({})
    paid = await db.bookings.count_documents({"payment_status": "paid"})
    pending = await db.bookings.count_documents({"status": {"$in": ["pending_payment", "confirmed"]}})
    active = await db.bookings.count_documents({"status": {"$in": ["driver_assigned", "en_route"]}})
    revenue_cursor = db.bookings.aggregate([
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "sum": {"$sum": "$total"}}},
    ])
    revenue_docs = await revenue_cursor.to_list(1)
    revenue = revenue_docs[0]["sum"] if revenue_docs else 0

    # Deposit stats — rentals only
    deposits_held = await db.bookings.count_documents({"deposit_status": "held", "deposit_amount": {"$gt": 0}})
    deposits_released = await db.bookings.count_documents({"deposit_status": "released"})
    deposits_forfeited = await db.bookings.count_documents({"deposit_status": "forfeited"})
    held_cursor = db.bookings.aggregate([
        {"$match": {"deposit_status": "held", "deposit_amount": {"$gt": 0}}},
        {"$group": {"_id": None, "sum": {"$sum": "$deposit_amount"}}},
    ])
    held_docs = await held_cursor.to_list(1)
    deposits_held_amount = held_docs[0]["sum"] if held_docs else 0

    return {
        "total": total,
        "paid": paid,
        "pending": pending,
        "active": active,
        "revenue": revenue,
        "deposits_held": deposits_held,
        "deposits_released": deposits_released,
        "deposits_forfeited": deposits_forfeited,
        "deposits_held_amount": deposits_held_amount,
    }


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


@api_router.get("/admin/group-inquiries")
async def admin_list_group_inquiries(_: str = Depends(require_admin)):
    docs = await db.group_inquiries.find({}).sort("created_at", -1).to_list(500)
    return [clean(d) for d in docs]


@api_router.patch("/admin/group-inquiries/{inquiry_id}/status")
async def admin_update_group_status(inquiry_id: str, req: GroupInquiryStatusUpdate, _: str = Depends(require_admin)):
    res = await db.group_inquiries.update_one(
        {"id": inquiry_id.upper()},
        {"$set": {"status": req.status, "updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Inquiry not found")
    doc = await db.group_inquiries.find_one({"id": inquiry_id.upper()})
    return clean(doc)


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


@api_router.post("/admin/upload-logo")
async def upload_logo(file: UploadFile = File(...), _: str = Depends(require_admin)):
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type. Use {', '.join(sorted(allowed))}")

    name = f"logo-{uuid.uuid4().hex[:8]}{ext}"
    dest = UPLOAD_DIR / name
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Logo must be ≤ 5MB")
    dest.write_bytes(content)

    url = f"/api/uploads/{name}"
    await db.site_config.update_one({"_id": "main"}, {"$set": {"logo_url": url}}, upsert=True)
    return {"logo_url": url}


@api_router.get("/uploads/{name}")
async def get_upload(name: str):
    from fastapi.responses import FileResponse
    path = (UPLOAD_DIR / name).resolve()
    if not str(path).startswith(str(UPLOAD_DIR.resolve())) or not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(path)


# ---------------- Admin CRUD (tours / taxi / rentals / site config) ----------------

def _coll_by_kind(kind: str):
    return {"tours": db.tours, "taxi_services": db.taxi_services, "rentals": db.rentals}.get(kind)


@api_router.post("/admin/{kind}")
async def admin_create_item(kind: str, item: ItemUpsert, _: str = Depends(require_admin)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    doc = item.model_dump()
    doc["id"] = f"{kind[:3]}-{uuid.uuid4().hex[:8]}"
    doc["created_at"] = now_iso()
    await coll.insert_one(doc)
    return clean(doc)


@api_router.put("/admin/{kind}/{item_id}")
async def admin_update_item(kind: str, item_id: str, item: ItemUpsert, _: str = Depends(require_admin)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    payload = {k: v for k, v in item.model_dump().items() if v is not None}
    payload["updated_at"] = now_iso()
    res = await coll.update_one({"id": item_id}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(404, "Item not found")
    doc = await coll.find_one({"id": item_id})
    return clean(doc)


@api_router.delete("/admin/{kind}/{item_id}")
async def admin_delete_item(kind: str, item_id: str, _: str = Depends(require_admin)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    res = await coll.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Item not found")
    return {"deleted": True}


@api_router.get("/admin/{kind}")
async def admin_list_items(kind: str, _: str = Depends(require_admin)):
    coll = _coll_by_kind(kind)
    if coll is None:
        raise HTTPException(404, "Unknown collection")
    docs = await coll.find({}).to_list(500)
    return [clean(d) for d in docs]


@api_router.put("/admin/site-config")
async def admin_update_site(req: SiteConfigUpdate, _: str = Depends(require_admin)):
    payload = {k: v for k, v in req.model_dump().items() if v is not None}
    if payload:
        await db.site_config.update_one({"_id": "main"}, {"$set": payload}, upsert=True)
    cfg = await db.site_config.find_one({"_id": "main"})
    cfg.pop("_id", None)
    return cfg


@api_router.post("/admin/bookings/{booking_id}/resend-notification")
async def admin_resend_notification(booking_id: str, body: Optional[Dict[str, Any]] = None, _: str = Depends(require_admin)):
    """Manually re-send the booking-confirmation email + SMS and update the stored report.

    Body: `{ "force": bool }` — when true, bypasses the admin's notify_email_enabled/notify_sms_enabled
    site-config toggles so the message goes out even if notifications are globally muted.
    """
    booking = await db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    force = bool((body or {}).get("force"))
    if force:
        prefs = {"notify_email_enabled": True, "notify_sms_enabled": True}
    else:
        prefs = await db.site_config.find_one({"_id": "main"}) or {}
    try:
        report = notify_booking_confirmed(clean(dict(booking)), prefs)
    except Exception as e:  # noqa: BLE001
        logging.warning("resend notify err: %s", e)
        raise HTTPException(500, f"Notification error: {e}") from e
    notified_at = now_iso()
    await db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"notification_status": report, "notified_at": notified_at}},
    )
    return {"booking_id": booking["id"], "notification_status": report, "notified_at": notified_at, "forced": force}


# ---------------- Payments ----------------

@api_router.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest, request: Request):
    booking = await db.bookings.find_one({"id": req.booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")

    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    success_url = f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{req.origin_url}/payment/cancel?booking_id={booking['id']}"

    checkout_req = CheckoutSessionRequest(
        amount=float(booking["total"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"booking_id": booking["id"], "customer_email": booking["customer_email"]},
    )
    session = await stripe_checkout.create_checkout_session(checkout_req)

    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "booking_id": booking["id"],
        "amount": float(booking["total"]),
        "currency": "usd",
        "status": "initiated",
        "payment_status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    return {"checkout_url": session.url, "session_id": session.session_id}


async def _mark_paid(session_id: str, booking_id: Optional[str]):
    await db.payment_transactions.update_one(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now_iso()}},
    )
    if booking_id:
        res = await db.bookings.update_one(
            {"id": booking_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"payment_status": "paid", "status": "confirmed", "updated_at": now_iso()}},
        )
        if res.modified_count:
            booking = await db.bookings.find_one({"id": booking_id})
            try:
                prefs = await db.site_config.find_one({"_id": "main"}) or {}
                report = notify_booking_confirmed(clean(dict(booking)), prefs)
                await db.bookings.update_one(
                    {"id": booking_id},
                    {"$set": {"notification_status": report, "notified_at": now_iso()}},
                )
            except Exception as e:  # noqa: BLE001
                logging.warning("notify err: %s", e)


@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, request: Request):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(404, "Transaction not found")

    if record.get("payment_status") != "paid":
        host_url = str(request.base_url)
        webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
        sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        try:
            status = await sc.get_checkout_status(session_id)
            if status.payment_status == "paid" or status.status == "complete":
                await _mark_paid(session_id, record["booking_id"])
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except Exception as e:  # noqa: BLE001
            logging.warning("stripe status err: %s", e)

    return {
        "session_id": record["session_id"],
        "booking_id": record["booking_id"],
        "status": record["status"],
        "payment_status": record["payment_status"],
    }


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        result = await sc.handle_webhook(body, sig)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Webhook error: {e}")
    if result.payment_status == "paid":
        booking_id = (result.metadata or {}).get("booking_id")
        await _mark_paid(result.session_id, booking_id)
    return {"status": "ok"}


# ---------------- PayPal Checkout (Smart Buttons) ----------------


class PayPalCreateOrderRequest(BaseModel):
    booking_id: str


@api_router.get("/paypal/config")
async def paypal_config():
    """Public config for the frontend PayPalScriptProvider."""
    return paypal_client.public_config()


@api_router.post("/paypal/create-order")
async def paypal_create_order(req: PayPalCreateOrderRequest):
    if not paypal_client.is_configured():
        raise HTTPException(503, "PayPal is not configured on the server")
    booking = await db.bookings.find_one({"id": req.booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.get("payment_status") == "paid":
        raise HTTPException(409, "Booking already paid")

    try:
        order = await paypal_client.create_order(
            amount=float(booking["total"]),
            booking_id=booking["id"],
            description=f"{booking.get('item_name','Rox Taxi booking')} — {booking['id']}",
        )
    except Exception as e:  # noqa: BLE001
        logging.exception("PayPal create-order failed")
        raise HTTPException(502, f"PayPal error: {e}") from e

    await db.payment_transactions.insert_one({
        "provider": "paypal",
        "session_id": order["id"],
        "booking_id": booking["id"],
        "amount": float(booking["total"]),
        "currency": "usd",
        "status": order.get("status", "CREATED"),
        "payment_status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    return {"order_id": order["id"], "status": order.get("status")}


@api_router.post("/paypal/capture-order/{order_id}")
async def paypal_capture_order(order_id: str):
    if not paypal_client.is_configured():
        raise HTTPException(503, "PayPal is not configured on the server")

    tx = await db.payment_transactions.find_one({"session_id": order_id, "provider": "paypal"})
    if not tx:
        raise HTTPException(404, "PayPal order not found")

    try:
        result = await paypal_client.capture_order(order_id)
    except Exception as e:  # noqa: BLE001
        logging.exception("PayPal capture failed")
        raise HTTPException(502, f"PayPal capture error: {e}") from e

    status = (result.get("status") or "").upper()
    if status != "COMPLETED":
        await db.payment_transactions.update_one(
            {"session_id": order_id},
            {"$set": {"status": status or "UNKNOWN", "updated_at": now_iso()}},
        )
        raise HTTPException(402, f"PayPal capture not completed (status={status})")

    # Payment succeeded — save capture_id (needed for refunds), mark booking paid + notify
    capture_id = paypal_client.extract_capture_id(result)
    await db.payment_transactions.update_one(
        {"session_id": order_id},
        {"$set": {"paypal_capture_id": capture_id, "updated_at": now_iso()}},
    )
    if capture_id:
        await db.bookings.update_one(
            {"id": tx["booking_id"]},
            {"$set": {"paypal_capture_id": capture_id, "payment_provider": "paypal"}},
        )
    await _mark_paid(order_id, tx["booking_id"])
    booking = await db.bookings.find_one({"id": tx["booking_id"]}, {"_id": 0})
    return {
        "order_id": order_id,
        "status": status,
        "booking_id": tx["booking_id"],
        "payment_status": "paid",
        "booking": clean(dict(booking)) if booking else None,
    }


# ---------------- Refund helpers (Stripe REST + PayPal REST) ----------------


async def _stripe_refund(payment_intent: str, amount_cents: int, reason: str) -> Dict[str, Any]:
    """Issue a Stripe refund via REST API (works with test + live keys)."""
    async with httpx.AsyncClient(timeout=30.0) as _client:
        r = await _client.post(
            "https://api.stripe.com/v1/refunds",
            auth=(STRIPE_API_KEY, ""),
            data={
                "payment_intent": payment_intent,
                "amount": str(amount_cents),
                "reason": "requested_by_customer",
                "metadata[deposit_reason]": (reason or "Deposit released")[:500],
            },
        )
    if r.status_code >= 400:
        raise RuntimeError(f"Stripe refund failed ({r.status_code}): {r.text}")
    return r.json()


async def _resolve_stripe_payment_intent(booking_id: str) -> Optional[str]:
    """Look up the payment_intent from payment_transactions; retrieve from Stripe if not cached."""
    tx = await db.payment_transactions.find_one({"booking_id": booking_id, "provider": {"$ne": "paypal"}})
    if not tx:
        tx = await db.payment_transactions.find_one({"booking_id": booking_id})
    if not tx:
        return None
    if tx.get("stripe_payment_intent"):
        return tx["stripe_payment_intent"]

    session_id = tx.get("session_id")
    if not session_id or tx.get("provider") == "paypal":
        return None

    async with httpx.AsyncClient(timeout=20.0) as _client:
        r = await _client.get(
            f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
            auth=(STRIPE_API_KEY, ""),
        )
    if r.status_code >= 400:
        logging.warning("Stripe session lookup failed: %s %s", r.status_code, r.text)
        return None
    pi = r.json().get("payment_intent")
    if pi:
        await db.payment_transactions.update_one(
            {"_id": tx["_id"]}, {"$set": {"stripe_payment_intent": pi}},
        )
    return pi


async def _attempt_deposit_refund(booking: Dict[str, Any], amount: float, reason: str) -> Dict[str, Any]:
    """Refund `amount` USD via the same payment provider used for the original booking."""
    if booking.get("payment_status") != "paid":
        return {"refunded": False, "provider": None, "error": "Booking not paid — no funds to refund"}

    if booking.get("paypal_capture_id"):
        try:
            refund = await paypal_client.refund_capture(
                capture_id=booking["paypal_capture_id"],
                amount=amount,
                note=f"Deposit released: {reason[:200]}",
            )
            return {
                "refunded": (refund.get("status", "").upper() == "COMPLETED"),
                "refund_id": refund.get("id"),
                "provider": "paypal",
                "status": refund.get("status"),
            }
        except Exception as e:  # noqa: BLE001
            logging.exception("PayPal deposit refund failed")
            return {"refunded": False, "provider": "paypal", "error": str(e)}

    pi = await _resolve_stripe_payment_intent(booking["id"])
    if pi:
        try:
            refund = await _stripe_refund(pi, int(round(amount * 100)), reason)
            return {
                "refunded": (refund.get("status") == "succeeded"),
                "refund_id": refund.get("id"),
                "provider": "stripe",
                "status": refund.get("status"),
            }
        except Exception as e:  # noqa: BLE001
            logging.exception("Stripe deposit refund failed")
            return {"refunded": False, "provider": "stripe", "error": str(e)}

    return {"refunded": False, "provider": booking.get("payment_method", "manual"), "error": "Manual payment method — issue refund by hand"}


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
