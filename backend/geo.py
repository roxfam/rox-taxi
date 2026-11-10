"""Hidden Nassau 'map': known places + geocode cache + distance fare for custom taxi addresses.

Distance formula (only for addresses with no fixed route): $15 base + $2 per road km (up to 2 guests).
"""
import math
import re
import logging
import uuid

import httpx

CUSTOM_BASE_USD = 15.0
CUSTOM_PER_KM_USD = 2.0
_VIEWBOX = "-77.57,25.11,-77.24,24.97"  # New Providence + Paradise Island

# (name shown in drop-downs, lat, lng, extra aliases). Core endpoints are included for distance legs only.
NASSAU_PLACES = [
    ("LPIA — Nassau Airport", 25.0393, -77.4661, ["lpia", "airport", "lynden pindling"], True),
    ("Nassau Cruise Port", 25.0785, -77.3395, ["cruise", "prince george", "wharf"], True),
    ("Downtown Nassau / Bay Street", 25.0782, -77.3420, ["downtown", "bay street"], True),
    ("Cable Beach", 25.0808, -77.4059, ["cable beach"], True),
    ("Baha Mar", 25.0782, -77.4126, ["baha mar", "sls", "grand hyatt", "rosewood"], True),
    ("Paradise Island / Atlantis", 25.0850, -77.3200, ["atlantis", "paradise island", "marina village"], True),
    ("Arawak Cay Fish Fry", 25.0778, -77.3625, ["fish fry", "arawak"], True),
    ("Montague Beach", 25.0790, -77.3080, ["montagu", "montague"], True),
    ("Lyford Cay", 25.0180, -77.5195, ["lyford"], True),
    ("Adelaide Village", 24.9990, -77.5050, ["adelaide"], True),
    ("Compass Point / West Bay", 25.0780, -77.4920, ["compass point"], True),
    ("Junkanoo Beach", 25.0824, -77.3435, ["junkanoo"], True),
    ("Love Beach", 25.0770, -77.4650, ["love beach"], True),
    ("Humes House @ Hillcrest", 25.0560, -77.3480, ["humes", "hillcrest"], True),
    ("Palm Cay", 25.0230, -77.2770, ["palm cay"], True),
    ("Cabbage Beach", 25.0890, -77.3180, ["cabbage"], True),
    # Popular tourist spots priced by distance (not on the fixed-rate list)
    ("Queen's Staircase / Fort Fincastle", 25.0747, -77.3397, ["queen's staircase", "queens staircase", "fort fincastle", "water tower"], False),
    ("Fort Charlotte", 25.0779, -77.3601, ["fort charlotte"], False),
    ("Ardastra Gardens & Zoo", 25.0768, -77.3654, ["ardastra", "flamingo"], False),
    ("Nassau Botanic Gardens", 25.0762, -77.3685, ["botanic"], False),
    ("Clifton Heritage National Park", 25.0072, -77.5486, ["clifton"], False),
    ("Graycliff Hotel & Chocolatier", 25.0763, -77.3449, ["graycliff"], False),
    ("John Watling's Distillery", 25.0758, -77.3462, ["john watling", "watlings", "buena vista"], False),
    ("Pirates of Nassau Museum", 25.0775, -77.3433, ["pirates of nassau", "pirate museum"], False),
    ("Straw Market", 25.0782, -77.3425, ["straw market"], False),
    ("Parliament Square", 25.0778, -77.3418, ["parliament"], False),
    ("Government House", 25.0762, -77.3436, ["government house"], False),
    ("British Colonial Hilton", 25.0790, -77.3455, ["british colonial", "hilton"], False),
    ("Margaritaville Beach Resort", 25.0795, -77.3448, ["margaritaville"], False),
    ("Potter's Cay Dock", 25.0790, -77.3290, ["potter's cay", "potters cay"], False),
    ("Long Wharf Beach / Western Esplanade", 25.0806, -77.3510, ["long wharf", "western esplanade"], False),
    ("Saunders Beach", 25.0793, -77.3740, ["saunders"], False),
    ("Goodman's Bay", 25.0794, -77.3920, ["goodman"], False),
    ("Sandals Royal Bahamian", 25.0785, -77.4245, ["sandals"], False),
    ("Melia Nassau Beach", 25.0800, -77.4150, ["melia"], False),
    ("Sandyport", 25.0700, -77.4740, ["sandyport"], False),
    ("Old Fort Bay", 25.0560, -77.5170, ["old fort bay"], False),
    ("Orange Hill Beach", 25.0670, -77.4800, ["orange hill"], False),
    ("Gambier Village", 25.0610, -77.4950, ["gambier"], False),
    ("Jaws Beach", 24.9960, -77.5360, ["jaws beach"], False),
    ("Albany Resort", 24.9970, -77.5320, ["albany"], False),
    ("South Ocean", 24.9930, -77.5150, ["south ocean"], False),
    ("Coral Harbour", 24.9835, -77.4680, ["coral harbour", "coral harbor"], False),
    ("Carmichael Road", 25.0150, -77.3900, ["carmichael"], False),
    ("The Mall at Marathon", 25.0500, -77.3240, ["marathon"], False),
    ("Princess Margaret Hospital", 25.0710, -77.3365, ["princess margaret", "pmh"], False),
    ("Doctors Hospital", 25.0730, -77.3410, ["doctors hospital"], False),
    ("Bahamas National Trust — The Retreat", 25.0590, -77.3000, ["the retreat", "national trust"], False),
    ("Fox Hill", 25.0470, -77.2950, ["fox hill"], False),
    ("Yamacraw Beach", 25.0215, -77.2610, ["yamacraw"], False),
    ("Warwick Paradise Island", 25.0858, -77.3330, ["warwick"], False),
    ("Riu Palace Paradise Island", 25.0870, -77.3150, ["riu"], False),
    ("One&Only Ocean Club", 25.0880, -77.3035, ["ocean club", "one&only", "one and only"], False),
    ("Hurricane Hole Marina", 25.0838, -77.3290, ["hurricane hole"], False),
    ("Versailles Gardens", 25.0870, -77.3020, ["versailles"], False),
]


