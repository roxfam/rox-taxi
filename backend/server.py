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
    notes: Optional[str] = None
    payment_method: str


LUGGAGE_FEE_USD = 3.0
LUGGAGE_MAX = 10
EXTRA_PASSENGER_FEE_USD = 5.0
EXTRA_PASSENGER_INCLUDED = 2  # first 2 passengers included in the flat fare; each additional adds the fee
RENTAL_DEPOSIT_USD = 150.0  # refundable security deposit applied automatically to every car rental booking

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

TOURS_SEED = [
    {"id": "blue-lagoon", "name": "Blue Lagoon Island Beach Day", "price": 89.0, "duration": "6 hours",
     "location": "Departs Nassau Harbour", "featured": True,
     "description": "A quick ferry from Nassau lands you on a private-feel island — hammocks, kayaks, snorkeling and a rum punch bar.",
     "image_url": "https://images.unsplash.com/photo-1723567017685-86060d4861c7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxiYWhhbWFzJTIwYmVhY2glMjBjbGVhciUyMHdhdGVyfGVufDB8fHx8MTc4NTA2MjgxMXww&ixlib=rb-4.1.0&q=85",
     "category": "excursion", "active": True},
    {"id": "atlantis-tour", "name": "Paradise Island & Atlantis City Tour", "price": 45.0, "duration": "3 hours",
     "location": "Paradise Island", "featured": True,
     "description": "Guided city tour ending at Atlantis Resort with photo stops at Fort Fincastle, Queen's Staircase and the Cloisters.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85",
     "category": "tour", "active": True},
    {"id": "snorkel-rose", "name": "Rose Island Reef Snorkeling", "price": 65.0, "duration": "4 hours",
     "location": "Departs Paradise Island", "featured": True,
     "description": "Just off Paradise Island — vibrant reef gardens, sea turtles and rum punch on the ride back.",
     "image_url": "https://images.unsplash.com/photo-1680635601834-581581c6cdfa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwyfHxzbm9ya2VsaW5nJTIwYmFoYW1hcyUyMGNsZWFyJTIwd2F0ZXJ8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85",
     "category": "excursion", "active": True},
    {"id": "island-hop", "name": "Three-Island Boat Hopping (from Nassau)", "price": 149.0, "duration": "7 hours",
     "location": "Departs Nassau", "featured": False,
     "description": "Cruise Nassau's out-islands with beach stops, lunch, and unlimited drinks.",
     "image_url": "https://images.pexels.com/photos/4166305/pexels-photo-4166305.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
     "category": "excursion", "active": True},
]

