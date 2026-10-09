"""Cable Beach day package — booking, quote, share-link credit, weather.

Previously lived in server.py (~700 lines). Server.py wires this up by calling
`configure(...)` with the shared DB handle + notification + referral helpers,
then `include_router(router)` on the main `/api` router. Exposes
`credit_share_referrer_if_cable_beach` so payments.py can call it after a
Stripe/PayPal payment finalises.
"""
from typing import Optional, List, Dict, Any
import logging
import secrets
import time
import uuid

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, EmailStr, Field


# ── shared state wired in by server.py ───────────────────────────────────
_db = None
_now_iso = None
_notify_owner_activity = None
_send_email = None
_new_referral_code = None
_require_admin = None


def configure(*, db, now_iso, notify_owner_activity, send_email,
              new_referral_code, require_admin):
    global _db, _now_iso, _notify_owner_activity, _send_email  # noqa: PLW0603
    global _new_referral_code, _require_admin  # noqa: PLW0603
    _db = db
    _now_iso = now_iso
    _notify_owner_activity = notify_owner_activity
    _send_email = send_email
    _new_referral_code = new_referral_code
    _require_admin = require_admin


# Placeholder dependency — forwards every FastAPI-resolved param to the
# real `require_admin` wired in via configure(). Matches the pattern used by
# routes/admin.py so cookie + CSRF auth keeps working.
async def _require_admin_dep(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
):
    if not callable(_require_admin):
        raise HTTPException(500, "cable_beach admin dep not configured")
    return await _require_admin(request, authorization, x_csrf_token)


router = APIRouter()


