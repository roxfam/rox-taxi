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
import asyncio
import time
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


# ── Recommended-addon computation (cached 10 min) ────────────────────
# The /taxi-services endpoint decorates each addon with `recommended:
# True` when its 30-day attach rate crosses 25% AND at least 4 guests
# have picked it. Cached in-memory so the public catalog endpoint
# stays fast even if hundreds of visitors hit it inside a minute.
_recommended_cache: dict = {"ts": 0.0, "keys": set()}
_RECOMMENDED_TTL_SECONDS = 600  # 10 min


async def _compute_recommended_addon_keys() -> set:
    """Returns a set of `(service_id, addon_id)` tuples that qualify
    as 'recommended' based on the last 30 days of booking activity."""
    from datetime import datetime, timedelta, timezone
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    pipeline = [
        {"$match": {"service_type": "taxi", "created_at": {"$gte": since}}},
        {"$group": {
            "_id": "$item_id",
            "total_bookings": {"$sum": 1},
            "addons_lists": {"$push": {"$ifNull": ["$addons_selected", []]}},
        }},
    ]
    keys: set = set()
    async for row in _db.bookings.aggregate(pipeline):
        item_id = row["_id"]
        total = int(row["total_bookings"])
        if total <= 0:
            continue
        counts: dict = {}
        for lst in row.get("addons_lists") or []:
            for a in (lst or []):
                aid = a.get("id")
                if aid:
                    counts[aid] = counts.get(aid, 0) + 1
        for aid, attaches in counts.items():
            rate = (attaches / total) * 100
            if rate >= 25.0 and attaches >= 4:
                keys.add((item_id, aid))
    return keys


async def _get_recommended_keys() -> set:
    now = time.monotonic()
    if now - _recommended_cache["ts"] < _RECOMMENDED_TTL_SECONDS and _recommended_cache["keys"]:
        return _recommended_cache["keys"]
    try:
        keys = await _compute_recommended_addon_keys()
        _recommended_cache["keys"] = keys
        _recommended_cache["ts"] = now
        return keys
    except Exception:  # noqa: BLE001
        return _recommended_cache.get("keys") or set()


@router.get("/tours")
async def list_tours():
    docs = await _db.tours.find({"active": True}).to_list(200)
    return [_annotate_promo(_clean(d)) for d in docs]


@router.get("/taxi-services")
async def list_taxi_services():
    """Public fixed-fare taxi routes for the /taxi page grid. Each
    add-on is decorated with `recommended: True` when its 30-day
    attach rate crosses 25% (min 4 attaches) — surfaces a gold ribbon
    in the frontend chip strip on high-converting extras."""
    docs = await _db.taxi_services.find({"active": {"$ne": False}}).to_list(200)
    recommended_keys = await _get_recommended_keys()
    out = []
    for d in docs:
        cleaned = _annotate_promo(_clean(d))
        addons = cleaned.get("addons") or []
        if addons and recommended_keys:
            sid = cleaned.get("id")
            for a in addons:
                if (sid, a.get("id")) in recommended_keys:
                    a["recommended"] = True
        out.append(cleaned)
    return out


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
    section in that case.

    Reviews that name-drop a driver from the tag roster (see
    site_config.driver_name_tags) are pinned to the front of the list
    so returning guests + guests booking with that driver see the
    proof point immediately.
    """
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
    # Sort tagged reviews first while preserving each subset's order
    tagged = [r for r in reviews if r.get("driver_tags")]
    untagged = [r for r in reviews if not r.get("driver_tags")]
    reviews = tagged + untagged
    avg = sum(int(r.get("rating") or 0) for r in reviews) / len(reviews)
    return {
        "place": "Rox Taxi Service & Tours",
        "rating": round(avg, 1),
        "total": len(reviews),
        "source": "Google",
        "reviews": reviews,
    }


@router.get("/drivers/{slug}")
async def get_driver_spotlight(slug: str):
    """Public driver-spotlight endpoint. Returns bio + headshot + the
    driver's tagged Google reviews (highest-star first). Bio is stored
    in `site_config.driver_spotlights` so the owner can edit copy +
    photo from the admin panel without a deploy.

    Falls back to a default Reagan profile so the /drivers/reagan
    landing page has content out of the box even before the owner
    customises it.
    """
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    roster = cfg.get("driver_spotlights") or {}
    # Case-insensitive key match; canonicalise on the way in
    key = slug.strip().lower()
    profile = roster.get(key) or roster.get(slug) or {}

    # ── Sensible defaults so /drivers/reagan renders immediately ────
    if not profile and key == "reagan":
        profile = {
            "canonical": "Reagan",
            "tagline": "The reason 4 out of 5 Google reviews mention his name.",
            "bio": (
                "Reagan grew up on New Providence and has been driving the "
                "Nassau taxi circuit for over a decade. Guests routinely "
                "call him their favourite part of the trip — patient with "
                "families, playful with kids, and a walking history book "
                "for the Bay Street strip, Fort Fincastle, and the Queen's "
                "Staircase. Every review below name-drops him directly."
            ),
            "specialties": [
                "Airport transfers (LPIA in 12 min from downtown)",
                "Cruise-port meet-and-greet",
                "Queen's Staircase + Fort Fincastle historical loop",
                "Long-form Nassau city narration on request",
            ],
            "headshot_url": "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop&crop=faces&auto=format",
            "years_experience": 10,
            "languages": ["English", "Bahamian Creole"],
        }
    if not profile:
        return {"error": "not_found", "slug": slug}

    # Pull this driver's tagged reviews (order: highest-star, then most
    # recent). Match on canonical name in `driver_tags`.
    canonical = profile.get("canonical") or slug.title()
    tagged = await _db.reviews.find({
        "active": {"$ne": False},
        "driver_tags": canonical,
    }).sort([("rating", -1), ("created_at", -1)]).to_list(20)

    return {
        "slug": key,
        "profile": profile,
        "reviews": [_clean(r) for r in tagged],
        "review_count": len(tagged),
        "avg_rating": (
            round(sum(int(r.get("rating") or 0) for r in tagged) / len(tagged), 1)
            if tagged else 0.0
        ),
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
