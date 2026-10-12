"""Seed/cleanup two TEST bookings for Playwright UI testing."""
import os
import sys
import asyncio
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

IDS = ["TESTROW_UI_1", "TESTROW_UI_2"]


def _mk(bid, name):
    tomorrow = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
    return {
        "id": bid,
        "customer_name": name,
        "customer_email": f"{bid.lower()}@example.com",
        "status": "confirmed",
        "payment_status": "pending",
        "payment_method": "stripe",
        "booking_date": tomorrow,
        "total": 40.0,
        "item_name": "TEST Taxi",
        "created_at": datetime.utcnow().isoformat() + "Z",
    }


async def seed():
    c = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    for bid in IDS:
        await c.bookings.delete_one({"id": bid})
        await c.bookings_deleted.delete_many({"id": bid})
    await c.bookings.insert_many([_mk("TESTROW_UI_1", "TEST Row UI One"),
                                   _mk("TESTROW_UI_2", "TEST Row UI Two")])
    print("seeded", IDS)


async def cleanup():
    c = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    for bid in IDS:
        await c.bookings.delete_one({"id": bid})
        await c.bookings_deleted.delete_many({"id": bid})
    print("cleaned", IDS)


if __name__ == "__main__":
    asyncio.run(cleanup() if sys.argv[-1] == "cleanup" else seed())