# ─────────────────── Cable Beach Day Package ──────────────────────────────
# Branded "Day at Cable Beach / Goodman's Bay" package with configurable
# transfer, beach gear, lunch and drink add-ons. All pricing lives in
# site_config.cable_beach_pkg so admins can tweak without a redeploy.
CABLE_BEACH_DEFAULTS = {
    "base_price": 40.0,              # Covers 1 chair + umbrella per guest
    "extra_seat_price": 15.0,        # Additional chairs beyond 1-per-guest
    "cruise_oneway_price": 10.0,     # Transfer FROM cruise port (per person)
    "cruise_roundtrip_price": 20.0,  # Round-trip cruise port (per person)
    # Dinner side-dish policy — every dinner (jerk / bbq / classic dinner)
    # includes 2 sides free; additional sides are charged a flat
    # `extra_side_price` each. Each side carries a `glyph` emoji that acts
    # as the default tiny thumbnail; admins can override with a real photo
    # via `image_url` (public URL or object-storage path) through the admin
    # dashboard.
    "sides_included_per_dinner": 2,
    "extra_side_price": 5.0,
    "sides": [
        {"id": "mac_cheese",   "name": "Mac & Cheese",          "glyph": "🧀", "image_url": None},
        {"id": "potato_salad", "name": "Bahamian Potato Salad", "glyph": "🥔", "image_url": None},
        {"id": "cabbage",      "name": "Steamed Cabbage",       "glyph": "🥬", "image_url": None},
        {"id": "broccoli",     "name": "Broccoli",              "glyph": "🥦", "image_url": None},
        {"id": "plantain",     "name": "Plantain",              "glyph": "🍌", "image_url": None},
        {"id": "loose_corn",   "name": "Loose Corn",            "glyph": "🌽", "image_url": None},
    ],
    # Starter menus — admin can rename / reprice / remove via the dashboard.
    # Dinners include rice & two sides; appetizers listed per piece-count.
    # `tags` are informational dietary flags (gluten_free, pescatarian, dairy_free).
    # `category` powers the mobile jump-link nav bar on the food menu.
    # `include_sides=True` reveals the 2-free-sides picker ($5 each extra).
    "lunch_items": [
        {"id": "conch_fritters_5",  "name": "Bahamian Conch Fritters · 5 pc",  "price": 10.0, "category": "appetizer", "tags": ["pescatarian", "dairy_free", "peanut_free"]},
        {"id": "conch_fritters_8",  "name": "Bahamian Conch Fritters · 8 pc",  "price": 15.0, "category": "appetizer", "tags": ["pescatarian", "dairy_free", "peanut_free"]},
        {"id": "conch_fritters_12", "name": "Bahamian Conch Fritters · 12 pc", "price": 18.0, "category": "appetizer", "tags": ["pescatarian", "dairy_free", "peanut_free"]},
        {"id": "jerk_chicken",   "name": "Jerk Chicken Dinner",   "price": 30.0, "category": "jerk", "include_sides": True, "tags": ["gluten_free", "dairy_free", "peanut_free", "shellfish_free"]},
        {"id": "jerk_pork",      "name": "Jerk Pork Dinner",      "price": 30.0, "category": "jerk", "include_sides": True, "tags": ["gluten_free", "dairy_free", "peanut_free", "shellfish_free"]},
        {"id": "jerk_ribs",      "name": "Jerk Ribs Dinner",      "price": 30.0, "category": "jerk", "include_sides": True, "tags": ["gluten_free", "dairy_free", "peanut_free", "shellfish_free"]},
        {"id": "jerk_salmon",    "name": "Jerk Salmon Dinner",    "price": 35.0, "category": "jerk", "include_sides": True, "tags": ["gluten_free", "dairy_free", "pescatarian", "peanut_free", "shellfish_free"]},
        {"id": "jerk_shrimp",    "name": "Jerk Shrimp Dinner",    "price": 40.0, "category": "jerk", "include_sides": True, "tags": ["gluten_free", "dairy_free", "pescatarian", "peanut_free"]},
        {"id": "jerk_conch",     "name": "Jerk Conch Dinner",     "price": 35.0, "category": "jerk", "include_sides": True, "tags": ["dairy_free", "pescatarian", "peanut_free"]},
        {"id": "jerk_lobster",   "name": "Jerk Lobster Dinner",   "price": 40.0, "category": "jerk", "include_sides": True, "tags": ["gluten_free", "dairy_free", "pescatarian", "peanut_free"]},
        {"id": "bbq_chicken",    "name": "BBQ Chicken Dinner",    "price": 25.0, "category": "bbq",  "include_sides": True, "tags": ["dairy_free", "peanut_free", "shellfish_free"]},
        {"id": "bbq_pork",       "name": "BBQ Pork Dinner",       "price": 30.0, "category": "bbq",  "include_sides": True, "tags": ["dairy_free", "peanut_free", "shellfish_free"]},
        {"id": "bbq_ribs",       "name": "BBQ Ribs Dinner",       "price": 30.0, "category": "bbq",  "include_sides": True, "tags": ["dairy_free", "peanut_free", "shellfish_free"]},
        {"id": "baked_pork_chop","name": "Baked Pork Chop Dinner","price": 40.0, "category": "dinner", "include_sides": True, "tags": ["gluten_free", "dairy_free", "peanut_free", "shellfish_free"]},
        {"id": "snapper_dinner", "name": "Snapper Dinner",        "price": 40.0, "category": "dinner", "include_sides": True, "tags": ["gluten_free", "dairy_free", "pescatarian", "peanut_free", "shellfish_free"]},
        {"id": "soamoo_dinner",  "name": "Soamoo Dinner",         "price": 35.0, "category": "dinner", "include_sides": True, "tags": ["dairy_free", "peanut_free"]},
        {"id": "combo_lcs",      "name": "Lobster · Conch · Shrimp Combo",          "price": 65.0, "category": "seafood_combo", "tags": ["dairy_free", "peanut_free", "pescatarian"]},
        {"id": "combo_lcsf",     "name": "Lobster · Conch · Shrimp · Fish Combo",   "price": 70.0, "category": "seafood_combo", "tags": ["dairy_free", "peanut_free", "pescatarian"]},
        {"id": "combo_scsl",     "name": "Salmon · Conch · Shrimp · Lobster Combo", "price": 70.0, "category": "seafood_combo", "tags": ["dairy_free", "peanut_free", "pescatarian"]},
        {"id": "combo_cs",       "name": "Conch & Shrimp",                          "price": 70.0, "category": "seafood_combo", "tags": ["dairy_free", "peanut_free", "pescatarian"]},
        {"id": "combo_ls",       "name": "Lobster & Shrimp",                        "price": 60.0, "category": "seafood_combo", "tags": ["dairy_free", "peanut_free", "pescatarian"]},
        {"id": "combo_gc",       "name": "Grouper & Conch",                         "price": 60.0, "category": "seafood_combo", "tags": ["dairy_free", "peanut_free", "pescatarian"]},
        {"id": "combo_gl",       "name": "Grouper & Lobster",                       "price": 35.0, "category": "seafood_combo", "tags": ["dairy_free", "peanut_free", "pescatarian"]},
        {"id": "combo_ws",       "name": "Wings & Shrimp",                          "price": 50.0, "category": "seafood_combo", "tags": ["dairy_free", "peanut_free"]},
        {"id": "burger_hamburger","name": "Hamburger",       "price": 30.0, "category": "burger", "tags": ["peanut_free", "shellfish_free"]},
        {"id": "burger_shrimp",   "name": "Shrimp Burger",   "price": 33.0, "category": "burger", "tags": ["peanut_free", "pescatarian"]},
        {"id": "burger_conch",    "name": "Conch Burger",    "price": 33.0, "category": "burger", "tags": ["peanut_free", "pescatarian"]},
        {"id": "burger_lobster",  "name": "Lobster Burger",  "price": 33.0, "category": "burger", "tags": ["peanut_free", "pescatarian"]},
        {"id": "burger_chicken",  "name": "Chicken Burger",  "price": 25.0, "category": "burger", "tags": ["peanut_free", "shellfish_free"]},
    ],
    "combos": [
        {
            "id": "chefs_choice",
            "name": "Chef's Choice combo",
            "subtitle": "Our most popular beach-day pairing",
            "items": ["conch_fritters_8", "jerk_chicken", "bahama_mama"],
            "discount": 5.0,
        },
    ],
    "drink_items": [
        {"id": "bahama_mama",   "name": "Bahama Mama",     "price": 12.0},
        {"id": "sky_juice",     "name": "Sky Juice",       "price": 10.0},
        {"id": "goombay_smash", "name": "Goombay Smash",   "price": 12.0},
        {"id": "kalik",         "name": "Kalik beer",      "price": 7.0},
        {"id": "sands",         "name": "Sands beer",      "price": 7.0},
        {"id": "water",         "name": "Bottled water",   "price": 3.0},
        {"id": "soda",          "name": "Soda / fruit punch","price": 4.0},
    ],
    # Water sports — all optional, selectable by quantity. `unit` is UI-only
    # metadata ("per_person" vs "per_ride"). Parasailing has an optional
    # spectator add-on priced at `parasail_spectator_price`.
    # `cutoff_hour` is the latest HOUR (0-23, Nassau local time) a guest can
    # book this sport for today; past that we soft-disable client-side. UTC-5
    # offset is applied in the frontend. `wave_sensitive=True` means the sport
    # auto-disables when the live Open-Meteo wave tier reads "big" (surf's up).
    "water_sports": [
        {"id": "parasailing",  "name": "Parasailing",        "price": 120.0, "duration": "8–10 min",  "unit": "per_ride",   "cutoff_hour": 15, "wave_sensitive": True,  "enabled": True, "has_spectator": True},
        {"id": "snorkeling",   "name": "Snorkeling package", "price": 100.0, "duration": "1 hr 30 min","unit": "per_person", "cutoff_hour": 14, "wave_sensitive": True,  "enabled": True},
        {"id": "banana_boat",  "name": "Banana boat ride",   "price": 55.0,  "duration": "3 miles",   "unit": "per_ride",   "cutoff_hour": 16, "wave_sensitive": True,  "enabled": True},
        {"id": "jet_ski_30",   "name": "Jet ski",            "price": 140.0, "duration": "30 min",    "unit": "per_ride",   "cutoff_hour": 16, "wave_sensitive": False, "enabled": True},
        {"id": "jet_ski_45",   "name": "Jet ski",            "price": 170.0, "duration": "45 min",    "unit": "per_ride",   "cutoff_hour": 16, "wave_sensitive": False, "enabled": True},
        {"id": "jet_ski_60",   "name": "Jet ski",            "price": 220.0, "duration": "60 min",    "unit": "per_ride",   "cutoff_hour": 16, "wave_sensitive": False, "enabled": True},
        {"id": "jet_car_15",   "name": "Jet Car",            "price": 170.0, "duration": "15 min",    "unit": "per_ride",   "cutoff_hour": 16, "wave_sensitive": False, "enabled": True},
        {"id": "jet_car_30",   "name": "Jet Car",            "price": 320.0, "duration": "30 min",    "unit": "per_ride",   "cutoff_hour": 16, "wave_sensitive": False, "enabled": True},
        {"id": "jet_car_45",   "name": "Jet Car",            "price": 470.0, "duration": "45 min",    "unit": "per_ride",   "cutoff_hour": 16, "wave_sensitive": False, "enabled": True},
        {"id": "jet_car_60",   "name": "Jet Car",            "price": 630.0, "duration": "60 min",    "unit": "per_ride",   "cutoff_hour": 16, "wave_sensitive": False, "enabled": True},
    ],
    "parasail_spectator_price": 35.0,
    "active": True,
}


