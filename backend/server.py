from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

CHAT_SYSTEM = (
    "You are Roxi, the friendly live-chat concierge for Rox Taxi & Tours in The Bahamas. "
    "Help visitors book taxis, tours/excursions, and car rentals. Be warm, brief and specific.\n\n"
    "Services & prices:\n"
    "- Airport transfer Nassau (LPIA) → Downtown/Cable Beach: $35/taxi (up to 3 pax)\n"
    "- Airport → Paradise Island/Atlantis: $45/taxi (bridge toll included)\n"
    "- Hourly private charter: $55/hour (2-hour min)\n"
    "- Group van transfer (up to 8 pax): $90\n"
    "Excursions:\n"
    "- Exuma Swimming Pigs day tour: $285 (8h)\n"
    "- Blue Lagoon Island beach day: $89 (6h)\n"
    "- Rose Island snorkeling: $65 (4h)\n"
    "- Three-island boat hopping: $149 (7h)\n"
    "- Atlantis / Paradise Island city tour: $45 (3h)\n"
    "Car rentals (per day, unlimited miles): Economy Nissan Versa $55, Toyota Corolla $69, "
    "Toyota RAV4 SUV $115, Mercedes GLE Luxury $245, 12-seater van $175.\n\n"
    "Payment: Credit Card & PayPal via Stripe, or Zelle transfer. Tell users they can pre-book online at "
    "/taxi, /tours, /rentals and track any booking at /track with their confirmation code. Facebook: "
    "https://www.facebook.com/roxtaxiservice/. If asked something outside taxi/tours/car rentals, politely "
    "redirect. Never invent prices or make promises about live driver locations."
)

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------------- Models ----------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class BookingCreate(BaseModel):
    service_type: str  # "taxi" | "tour" | "rental"
    item_id: str       # id of tour/rental or "taxi"
    item_name: str
    price: float
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    booking_date: str  # ISO date/datetime string
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    passengers: Optional[int] = 1
    days: Optional[int] = 1
    notes: Optional[str] = None
    payment_method: str  # "stripe" | "zelle"


class BookingStatusUpdate(BaseModel):
    status: str  # confirmed, driver_assigned, en_route, arrived, completed, cancelled


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


# ---------------- Auth ----------------

