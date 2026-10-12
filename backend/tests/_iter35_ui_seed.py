"""Iter35 Playwright seed — reusable before running UI test."""
import os, uuid
from datetime import datetime, timedelta, timezone
import pymongo
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
db = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
NOW = datetime.now(timezone.utc)
NOW_ISO = NOW.isoformat()
FUTURE = (NOW + timedelta(days=5)).isoformat()
PAST = (NOW - timedelta(days=10)).isoformat()
YEAR = (NOW + timedelta(days=365)).isoformat()

EMAIL = "test.ui.gift@example.com"
USER_ID = "TEST_UI_user"
TOKEN = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"
GC_UI = "TEST-GC-UI-ACTIVE"
BID_PAY = "TESTUIPAY"
BID_PAST = "TESTUIPAST"
BID_UP = "TESTUIUP"


def cleanup():
    db.gift_cards.delete_many({"code": {"$regex": "^TEST-GC-UI"}})
    db.bookings.delete_many({"id": {"$regex": "^TESTUI"}})
    db.users.delete_many({"user_id": USER_ID})
    db.user_sessions.delete_many({"user_id": USER_ID})


def seed():
    cleanup()
    db.gift_cards.insert_one({
        "code": GC_UI, "status": "active", "balance": 50.0, "amount": 50.0,
        "expires_at": YEAR, "buyer_email": EMAIL.lower(),
        "recipient_email": EMAIL.lower(), "buyer_name": "Test",
        "non_refundable": True, "created_at": NOW_ISO,
    })
    # pending-payment booking for /pay/{id}
    db.bookings.insert_one({
        "id": BID_PAY, "customer_name": "TEST UI Pay", "customer_email": EMAIL.lower(),
        "status": "pending_payment", "payment_status": "pending",
        "payment_method": "stripe", "booking_date": FUTURE, "total": 200.0,
        "service_type": "taxi", "item_name": "TEST UI Taxi", "created_at": NOW_ISO,
    })
    # Upcoming (paid)
    db.bookings.insert_one({
        "id": BID_UP, "customer_name": "TEST UI Up", "customer_email": EMAIL.lower(),
        "status": "confirmed", "payment_status": "paid",
        "payment_method": "stripe", "booking_date": FUTURE, "total": 60.0,
        "service_type": "tour", "item_id": "cable-beach-day",
        "item_name": "TEST UI Tour", "created_at": NOW_ISO,
    })
    # Past (for "Book again")
    db.bookings.insert_one({
        "id": BID_PAST, "customer_name": "TEST UI Past", "customer_email": EMAIL.lower(),
        "status": "completed", "payment_status": "paid",
        "payment_method": "stripe", "booking_date": PAST, "total": 40.0,
        "service_type": "taxi", "item_id": "lpia-downtown",
        "item_name": "TEST UI Taxi Past", "created_at": NOW_ISO,
    })
    db.users.update_one(
        {"user_id": USER_ID},
        {"$set": {"user_id": USER_ID, "email": EMAIL.lower(),
                  "name": "TEST UI Gift User", "created_at": NOW_ISO}},
        upsert=True,
    )
    db.user_sessions.insert_one({
        "user_id": USER_ID, "session_token": TOKEN, "auth_method": "email",
        "expires_at": (NOW + timedelta(days=7)).isoformat(),
        "last_activity_at": NOW_ISO, "created_at": NOW_ISO,
    })
    print("SEED_OK", "token=", TOKEN, "booking=", BID_PAY, "gift=", GC_UI)


if __name__ == "__main__":
    import sys
    if sys.argv[-1] == "cleanup":
        cleanup(); print("CLEAN_OK")
    else:
        seed()