# ─── Nassau hotel tariff lookup (round-trip) for Cable Beach Day ──────────
# Values mirror the published Rox zone tariff. The guest no longer types a
# fare — they pick their hotel and we auto-fill a round-trip quote (one-way
# × 2) sourced from the same tariff dispatch uses. Flat fare per taxi, not
# per passenger. Admin can override via `site_config.cable_beach_pkg.hotel_fares`.
NASSAU_HOTEL_TARIFFS = [
    {"id": "cable_beach",   "name": "Baha Mar · SLS · Grand Hyatt · Rosewood (Cable Beach)",   "oneway_fare": 10.0, "lat": 25.0797, "lng": -77.4125},
    {"id": "melia",         "name": "Meliã Nassau Beach · Breezes · Sandals Royal Bahamian",   "oneway_fare": 10.0, "lat": 25.0820, "lng": -77.4047},
    {"id": "cable_beach_other","name": "Any other Cable Beach hotel / villa",                   "oneway_fare": 10.0, "lat": 25.0810, "lng": -77.4080},
    {"id": "downtown",      "name": "Downtown Nassau (British Colonial · Graycliff · Towne)",   "oneway_fare": 20.0, "lat": 25.0774, "lng": -77.3390},
    {"id": "paradise",      "name": "Paradise Island · Atlantis · The Cove · The Reef · Ocean Club", "oneway_fare": 30.0, "lat": 25.0837, "lng": -77.3238},
    {"id": "comfort_pi",    "name": "Comfort Suites · Riu Palace · Warwick Paradise Island",     "oneway_fare": 30.0, "lat": 25.0828, "lng": -77.3194},
    {"id": "west_bay",      "name": "Compass Point · West Bay Street hotels",                    "oneway_fare": 25.0, "lat": 25.0832, "lng": -77.4349},
    {"id": "lyford",        "name": "Lyford Cay / Old Fort Bay",                                 "oneway_fare": 40.0, "lat": 25.0469, "lng": -77.5285},
    {"id": "montague",      "name": "Montague Beach · Eastern Road",                             "oneway_fare": 25.0, "lat": 25.0768, "lng": -77.3017},
    {"id": "south_ocean",   "name": "South Ocean · Albany · Adelaide",                           "oneway_fare": 50.0, "lat": 24.9800, "lng": -77.5500},
]

SHARE_CREDIT_USD = 10.0


async def notify_beach_team_cable_beach_booking(booking_id: str, *, phase: str) -> None:
    """SMS the Cable Beach team + admin owners when a Cable Beach booking
    hits a lifecycle milestone. Fire-and-forget. Idempotent per phase via
    `beach_team_<phase>_sms_at` on the booking.

    - **Team numbers** are managed via the admin "Team SMS" panel and
      only receive events whose `area` is in their `areas` list (so a
      Taxi-only team never sees Cable Beach bookings and vice-versa).
    - **Admin / owner numbers** always receive the activity via
      `notify_owner_activity(kind="cable_beach_<phase>", ...)` — matches
      the pattern used by every other service.
    - ONLY fires for `item_id == "cable-beach-day"` bookings so taxi /
      tour / rental streams can't leak to this channel.
    """
    booking = await _db.bookings.find_one({"id": booking_id})
    if not booking:
        return
    if booking.get("item_id") != "cable-beach-day":
        return
    flag = f"beach_team_{phase}_sms_at"
    if booking.get(flag):
        return
    cb = booking.get("cable_beach") or {}
    guest = booking.get("customer_name") or "Guest"
    pax = booking.get("pax") or 1
    date_raw = booking.get("booking_date") or ""
    date_short = date_raw[:16].replace("T", " ") if date_raw else "TBD"
    hotel = cb.get("hotel_name")
    xfer = cb.get("transfer_kind")
    pickup = hotel or ("Cruise port" if (xfer or "").startswith("cruise") else "Self-drive")
    extras: list[str] = []
    if cb.get("extra_seats"):
        extras.append(f"{cb['extra_seats']} extra seat(s)")
    menu_lines = cb.get("menu_lines") or []
    if menu_lines:
        extras.append(f"{len(menu_lines)} menu item(s)")
    ws_lines = cb.get("water_sport_lines") or []
    if ws_lines:
        extras.append(f"{len(ws_lines)} water sport(s)")
    extras_s = " · ".join(extras) if extras else "no add-ons"
    phase_label = {
        "created": "🏖️ NEW Cable Beach booking (pending pay)",
        "paid":    "✅ Cable Beach booking PAID",
        "dayof":   "☀️ TODAY · Cable Beach guests arriving",
    }.get(phase, "Cable Beach booking")
    body = (
        f"{phase_label}\n"
        f"{guest} · {pax} pax · {date_short}\n"
        f"Pickup: {pickup}\n"
        f"Extras: {extras_s}\n"
        f"Ref: {booking_id}"
    )
    # (1) Area-specific team roster (SMS + email).
    try:
        from routes.team_sms import send_team_sms
        subj_prefix = {
            "created": "🏖️ New Cable Beach booking",
            "paid":    "✅ Cable Beach booking paid",
            "dayof":   "☀️ Today — Cable Beach guests",
        }.get(phase, "Cable Beach booking")
        subject = f"{subj_prefix} · {guest} · {pax} pax · {date_short}"
        await send_team_sms("cable_beach", body, subject=subject)
    except Exception as e:  # noqa: BLE001
        logging.getLogger(__name__).warning("team sms (cable_beach) err: %s", e)
    # (2) Admin / owner activity — SMS AND email through the shared
    # owner-notification helper. Fires on every Cable Beach phase so admins
    # see the booking even when the team SMS roster is empty.
    try:
        from notifications import notify_owner_activity
        notify_owner_activity(
            f"cable_beach_{phase}",
            body,
            email_subject=f"{phase_label.strip()} · {guest} · {pax} pax · {date_short}",
            email_html=(
                f'<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0B3B5C;max-width:560px">'
                f'<div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;font-weight:900;color:#D4A94A">Rox · cable beach</div>'
                f'<h2 style="font-family:Georgia,serif;color:#0B3B5C;margin:4px 0 12px">{phase_label.strip()}</h2>'
                f'<pre style="font-family:inherit;white-space:pre-wrap;font-size:14px;line-height:1.55;background:#FBF7EF;border-left:3px solid #D4A94A;padding:14px 18px;border-radius:8px">{body.replace("<", "&lt;")}</pre>'
                f'<p style="font-size:11px;color:#64748B;margin-top:14px">Booking ref: <code>{booking_id}</code></p>'
                f'</div>'
            ),
        )
    except Exception as e:  # noqa: BLE001
        logging.getLogger(__name__).warning("owner sms (cable_beach %s) err: %s", phase, e)
    await _db.bookings.update_one(
        {"id": booking_id}, {"$set": {flag: _now_iso()}},
    )


async def notify_beach_team_cable_beach_paid_if_cable_beach(booking_id: str) -> None:
    """Thin wrapper used by `_apply_referral_conversion_if_paid` globals()."""
    await notify_beach_team_cable_beach_booking(booking_id, phase="paid")


def _hotel_tariffs() -> list[dict]:
    """Flat round-trip fare per taxi, derived from the zone tariff."""
    return [
        {"id": h["id"], "name": h["name"],
         "oneway_fare": round(float(h["oneway_fare"]), 2),
         "roundtrip_fare": round(float(h["oneway_fare"]) * 2, 2),
         "lat": h["lat"], "lng": h["lng"]}
        for h in NASSAU_HOTEL_TARIFFS
    ]


# Infer `category` + `include_sides` for lunch items persisted before the
# jump-link nav / sides picker shipped. Admin can override by saving the
# items again from the dashboard. Kept narrow: only sets fields that are
# missing, never overwrites a value the admin already chose.
_CATEGORY_PREFIX_MAP = (
    ("conch_fritters", "appetizer"),
    ("burger_",        "burger"),
    ("jerk_",          "jerk"),
    ("bbq_",           "bbq"),
    ("combo_",         "seafood_combo"),
)
_SIDED_CATEGORIES = {"jerk", "bbq", "dinner"}


