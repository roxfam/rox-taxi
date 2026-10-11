"""Nightly payment digest (9 PM Nassau) + guest payment-retry links."""
from typing import Optional
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, Request, HTTPException

import secrets_store

NASSAU = ZoneInfo("America/Nassau")
DIGEST_HOUR_LOCAL = 21
FAILED_STATES = ("failed", "expired", "error")

_db = None
_require_admin = None
_now_iso = None

router = APIRouter()
log = logging.getLogger("rox.payment_digest")


def configure(*, db, require_admin, now_iso):
    global _db, _require_admin, _now_iso  # noqa: PLW0603
    _db = db
    _require_admin = require_admin
    _now_iso = now_iso


async def _admin_dep(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
):
    return await _require_admin(request, authorization, x_csrf_token)


def _site_url() -> str:
    return (secrets_store.get_secret("PUBLIC_SITE_URL", "") or os.environ.get("PUBLIC_SITE_URL", "")
            or "https://roxtaxi.com").rstrip("/")


def _admin_emails() -> list:
    raw = secrets_store.get_secret("ADMIN_EMAIL", "") or os.environ.get("ADMIN_EMAIL", "")
    out = []
    for e in raw.split(","):
        e = e.strip()
        if e and e not in out:
            out.append(e)
    return out


# ─── Payment retry ──────────────────────────────────────────────────────
async def send_payment_retry(booking_id: Optional[str], *, session_id: Optional[str] = None,
                             reason: str = "failed") -> dict:
    """Mark the tx failed and email the guest a one-tap retry link (once per booking)."""
    if not booking_id:
        return {"sent": False, "error": "no booking"}
    booking_id = booking_id.upper()
    if session_id:
        await _db.payment_transactions.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"status": reason, "payment_status": "failed",
                      "failure_reason": reason, "updated_at": _now_iso()}},
        )
    booking = await _db.bookings.find_one({"id": booking_id})
    if not booking or booking.get("payment_status") in ("paid", "refunded"):
        return {"sent": False, "error": "booking missing or already paid"}
    claimed = await _db.bookings.update_one(
        {"id": booking_id, "payment_retry_sent_at": {"$exists": False}},
        {"$set": {"payment_retry_sent_at": _now_iso(), "payment_retry_reason": reason}},
    )
    if not claimed.modified_count:
        return {"sent": False, "error": "retry already sent"}
    retry_url = f"{_site_url()}/pay/{booking_id}"
    booking.pop("_id", None)
    from notifications import notify_payment_retry, send_owner_sms  # noqa: PLC0415
    report = await asyncio.to_thread(notify_payment_retry, booking, retry_url=retry_url, reason=reason)
    try:
        total = float(booking.get("total_price") or booking.get("total") or 0)
        await asyncio.to_thread(
            send_owner_sms,
            f"Rox: payment {reason} for {booking_id} ({booking.get('customer_name', 'guest')}, "
            f"${total:.2f}). Retry link emailed to guest.",
            "payment_failed",
        )
    except Exception as e:  # noqa: BLE001
        log.warning("owner retry sms err: %s", e)
    await _db.bookings.update_one({"id": booking_id}, {"$set": {"payment_retry_report": report}})
    return report


# ─── Digest ─────────────────────────────────────────────────────────────
async def build_digest(hours: int = 24) -> dict:
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    window = {"$gte": start.isoformat(), "$lte": end.isoformat()}
    txs = await _db.payment_transactions.find({"updated_at": window}).to_list(2000)
    groups = {"paid": [], "failed": [], "refunded": [], "pending": []}
    for t in txs:
        ps = (t.get("payment_status") or "").lower()
        st = (t.get("status") or "").lower()
        if ps == "paid":
            key = "paid"
        elif ps == "refunded" or st == "refunded":
            key = "refunded"
        elif ps == "failed" or st in FAILED_STATES:
            key = "failed"
        else:
            key = "pending"
        amt = float(t.get("refund_amount") if key == "refunded" and t.get("refund_amount") else t.get("amount") or 0)
        groups[key].append({
            "booking_id": t.get("booking_id"), "amount": round(amt, 2),
            "provider": t.get("provider", "stripe"),
            "reason": t.get("failure_reason") or st, "at": t.get("updated_at"),
        })
    return {
        "window_start": start.isoformat(), "window_end": end.isoformat(),
        "totals": {k: {"count": len(v), "amount": round(sum(i["amount"] for i in v), 2)}
                   for k, v in groups.items()},
        "items": groups,
    }