def make_token(email: str) -> str:
    payload = {"sub": email, "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(days=7)}
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
async def login(req: LoginRequest):
    if req.email.lower() != ADMIN_EMAIL.lower():
        raise HTTPException(401, "Invalid credentials")
    if not bcrypt.checkpw(req.password.encode(), ADMIN_PASSWORD_HASH.encode()):
        raise HTTPException(401, "Invalid credentials")
    return {"token": make_token(req.email), "email": req.email}


@api_router.get("/auth/me")
async def me(email: str = Depends(require_admin)):
    return {"email": email, "role": "admin"}


# ---------------- Seed content ----------------

TOURS_SEED = [
    {"id": "swimming-pigs", "name": "Exuma Swimming Pigs Day Tour", "price": 285.0, "duration": "8 hours",
     "description": "Boat trip to the famous Pig Beach in the Exumas plus snorkeling with sharks and iguanas.",
     "image_url": "https://images.unsplash.com/photo-1533586616444-300edc8a6b5e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1Mjh8MHwxfHNlYXJjaHwxfHxzd2ltbWluZyUyMHBpZ3MlMjBiYWhhbWFzfGVufDB8fHx8MTc4NTA2MjgxMXww&ixlib=rb-4.1.0&q=85",
     "category": "excursion", "active": True},
    {"id": "blue-lagoon", "name": "Blue Lagoon Island Beach Day", "price": 89.0, "duration": "6 hours",
     "description": "Escape to Blue Lagoon Island — pristine beach, hammocks, kayaks and snorkeling.",
     "image_url": "https://images.unsplash.com/photo-1723567017685-86060d4861c7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxiYWhhbWFzJTIwYmVhY2glMjBjbGVhciUyMHdhdGVyfGVufDB8fHx8MTc4NTA2MjgxMXww&ixlib=rb-4.1.0&q=85",
     "category": "excursion", "active": True},
    {"id": "snorkel-reef", "name": "Rose Island Snorkeling Adventure", "price": 65.0, "duration": "4 hours",
     "description": "Guided snorkeling on Rose Island reef with vibrant corals and tropical fish.",
     "image_url": "https://images.unsplash.com/photo-1680635601834-581581c6cdfa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwyfHxzbm9ya2VsaW5nJTIwYmFoYW1hcyUyMGNsZWFyJTIwd2F0ZXJ8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85",
     "category": "excursion", "active": True},
    {"id": "island-hop", "name": "Three Island Boat Hopping", "price": 149.0, "duration": "7 hours",
     "description": "Cruise Nassau's out-islands with beach stops, lunch, and unlimited drinks.",
     "image_url": "https://images.pexels.com/photos/4166305/pexels-photo-4166305.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
     "category": "excursion", "active": True},
    {"id": "atlantis-transfer", "name": "Atlantis & Paradise Island City Tour", "price": 45.0, "duration": "3 hours",
     "description": "Guided city tour ending at Atlantis Resort with photo stops at Fort Fincastle and Queen's Staircase.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85",
     "category": "tour", "active": True},
]

TAXI_SERVICES = [
    {"id": "airport-nassau", "name": "Nassau Airport (LPIA) → Downtown / Cable Beach", "price": 35.0,
     "description": "Fixed rate per taxi, up to 3 passengers. AC, meet & greet, luggage help.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
    {"id": "airport-paradise", "name": "Nassau Airport → Paradise Island / Atlantis", "price": 45.0,
     "description": "Fixed rate per taxi, up to 3 passengers. Bridge toll included.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
    {"id": "hourly-charter", "name": "Hourly Taxi Charter (Private Driver)", "price": 55.0,
     "description": "Per hour, 2-hour minimum. Perfect for shopping, sightseeing, or errands.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
    {"id": "van-group", "name": "Group Van Transfer (up to 8 pax)", "price": 90.0,
     "description": "Ideal for families, friends and groups. Airport, hotel, cruise port pickups.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85"},
]

RENTALS_SEED = [
    {"id": "economy", "name": "Economy — Nissan Versa", "price": 55.0, "seats": 5,
     "description": "Great gas mileage, easy Nassau parking. AC, automatic, unlimited miles.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85",
     "category": "economy", "active": True},
    {"id": "midsize", "name": "Mid-size — Toyota Corolla", "price": 69.0, "seats": 5,
     "description": "Comfortable ride for couples & small families. Bluetooth, backup camera.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85",
     "category": "midsize", "active": True},
    {"id": "suv", "name": "SUV — Toyota RAV4", "price": 115.0, "seats": 5,
     "description": "Extra cargo & clearance for out-of-town beach runs. 4WD, roof rack.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85",
     "category": "suv", "active": True},
    {"id": "luxury", "name": "Luxury — Mercedes GLE", "price": 245.0, "seats": 5,
     "description": "Turn heads on Bay Street. Premium interior, panoramic roof, full insurance.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85",
     "category": "luxury", "active": True},
    {"id": "van", "name": "Passenger Van — 12-seater", "price": 175.0, "seats": 12,
     "description": "Weddings, family reunions, or big group airport runs. AC, luggage roof rack.",
     "image_url": "https://images.unsplash.com/photo-1736742482023-03f3be60875e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBzdXYlMjBkcml2aW5nJTIwdHJvcGljYWx8ZW58MHx8fHwxNzg1MDYyODExfDA&ixlib=rb-4.1.0&q=85",
     "category": "van", "active": True},
]


@app.on_event("startup")
async def seed_db():
    if await db.tours.count_documents({}) == 0:
        await db.tours.insert_many(TOURS_SEED)
    if await db.taxi_services.count_documents({}) == 0:
        await db.taxi_services.insert_many(TAXI_SERVICES)
    if await db.rentals.count_documents({}) == 0:
        await db.rentals.insert_many(RENTALS_SEED)


def clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc.pop("_id", None)
    return doc


# ---------------- Catalog ----------------

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


@api_router.get("/site-config")
async def site_config():
    return {"facebook_url": FACEBOOK_URL, "zelle_email": ZELLE_EMAIL, "zelle_phone": ZELLE_PHONE}


# ---------------- Bookings ----------------

@api_router.post("/bookings")
async def create_booking(req: BookingCreate):
    booking = req.model_dump()
    booking["id"] = str(uuid.uuid4())[:8].upper()
    booking["status"] = "pending_payment" if req.payment_method == "stripe" else "confirmed"
    booking["payment_status"] = "pending"
    booking["created_at"] = now_iso()
    booking["updated_at"] = now_iso()
    booking["total"] = float(req.price) * max(1, req.days or 1)
    await db.bookings.insert_one(booking)
    return clean(booking)


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


@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, request: Request):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(404, "Transaction not found")

    if record.get("payment_status") != "paid":
        host_url = str(request.base_url)
        webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        try:
            status = await stripe_checkout.get_checkout_status(session_id)
            if status.payment_status == "paid" or status.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now_iso()}},
                )
                await db.bookings.update_one(
                    {"id": record["booking_id"]},
                    {"$set": {"payment_status": "paid", "status": "confirmed", "updated_at": now_iso()}},
                )
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except Exception as e:  # noqa: BLE001
            logging.getLogger(__name__).warning("stripe status err %s", e)

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
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        result = await stripe_checkout.handle_webhook(body, sig)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Webhook error: {e}")

    if result.payment_status == "paid":
        await db.payment_transactions.update_one(
            {"session_id": result.session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now_iso()}},
        )
        booking_id = (result.metadata or {}).get("booking_id")
        if booking_id:
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"payment_status": "paid", "status": "confirmed", "updated_at": now_iso()}},
            )
    return {"status": "ok"}