def _classify_lunch_item(item: dict) -> dict:
    out = dict(item or {})
    if not out.get("category"):
        iid = str(out.get("id") or "")
        cat = None
        for prefix, c in _CATEGORY_PREFIX_MAP:
            if iid.startswith(prefix):
                cat = c
                break
        out["category"] = cat or "dinner"
    if "include_sides" not in out:
        out["include_sides"] = out["category"] in _SIDED_CATEGORIES
    return out


# Hydrate side rows persisted before glyph/image_url shipped so the frontend
# always has at least an emoji glyph to render.
_SIDE_GLYPH_DEFAULTS = {s["id"]: s["glyph"] for s in CABLE_BEACH_DEFAULTS["sides"]}


def _hydrate_side(row: dict) -> dict:
    out = dict(row or {})
    if not out.get("glyph"):
        out["glyph"] = _SIDE_GLYPH_DEFAULTS.get(out.get("id", ""), "🍽️")
    if "image_url" not in out:
        out["image_url"] = None
    return out


async def _cable_beach_cfg() -> dict:
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    pkg = cfg.get("cable_beach_pkg") or {}
    merged = {**CABLE_BEACH_DEFAULTS, **pkg}
    merged["lunch_items"] = pkg.get("lunch_items") or CABLE_BEACH_DEFAULTS["lunch_items"]
    merged["drink_items"] = pkg.get("drink_items") or CABLE_BEACH_DEFAULTS["drink_items"]
    merged["combos"] = pkg.get("combos") or CABLE_BEACH_DEFAULTS["combos"]
    merged["sides"] = pkg.get("sides") or CABLE_BEACH_DEFAULTS["sides"]
    merged["water_sports"] = pkg.get("water_sports") or CABLE_BEACH_DEFAULTS["water_sports"]
    merged["parasail_spectator_price"] = pkg.get(
        "parasail_spectator_price", CABLE_BEACH_DEFAULTS["parasail_spectator_price"],
    )
    merged["sides_included_per_dinner"] = pkg.get(
        "sides_included_per_dinner", CABLE_BEACH_DEFAULTS["sides_included_per_dinner"],
    )
    merged["extra_side_price"] = pkg.get(
        "extra_side_price", CABLE_BEACH_DEFAULTS["extra_side_price"],
    )
    merged["lunch_items"] = [_classify_lunch_item(it) for it in merged["lunch_items"]]
    merged["sides"] = [_hydrate_side(s) for s in merged["sides"]]
    merged["hotel_fares"] = _hotel_tariffs()
    return merged


# ─── Public read endpoints ───────────────────────────────────────────────
@router.get("/cable-beach/hotels")
async def cable_beach_hotels():
    """Hotel directory with auto-filled round-trip fares for the Cable Beach day."""
    return {"hotels": _hotel_tariffs()}


@router.get("/public/cable-beach-package")
async def public_cable_beach_pkg():
    """Public-safe read: config + pricing for the Cable Beach day."""
    return await _cable_beach_cfg()


# ─── Admin update ────────────────────────────────────────────────────────
class CableBeachPkgUpdate(BaseModel):
    base_price: Optional[float] = Field(None, ge=0, le=1000)
    extra_seat_price: Optional[float] = Field(None, ge=0, le=200)
    cruise_oneway_price: Optional[float] = Field(None, ge=0, le=400)
    cruise_roundtrip_price: Optional[float] = Field(None, ge=0, le=400)
    lunch_items: Optional[list] = None
    drink_items: Optional[list] = None
    combos: Optional[list] = None
    sides: Optional[list] = None
    sides_included_per_dinner: Optional[int] = Field(None, ge=0, le=6)
    extra_side_price: Optional[float] = Field(None, ge=0, le=50)
    water_sports: Optional[list] = None
    parasail_spectator_price: Optional[float] = Field(None, ge=0, le=400)
    # Admin-paste today's cruise ships (lightweight — one short line per ship,
    # we don't model arrival/departure times). Admin may update daily or wire a
    # cron scrape later. Public endpoint returns the current list.
    cruise_ships_today: Optional[list[str]] = None
    # Loyalty: Nth paid Cable Beach visit is free (base * pax). Default 5.
    loyalty_free_every: Optional[int] = Field(None, ge=2, le=20)
    active: Optional[bool] = None


@router.put("/admin/cable-beach-package")
async def admin_update_cable_beach_pkg(
    patch: CableBeachPkgUpdate, _admin: str = Depends(_require_admin_dep),
):
    body = {k: v for k, v in patch.dict().items() if v is not None}
    if not body:
        raise HTTPException(400, "No fields provided.")
    for key in ("lunch_items", "drink_items"):
        if key in body:
            cleaned = []
            for row in body[key][:40]:
                try:
                    out = {
                        "id": str(row.get("id") or uuid.uuid4().hex[:6]),
                        "name": str(row.get("name", "")).strip()[:80],
                        "price": round(float(row.get("price") or 0), 2),
                        "tags": [str(t) for t in (row.get("tags") or []) if t][:8],
                    }
                    if row.get("category"):
                        out["category"] = str(row["category"])[:30]
                    if "include_sides" in row:
                        out["include_sides"] = bool(row["include_sides"])
                    cleaned.append(out)
                except Exception:  # noqa: BLE001
                    continue
            body[key] = [r for r in cleaned if r["name"] and r["price"] >= 0]
    # Side-dish list — {id, name, glyph?, image_url?}; max 12 entries.
    if "sides" in body:
        cleaned_sides = []
        for row in body["sides"][:12]:
            try:
                out = {
                    "id": str(row.get("id") or uuid.uuid4().hex[:6]),
                    "name": str(row.get("name", "")).strip()[:40],
                }
                g = (row.get("glyph") or "").strip()
                if g:
                    out["glyph"] = g[:8]
                iu = (row.get("image_url") or "").strip()
                if iu and (iu.startswith("http://") or iu.startswith("https://") or iu.startswith("/")):
                    out["image_url"] = iu[:400]
                cleaned_sides.append(out)
            except Exception:  # noqa: BLE001
                continue
        body["sides"] = [s for s in cleaned_sides if s["name"]]
    # Water sports — {id, name, price, duration?, unit?, cutoff_hour?,
    # wave_sensitive?, enabled?, has_spectator?}
    if "water_sports" in body:
        cleaned_ws = []
        for row in body["water_sports"][:20]:
            try:
                out = {
                    "id": str(row.get("id") or uuid.uuid4().hex[:6]),
                    "name": str(row.get("name", "")).strip()[:60],
                    "price": round(float(row.get("price") or 0), 2),
                }
                if row.get("duration"):
                    out["duration"] = str(row["duration"])[:40]
                if row.get("unit"):
                    out["unit"] = str(row["unit"])[:20]
                if row.get("cutoff_hour") is not None:
                    try:
                        ch = int(row["cutoff_hour"])
                        if 0 <= ch <= 23:
                            out["cutoff_hour"] = ch
                    except (TypeError, ValueError):
                        pass
                if "wave_sensitive" in row:
                    out["wave_sensitive"] = bool(row["wave_sensitive"])
                if "enabled" in row:
                    out["enabled"] = bool(row["enabled"])
                if row.get("has_spectator"):
                    out["has_spectator"] = True
                cleaned_ws.append(out)
            except Exception:  # noqa: BLE001
                continue
        body["water_sports"] = [w for w in cleaned_ws if w["name"] and w["price"] >= 0]
    # Cruise ships-today — tiny list of ≤120-char strings. Admin may paste
    # the morning schedule; frontend home page shows the first one as a
    # "Welcome, Carnival Pride guests" ribbon.
    if "cruise_ships_today" in body:
        cleaned_ships = []
        for row in body["cruise_ships_today"][:12]:
            s = str(row or "").strip()[:120]
            if s:
                cleaned_ships.append(s)
        body["cruise_ships_today"] = cleaned_ships
        body["cruise_ships_updated_at"] = _now_iso()
    if "combos" in body:
        cleaned_combos = []
        for row in body["combos"][:12]:
            try:
                cleaned_combos.append({
                    "id": str(row.get("id") or uuid.uuid4().hex[:6]),
                    "name": str(row.get("name", "")).strip()[:60],
                    "subtitle": str(row.get("subtitle", "")).strip()[:120],
                    "items": [str(x) for x in (row.get("items") or []) if x][:12],
                    "discount": round(float(row.get("discount") or 0), 2),
                })
            except Exception:  # noqa: BLE001
                continue
        body["combos"] = [c for c in cleaned_combos
                          if c["name"] and len(c["items"]) >= 2 and c["discount"] >= 0]
    await _db.site_config.update_one(
        {"_id": "main"},
        {"$set": {f"cable_beach_pkg.{k}": v for k, v in body.items()}},
        upsert=True,
    )
    return await _cable_beach_cfg()


