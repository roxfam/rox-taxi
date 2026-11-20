"""Processing fee for taxi + city tours, VAT for everything else (rates editable in admin)."""
DEFAULT_PROCESSING_PCT = 5.0
DEFAULT_VAT_PCT = 10.0


async def fee_rates(db) -> dict:
    cfg = await db.site_config.find_one({"_id": "main"}, {"processing_fee_pct": 1, "vat_pct": 1}) or {}
    p, v = cfg.get("processing_fee_pct"), cfg.get("vat_pct")
    return {"processing_pct": float(DEFAULT_PROCESSING_PCT if p is None else p),
            "vat_pct": float(DEFAULT_VAT_PCT if v is None else v)}


def is_processing_kind(service_type: str, item_name: str = "") -> bool:
    return service_type == "taxi" or (service_type == "tour" and "city tour" in (item_name or "").lower())


def compute_fees(subtotal: float, service_type: str, item_name: str, rates: dict) -> dict:
    if is_processing_kind(service_type, item_name):
        pct = rates["processing_pct"]
        return {"vat_amount": 0.0, "vat_pct": 0.0, "processing_fee": round(subtotal * pct / 100, 2), "processing_fee_pct": pct / 100}
    pct = rates["vat_pct"]
    return {"vat_amount": round(subtotal * pct / 100, 2), "vat_pct": pct / 100, "processing_fee": 0.0, "processing_fee_pct": 0.0}


def fee_line(fees: dict) -> list:
    if fees["processing_fee"]:
        return [{"label": f"Processing fee ({fees['processing_fee_pct'] * 100:g}%)", "amount": fees["processing_fee"]}]
    if fees["vat_amount"]:
        return [{"label": f"VAT ({fees['vat_pct'] * 100:g}%)", "amount": fees["vat_amount"]}]
    return []