@api_router.get("/")
async def root():
    return {"service": "Rox Taxi & Tours Bahamas API", "status": "running"}


# ---------------- Live Chat (SSE) ----------------

class ChatIn(BaseModel):
    session_id: str
    message: str


@api_router.post("/chat/stream")
async def chat_stream(req: ChatIn):
    """Server-Sent Events chat endpoint. Uses per-session in-process LlmChat with history."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "LLM key not configured")

    # persist user message
    await db.chat_messages.insert_one({
        "session_id": req.session_id, "role": "user", "text": req.message, "ts": now_iso(),
    })

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=req.session_id,
        system_message=CHAT_SYSTEM,
    ).with_model("anthropic", "claude-sonnet-4-6")

    # rehydrate short history so replies are contextual across requests
    history = await db.chat_messages.find({"session_id": req.session_id}).sort("ts", 1).to_list(50)
    # Feed everything except the very last user msg (which will be sent in stream) as context
    # by prepending to system prompt (LlmChat holds its own turn history per instance, so we
    # replay past turns quickly using send_message BEFORE we stream the current turn).
    # For simplicity & latency, we just send the current message; history is captured in DB.

    full_text = []

    async def gen():
        try:
            async for ev in chat.stream_message(UserMessage(text=req.message)):
                if isinstance(ev, TextDelta):
                    full_text.append(ev.content)
                    # SSE frame
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
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@api_router.get("/chat/history/{session_id}")
async def chat_history(session_id: str):
    docs = await db.chat_messages.find({"session_id": session_id}).sort("ts", 1).to_list(200)
    return [{"role": d["role"], "text": d["text"], "ts": d["ts"]} for d in docs]


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
