"""Processing fee for taxi + city tours, VAT for everything else (rates editable in admin)."""
import contextlib
import contextvars

DEFAULT_PROCESSING_PCT = 5.0
DEFAULT_VAT_PCT = 10.0
NO_VAT = contextvars.ContextVar("no_vat", default=False)  # set only by admin-created quotes/bookings
FEE_ON = contextvars.ContextVar("fee_on", default=None)  # admin override: force processing fee on/off
TOUR_PER_PERSON = contextvars.ContextVar("tour_per_person", default=False)  # admin quotes: flat tours × people
ADMIN_MADE = contextvars.ContextVar("admin_made", default=False)  # admin-created: may book on Saturday closure
ALLOW_BLACKOUT = contextvars.ContextVar("allow_blackout", default=False)  # admin approved a blackout-date booking


@contextlib.contextmanager
def admin_overrides(no_vat: bool = False, fee_on=None, tour_per_person: bool = False, admin_made: bool = False,
                    allow_blackout: bool = False):
    t1, t2, t3 = NO_VAT.set(bool(no_vat)), FEE_ON.set(fee_on), TOUR_PER_PERSON.set(bool(tour_per_person))
    t4, t5 = ADMIN_MADE.set(bool(admin_made)), ALLOW_BLACKOUT.set(bool(admin_made and allow_blackout))
    try:
        yield
    finally:
        NO_VAT.reset(t1)
        FEE_ON.reset(t2)
        TOUR_PER_PERSON.reset(t3)
        ADMIN_MADE.reset(t4)
        ALLOW_BLACKOUT.reset(t5)


async def special_day_flags(db, booking_date: str, allow_blackout: bool) -> dict:
    """For admin-made bookings: flag Saturday/blackout trips; reject blackout days unless approved."""
    from datetime import date as _date  # noqa: PLC0415
    from fastapi import HTTPException  # noqa: PLC0415
    try:
        d = _date.fromisoformat((booking_date or "")[:10])
    except ValueError:
        return {}
    cfg = await db.site_config.find_one({"_id": "main"}, {"blackout_dates": 1}) or {}
    out = {}
    if d.weekday() == 5:
        out["admin_saturday"] = True
    if d.isoformat() in set(cfg.get("blackout_dates") or []):
        if not allow_blackout:
            raise HTTPException(400, f"{d.isoformat()} is a blackout date. Tick 'Book on blackout date' to approve it.")
        out["admin_blackout"] = True
    return out


async def fee_rates(db) -> dict:
    cfg = await db.site_config.find_one({"_id": "main"}, {"processing_fee_pct": 1, "vat_pct": 1}) or {}
    p, v = cfg.get("processing_fee_pct"), cfg.get("vat_pct")
    return {"processing_pct": float(DEFAULT_PROCESSING_PCT if p is None else p),
            "vat_pct": float(DEFAULT_VAT_PCT if v is None else v)}


async def is_processing(db, service_type: str, item_id: str = "", item_name: str = "") -> bool:
    if service_type == "taxi":
        return True
    if service_type != "tour":
        return False
    q = {"id": item_id} if item_id else {"name": item_name} if item_name else None
    doc = await db.tours.find_one(q, {"city_tour": 1}) if q else None
    if doc and doc.get("city_tour") is not None:
        return bool(doc["city_tour"])
    return "city tour" in (item_name or "").lower()


def compute_fees(subtotal: float, processing: bool, rates: dict, no_vat: bool = False, fee_on=None) -> dict:
    on = fee_on if fee_on is not None else FEE_ON.get()
    on = processing if on is None else bool(on)
    vat_pct = 0.0 if (processing or no_vat or NO_VAT.get()) else rates["vat_pct"]
    fee_pct = rates["processing_pct"] if on else 0.0
    return {"vat_amount": round(subtotal * vat_pct / 100, 2), "vat_pct": vat_pct / 100,
            "processing_fee": round(subtotal * fee_pct / 100, 2), "processing_fee_pct": fee_pct / 100}


def fee_line(fees: dict) -> list:
    out = []
    if fees["vat_amount"]:
        out.append({"label": f"VAT ({fees['vat_pct'] * 100:g}%)", "amount": fees["vat_amount"]})
    if fees["processing_fee"]:
        out.append({"label": f"Processing fee ({fees['processing_fee_pct'] * 100:g}%)", "amount": fees["processing_fee"]})
    return out



def guard_saturday(date_str: str) -> None:
    """Saturdays are an off day: only admin-created bookings may use them."""
    from datetime import date as _date  # noqa: PLC0415
    from fastapi import HTTPException  # noqa: PLC0415
    if ADMIN_MADE.get():
        return
    try:
        d = _date.fromisoformat((date_str or "")[:10])
    except ValueError:
        return
    if d.weekday() == 5:
        raise HTTPException(400, "We're closed on Saturdays. Please choose another day, or WhatsApp us for special requests.")
