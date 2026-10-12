"""Seed/cleanup for Playwright UI testing (iter33 partial refund)."""
import os, sys
from datetime import datetime, timedelta
from dotenv import load_dotenv
import pymongo

load_dotenv("/app/backend/.env")
MONGO = os.environ["MONGO_URL"]; DB = os.environ["DB_NAME"]
IDS = ["TESTPR1"]
NOW = datetime.utcnow().isoformat()
TOMORROW = (datetime.utcnow() + timedelta(days=1)).isoformat()

BOOKING = {
    "id": "TESTPR1", "customer_name": "TEST Partial Refund",
    "customer_email": "test.pr@example.com", "status": "confirmed",
    "payment_status": "paid", "payment_method": "stripe",
    "booking_date": TOMORROW, "total": 60.0, "item_name": "TEST Taxi",
    "created_at": NOW,
}
TX = {"session_id": "cs_TEST_pr1", "booking_id": "TESTPR1",
      "payment_status": "paid", "status": "completed", "provider": "stripe",
      "amount": 60.0, "created_at": NOW, "updated_at": NOW}


def seed():
    db = pymongo.MongoClient(MONGO)[DB]
    for bid in IDS:
        db.bookings.delete_many({"id": bid})
        db.bookings_deleted.delete_many({"id": bid})
        db.payment_transactions.delete_many({"booking_id": bid})
    db.bookings.insert_one(BOOKING)
    db.payment_transactions.insert_one(TX)
    print("seeded", IDS)


def cleanup():
    db = pymongo.MongoClient(MONGO)[DB]
    for bid in IDS:
        db.bookings.delete_many({"id": bid})
        db.bookings_deleted.delete_many({"id": bid})
        db.payment_transactions.delete_many({"booking_id": bid})
    print("cleaned", IDS)


if __name__ == "__main__":
    (cleanup if sys.argv[-1] == "cleanup" else seed)()