TAXI_SERVICES = [
    {"id": "airport-nassau", "name": "LPIA Airport → Downtown Nassau / Cable Beach", "price": 35.0,
     "route": "LPIA → Nassau", "featured": True,
     "description": "Flat rate per taxi, up to 3 passengers. Meet & greet at arrivals, luggage help, air-conditioned.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
    {"id": "airport-paradise", "name": "LPIA Airport → Paradise Island / Atlantis / Baha Mar", "price": 45.0,
     "route": "LPIA → Paradise Island", "featured": True,
     "description": "Flat rate per taxi, up to 3 passengers. Paradise Island bridge toll included.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
    {"id": "port-paradise", "name": "Cruise Port (Prince George Wharf) → Paradise Island", "price": 25.0,
     "route": "Cruise Port → Paradise Island", "featured": True,
     "description": "Straight from the ship to your Paradise Island resort. Bridge toll included.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
    {"id": "paradise-nassau", "name": "Paradise Island ↔ Downtown Nassau Shuttle", "price": 20.0,
     "route": "Paradise Island ↔ Nassau", "featured": True,
     "description": "Bay Street shopping, Fish Fry dinner, downtown nightlife — cross the bridge with ease.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
    {"id": "hourly-charter", "name": "Nassau / Paradise Island Hourly Charter", "price": 55.0,
     "route": "By the hour", "featured": False,
     "description": "Private driver by the hour, 2-hour minimum. Perfect for shopping, sightseeing, or errands.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
    {"id": "van-group", "name": "Group Van Transfer (up to 8 pax) — Nassau + Paradise Island", "price": 90.0,
     "route": "Anywhere on Nassau / PI", "featured": False,
     "description": "Weddings, families, cruise groups. Airport, hotel, cruise port pickups & drop-offs.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
    {"id": "airport-bahamar", "name": "LPIA Airport → Baha Mar / SLS / Grand Hyatt", "price": 35.0,
     "route": "LPIA → Baha Mar", "featured": True,
     "description": "Fixed rate to the Baha Mar resort complex on Cable Beach. Up to 3 passengers.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&q=85"},
    {"id": "cablebeach-downtown", "name": "Cable Beach ↔ Downtown Nassau (Bay Street)", "price": 18.0,
     "route": "Cable Beach ↔ Downtown", "featured": False,
     "description": "Quick hop between Cable Beach hotels and Bay Street shopping / straw market. Nassau tariff.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&q=85"},
    {"id": "downtown-paradise", "name": "Downtown Nassau → Paradise Island (via bridge)", "price": 12.0,
     "route": "Downtown → Paradise Island", "featured": False,
     "description": "Includes $1 Paradise Island bridge toll. Standard Nassau tariff for up to 2 passengers.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&q=85"},
    {"id": "cablebeach-atlantis", "name": "Cable Beach ↔ Atlantis / Paradise Island", "price": 30.0,
     "route": "Cable Beach ↔ Atlantis", "featured": False,
     "description": "Cross-island transfer including bridge toll. Popular for dinner + casino runs.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&q=85"},
    {"id": "fish-fry-shuttle", "name": "Hotel → Arawak Cay Fish Fry (evening)", "price": 15.0,
     "route": "Any Nassau hotel → Fish Fry", "featured": False,
     "description": "One-way evening ride to Nassau's iconic Fish Fry food strip. Return quote on request.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&q=85"},
    {"id": "compass-point", "name": "Nassau → Compass Point / West Bay Street", "price": 25.0,
     "route": "Nassau → West Bay", "featured": False,
     "description": "West-side beach clubs and restaurants beyond Cable Beach. Fixed one-way rate.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&q=85"},
    {"id": "adelaide-southwest", "name": "Nassau → Adelaide Village / South West", "price": 50.0,
     "route": "Nassau → Adelaide", "featured": False,
     "description": "Long-distance transfer to Adelaide Village and the south-west coast. Per Nassau tariff.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&q=85"},
    {"id": "blue-hole-roundtrip", "name": "Nassau → Blue Hole / Lyford Cay (round trip)", "price": 80.0,
     "route": "Nassau ↔ Lyford Cay", "featured": False,
     "description": "Round-trip driver waits up to 90 min. Great for beach picnics or Lyford visits.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&q=85"},
]

RENTALS_SEED = [
    {"id": "spark-compact", "name": "2019 Chevrolet Spark — Compact", "price": 45.0, "seats": 4,
     "year": 2019, "make": "Chevrolet", "model": "Spark", "color": "Silver", "body": "Compact",
     "description": "Zippy little compact — perfect for solo travelers and couples buzzing around Nassau. AC, automatic, unlimited miles. Free delivery to LPIA or your hotel.",
     "image_url": "https://images.unsplash.com/photo-1580273916550-e323be2ae537?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
     "category": "compact", "active": True},
    {"id": "sentra-orange", "name": "2001 Nissan Sentra — Orange Sedan", "price": 39.0, "seats": 5,
     "year": 2001, "make": "Nissan", "model": "Sentra", "color": "Orange", "body": "Sedan",
     "description": "Old but reliable island cruiser — the ultimate budget rental. Bright orange, hard to lose in a parking lot. Free Nassau delivery.",
     "image_url": "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
     "category": "economy", "active": True},
    {"id": "malibu-fullsize", "name": "2019 Chevrolet Malibu — Full-Size Sedan (White)", "price": 79.0, "seats": 5,
     "year": 2019, "make": "Chevrolet", "model": "Malibu", "color": "White", "body": "Full-size Sedan",
     "description": "Spacious full-size sedan for comfort on longer Bahamas drives. Bluetooth, backup camera, roomy trunk.",
     "image_url": "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
     "category": "full-size", "active": True},
    {"id": "trax-suv", "name": "2025 Chevrolet Trax — SUV (White)", "price": 119.0, "seats": 5,
     "year": 2025, "make": "Chevrolet", "model": "Trax", "color": "White", "body": "SUV",
     "description": "Brand-new 2025 SUV with clearance for out-of-town beach runs and cargo for the whole crew. Apple CarPlay, backup cam, roof rack.",
     "image_url": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
     "category": "suv", "active": True},
    {"id": "town-country-van", "name": "2022 Chrysler Town & Country — Mini-Van (White)", "price": 149.0, "seats": 7,
     "year": 2022, "make": "Chrysler", "model": "Town & Country", "color": "White", "body": "Mini-Van",
     "description": "Family & group hauler — 7 seats, sliding doors, panoramic space. Perfect for cruise-port pickups and family beach days.",
     "image_url": "https://images.unsplash.com/photo-1609521263047-f8f205293f24?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
     "category": "mini-van", "active": True},
]

CURRENT_RENTAL_IDS = {r["id"] for r in RENTALS_SEED}


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
        })
    else:
        # backfill new fields if missing (idempotent)
        patch = {}
        if not cfg.get("whatsapp_number"): patch["whatsapp_number"] = WHATSAPP_NUMBER
        if not cfg.get("paypal_me_url"): patch["paypal_me_url"] = PAYPAL_ME_URL
        if not cfg.get("tripadvisor_url"): patch["tripadvisor_url"] = TRIPADVISOR_URL
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

    booking["total"] = round(base + luggage_fee + passenger_fee + deposit_amount, 2)

    await db.bookings.insert_one(booking)
    if req.payment_method == "zelle":
        try:
            notify_booking_confirmed(clean(dict(booking)))
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
    return {"total": total, "paid": paid, "pending": pending, "active": active, "revenue": revenue}


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

def _build_wedding_pdf(inquiry: dict) -> bytes:
    from io import BytesIO
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    )

    NAVY = colors.HexColor("#0B3B5C")
    GOLD = colors.HexColor("#D4A94A")
    CORAL = colors.HexColor("#E86A3C")
    GREY = colors.HexColor("#64748B")
    SAND = colors.HexColor("#FBF7EF")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("title", parent=styles["Title"], fontName="Times-Italic", fontSize=32, textColor=NAVY, spaceAfter=6, leading=34)
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=GREY, spaceAfter=18, letterSpacing=1)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Times-Italic", fontSize=18, textColor=NAVY, spaceBefore=10, spaceAfter=8)
    p = ParagraphStyle("p", parent=styles["Normal"], fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#0B192C"), leading=14, spaceAfter=6)
    small = ParagraphStyle("small", parent=styles["Normal"], fontName="Helvetica", fontSize=8, textColor=GREY, leading=11)

    story = []

    # Header
    story.append(Paragraph("ROX TAXI SERVICE AND TOURS", sub))
    story.append(Paragraph(f"Wedding Package for <font color='#D4A94A'><i>{inquiry.get('customer_name','the happy couple')}</i></font>", title))
    story.append(Paragraph(f"REFERENCE {inquiry['id']} · EVENT DATE {inquiry.get('event_date','')} · {inquiry.get('guest_count',0)} GUESTS", sub))

    # Line items
    lines = []
    pkg = inquiry.get("package") or {}
    for tid, count in (pkg.get("transport") or {}).items():
        if not count:
            continue
        s = await_none = None
    # (services fetched below asynchronously — handled by caller)

    # We render item rows using stored labels via callback in the endpoint
    for row in inquiry.get("_pdf_rows", []):
        lines.append(row)

    if lines:
        story.append(Paragraph("Your package", h2))
        tbl = Table([["Item", "Amount"]] + lines, colWidths=[4.5 * inch, 1.5 * inch], hAlign="LEFT")
        tbl.setStyle(TableStyle([
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE", (0,0), (-1,-1), 9),
            ("TEXTCOLOR", (0,0), (-1,0), NAVY),
            ("BACKGROUND", (0,0), (-1,0), SAND),
            ("LINEBELOW", (0,0), (-1,0), 0.5, NAVY),
            ("LINEBELOW", (0,-1), (-1,-1), 0.5, GREY),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, SAND]),
            ("ALIGN", (1,0), (1,-1), "RIGHT"),
            ("FONTNAME", (1,1), (1,-1), "Courier"),
            ("TEXTCOLOR", (1,1), (1,-1), NAVY),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("LEFTPADDING", (0,0), (-1,-1), 10),
            ("RIGHTPADDING", (0,0), (-1,-1), 10),
            ("TOPPADDING", (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 12))

    # Totals
    subtotal = float(inquiry.get("_subtotal", 0))
    disc_pct = float(inquiry.get("_disc_pct", 0))
    discount = subtotal * disc_pct
    total = float(inquiry.get("estimated_total") or (subtotal - discount))

    totals_rows = [
        ["Subtotal", f"${subtotal:,.2f}"],
    ]
    if disc_pct:
        totals_rows.append([f"Group discount ({int(disc_pct*100)}%)", f"-${discount:,.2f}"])
    totals_rows.append(["Estimated total", f"${total:,.2f}"])

    tot = Table(totals_rows, colWidths=[4.5 * inch, 1.5 * inch], hAlign="LEFT")
    tot.setStyle(TableStyle([
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("FONTNAME", (0,-1), (-1,-1), "Times-Bold"),
        ("FONTSIZE", (0,-1), (-1,-1), 14),
        ("TEXTCOLOR", (0,-1), (-1,-1), CORAL),
        ("ALIGN", (1,0), (1,-1), "RIGHT"),
        ("LINEABOVE", (0,-1), (-1,-1), 0.5, NAVY),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(tot)

    story.append(Spacer(1, 24))
    story.append(Paragraph("What happens next", h2))
    story.append(Paragraph(
        "Our concierge will confirm final pricing within <b>2 hours</b> during business hours. Once you approve, "
        "we send a Stripe / PayPal / Zelle link and lock in your date. Cancellations at least 48 hours before the "
        "service are refundable minus a 15% fee.",
        p,
    ))

    if inquiry.get("notes"):
        story.append(Spacer(1, 6))
        story.append(Paragraph("Your notes", h2))
        story.append(Paragraph(inquiry["notes"].replace("\n", "<br/>"), p))

    story.append(Spacer(1, 30))
    story.append(Paragraph(
        "Rox Taxi Service and Tours · Nassau, New Providence · The Bahamas<br/>"
        "hello@roxtaxi.com · facebook.com/roxtaxiservice · Estimate valid 30 days from date of issue.",
        small,
    ))

    doc.build(story)
    return buf.getvalue()


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

    pdf_bytes = _build_wedding_pdf(doc)
    filename = f"Rox-Wedding-Quote-{doc['id']}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_receipt_pdf(booking: dict) -> bytes:
    from io import BytesIO
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    NAVY = colors.HexColor("#0B3B5C"); GOLD = colors.HexColor("#D4A94A")
    CORAL = colors.HexColor("#E86A3C"); GREY = colors.HexColor("#64748B")
    SAND = colors.HexColor("#FBF7EF")

    buf = BytesIO()
    doc_pdf = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.75*inch, rightMargin=0.75*inch, topMargin=0.75*inch, bottomMargin=0.75*inch)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("t", parent=styles["Title"], fontName="Times-Italic", fontSize=30, textColor=NAVY, spaceAfter=6, leading=32)
    sub = ParagraphStyle("s", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=GREY, spaceAfter=18)
    h2 = ParagraphStyle("h", parent=styles["Heading2"], fontName="Times-Italic", fontSize=16, textColor=NAVY, spaceBefore=8, spaceAfter=6)
    p = ParagraphStyle("p", parent=styles["Normal"], fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#0B192C"), leading=14, spaceAfter=6)
    small = ParagraphStyle("sm", parent=styles["Normal"], fontName="Helvetica", fontSize=8, textColor=GREY, leading=11)

    story = []
    story.append(Paragraph("ROX TAXI SERVICE AND TOURS", sub))
    story.append(Paragraph(f"Booking receipt for <font color='#D4A94A'><i>{booking.get('customer_name','')}</i></font>", title))
    paid = booking.get("payment_status") == "paid"
    status_label = "PAID" if paid else "PENDING PAYMENT"
    story.append(Paragraph(f"REFERENCE {booking['id']} · {status_label} · ISSUED {now_iso()[:10]}", sub))

    # Details table
    rows = [["Service", booking.get("item_name", "-")]]
    rows.append(["Date", str(booking.get("booking_date", ""))])
    if booking.get("pickup_location"):
        rows.append(["Pickup", booking["pickup_location"]])
    if booking.get("dropoff_location"):
        rows.append(["Dropoff", booking["dropoff_location"]])
    rows.append(["Passengers", str(booking.get("passengers", 1))])
    if booking.get("service_type") == "rental":
        rows.append(["Days", str(booking.get("days", 1))])
    rows.append(["Payment method", str(booking.get("payment_method", "-")).title()])

    story.append(Paragraph("Details", h2))
    dtl = Table(rows, colWidths=[1.7*inch, 4.3*inch], hAlign="LEFT")
    dtl.setStyle(TableStyle([
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0,0), (0,-1), GREY),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, SAND]),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(dtl)
    story.append(Spacer(1, 14))

    # Amount breakdown
    base = float(booking.get("price", 0)) * max(1, int(booking.get("days", 1)))
    lug = float(booking.get("luggage_fee", 0))
    pax = float(booking.get("passenger_fee", 0))
    total = float(booking.get("total", base + lug + pax))
    amt_rows = [["Base fare" if booking.get("service_type") != "rental" else f"Rental × {booking.get('days',1)} day(s)", f"${base:,.2f}"]]
    if lug: amt_rows.append([f"Extra luggage ({booking.get('extra_luggage',0)} × $3)", f"${lug:,.2f}"])
    if pax: amt_rows.append(["Group fee (3+ passengers)", f"${pax:,.2f}"])
    amt_rows.append(["Total", f"${total:,.2f}"])

    tot = Table(amt_rows, colWidths=[4.5*inch, 1.5*inch], hAlign="LEFT")
    tot.setStyle(TableStyle([
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("FONTNAME", (0,-1), (-1,-1), "Times-Bold"),
        ("FONTSIZE", (0,-1), (-1,-1), 14),
        ("TEXTCOLOR", (0,-1), (-1,-1), CORAL if paid else NAVY),
        ("ALIGN", (1,0), (1,-1), "RIGHT"),
        ("FONTNAME", (1,0), (1,-2), "Courier"),
        ("LINEABOVE", (0,-1), (-1,-1), 0.5, NAVY),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(tot)

    if paid:
        story.append(Spacer(1, 12))
        story.append(Paragraph("<font color='#D4A94A'><b>PAID IN FULL</b></font> — thank you for choosing Rox.", p))
    else:
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>Payment pending.</b> Complete payment via the link in your confirmation email or contact us on WhatsApp.", p))

    story.append(Spacer(1, 18))
    story.append(Paragraph("Cancellation policy", h2))
    story.append(Paragraph(
        "Cancel 48+ hours before service to receive a refund minus a 15% cancellation fee. Cancellations within 48 hours are non-refundable.",
        p,
    ))

    story.append(Spacer(1, 24))
    story.append(Paragraph(
        "Rox Taxi Service and Tours · Nassau, New Providence · The Bahamas<br/>"
        "hello@roxtaxi.com · facebook.com/roxtaxiservice · Keep this receipt for your records.",
        small,
    ))

    doc_pdf.build(story)
    return buf.getvalue()


@api_router.get("/bookings/{booking_id}/receipt.pdf")
async def booking_receipt_pdf(booking_id: str):
    from fastapi.responses import Response
    booking = await db.bookings.find_one({"id": booking_id.upper()})
    if not booking:
        raise HTTPException(404, "Booking not found")
    pdf_bytes = _build_receipt_pdf(booking)
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
                notify_booking_confirmed(clean(dict(booking)))
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
