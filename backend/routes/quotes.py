"""Quotes: price a full booking payload without booking; valid 48h; one-click convert to a real booking."""
import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError

import fees as fees_module

router = APIRouter()
_db = _now_iso = _create_booking = _Booking = _require_admin = None
VALID_HOURS = 48
PURGE_AFTER_DAYS = 3
PRICE_KEYS = [("subtotal_before_tax", "Fare / service"), ("bridge_toll_fee", "Paradise Island bridge toll pass (included above)"), ("group_discount", "Group discount (included above)"), ("promotion_discount", "Promotion"), ("online_discount", "Online booking discount"),
              ("vat_amount", "VAT"), ("processing_fee", "Processing fee"), ("deposit_amount", "Refundable deposit"),
              ("tip_amount", "Driver gratuity")]


def configure(*, db, now_iso, create_booking, booking_model, require_admin):
    global _db, _now_iso, _create_booking, _Booking, _require_admin
    _db, _now_iso, _create_booking, _Booking, _require_admin = db, now_iso, create_booking, booking_model, require_admin


async def _admin_dep(request: Request, authorization: Optional[str] = Header(None),
                     x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token")):
    return await _require_admin(request, authorization, x_csrf_token)


def _status(q: dict) -> str:
    if q.get("status") in ("booked", "cancelled"):
        return q["status"]
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
    if q.get("customer_phone"):
        try:
            from notifications import send_sms  # noqa: PLC0415
            send_sms(q["customer_phone"], f"Rox: Hi {q['customer_name'].split(' ')[0]}, your quote {q['id']} for {q['item_name']} "
                                           f"is ${q['total']:.2f}, valid until {q['expires_label']}. View, adjust people & pay: {link}")
        except Exception as e:  # noqa: BLE001
            logging.warning("quote sms err: %s", e)
    try:
        notify_owner_activity("quote", f"📝 New quote {q['id']}: {q['item_name']} ${q['total']:.2f} · {q['customer_name']} {q.get('customer_phone') or ''}")
    except Exception as e:  # noqa: BLE001
        logging.warning("quote owner notify err: %s", e)


async def _price(payload: dict, request: Request) -> dict:
    res = await _create_booking(_model(payload, True), request)
    b = res["booking"]
    lines = [{"label": lbl, "amount": round(float(b[k]), 2) * (-1 if k in ("online_discount", "promotion_discount") else 1)}
             for k, lbl in PRICE_KEYS if b.get(k)]
    legs = b.get("trip_legs") or []
    if b.get("per_person_tour"):
        lines = [{**x, "label": f"Tour (${float(payload.get('price') or 0):,.2f} × {b.get('adults')} people)"}
                 if x["label"] == "Fare / service" else x for x in lines]
    if legs:
        leg_lines = [{"label": f"Leg {n}: {lg['from']} → {lg['to']}", "amount": round(float(lg["fare"]), 2)}
                     for n, lg in enumerate(legs, 1)]
        toll = round(float(b.get("bridge_toll_fee") or 0), 2)
        extras = round(float(b.get("subtotal_before_tax") or 0) - sum(x["amount"] for x in leg_lines) - toll, 2)
        rest = [x for x in lines if x["label"] not in ("Fare / service", "Paradise Island bridge toll pass (included above)")]
        lines = leg_lines + ([{"label": "Paradise Island bridge toll pass", "amount": toll}] if toll else []) \
            + ([{"label": "Luggage, extras & fees", "amount": extras}] if extras > 0 else []) + rest
    return {
        "service_type": b.get("service_type"), "item_name": b.get("item_name"),
        "customer_name": b.get("customer_name"), "customer_email": b.get("customer_email"),
        "customer_phone": b.get("customer_phone"), "booking_date": b.get("booking_date"),
        "pickup_location": b.get("pickup_location"), "dropoff_location": b.get("dropoff_location"),
        "stops": b.get("stops") or [], "trip_legs": legs,
        "passengers": b.get("passengers"), "days": b.get("days"),
        "adults": b.get("adults"), "kids": b.get("kids"), "toddlers": b.get("toddlers"),
        "lines": lines,
        "total": round(float(b.get("total") or 0), 2),
    }


@router.post("/quotes")
async def create_quote(req: QuoteRequest, request: Request):
    return await _save_quote(req.payload, "booking", await _price(req.payload, request))


class QuotePeople(BaseModel):
    passengers: Optional[int] = Field(None, ge=1, le=60)
    adults: Optional[int] = Field(None, ge=0, le=40)
    kids: Optional[int] = Field(None, ge=0, le=40)
    toddlers: Optional[int] = Field(None, ge=0, le=20)


@router.post("/quotes/{qid}/people")
async def quote_people(qid: str, req: QuotePeople, request: Request):
    """Guest changes the number of people on an open quote; it is re-priced with the same rules as a booking."""
    q = await _get(qid)
    if _status(q) != "open" or q.get("kind") not in ("booking", "manual"):
        raise HTTPException(400, "This quote can't be changed any more")
    if q.get("kind") == "manual":
        if not req.passengers:
            raise HTTPException(400, "Enter the number of people")
        p = {**q["payload"], "passengers": req.passengers}
        fields = _manual_fields(p, await _manual_rates(p))
        await _db.quotes.update_one({"id": q["id"]}, {"$set": {**fields, "payload": p, "updated_at": _now_iso()}})
        return _public({**q, **fields})
    p = dict(q["payload"])
    if p.get("adults") is not None and req.adults is not None:
        p.update({"adults": req.adults, "kids": req.kids or 0, "toddlers": req.toddlers or 0})
        p["passengers"] = req.adults + (req.kids or 0) + (req.toddlers or 0)
        if req.adults + (req.kids or 0) < 1:
            raise HTTPException(400, "At least one paying guest is needed")
    elif req.passengers:
        p["passengers"] = req.passengers
        if p.get("adults") is not None:
            p.update({"adults": req.passengers, "kids": 0, "toddlers": 0})
    else:
        raise HTTPException(400, "Enter the number of people")
    p.pop("processing_fee", None)
    p.pop("group_discount", None)
    with fees_module.admin_overrides(bool(q.get("no_vat")), q.get("processing_fee_on"), bool(q.get("per_person_tour")), bool(q.get("created_by")), bool(q.get("allow_blackout"))):
        fields = await _price(p, request)
    await _db.quotes.update_one({"id": q["id"]}, {"$set": {**fields, "payload": p, "updated_at": _now_iso()}})
    return _public({**q, **fields})


@router.post("/admin/quotes/{qid}/cancel")
async def admin_cancel_quote(qid: str, admin=Depends(_admin_dep)):
    q = await _get(qid)
    if q.get("status") == "booked":
        raise HTTPException(400, "This quote is already booked. Cancel the booking instead.")
    await _db.quotes.update_one({"id": q["id"]}, {"$set": {"status": "cancelled", "cancelled_at": _now_iso(), "cancelled_by": admin}})
    return {"cancelled": True}


@router.post("/admin/quotes/{qid}/send-link")
async def admin_send_quote_link(qid: str, admin=Depends(_admin_dep)):
    """Text + email (re-send) the guest the quote link + PDF. Expired quotes are re-opened for 48h."""
    q = await _get(qid)
    st = _status(q)
    if st not in ("open", "expired") or q.get("status") == "booking":
        raise HTTPException(400, "Only open or expired quotes can be sent")
    if st == "expired":
        exp = datetime.now(timezone.utc) + timedelta(hours=VALID_HOURS)
        reopen = {"expires_at": exp.isoformat(), "status": "open",
                  "expires_label": exp.astimezone(timezone(timedelta(hours=-4))).strftime("%b %d, %Y %I:%M %p") + " Nassau time"}
        await _db.quotes.update_one({"id": q["id"]}, {"$set": reopen})
        q.update(reopen)
    from notifications import send_sms, send_email  # noqa: PLC0415
    from routes.payment_digest import _site_url  # noqa: PLC0415
    link = f"{_site_url()}/quote/{q['id']}"
    pdf = f"{_site_url()}/api/quotes/{q['id']}/pdf"
    first = (q.get("customer_name") or "there").split(" ")[0]
    out = {"link": link, "text": None, "email": None}
    if q.get("customer_phone"):
        out["text"] = await asyncio.to_thread(send_sms, q["customer_phone"],
                                              f"Hi {first}, it's Rox Taxi. Your quote {q['id']} for {q['item_name']} is ${q['total']:.2f}. Tap to pay online: {link}")
    if q.get("customer_email"):
        html = (f"<p>Hi {first},</p><p>Your quote <b>{q['id']}</b> for {q['item_name']} is <b>${q['total']:.2f}</b>.</p>"
                f"<p><a href='{link}' style='display:inline-block;padding:12px 20px;background:#E86A3C;color:#fff;border-radius:999px;text-decoration:none'>View quote &amp; pay</a></p>"
                f"<p style='font-size:13px'><a href='{pdf}'>Download quote PDF</a> · valid until {q.get('expires_label', '')}</p>")
        out["email"] = await asyncio.to_thread(send_email, q["customer_email"], f"Your Rox quote {q['id']} — pay online", html)
    await _db.quotes.update_one({"id": q["id"]}, {"$set": {"link_sent_at": _now_iso()}})
    return out


async def _manual_rates(p: dict) -> dict:
    proc = await fees_module.is_processing(_db, p.get("service_type") or "", p.get("item_id") or "", p.get("item_name") or "")
    return {**await fees_module.fee_rates(_db), "processing": proc}


def _manual_fields(p: dict, rates: dict) -> dict:
    """Admin-priced quote: trip cost (optionally × people) + luggage + baby seats + bridge toll."""
    pax = int(p.get("passengers") or 1)
    cost = float(p.get("trip_cost") or 0)
    per = bool(p.get("per_person"))
    base = round(cost * (pax if per else 1), 2)
    lines = [{"label": f"Trip cost (${cost:,.2f} × {pax} people)" if per else "Trip cost", "amount": base}]
    extras = [("Luggage", round(int(p.get("extra_luggage") or 0) * float(p.get("luggage_price") or 0), 2)),
              ("Baby car seats", round(int(p.get("car_seats") or 0) * 2.0, 2)),
              ("Paradise Island bridge toll pass", 2.0 if p.get("bridge_toll") and p.get("service_type") == "taxi" else 0.0)]
    lines += [{"label": k, "amount": v} for k, v in extras if v]
    sub = round(sum(x["amount"] for x in lines), 2)
    fz = fees_module.compute_fees(sub, rates["processing"], rates, no_vat=bool(p.get("no_vat")), fee_on=p.get("processing_fee_on"))
    lines += fees_module.fee_line(fz)
    tip = round(max(0.0, float(p.get("tip_amount") or 0)), 2)
    if tip:
        lines.append({"label": "Gratuity", "amount": tip})
    total = round(sub + fz["vat_amount"] + fz["processing_fee"] + tip, 2)
    p["total"] = sub  # pre-fee, pre-tip: the booking re-adds VAT/fee/gratuity on conversion
    dep_pct = max(0.0, min(90.0, float(p.get("deposit_pct") or 0)))
    deposit = round(total * dep_pct / 100, 2) if dep_pct else 0.0
    return {"service_type": p.get("service_type"), "item_name": p.get("item_name"),
            "customer_name": p.get("customer_name"), "customer_email": p.get("customer_email"),
            "customer_phone": p.get("customer_phone"), "booking_date": p.get("booking_date"),
            "pickup_location": p.get("pickup_location"), "dropoff_location": p.get("dropoff_location"),
            "stops": p.get("stops") or [], "trip_legs": p.get("trip_legs") or [], "passengers": pax,
            "dropoff_time": p.get("dropoff_time") or None, "no_vat": bool(p.get("no_vat")),
            "processing_fee_on": p.get("processing_fee_on"),
            "per_person": per, "trip_cost": cost, "lines": lines, "total": total,
            "deposit_pct": dep_pct, "deposit_due": deposit, "balance_later": round(total - deposit, 2) if deposit else 0.0}


@router.post("/admin/quotes/manual")
async def admin_manual_quote(payload: dict, admin=Depends(_admin_dep)):
    from routes.dayof_reminders import ManualBooking  # noqa: PLC0415
    p = {**payload, "total": 0, "payment": "unpaid", "send_confirmation": False, "send_pay_link": False, "text_pay_link": False}
    try:
        ManualBooking(**p)
    except ValidationError as e:
        raise HTTPException(422, e.errors()[0].get("msg", "Invalid quote")) from e
    await fees_module.special_day_flags(_db, p.get("booking_date") or "", bool(p.get("allow_blackout")))
    if not p.get("trip_cost") or not (p.get("customer_email") or p.get("customer_phone")):
        raise HTTPException(400, "Enter the trip cost and the guest's email or phone")
    return await _save_quote(p, "manual", {**_manual_fields(p, await _manual_rates(p)), "created_by": admin})


class AdminQuote(BaseModel):
    payload: dict
    text_guest: bool = False
    no_vat: bool = False
    processing_fee_on: Optional[bool] = None
    allow_blackout: bool = False
    dropoff_time: Optional[str] = Field(None, max_length=10)


@router.post("/admin/quotes")
async def admin_create_quote(req: AdminQuote, request: Request, admin=Depends(_admin_dep)):
    ppt = req.payload.get("service_type") == "tour"
    with fees_module.admin_overrides(req.no_vat, req.processing_fee_on, ppt, True, req.allow_blackout):
        fields = await _price(req.payload, request)
    q = await _save_quote(req.payload, "booking", {**fields, "created_by": admin, "no_vat": req.no_vat,
                                                    "processing_fee_on": req.processing_fee_on, "per_person_tour": ppt, "allow_blackout": req.allow_blackout,
                                                    "dropoff_time": req.dropoff_time or None})
    return q


CB_LINES = [("base", "Beach day package (chairs + umbrella)"), ("extra_seats_total", "Extra seats"),
            ("transfer_total", "Taxi transfer"), ("menu_total", "Lunch & drinks"), ("sides_extra_total", "Extra sides"),
            ("water_sports_total", "Water sports"), ("combo_discount", "Combo discount"),
            ("loyalty_discount", "Loyalty discount"), ("vat", "VAT"), ("processing_fee", "Processing fee")]


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


@router.post("/cron/purge-old-quotes")
async def cron_purge_old_quotes(background: BackgroundTasks, authorization: Optional[str] = Header(None)):
    from routes.cron import _check_cron_auth  # noqa: PLC0415
    _check_cron_auth(authorization)
    background.add_task(purge_old_quotes)
    return {"ok": True, "queued": True}


async def purge_old_quotes() -> int:
    """Deletes un-booked quotes 3 days after they were sent (or last re-sent/edited)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=PURGE_AFTER_DAYS) + timedelta(hours=VALID_HOURS)
    res = await _db.quotes.delete_many({"status": {"$nin": ["booked", "booking"]},
                                        "expires_at": {"$lte": cutoff.isoformat()}})
    if res.deleted_count:
        logging.info("purged %s old quotes", res.deleted_count)
    return res.deleted_count


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
        elif q.get("kind") == "manual":
            from routes.dayof_reminders import ManualBooking, admin_create_booking  # noqa: PLC0415
            b = (await admin_create_booking(ManualBooking(**q["payload"]), q.get("created_by") or "quote"))["booking"]
        else:
            with fees_module.admin_overrides(bool(q.get("no_vat")), q.get("processing_fee_on"), bool(q.get("per_person_tour")), bool(q.get("created_by")), bool(q.get("allow_blackout"))):
                b = await _create_booking(_model(q["payload"], False), request)
    except Exception:
        await _db.quotes.update_one({"id": q["id"]}, {"$set": {"status": "open"}})
        raise
    await _db.quotes.update_one({"id": q["id"]}, {"$set": {"status": "booked", "booking_id": b["id"], "booked_at": _now_iso()}})
    invoice_no = "INV-" + q["id"].split("-", 1)[-1]
    inv = {"quote_id": q["id"], "invoice_number": invoice_no, "invoiced_at": _now_iso()}
    if q.get("dropoff_time"):
        inv["dropoff_time"] = q["dropoff_time"]
    if q.get("deposit_due"):
        inv.update({"is_group_booking": True, "group_pay_mode": "deposit", "balance_due": q["balance_later"],
                    "quote_deposit": q["deposit_due"]})
        b.update(inv)
    await _db.bookings.update_one({"id": b["id"]}, {"$set": inv})
    from notifications import notify_guest_update  # noqa: PLC0415
    from routes.payment_digest import _site_url  # noqa: PLC0415
    pay = f"{_site_url()}/pay/{b['id']}"
    first = (b.get("customer_name") or "there").split(" ")[0]
    total = float(b.get("total") or 0)
    dep = float(q.get("deposit_due") or 0)
    due_txt = (f"Deposit due now: ${dep:.2f}. Balance ${total - dep:.2f} is due before your trip; we'll send you a link 48 hours ahead."
               if dep else f"Amount due: ${total:.2f}.")
    asyncio.get_running_loop().run_in_executor(None, lambda: notify_guest_update(
        b, subject=f"Invoice {invoice_no} — {b.get('item_name', '')} (${total:.2f})", kicker="Invoice",
        headline=f"{first}, your invoice {invoice_no} is ready",
        lines=[f"{b.get('item_name', '')} on {str(b.get('booking_date', '')).replace('T', ' ')}.",
               f"{due_txt} Booking reference {b['id']}."],
        sms=(f"Rox: Hi {first}, invoice {invoice_no} for {b.get('item_name', '')} is ${total:.2f}"
             + (f" (deposit ${dep:.2f} now, balance before the trip)" if dep else "") + f". Pay securely: {pay}"),
        button=("Pay invoice", pay)))
    return {"booking_id": b["id"], "invoice_number": invoice_no}


@router.get("/admin/quotes")
async def admin_quotes(_admin=Depends(_admin_dep)):
    docs = await _db.quotes.find({}, {"_id": 0, "payload": 0}).sort("created_at", -1).to_list(1000)
    return [{**d, "status": _status(d)} for d in docs]


@router.get("/admin/quotes/{qid}")
async def admin_quote_detail(qid: str, _admin=Depends(_admin_dep)):
    q = await _get(qid)
    return {**q, "status": _status(q)}


EDITABLE = ("customer_name", "customer_email", "customer_phone", "booking_date", "pickup_location", "dropoff_location",
            "passengers", "notes", "dropoff_time", "trip_cost", "per_person", "deposit_pct", "no_vat",
            "processing_fee_on", "tip_amount", "item_name")


@router.put("/admin/quotes/{qid}")
async def admin_edit_quote(qid: str, body: dict, request: Request, admin=Depends(_admin_dep)):
    """Edit an open/expired quote; it is re-priced and its 48h validity restarts."""
    q = await _get(qid)
    if _status(q) in ("booked", "cancelled") or q.get("status") == "booking":
        raise HTTPException(400, "Only open or expired quotes can be edited")
    if q.get("kind") not in ("manual", "booking", "cable_beach"):
        raise HTTPException(400, "This quote type can't be edited — create a new one")
    if q["kind"] == "cable_beach":
        from phone_utils import normalize_phone as _np  # noqa: PLC0415
        ch = {k: v for k, v in body.items() if k in ("customer_name", "customer_email", "customer_phone", "notes")}
        if ch.get("customer_phone"):
            ch["customer_phone"] = _np(ch["customer_phone"])
        await _db.quotes.update_one({"id": q["id"]}, {"$set": {**ch, "updated_at": _now_iso(), "edited_by": admin}})
        return {**q, **ch, "status": _status(q)}
    ch = {k: v for k, v in body.items() if k in EDITABLE}
    p = {**q["payload"]}
    from phone_utils import normalize_phone  # noqa: PLC0415
    if ch.get("customer_phone"):
        ch["customer_phone"] = normalize_phone(ch["customer_phone"])
    no_vat = bool(ch.pop("no_vat", q.get("no_vat")))
    fee_on = ch.pop("processing_fee_on", q.get("processing_fee_on"))
    drop = ch.pop("dropoff_time", q.get("dropoff_time"))
    if q["kind"] == "manual":
        p.update({**ch, "no_vat": no_vat, "processing_fee_on": fee_on, "dropoff_time": drop})
        fields = _manual_fields(p, await _manual_rates(p))
    else:
        for k in ("trip_cost", "per_person", "deposit_pct"):
            ch.pop(k, None)
        if "passengers" in ch and p.get("adults") is not None:
            p.update({"adults": ch["passengers"], "kids": 0, "toddlers": 0})
        p.update(ch)
        p.pop("processing_fee", None)
        p.pop("group_discount", None)
        with fees_module.admin_overrides(no_vat, fee_on, bool(q.get("per_person_tour")), True, bool(q.get("allow_blackout"))):
            fields = await _price(p, request)
        fields.update({"dropoff_time": drop or None})
    exp = datetime.now(timezone.utc) + timedelta(hours=VALID_HOURS)
    upd = {**fields, "payload": p, "no_vat": no_vat, "processing_fee_on": fee_on, "updated_at": _now_iso(),
           "edited_by": admin, "status": "open", "expires_at": exp.isoformat(),
           "expires_label": exp.astimezone(timezone(timedelta(hours=-4))).strftime("%b %d, %Y %I:%M %p") + " Nassau time"}
    await _db.quotes.update_one({"id": q["id"]}, {"$set": upd})
    return {**q, **upd, "status": "open"}
