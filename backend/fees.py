"""Processing fee for taxi + city tours, VAT for everything else (rates editable in admin)."""
import contextvars

DEFAULT_PROCESSING_PCT = 5.0
DEFAULT_VAT_PCT = 10.0
NO_VAT = contextvars.ContextVar("no_vat", default=False)  # set only by admin-created quotes/bookings


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


def compute_fees(subtotal: float, processing: bool, rates: dict, no_vat: bool = False) -> dict:
    if processing:
        pct = rates["processing_pct"]
        return {"vat_amount": 0.0, "vat_pct": 0.0, "processing_fee": round(subtotal * pct / 100, 2), "processing_fee_pct": pct / 100}
    pct = 0.0 if (no_vat or NO_VAT.get()) else rates["vat_pct"]
    return {"vat_amount": round(subtotal * pct / 100, 2), "vat_pct": pct / 100, "processing_fee": 0.0, "processing_fee_pct": 0.0}


def fee_line(fees: dict) -> list:
    if fees["processing_fee"]:
        return [{"label": f"Processing fee ({fees['processing_fee_pct'] * 100:g}%)", "amount": fees["processing_fee"]}]
    if fees["vat_amount"]:
        return [{"label": f"VAT ({fees['vat_pct'] * 100:g}%)", "amount": fees["vat_amount"]}]
    return []
