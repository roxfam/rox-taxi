"""Seed/cleanup for Playwright UI testing (iter32)."""
import os, sys, asyncio
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
MONGO = os.environ["MONGO_URL"]; DB = os.environ["DB_NAME"]

IDS = ["TESTRF1", "TESTRF2"]
TOMORROW = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
NOW = datetime.utcnow().isoformat() + "Z"

RF1 = {"id": "TESTRF1", "customer_name": "TEST Refund One",
       "customer_email": "test.rf@example.com", "status": "confirmed",
       "payment_status": "pending", "payment_method": "stripe",
       "booking_date": TOMORROW, "total": 40.0, "item_name": "TEST Taxi",
       "created_at": NOW}
RF2 = {"id": "TESTRF2", "customer_name": "TEST Refund Two",
       "customer_email": "test.rf2@example.com", "status": "confirmed",
       "payment_status": "paid", "payment_method": "stripe",
       "booking_date": TOMORROW, "total": 60.0, "item_name": "TEST Taxi",
       "created_at": NOW}
TX2 = {"session_id": "cs_TEST_rf2", "booking_id": "TESTRF2",
       "payment_status": "paid", "provider": "stripe",
       "amount": 60.0, "updated_at": NOW}


async def seed():
    c = AsyncIOMotorClient(MONGO)[DB]
    for bid in IDS:
        await c.bookings.delete_one({"id": bid})
        await c.bookings_deleted.delete_many({"id": bid})
        await c.payment_transactions.delete_many({"booking_id": bid})
    await c.bookings.insert_many([RF1, RF2])
    await c.payment_transactions.insert_one(TX2)
    print("seeded", IDS)


async def cleanup():
    c = AsyncIOMotorClient(MONGO)[DB]
    for bid in IDS:
        await c.bookings.delete_one({"id": bid})
        await c.bookings_deleted.delete_many({"id": bid})
        await c.payment_transactions.delete_many({"booking_id": bid})
    print("cleaned", IDS)


if __name__ == "__main__":
    asyncio.run(cleanup() if sys.argv[-1] == "cleanup" else seed())