# ─── Quote ───────────────────────────────────────────────────────────────
class CableBeachQuoteRequest(BaseModel):
    pax: int = Field(..., ge=1, le=50)
    transfer_kind: str = Field("none", pattern="^(none|cruise_oneway|cruise_roundtrip|hotel)$")
    hotel_id: Optional[str] = Field(None, max_length=40)
    hotel_fare: Optional[float] = Field(None, ge=0, le=500)
    extra_seats: int = Field(0, ge=0, le=50)
    lunch_item_ids: list[str] = Field(default_factory=list)
    drink_item_ids: list[str] = Field(default_factory=list)
    combo_id: Optional[str] = Field(None, max_length=40)
    side_selections: dict[str, list[str]] = Field(default_factory=dict)
    # Water sports qty by item id, e.g. {"parasailing": 2, "snorkeling": 4}.
    # Each entry is capped at 20 server-side to avoid runaway totals.
    water_sport_qty: dict[str, int] = Field(default_factory=dict)
    parasail_spectators: int = Field(0, ge=0, le=20)
    # Loyalty email — when the guest has `loyalty_free_every - 1` prior
    # paid Cable Beach bookings for this email, we zero out `base`.
    loyalty_email: Optional[str] = Field(None, max_length=120)


@router.post("/cable-beach/quote")
async def cable_beach_quote(req: CableBeachQuoteRequest):
    """Transparent quote breakdown for the Cable Beach day package."""
    cfg = await _cable_beach_cfg()
    if not cfg.get("active", True):
        raise HTTPException(503, "Cable Beach package is not currently available.")

    base = round(cfg["base_price"] * req.pax, 2)
    extra = round(cfg["extra_seat_price"] * req.extra_seats, 2)
    transfer = 0.0
    if req.transfer_kind == "cruise_oneway":
        transfer = round(cfg["cruise_oneway_price"] * req.pax, 2)
    elif req.transfer_kind == "cruise_roundtrip":
        transfer = round(cfg["cruise_roundtrip_price"] * req.pax, 2)
    elif req.transfer_kind == "hotel":
        if req.hotel_id:
            match = next((h for h in _hotel_tariffs() if h["id"] == req.hotel_id), None)
            if not match:
                raise HTTPException(400, "Unknown hotel. Refresh the page and try again.")
            transfer = match["roundtrip_fare"]
        elif req.hotel_fare is not None:
            transfer = round(float(req.hotel_fare), 2)

    menu_by_id = {it["id"]: it for it in cfg["lunch_items"] + cfg["drink_items"]}
    menu_lines = []
    menu_total = 0.0
    for mid in list(req.lunch_item_ids) + list(req.drink_item_ids):
        it = menu_by_id.get(mid)
        if not it:
            continue
        price = round(float(it.get("price") or 0.0), 2)
        menu_total += price
        menu_lines.append({"id": mid, "name": it.get("name"), "price": price})
    menu_total = round(menu_total, 2)

    # Dinner side-dish totals. Guests get N free sides per dinner; each
    # additional side costs cfg.extra_side_price.
    sides_by_id = {s["id"]: s for s in cfg.get("sides") or []}
    free_sides = int(cfg.get("sides_included_per_dinner", 2) or 0)
    extra_side_price = float(cfg.get("extra_side_price", 5.0) or 0.0)
    sides_detail: list[dict] = []
    total_extra_sides = 0
    lunch_set = set(req.lunch_item_ids)
    for dinner_id, side_ids in (req.side_selections or {}).items():
        item = menu_by_id.get(dinner_id)
        if not item or not item.get("include_sides"):
            continue
        if dinner_id not in lunch_set:
            continue
        valid = []
        seen: set[str] = set()
        for sid in (side_ids or [])[:12]:
            if sid in sides_by_id and sid not in seen:
                valid.append(sid)
                seen.add(sid)
        if not valid:
            continue
        extras = max(0, len(valid) - free_sides)
        total_extra_sides += extras
        sides_detail.append({
            "dinner_id": dinner_id,
            "dinner_name": item.get("name"),
            "side_ids": valid,
            "side_names": [sides_by_id[sid]["name"] for sid in valid],
            "free_count": min(len(valid), free_sides),
            "extra_count": extras,
        })
    sides_extra_total = round(total_extra_sides * extra_side_price, 2)

    # Water sports — qty × item price. Parasail spectator add-on applies
    # only when at least one parasailing seat is in the cart. Each line is
    # qty-capped at 20 to prevent runaway totals from a stuck stepper. Items
    # marked `enabled=False` reject at the quote stage so an admin pause
    # can't be bypassed by a stale frontend.
    ws_by_id = {w["id"]: w for w in cfg.get("water_sports") or []}
    water_sport_lines: list[dict] = []
    water_sports_total = 0.0
    parasailing_qty = 0
    for ws_id, raw_qty in (req.water_sport_qty or {}).items():
        item = ws_by_id.get(ws_id)
        if not item:
            continue
        if item.get("enabled") is False:
            continue
        qty = max(0, min(20, int(raw_qty or 0)))
        if qty <= 0:
            continue
        price_each = round(float(item.get("price") or 0.0), 2)
        line_total = round(price_each * qty, 2)
        water_sports_total += line_total
        water_sport_lines.append({
            "id": ws_id,
            "name": item.get("name"),
            "duration": item.get("duration"),
            "qty": qty,
            "price_each": price_each,
            "line_total": line_total,
        })
        if ws_id == "parasailing":
            parasailing_qty = qty
    spectator_total = 0.0
    spectator_qty = 0
    if parasailing_qty > 0 and req.parasail_spectators > 0:
        spectator_qty = min(20, int(req.parasail_spectators))
        spectator_price = float(cfg.get("parasail_spectator_price", 35.0) or 0.0)
        spectator_total = round(spectator_qty * spectator_price, 2)
        water_sports_total += spectator_total
        water_sport_lines.append({
            "id": "parasail_spectator",
            "name": "Parasail spectator seat",
            "duration": None,
            "qty": spectator_qty,
            "price_each": spectator_price,
            "line_total": spectator_total,
        })
    water_sports_total = round(water_sports_total, 2)

    # Loyalty redemption — check *before* assembling the subtotal so the
    # free base shows as a crisp standalone line in the breakdown.
    loyalty_discount = 0.0
    loyalty_free_applied = False
    loyalty_stamps = 0
    loyalty_cycle = int(cfg.get("loyalty_free_every") or 5)
    if req.loyalty_email:
        email_norm = req.loyalty_email.strip().lower()
        paid = await _db.bookings.count_documents({
            "item_id": "cable-beach-day",
            "customer_email": email_norm,
            "payment_status": "paid",
            "loyalty_free_applied": {"$ne": True},
        })
        loyalty_stamps = paid % loyalty_cycle
        if paid >= (loyalty_cycle - 1) and loyalty_stamps == (loyalty_cycle - 1):
            loyalty_free_applied = True
            loyalty_discount = base  # Zero out the base = 5th day free.

    subtotal = round(base + extra + transfer + menu_total + sides_extra_total + water_sports_total - loyalty_discount, 2)

    combo_discount = 0.0
    combo_applied = None
    if req.combo_id:
        selected_ids = set(list(req.lunch_item_ids) + list(req.drink_item_ids))
        for combo in cfg.get("combos") or []:
            if combo.get("id") == req.combo_id:
                if set(combo.get("items") or []).issubset(selected_ids):
                    combo_discount = round(float(combo.get("discount") or 0.0), 2)
                    combo_applied = {"id": combo["id"], "name": combo.get("name"),
                                     "discount": combo_discount}
                break
    subtotal = round(max(0.0, subtotal - combo_discount), 2)

    vat = round(subtotal * 0.10, 2)
    processing = round((subtotal + vat) * 0.05, 2)
    total = round(subtotal + vat + processing, 2)

    return {
        "pax": req.pax,
        "base": base,
        "base_price": cfg["base_price"],
        "extra_seats": req.extra_seats,
        "extra_seats_total": extra,
        "extra_seat_price": cfg["extra_seat_price"],
        "transfer_kind": req.transfer_kind,
        "transfer_total": transfer,
        "menu_lines": menu_lines,
        "menu_total": menu_total,
        "sides_detail": sides_detail,
        "sides_extra_count": total_extra_sides,
        "sides_extra_total": sides_extra_total,
        "sides_included_per_dinner": free_sides,
        "extra_side_price": extra_side_price,
        "water_sport_lines": water_sport_lines,
        "water_sports_total": water_sports_total,
        "parasail_spectators": spectator_qty,
        "parasail_spectator_price": float(cfg.get("parasail_spectator_price", 35.0) or 0.0),
        "loyalty_free_applied": loyalty_free_applied,
        "loyalty_discount": loyalty_discount,
        "loyalty_stamps": loyalty_stamps,
        "loyalty_cycle": loyalty_cycle,
        "combo_applied": combo_applied,
        "combo_discount": combo_discount,
        "subtotal": subtotal,
        "vat": vat,
        "processing_fee": processing,
        "total": total,
    }


