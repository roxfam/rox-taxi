"""Quotes: price a full booking payload without booking; valid 48h; one-click convert to a real booking."""
import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ValidationError

router = APIRouter()
_db = _now_iso = _create_booking = _Booking = _require_admin = None
VALID_HOURS = 48
PRICE_KEYS = [("subtotal_before_tax", "Fare / service"), ("group_discount", "Group discount (included above)"), ("promotion_discount", "Promotion"),
              ("vat_amount", "VAT"), ("processing_fee", "Processing fee"), ("deposit_amount", "Refundable deposit"),
              ("tip_amount", "Driver gratuity")]


def configure(*, db, now_iso, create_booking, booking_model, require_admin):
    global _db, _now_iso, _create_booking, _Booking, _require_admin
    _db, _now_iso, _create_booking, _Booking, _require_admin = db, now_iso, create_booking, booking_model, require_admin


async def _admin_dep(request: Request, authorization: Optional[str] = Header(None),
                     x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token")):
    return await _require_admin(request, authorization, x_csrf_token)


def _status(q: dict) -> str:
    if q.get("status") == "booked":
        return "booked"
    return "expired" if q["expires_at"] <= datetime.now(timezone.utc).isoformat() else "open"


def _public(q: dict) -> dict:
    out = {k: v for k, v in q.items() if k not in ("_id", "payload")}
    out["status"] = _status(q)
    return out


def _model(payload: dict, quote_only: bool):
    try:
        return _Booking(**{**payload, "quote_only": quote_only})
    except ValidationError as e:
        err = e.errors()[0]
        field = ".".join(str(x) for x in err.get("loc", []))
        raise HTTPException(422, f"{field}: {err.get('msg', 'Invalid quote details')}") from e


class QuoteRequest(BaseModel):
    payload: dict


def _notify(q: dict) -> None:
    from notifications import notify_owner_activity, send_email  # noqa: PLC0415
    from pdf_utils import build_quote_pdf  # noqa: PLC0415
    from routes.payment_digest import _site_url  # noqa: PLC0415
    link = f"{_site_url()}/quote/{q['id']}"
    try:
        send_email(
            to_email=q["customer_email"],
            subject=f"Your Rox quote {q['id']} — {q['item_name']} (${q['total']:.2f})",
            html=(f"<div style='font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0F172A'>"
                  f"<h2 style='color:#0B3B5C'>Your quote is ready</h2><p>Hi {q['customer_name'].split(' ')[0]},</p>"
                  f"<p>Thanks for your interest in <b>{q['item_name']}</b>. Your quote total is <b>${q['total']:.2f}</b>. "
                  f"It is valid for 48 hours (until {q['expires_label']}). Your quote is attached as a PDF.</p>"
                  f"<p style='text-align:center;margin:28px 0'><a href='{link}' style='background:#E86A3C;color:#fff;"
                  f"text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:bold'>Book this quote</a></p>"
                  f"<p style='color:#64748B;font-size:12px'>Nothing has been booked or charged yet.</p></div>"),
            text=f"Your Rox quote {q['id']}: ${q['total']:.2f}, valid until {q['expires_label']}. Book: {link}",
            category="info",
            attachments=[{"filename": f"rox-quote-{q['id']}.pdf", "content": build_quote_pdf(q), "mime_type": "application/pdf"}],
        )
    except Exception as e:  # noqa: BLE001
        logging.warning("quote email err: %s", e)
    try:
        notify_owner_activity("quote", f"📝 New quote {q['id']}: {q['item_name']} ${q['total']:.2f} · {q['customer_name']} {q.get('customer_phone') or ''}")
    except Exception as e:  # noqa: BLE001
        logging.warning("quote owner notify err: %s", e)


@router.post("/quotes")
async def create_quote(req: QuoteRequest, request: Request):
    res = await _create_booking(_model(req.payload, True), request)
    b = res["booking"]
    return await _save_quote(req.payload, "booking", {
        "service_type": b.get("service_type"), "item_name": b.get("item_name"),
        "customer_name": b.get("customer_name"), "customer_email": b.get("customer_email"),
        "customer_phone": b.get("customer_phone"), "booking_date": b.get("booking_date"),
        "pickup_location": b.get("pickup_location"), "dropoff_location": b.get("dropoff_location"),
        "passengers": b.get("passengers"), "days": b.get("days"),
        "lines": [{"label": lbl, "amount": round(float(b[k]), 2)} for k, lbl in PRICE_KEYS if b.get(k)],
        "total": round(float(b.get("total") or 0), 2),
    })


CB_LINES = [("base", "Beach day package (chairs + umbrella)"), ("extra_seats_total", "Extra seats"),
            ("transfer_total", "Taxi transfer"), ("menu_total", "Lunch & drinks"), ("sides_extra_total", "Extra sides"),
            ("water_sports_total", "Water sports"), ("combo_discount", "Combo discount"),
            ("loyalty_discount", "Loyalty discount"), ("vat", "VAT 10%"), ("processing_fee", "Processing fee 5%")]


def _cb_models(payload: dict):
    from routes.cable_beach import CableBeachBookRequest, CableBeachQuoteRequest  # noqa: PLC0415
    try:
        r = CableBeachBookRequest(**payload)
    except ValidationError as e:
        err = e.errors()[0]
        raise HTTPException(422, f"{'.'.join(str(x) for x in err.get('loc', []))}: {err.get('msg')}") from e
    qr = CableBeachQuoteRequest(
        pax=r.pax, transfer_kind=r.transfer_kind, hotel_id=r.hotel_id, extra_seats=r.extra_seats,
        lunch_item_ids=r.lunch_item_ids, drink_item_ids=r.drink_item_ids, drink_choices=r.drink_choices,
        combo_id=r.combo_id, side_selections=r.side_selections, water_sport_qty=r.water_sport_qty,
        parasail_spectators=r.parasail_spectators, loyalty_email=r.loyalty_email or r.customer_email)
    return r, qr


@router.post("/quotes/cable-beach")
async def create_cable_beach_quote(req: QuoteRequest):
    from routes.cable_beach import cable_beach_quote  # noqa: PLC0415
    r, qr = _cb_models(req.payload)
    cq = await cable_beach_quote(qr)
    lines = []
    for k, lbl in CB_LINES:
        v = round(float(cq.get(k) or 0), 2)
        if v:
            lines.append({"label": lbl, "amount": -abs(v) if "discount" in k else v})
    return await _save_quote(req.payload, "cable_beach", {
        "service_type": "cable_beach", "item_name": "Cable Beach Day · Toes in the Sandy Turquoise",
        "customer_name": r.customer_name, "customer_email": r.customer_email.lower(), "customer_phone": r.customer_phone,
        "booking_date": r.booking_date, "passengers": r.pax,
        "pickup_location": {"hotel": "Hotel pickup", "none": "Meet at the beach"}.get(r.transfer_kind, "Nassau Cruise Port"),
        "dropoff_location": "Cable Beach (Goodman's Bay)",
        "lines": lines, "total": round(float(cq.get("total") or 0), 2),
    })


async def _save_quote(payload: dict, kind: str, fields: dict) -> dict:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(hours=VALID_HOURS)
    q = {
        "id": f"Q-{secrets.token_hex(3).upper()}", "kind": kind, "payload": payload, **fields,
        "created_at": now.isoformat(), "expires_at": exp.isoformat(),
        "expires_label": exp.astimezone(timezone(timedelta(hours=-4))).strftime("%b %d, %Y %I:%M %p") + " Nassau time",
        "status": "open",
    }
    await _db.quotes.insert_one(dict(q))
    asyncio.get_running_loop().run_in_executor(None, _notify, q)
    return _public(q)


async def _get(qid: str) -> dict:
    q = await _db.quotes.find_one({"id": qid.upper()}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Quote not found")
    return q


@router.get("/quotes/{qid}")
async def get_quote(qid: str):
    return _public(await _get(qid))


@router.get("/quotes/{qid}/pdf")
async def quote_pdf(qid: str):
    from pdf_utils import build_quote_pdf  # noqa: PLC0415
    q = _public(await _get(qid))
    return Response(build_quote_pdf(q), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="rox-quote-{q["id"]}.pdf"'})


@router.post("/quotes/{qid}/book")
async def book_quote(qid: str, request: Request):
    q = await _get(qid)
    st = _status(q)
    if st == "booked":
        return {"booking_id": q["booking_id"], "already": True}
    if st == "expired":
        raise HTTPException(400, "This quote has expired. Please request a new quote.")
    claim = await _db.quotes.update_one({"id": q["id"], "status": "open"}, {"$set": {"status": "booking"}})
    if not claim.modified_count:
        raise HTTPException(409, "This quote is already being booked")
    try:
        if q.get("kind") == "cable_beach":
            from routes.cable_beach import cable_beach_book  # noqa: PLC0415
            r, _ = _cb_models(q["payload"])
            b = {"id": (await cable_beach_book(r))["booking_id"]}
        else:
            b = await _create_booking(_model(q["payload"], False), request)
    except Exception:
        await _db.quotes.update_one({"id": q["id"]}, {"$set": {"status": "open"}})
        raise
    await _db.quotes.update_one({"id": q["id"]}, {"$set": {"status": "booked", "booking_id": b["id"], "booked_at": _now_iso()}})
    await _db.bookings.update_one({"id": b["id"]}, {"$set": {"quote_id": q["id"]}})
    return {"booking_id": b["id"]}


@router.get("/admin/quotes")
async def admin_quotes(_admin=Depends(_admin_dep)):
    docs = await _db.quotes.find({}, {"_id": 0, "payload": 0}).sort("created_at", -1).to_list(100)
    return [{**d, "status": _status(d)} for d in docs]
