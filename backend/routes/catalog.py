"""Public catalog router — read-only feeds for the public site.

Endpoints:
    GET /tours          — active tours (promo-annotated)
    GET /taxi-services  — fixed-fare taxi routes (promo-annotated)
    GET /rentals        — active rental vehicles (promo-annotated)
    GET /home-slides    — hero carousel (admin-ordered)
    GET /reviews        — static Google reviews snapshot
    GET /packages       — curated multi-service bundles (self-seeds on first hit)

Wired up by server.py via `configure()` + `include_router()`. Same
factory-configure pattern as routes/payments.py and routes/admin.py.
"""
from typing import Callable, List
from fastapi import APIRouter


_db = None
_clean: Callable = lambda x: x
_annotate_promo: Callable = lambda x: x
_now_iso: Callable = lambda: ""
_reviews_seed: list = []


def configure(*, db, clean, annotate_promo, now_iso, reviews_seed: list):
    """Called once at app startup."""
    global _db, _clean, _annotate_promo, _now_iso, _reviews_seed
    _db = db
    _clean = clean
    _annotate_promo = annotate_promo
    _now_iso = now_iso
    _reviews_seed = reviews_seed


router = APIRouter()


@router.get("/tours")
async def list_tours():
    docs = await _db.tours.find({"active": True}).to_list(200)
    return [_annotate_promo(_clean(d)) for d in docs]


@router.get("/taxi-services")
async def list_taxi_services():
    """Public fixed-fare taxi routes for the /taxi page grid."""
    docs = await _db.taxi_services.find({"active": {"$ne": False}}).to_list(200)
    return [_annotate_promo(_clean(d)) for d in docs]


@router.get("/rentals")
async def list_rentals():
    docs = await _db.rentals.find({"active": True}).to_list(200)
    return [_annotate_promo(_clean(d)) for d in docs]


@router.get("/home-slides")
async def list_home_slides():
    """Public feed for the home page hero carousel — sorted by admin-set order."""
    docs = await _db.home_slides.find({"active": True}).sort("order", 1).to_list(50)
    return [_clean(d) for d in docs]


@router.get("/reviews")
async def list_reviews():
    """Real reviews pasted via admin. Rating + total are computed from the
    actual pasted rows (no more inflated seed numbers). Returns an empty
    list when no reviews have been pasted yet — the frontend hides the
    section in that case."""
    docs = await _db.reviews.find({"active": {"$ne": False}}).sort("created_at", -1).to_list(60)
    reviews = [_clean(d) for d in docs]
    if not reviews:
        return {
            "place": "Rox Taxi Service & Tours",
            "rating": 0.0,
            "total": 0,
            "source": "Google",
            "reviews": [],
        }
    avg = sum(int(r.get("rating") or 0) for r in reviews) / len(reviews)
    return {
        "place": "Rox Taxi Service & Tours",
        "rating": round(avg, 1),
        "total": len(reviews),
        "source": "Google",
        "reviews": reviews,
    }


@router.get("/packages")
async def list_packages():
    """Public curated bundles. Each: {id, name, description,
    items:[{service_type,item_name}], subtotal, package_price, savings}.
    Self-seeds on first hit if the collection is empty."""
    docs = await _db.packages.find({"active": {"$ne": False}}).to_list(50)
    if not docs:
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
            s["created_at"] = _now_iso()
            await _db.packages.update_one({"id": s["id"]}, {"$setOnInsert": s}, upsert=True)
        docs = await _db.packages.find({"active": {"$ne": False}}).to_list(50)
    return [_clean(d) for d in docs]