# ─── Share tokens + Book + Credit hook ───────────────────────────────────
class CableBeachShareCreate(BaseModel):
    sharer_email: EmailStr


class CableBeachShareClick(BaseModel):
    token: str = Field(..., min_length=4, max_length=40)


class CableBeachBookRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=120)
    customer_email: EmailStr
    customer_phone: str = Field(..., min_length=5, max_length=40)
    booking_date: str = Field(..., min_length=10, max_length=40)
    pax: int = Field(..., ge=1, le=50)
    transfer_kind: str = Field("none", pattern="^(none|cruise_oneway|cruise_roundtrip|hotel)$")
    hotel_id: Optional[str] = Field(None, max_length=40)
    extra_seats: int = Field(0, ge=0, le=50)
    lunch_item_ids: list[str] = Field(default_factory=list)
    drink_item_ids: list[str] = Field(default_factory=list)
    combo_id: Optional[str] = Field(None, max_length=40)
    side_selections: dict[str, list[str]] = Field(default_factory=dict)
    water_sport_qty: dict[str, int] = Field(default_factory=dict)
    parasail_spectators: int = Field(0, ge=0, le=20)
    loyalty_email: Optional[str] = Field(None, max_length=120)
    allergies: list[str] = Field(default_factory=list)
    special_requests: Optional[str] = Field(None, max_length=500)
    share_token: Optional[str] = Field(None, max_length=40)


@router.post("/share/cable-beach/create")
async def share_cable_beach_create(req: CableBeachShareCreate):
    """Create (or reuse) a share token for a given email. Idempotent."""
    email = req.sharer_email.lower()
    existing = await _db.share_tokens.find_one({"sharer_email": email, "package": "cable_beach_day"})
    if existing:
        return {"token": existing["token"],
                "share_url": f"/tours/cable-beach-day?r={existing['token']}"}
    token = secrets.token_urlsafe(8)
    await _db.share_tokens.insert_one({
        "token": token,
        "sharer_email": email,
        "package": "cable_beach_day",
        "created_at": _now_iso(),
        "clicks": 0,
        "bookings": 0,
        "credits_awarded_total": 0.0,
    })
    return {"token": token, "share_url": f"/tours/cable-beach-day?r={token}"}


@router.post("/share/cable-beach/click")
async def share_cable_beach_click(req: CableBeachShareClick):
    """Increment click counter on a share token. Fire-and-forget beacon."""
    await _db.share_tokens.update_one({"token": req.token}, {"$inc": {"clicks": 1}})
    return {"ok": True}