def _render_html(d: dict, day_label: str) -> str:
    colors = {"paid": "#059669", "failed": "#DC2626", "refunded": "#D97706", "pending": "#64748B"}
    tiles = "".join(
        f'<td style="padding:12px;text-align:center;border:1px solid #E2E8F0;">'
        f'<div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#64748B;font-weight:700;">{k}</div>'
        f'<div style="font-size:22px;font-weight:800;color:{colors[k]};">{v["count"]}</div>'
        f'<div style="font-size:12px;color:#0B3B5C;">${v["amount"]:.2f}</div></td>'
        for k, v in d["totals"].items()
    )
    rows = ""
    for k in ("failed", "refunded", "paid", "pending"):
        for i in d["items"][k]:
            rows += (f'<tr><td style="padding:6px 8px;color:{colors[k]};font-weight:700;">{k}</td>'
                     f'<td style="padding:6px 8px;font-family:monospace;">{i["booking_id"]}</td>'
                     f'<td style="padding:6px 8px;">{i["provider"]}</td>'
                     f'<td style="padding:6px 8px;text-align:right;">${i["amount"]:.2f}</td></tr>')
    if not rows:
        rows = '<tr><td colspan="4" style="padding:12px;color:#64748B;">No payment activity in the last 24 hours.</td></tr>'
    alert = ""
    if d["totals"]["failed"]["count"]:
        alert = (f'<p style="background:#FEE2E2;color:#991B1B;padding:10px 14px;border-radius:8px;font-size:13px;">'
                 f'{d["totals"]["failed"]["count"]} payment(s) failed today — retry links were emailed to guests.</p>')
    return f"""<!DOCTYPE html><html><body style="margin:0;background:#F3F4F6;">
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
<div style="background:#0B3B5C;color:#fff;padding:24px 28px;">
<div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#D4A94A;font-weight:800;">Nightly payment digest</div>
<h1 style="font-family:Georgia,serif;margin:8px 0 0;font-size:22px;">{day_label}</h1></div>
<div style="padding:20px 28px;">{alert}
<table style="width:100%;border-collapse:collapse;"><tr>{tiles}</tr></table>
<table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:13px;">
<tr style="background:#F8FAFC;color:#64748B;text-align:left;"><th style="padding:6px 8px;">Status</th><th style="padding:6px 8px;">Booking</th><th style="padding:6px 8px;">Provider</th><th style="padding:6px 8px;text-align:right;">Amount</th></tr>
{rows}</table>
<p style="font-size:12px;color:#64748B;margin-top:18px;">Open the dashboard: {_site_url()}/admin</p>
</div></div></body></html>"""


def _sms_text(d: dict, day_label: str) -> str:
    t = d["totals"]
    return (f"Rox payments {day_label}: {t['paid']['count']} paid ${t['paid']['amount']:.0f} · "
            f"{t['failed']['count']} failed · {t['refunded']['count']} refunded ${t['refunded']['amount']:.0f} · "
            f"{t['pending']['count']} pending")


async def send_digest() -> dict:
    from notifications import send_email, send_owner_sms  # noqa: PLC0415
    d = await build_digest()
    day_label = datetime.now(NASSAU).strftime("%a %b %-d")
    html = _render_html(d, day_label)
    sms = _sms_text(d, day_label)
    t = d["totals"]
    subject = (f"Rox payments {day_label} · {t['paid']['count']} paid · "
               f"{t['failed']['count']} failed · {t['refunded']['count']} refunded")
    emails = []
    for e in _admin_emails():
        r = await asyncio.to_thread(send_email, e, subject, html, sms, category="admin")
        emails.append({"to": e, "sent": bool(r.get("sent")), "error": r.get("error")})
    sms_report = await asyncio.to_thread(send_owner_sms, sms, "payment_digest", True)
    result = {"totals": t, "emails": emails, "sms_sent": bool(sms_report.get("sent")),
              "sms_error": sms_report.get("error")}
    await _db.cron_runs.update_one(
        {"kind": "payment_digest"},
        {"$set": {"last_run_at": _now_iso(), "last_result": result}},
        upsert=True,
    )
    return result


async def digest_loop() -> None:
    while True:
        try:
            now_local = datetime.now(NASSAU)
            today = now_local.date().isoformat()
            cfg = await _db.site_config.find_one({"_id": "main"}) or {}
            if now_local.hour >= DIGEST_HOUR_LOCAL and cfg.get("payment_digest_last_date") != today:
                await _db.site_config.update_one(
                    {"_id": "main"}, {"$set": {"payment_digest_last_date": today}}, upsert=True)
                await send_digest()
        except Exception as e:  # noqa: BLE001
            log.warning("payment digest tick err: %s", e)
        await asyncio.sleep(300)


@router.get("/admin/payment-digest/preview")
async def admin_payment_digest_preview(_: str = Depends(_admin_dep)):
    d = await build_digest()
    run = await _db.cron_runs.find_one({"kind": "payment_digest"}, {"_id": 0}) or {}
    return {**d, "recipients": _admin_emails(), "last_run": run,
            "schedule": "Daily at 9:00 PM Nassau time"}


@router.post("/admin/payment-digest/send-now")
async def admin_payment_digest_send_now(_: str = Depends(_admin_dep)):
    if not _admin_emails():
        raise HTTPException(400, "ADMIN_EMAIL is not configured")
    return await send_digest()