_PLACES: list = [(n, la, lo, al, c) for n, la, lo, al, c in NASSAU_PLACES]


async def load_places(db) -> None:
    global _PLACES
    rows = await db.nassau_places.find({"active": {"$ne": False}}).sort("name", 1).to_list(1000)
    _PLACES = [(r["name"], float(r["lat"]), float(r["lng"]), list(r.get("aliases") or []), bool(r.get("fixed_endpoint")))
               for r in rows if r.get("lat") is not None and r.get("lng") is not None]


async def get_rates(db) -> tuple:
    cfg = await db.site_config.find_one({"_id": "main"}, {"custom_base_usd": 1, "custom_per_km_usd": 1}) or {}
    base = cfg.get("custom_base_usd")
    per_km = cfg.get("custom_per_km_usd")
    return (float(base) if base is not None else CUSTOM_BASE_USD,
            float(per_km) if per_km is not None else CUSTOM_PER_KM_USD)


def extra_place_labels() -> list:
    return [p[0] for p in _PLACES if not p[4]]


_PI_WORDS = ("paradise island", "atlantis", "ocean club", "one&only", "one and only", "marina village", "cabbage beach",
             "cove atlantis", "royal towers", "harborside", "hurricane hole", "warwick", "riu palace", "versailles",
             "comfort suites paradise", "paradise harbour", "paradise beach", "pi bridge", "paradise")


def _on_paradise(lat: float, lng: float) -> bool:
    return lat >= 25.083 and -77.345 <= lng <= -77.27


def crosses_paradise(*texts) -> bool:
    """True when any pickup / stop / drop-off is on Paradise Island (needs the $2 bridge toll pass)."""
    words = set(_PI_WORDS)
    for name, lat, lng, aliases, _core in _PLACES:
        if _on_paradise(lat, lng):
            words.update([name.lower(), *[a.lower() for a in aliases]])
    blob = " | ".join(_norm(t) for t in texts if t)
    return any(w in blob for w in words)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().replace("’", "'")).strip()


def _known(text: str):
    t = _norm(text)
    best, best_len = None, 0
    for name, lat, lng, aliases, _core in _PLACES:
        for a in [name.lower(), *aliases]:
            if a in t and len(a) > best_len:
                best, best_len = (lat, lng), len(a)
    return best


async def seed_places(db) -> None:
    for name, lat, lng, aliases, core in NASSAU_PLACES:
        await db.nassau_places.update_one({"name": name}, {"$setOnInsert": {"lat": lat, "lng": lng, "aliases": aliases, "fixed_endpoint": core, "active": True}}, upsert=True)
    async for r in db.nassau_places.find({"id": {"$exists": False}}, {"_id": 1}):
        await db.nassau_places.update_one({"_id": r["_id"]}, {"$set": {"id": uuid.uuid4().hex[:10]}})
    await load_places(db)


async def geocode(text: str, db):
    hit = _known(text)
    if hit:
        return hit
    key = _norm(text)
    if not key:
        return None
    cached = await db.geo_cache.find_one({"q": key})
    if cached:
        return (cached["lat"], cached["lng"]) if cached.get("lat") is not None else None
    lat = lng = None
    try:
        async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": "RoxTaxi/1.0 (roxtaxi.com)"}) as c:
            r = await c.get("https://nominatim.openstreetmap.org/search", params={
                "q": f"{text}, New Providence, Bahamas", "format": "json", "limit": 1,
                "countrycodes": "bs", "viewbox": _VIEWBOX, "bounded": 1})
            rows = r.json() if r.status_code == 200 else []
            if rows:
                lat, lng = float(rows[0]["lat"]), float(rows[0]["lon"])
    except Exception as ex:  # noqa: BLE001
        logging.warning("geocode failed for %r: %s", text, ex)
        return None  # don't cache transient failures
    await db.geo_cache.update_one({"q": key}, {"$set": {"lat": lat, "lng": lng}}, upsert=True)
    return (lat, lng) if lat is not None else None


def _haversine_km(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


async def road_km(a, b) -> float:
    try:
        async with httpx.AsyncClient(timeout=4.0) as c:
            r = await c.get(f"https://router.project-osrm.org/route/v1/driving/{a[1]},{a[0]};{b[1]},{b[0]}",
                            params={"overview": "false"})
            d = r.json()
            if d.get("code") == "Ok":
                return d["routes"][0]["distance"] / 1000.0
    except Exception:  # noqa: BLE001
        pass
    return _haversine_km(a, b) * 1.3  # typical Nassau road winding


async def distance_fare(from_text: str, to_text: str, db) -> dict:
    a = await geocode(from_text, db)
    b = await geocode(to_text, db)
    missing = from_text if not a else to_text if not b else None
    if missing:
        return {"ok": False, "error": f"We couldn't find \"{missing}\" on the Nassau map. Try a nearby landmark or WhatsApp us."}
    km = round(max(0.5, await road_km(a, b)), 1)
    base, per_km = await get_rates(db)
    fare = float(math.floor(base + per_km * km + 0.5))
    return {"ok": True, "km": km, "fare": fare, "base": base, "per_km": per_km}