@router.post("/cable-beach/book")
async def cable_beach_book(req: CableBeachBookRequest):
    """Create a real booking record for the Cable Beach day package."""
    cfg = await _cable_beach_cfg()
    if not cfg.get("active", True):
        raise HTTPException(503, "Cable Beach package is not currently available.")

    quote_req = CableBeachQuoteRequest(
        pax=req.pax, transfer_kind=req.transfer_kind, hotel_id=req.hotel_id,
        extra_seats=req.extra_seats,
        lunch_item_ids=req.lunch_item_ids, drink_item_ids=req.drink_item_ids,
        combo_id=req.combo_id,
        side_selections=req.side_selections,
        water_sport_qty=req.water_sport_qty,
        parasail_spectators=req.parasail_spectators,
        loyalty_email=req.loyalty_email or req.customer_email,
    )
    quote = await cable_beach_quote(quote_req)
    hotel_match = next((h for h in _hotel_tariffs() if h["id"] == req.hotel_id), None) if req.hotel_id else None

    import string
    booking_id = "CB-" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
    allergy_prefix = ""
    if req.allergies:
        allergy_prefix = "⚠️ ALLERGIES: " + ", ".join(a.strip().title() for a in req.allergies if a.strip()) + ". "
    merged_requests = (allergy_prefix + (req.special_requests or "")).strip() or None
    booking_doc = {
        "id": booking_id,
        "service_type": "tour",
        "item_id": "cable-beach-day",
        "item_name": "Toes in the Turquoise · Cable Beach Day",
        "customer_name": req.customer_name,
        "customer_email": req.customer_email.lower(),
        "customer_phone": req.customer_phone,
        "booking_date": req.booking_date,
        "pax": req.pax,
        "pickup_location": hotel_match["name"] if hotel_match else (
            "Nassau Cruise Port" if req.transfer_kind.startswith("cruise") else "Self-drive / meet at beach"
        ),
        "dropoff_location": "Cable Beach / Goodman's Bay",
        "price_subtotal": quote["subtotal"],
        "vat": quote["vat"],
        "processing_fee": quote["processing_fee"],
        "total_price": quote["total"],
        "payment_status": "pending",
        "status": "pending",
        "special_requests": merged_requests,
        "allergies": req.allergies or [],
        "created_at": _now_iso(),
        "cable_beach": {
            "transfer_kind": req.transfer_kind,
            "hotel_id": req.hotel_id,
            "hotel_name": hotel_match["name"] if hotel_match else None,
            "extra_seats": req.extra_seats,
            "menu_lines": quote["menu_lines"],
            "sides_detail": quote.get("sides_detail") or [],
            "sides_extra_count": quote.get("sides_extra_count") or 0,
            "sides_extra_total": quote.get("sides_extra_total") or 0.0,
            "water_sport_lines": quote.get("water_sport_lines") or [],
            "water_sports_total": quote.get("water_sports_total") or 0.0,
            "parasail_spectators": quote.get("parasail_spectators") or 0,
            "combo_applied": quote.get("combo_applied"),
            "combo_discount": quote.get("combo_discount") or 0.0,
        },
        "cable_beach_share_token": req.share_token,
        "loyalty_free_applied": bool(quote.get("loyalty_free_applied")),
        "loyalty_discount": quote.get("loyalty_discount") or 0.0,
    }
    await _db.bookings.insert_one(booking_doc)
    # Fire beach-team SMS the moment the booking is created (even before
    # payment lands) so the Cable Beach crew can set up chairs. Pay-time
    # confirmation + day-of reminders go through separate hooks.
    try:
        await notify_beach_team_cable_beach_booking(booking_id, phase="created")
    except Exception as e:  # noqa: BLE001
        logging.getLogger(__name__).warning("beach team SMS (create) err: %s", e)
    return {"booking_id": booking_id, "total": quote["total"], "pay_url": f"/pay/{booking_id}"}


async def credit_share_referrer_if_cable_beach(booking_id: str) -> None:
    booking = await _db.bookings.find_one({"id": booking_id})
    if not booking:
        return
    if booking.get("share_credit_awarded"):
        return
    token = booking.get("cable_beach_share_token")
    if not token:
        return
    rec = await _db.share_tokens.find_one({"token": token})
    if not rec:
        return
    sharer_email = rec.get("sharer_email")
    if not sharer_email:
        return
    if (booking.get("customer_email") or "").lower() == sharer_email.lower():
        await _db.bookings.update_one(
            {"id": booking_id},
            {"$set": {"share_credit_awarded": True, "share_credit_amount": 0.0,
                      "share_credit_note": "self-referral"}},
        )
        return
    await _db.users.update_one(
        {"email": sharer_email},
        {"$inc": {"credit_balance": SHARE_CREDIT_USD},
         "$setOnInsert": {"email": sharer_email, "created_at": _now_iso(),
                          "referral_code": _new_referral_code(),
                          "name": sharer_email.split("@")[0]}},
        upsert=True,
    )
    await _db.share_tokens.update_one(
        {"token": token},
        {"$inc": {"bookings": 1, "credits_awarded_total": SHARE_CREDIT_USD}},
    )
    await _db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"share_credit_awarded": True,
                  "share_credit_amount": SHARE_CREDIT_USD,
                  "share_credit_to_email": sharer_email}},
    )
    try:
        if callable(_notify_owner_activity):
            _notify_owner_activity(
                "share_conversion",
                f"🌴 Cable Beach share converted · {sharer_email} earned ${SHARE_CREDIT_USD:.0f} credit · booking {booking_id}",
            )
    except Exception:  # noqa: BLE001
        pass

    try:
        user = await _db.users.find_one({"email": sharer_email}) or {}
        new_balance = float(user.get("credit_balance") or SHARE_CREDIT_USD)
        display_name = (user.get("name") or sharer_email.split("@")[0]).split("@")[0]
        html = f"""
        <!doctype html><html><body style="margin:0;background:#FBF7EF;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0B3B5C">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FBF7EF;padding:32px 16px">
            <tr><td align="center">
              <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 20px 50px rgba(11,25,44,0.08)">
                <tr><td style="background:linear-gradient(135deg,#128C7E,#25D366);padding:32px;color:#fff">
                  <div style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;font-weight:900;opacity:0.9">Rox share · reward unlocked</div>
                  <div style="font-family:Georgia,serif;font-size:36px;font-weight:700;margin-top:6px;line-height:1.1">You just earned<br/><em style="font-style:italic;color:#F7E6C6">$10 off your next trip.</em></div>
                </td></tr>
                <tr><td style="padding:28px 32px 8px">
                  <p style="font-size:15px;line-height:1.55;margin:0 0 12px">Hey {display_name},</p>
                  <p style="font-size:15px;line-height:1.55;margin:0 0 16px">A friend you shared <b>Toes in the Turquoise</b> with just booked their Cable Beach day. Nice work — we've dropped <b style="color:#128C7E">${SHARE_CREDIT_USD:.0f}</b> onto your Rox wallet.</p>
                  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:12px 0 20px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:12px;padding:14px 18px;width:100%">
                    <tr>
                      <td><div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.2em;font-weight:700">Wallet balance</div>
                      <div style="font-family:Georgia,serif;font-size:30px;color:#128C7E;font-weight:700;margin-top:2px">${new_balance:.2f}</div></td>
                    </tr>
                  </table>
                  <p style="font-size:14px;line-height:1.55;color:#64748B;margin:0 0 24px">Credits auto-apply on your next Rox booking (taxi, tour, or rental). No code needed — just book like usual.</p>
                  <a href="https://roxtaxi.com/tours/cable-beach-day" style="display:inline-block;background:#E86A3C;color:#fff;text-decoration:none;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;font-size:13px;padding:14px 28px;border-radius:999px">Book your next day →</a>
                </td></tr>
                <tr><td style="padding:20px 32px 32px;color:#94A3B8;font-size:11px;line-height:1.55">
                  Share more Cable Beach days to earn more Rox credit — every friend who books gets you another $10. 🌴<br/>
                  You received this because you shared a trip from <a href="https://roxtaxi.com/tours/cable-beach-day" style="color:#D4A94A">roxtaxi.com</a>.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body></html>
        """
        if callable(_send_email):
            _send_email(
                to_email=sharer_email,
                subject=f"🌴 Your ${SHARE_CREDIT_USD:.0f} Rox credit is here — a friend just booked",
                html=html,
                text=f"You just earned ${SHARE_CREDIT_USD:.0f} on Rox! Your wallet balance is now ${new_balance:.2f}. Spend it on your next taxi, tour, or rental at https://roxtaxi.com",
                category="confirmation",
            )
    except Exception as e:  # noqa: BLE001
        logging.getLogger(__name__).warning("share credit email err: %s", e)


# ─── Live marine conditions (Open-Meteo, 15-min cached) ───────────────────
_CB_WEATHER_CACHE: dict = {"ts": 0.0, "data": None}


def _classify_marine(wave_m: float, wind_kmh: float) -> dict:
    if wave_m is None:
        wave_m = 0.0
    if wind_kmh is None:
        wind_kmh = 0.0
    if wave_m < 0.3 and wind_kmh < 12:
        return {"label": "Glass calm", "emoji": "🪞", "hex": "#0EA5E9", "tier": "calm"}
    if wave_m < 0.7 and wind_kmh < 20:
        return {"label": "Light chop", "emoji": "🌊", "hex": "#06B6D4", "tier": "mild"}
    if wave_m < 1.2 and wind_kmh < 30:
        return {"label": "Breezy & fun", "emoji": "🏄\u200d♂️", "hex": "#F59E0B", "tier": "lively"}
    return {"label": "Surf's up", "emoji": "🏄", "hex": "#EF4444", "tier": "big"}


@router.get("/cable-beach/weather")
async def cable_beach_weather():
    """Open-Meteo marine + weather for Cable Beach (Nassau). Cached 15 min."""
    now = time.time()
    if _CB_WEATHER_CACHE.get("data") and (now - _CB_WEATHER_CACHE["ts"]) < 900:
        return _CB_WEATHER_CACHE["data"]

    lat, lon = 25.0797, -77.4125
    try:
        import httpx
        async with httpx.AsyncClient(timeout=6.0) as client:
            marine_r = await client.get(
                "https://marine-api.open-meteo.com/v1/marine",
                params={"latitude": lat, "longitude": lon, "current": "wave_height,sea_surface_temperature"},
            )
            weather_r = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={"latitude": lat, "longitude": lon, "current": "wind_speed_10m,temperature_2m", "wind_speed_unit": "kmh"},
            )
        marine = marine_r.json().get("current") or {}
        weather = weather_r.json().get("current") or {}
        wave = float(marine.get("wave_height") or 0.0)
        water = marine.get("sea_surface_temperature")
        wind = float(weather.get("wind_speed_10m") or 0.0)
        air = weather.get("temperature_2m")
        cls = _classify_marine(wave, wind)
        data = {
            **cls,
            "wave_m": round(wave, 2),
            "wind_kmh": round(wind, 1),
            "water_c": round(float(water), 1) if water is not None else None,
            "air_c": round(float(air), 1) if air is not None else None,
            "fetched_at": _now_iso(),
        }
    except Exception as e:  # noqa: BLE001
        logging.getLogger(__name__).warning("marine fetch err: %s", e)
        data = {**_classify_marine(0.4, 10.0), "wave_m": None, "wind_kmh": None,
                "water_c": None, "air_c": None, "fetched_at": _now_iso(), "stale": True}
    _CB_WEATHER_CACHE.update({"ts": now, "data": data})
    return data


# ─── Cruise ships today (public read) ────────────────────────────────────
@router.get("/cable-beach/cruise-ships-today")
async def cruise_ships_today():
    """Admin-maintained list of cruise ships docked at Nassau today.
    Frontend uses this to pin a context ribbon on the home-page promotion
    ("Welcome Carnival Pride guests — same-day beach day only $35 r/t").
    Returns an empty list when nothing is docked / unset."""
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    pkg = cfg.get("cable_beach_pkg") or {}
    return {
        "ships": list(pkg.get("cruise_ships_today") or []),
        "updated_at": pkg.get("cruise_ships_updated_at"),
    }


# ─── Local loyalty punch card ────────────────────────────────────────────
# Count paid Cable Beach bookings for a given email. Every Nth visit
# (default 5) is free — the next quote with `loyalty_email` passed in
# applies a `base_price × pax` discount and marks the resulting booking
# with `loyalty_free_applied: True` so it doesn't count toward the next
# cycle.
@router.get("/cable-beach/loyalty")
async def cable_beach_loyalty(email: Optional[str] = None):
    if not email:
        return {"email": None, "paid_visits": 0, "stamps": 0,
                "cycle_size": 5, "free_available": False}
    cfg = await _cable_beach_cfg()
    cycle = int(cfg.get("loyalty_free_every") or 5)
    normalised = email.strip().lower()
    # Only count paid bookings that didn't already redeem a free day.
    paid = await _db.bookings.count_documents({
        "item_id": "cable-beach-day",
        "customer_email": normalised,
        "payment_status": "paid",
        "loyalty_free_applied": {"$ne": True},
    })
    stamps = paid % cycle
    free_available = paid >= (cycle - 1) and stamps == (cycle - 1)
    return {
        "email": normalised,
        "paid_visits": paid,
        "stamps": stamps,
        "cycle_size": cycle,
        "free_available": free_available,
        "next_free_in": (cycle - 1 - stamps) if not free_available else 0,
    }


# ─── Day-of beach-team reminders (cron piggyback) ─────────────────────────
@router.post("/cron/send-beach-team-dayof")
async def cron_send_beach_team_dayof(request: Request):
    """Fires a one-time morning SMS to the Cable Beach team for every PAID
    Cable Beach booking whose service date is today (Nassau local). Called
    from the platform cron (every 10 min); idempotent via
    `beach_team_dayof_sms_at` on each booking.
    """
    # Platform-cron auth header — matches the pattern used by other crons.
    from datetime import datetime, timezone, timedelta
    nassau = timezone(timedelta(hours=-5))  # Nassau (EST, no DST)
    today = datetime.now(nassau).date()
    # Only fire between 07:00 and 10:00 Nassau — avoids spamming through the
    # day when the 10-min cron ticks. Cron is already time-of-day gated at the
    # platform, this is defence-in-depth.
    hour = datetime.now(nassau).hour
    if not (7 <= hour <= 10):
        return {"status": "outside-window", "nassau_hour": hour}
    cursor = _db.bookings.find({
        "item_id": "cable-beach-day",
        "payment_status": "paid",
        "beach_team_dayof_sms_at": {"$exists": False},
    }).limit(200)
    fired = 0
    async for booking in cursor:
        try:
            raw = (booking.get("booking_date") or "")[:10]
            if not raw:
                continue
            d = datetime.fromisoformat(raw).date()
        except Exception:  # noqa: BLE001
            continue
        if d != today:
            continue
        try:
            await notify_beach_team_cable_beach_booking(booking["id"], phase="dayof")
            fired += 1
        except Exception as e:  # noqa: BLE001
            logging.getLogger(__name__).warning("dayof SMS err %s: %s", booking.get("id"), e)
    return {"status": "ok", "fired": fired, "nassau_date": str(today)}
