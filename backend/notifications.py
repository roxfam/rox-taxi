"""Email + SMS notifications. No-op if credentials aren't configured yet.

Every send helper returns a delivery-status dict so the caller can persist it
against the booking (used for admin dashboard delivery badges):

    {"sent": bool, "provider": str, "error": Optional[str]}
"""
import hmac
import hashlib
import logging
import os
from typing import Optional

try:
    from zoneinfo import ZoneInfo  # py3.9+
    _NASSAU_TZ = ZoneInfo("America/Nassau")
except Exception:  # noqa: BLE001
    _NASSAU_TZ = None

from secrets_store import get_secret

logger = logging.getLogger(__name__)


# ── Owner SMS registry + quiet-hours state (populated by server.py) ─────────
_owner_sms_db = None  # motor db handle for queue writes
_owner_recipients_cache: list = []  # list of {phone, label, subscriptions, quiet_hours}
_owner_priority_kinds: set = {"payment"}  # default: payment always breaks quiet-hours


def configure_owner_sms(db) -> None:
    """Called by server.py at startup so send_owner_sms can enqueue
    quiet-hours SMS to Mongo. Safe to call multiple times."""
    global _owner_sms_db
    _owner_sms_db = db


def set_owner_recipients_cache(recipients: list) -> None:
    """Replace the cached owner-SMS recipient registry. Called every N
    seconds by server.py's async refresher after reading site_config.
    Empty list ⇒ fall back to ADMIN_SMS_NUMBER env var."""
    global _owner_recipients_cache
    if isinstance(recipients, list):
        _owner_recipients_cache = recipients


def set_owner_priority_kinds(kinds) -> None:
    """Update which event kinds should ALWAYS break through quiet-hours
    regardless of per-recipient preference. Falls back to the default
    `{"payment"}` set when passed an empty iterable."""
    global _owner_priority_kinds
    try:
        cleaned = {str(k).strip() for k in (kinds or []) if str(k).strip()}
    except Exception:  # noqa: BLE001
        cleaned = set()
    _owner_priority_kinds = cleaned or {"payment"}


_high_value_threshold: float = 500.0  # bookings ≥ this bypass quiet-hours


def set_high_value_threshold(usd: float) -> None:
    """Set the USD threshold above which a booking is auto-promoted to
    priority — big trips wake you up even if `booking` isn't a priority
    kind. Anything ≤ 0 disables the override entirely."""
    global _high_value_threshold
    try:
        _high_value_threshold = float(usd)
    except Exception:  # noqa: BLE001
        _high_value_threshold = 500.0


def get_high_value_threshold() -> float:
    return _high_value_threshold


def _is_priority_kind(kind: Optional[str]) -> bool:
    """True when this event kind breaks through quiet-hours for every
    recipient, regardless of their `quiet_hours` preference."""
    return bool(kind and kind in _owner_priority_kinds)


def _in_owner_quiet_hours(start: int = 22, end: int = 4) -> bool:
    """22:00-04:00 America/Nassau by default. When start > end the window
    wraps midnight (22-23 OR 00-03). Returns False if zoneinfo not
    available so we never silently drop SMS."""
    if _NASSAU_TZ is None:
        return False
    from datetime import datetime as _dt
    hr = _dt.now(_NASSAU_TZ).hour
    if start <= end:
        return start <= hr < end
    return hr >= start or hr < end


def _fmt_money(n: float) -> str:
    return f"${n:,.2f}"


def _booking_summary_text(b: dict) -> str:
    return (
        f"Booking {b['id']}\n"
        f"Service: {b['item_name']}\n"
        f"Date: {b['booking_date']}\n"
        f"Guest: {b['customer_name']}\n"
        f"Total: {_fmt_money(b.get('total', 0))}\n"
        f"Track: https://roxtaxi.com/track?id={b['id']}"
    )


def _sender_for_category(category: Optional[str]) -> Optional[str]:
    """Resolve the From: address for a given email category.

    Categories:
      - "confirmation" — booking confirmations, reminders, paid receipts
      - "quotes"       — custom quote requests + replies
      - "info"         — contact form, group inquiries, general info

    Each maps to EMAIL_FROM_<CATEGORY> (via secrets_store). Returns None when
    unset so callers fall back to SENDGRID_FROM_EMAIL / SMTP_FROM.
    """
    if not category:
        return None
    val = (get_secret(f"EMAIL_FROM_{category.strip().upper()}", "") or "").strip()
    return val or None


def send_email(to_email: str, subject: str, html: str, text: Optional[str] = None,
               category: Optional[str] = None,
               attachments: Optional[list] = None) -> dict:
    """Send email via SendGrid if configured, otherwise fall back to plain SMTP.

    Args:
        category: optional routing hint — "confirmation", "quotes", "info".
            When set, the From: address is resolved from EMAIL_FROM_<CATEGORY>
            for both SendGrid and SMTP paths.
        attachments: optional list of dicts `{filename, content, mime_type}`
            where `content` is raw bytes. Attached to BOTH SendGrid and SMTP
            paths so invoice PDFs land in the guest's inbox offline-usable.

    Returns a status dict: {sent, provider, error}.
    """
    api_key = get_secret("SENDGRID_API_KEY", "").strip()
    sender_sg = _sender_for_category(category) or get_secret("SENDGRID_FROM_EMAIL", "").strip()
    attachments = attachments or []

    # 1) SendGrid path
    if api_key and sender_sg:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition
            import base64 as _b64
            message = Mail(from_email=sender_sg, to_emails=to_email, subject=subject, html_content=html, plain_text_content=text or "")
            for a in attachments:
                try:
                    att = Attachment(
                        FileContent(_b64.b64encode(a["content"]).decode()),
                        FileName(a.get("filename", "attachment")),
                        FileType(a.get("mime_type", "application/octet-stream")),
                        Disposition("attachment"),
                    )
                    message.add_attachment(att)
                except Exception as ex:  # noqa: BLE001
                    logger.warning("SendGrid attachment add failed: %s", ex)
            resp = SendGridAPIClient(api_key).send(message)
            if 200 <= resp.status_code < 300:
                return {"sent": True, "provider": "sendgrid", "error": None}
            return {"sent": False, "provider": "sendgrid", "error": f"SendGrid HTTP {resp.status_code}"}
        except Exception as e:  # noqa: BLE001
            logger.warning("SendGrid error: %s — falling back to SMTP", e)
            sendgrid_err = str(e)
    else:
        sendgrid_err = None

    # 2) Generic SMTP path (Namecheap Private Email, Zoho, Gmail, etc.)
    host = get_secret("SMTP_HOST", "").strip()
    port = int(get_secret("SMTP_PORT", "587") or 587)
    user = get_secret("SMTP_USER", "").strip()
    pw = get_secret("SMTP_PASSWORD", "").strip()
    desired_from = _sender_for_category(category) or get_secret("SMTP_FROM", "").strip() or user
    use_tls = (get_secret("SMTP_USE_TLS", "true") or "true").lower() == "true"
    if not (host and user and pw and desired_from):
        logger.info("Neither SendGrid nor SMTP configured; skipping email to %s", to_email)
        return {"sent": False, "provider": "none", "error": sendgrid_err or "Email not configured"}

    # ── Domain-mismatch guard ────────────────────────────────────────
    # Namecheap Private Email + most self-hosted SMTP servers reject any From:
    # header whose domain isn't owned by the authenticated mailbox. When the
    # admin has set a branded EMAIL_FROM_* / SMTP_FROM at a different domain
    # than SMTP_USER (e.g. From=confirmation@roxtaxi.com but the mailbox is
    # confirmation@roxtaxi242.com), we auto-fall back to sending FROM the
    # mailbox and set Reply-To to the branded address so guests replying
    # still land in the right inbox. Also adds a friendly display name.
    def _domain(a: str) -> str:
        return a.rsplit("@", 1)[-1].lower().strip(">").strip() if "@" in a else ""

    reply_to = None
    envelope_from = user  # what MAIL FROM sends at the SMTP protocol level
    header_from = desired_from
    if _domain(desired_from) != _domain(user):
        # branded sender lives on a different domain than the mailbox →
        # keep it as Reply-To, use the mailbox as the From header instead.
        reply_to = desired_from
        header_from = f"Rox Taxi Service & Tours <{user}>"
        envelope_from = user
        logger.info(
            "SMTP sender domain mismatch — sending FROM %s (mailbox), Reply-To %s",
            user, reply_to,
        )

    try:
        import smtplib, ssl
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.application import MIMEApplication

        # When attachments are present we need a "mixed" top-level so
        # Apple Mail / Gmail / Outlook all show the paperclip icon; the
        # text + html go inside a nested "alternative" part.
        if attachments:
            msg = MIMEMultipart("mixed")
            body = MIMEMultipart("alternative")
            if text:
                body.attach(MIMEText(text, "plain"))
            body.attach(MIMEText(html, "html"))
            msg.attach(body)
            for a in attachments:
                part = MIMEApplication(a["content"], _subtype=(a.get("mime_type", "application/octet-stream").split("/")[-1] or "octet-stream"))
                part.add_header("Content-Disposition", "attachment", filename=a.get("filename", "attachment"))
                msg.attach(part)
        else:
            msg = MIMEMultipart("alternative")
            if text:
                msg.attach(MIMEText(text, "plain"))
            msg.attach(MIMEText(html, "html"))
        msg["Subject"] = subject
        msg["From"] = header_from
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to

        if port == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as server:
                server.login(user, pw)
                server.sendmail(envelope_from, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                if use_tls:
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                server.login(user, pw)
                server.sendmail(envelope_from, [to_email], msg.as_string())
        logger.info("SMTP email sent to %s via %s", to_email, host)
        return {"sent": True, "provider": "smtp", "error": None}
    except Exception as e:  # noqa: BLE001
        logger.warning("SMTP error: %s", e)
        return {"sent": False, "provider": "smtp", "error": str(e)}


def send_sms(to_number: str, body: str) -> dict:
    sid = get_secret("TWILIO_ACCOUNT_SID", "").strip()
    token = get_secret("TWILIO_AUTH_TOKEN", "").strip()
    from_num = get_secret("TWILIO_FROM_NUMBER", "").strip()
    if not (sid and token and from_num):
        logger.info("Twilio not configured; skipping SMS to %s", to_number)
        return {"sent": False, "provider": "twilio", "error": "Twilio not configured"}
    try:
        from twilio.rest import Client
        client = Client(sid, token)
        client.messages.create(from_=from_num, to=to_number, body=body)
        return {"sent": True, "provider": "twilio", "error": None}
    except Exception as e:  # noqa: BLE001
        logger.warning("Twilio error: %s", e)
        return {"sent": False, "provider": "twilio", "error": str(e)}


def _owner_sms_recipients_resolved() -> list:
    """Return the effective recipient roster.

    Priority: `_owner_recipients_cache` (loaded from site_config) →
    ADMIN_SMS_NUMBER env fallback. Every entry is normalised into
    `{phone, label, subscriptions, quiet_hours}` so the rest of the
    dispatch code doesn't branch on config source."""
    if _owner_recipients_cache:
        out = []
        for r in _owner_recipients_cache:
            phone = (r.get("phone") or "").strip()
            if not phone:
                continue
            subs = r.get("subscriptions") or ["*"]
            if isinstance(subs, str):
                subs = [subs]
            out.append({
                "phone": phone,
                "label": (r.get("label") or "").strip() or phone,
                "subscriptions": subs,
                "quiet_hours": bool(r.get("quiet_hours", True)),
            })
        if out:
            return out
    # Env fallback — every number is treated as "all-events, quiet-hours-on".
    raw = (get_secret("ADMIN_SMS_NUMBER") or get_secret("WHATSAPP_NUMBER") or "").strip()
    seen: set = set()
    out: list = []
    for part in raw.split(","):
        n = part.strip()
        if not n or n in seen:
            continue
        seen.add(n)
        out.append({"phone": n, "label": n, "subscriptions": ["*"], "quiet_hours": True})
    return out


def _matches_subscription(recipient: dict, kind: Optional[str]) -> bool:
    """Wildcard-aware subscription filter. `["*"]` matches any kind;
    otherwise the kind must be in the list. Missing/unknown kind ⇒ True."""
    if not kind:
        return True
    subs = recipient.get("subscriptions") or ["*"]
    return "*" in subs or kind in subs


def _owner_sms_numbers() -> list:
    """Legacy helper — kept for callers that still expect a flat list of
    E.164 numbers. Prefer send_owner_sms(body, kind) for new code."""
    return [r["phone"] for r in _owner_sms_recipients_resolved()]


def send_owner_sms(body: str, kind: Optional[str] = None, force_priority: bool = False) -> dict:
    """Fan out an owner SMS respecting per-recipient subscriptions and
    quiet-hours. Returns an aggregated report:
      • `.sent`       — True if AT LEAST ONE recipient got a live SMS
      • `.provider`   — "twilio" (or "none" when unconfigured)
      • `.recipients` — per-recipient breakdown (`sent`/`queued`/`skipped`)
      • `.queued`     — count of recipients whose SMS was pushed to the
                        morning-digest queue instead of sent live

    Behaviour:
      1. Recipients whose subscriptions don't include `kind` get skipped.
      2. During Nassau quiet-hours (22:00-04:00) recipients that opted
         into quiet-hours are pushed to `owner_sms_queue` for the 5am
         digest drain instead of receiving a live SMS.
      3. Everyone else gets the SMS immediately via Twilio.
      4. `force_priority=True` short-circuits quiet-hours regardless of
         `kind` — used by high-value bookings (see `notify_owner_booking_created`).
    """
    recipients = _owner_sms_recipients_resolved()
    if not recipients:
        return {"sent": False, "provider": "none",
                "error": "No owner SMS recipients configured",
                "recipients": [], "queued": 0}

    quiet_now = _in_owner_quiet_hours()
    priority = force_priority or _is_priority_kind(kind)
    report: list = []
    any_sent = False
    queued_count = 0
    errors: list = []

    for r in recipients:
        phone = r["phone"]
        if not _matches_subscription(r, kind):
            report.append({"to": phone, "label": r.get("label", phone),
                           "sent": False, "queued": False,
                           "skipped": True, "reason": f"not subscribed to '{kind}'"})
            continue
        if quiet_now and r.get("quiet_hours", True) and not priority:
            # Enqueue for the morning digest. Motor 3.x returns a Future
            # for collection methods, so we wrap in a coroutine before
            # scheduling as a task. During quiet hours we DO NOT fall
            # through to live send if enqueue fails — the whole point of
            # quiet hours is silence.
            queued = False
            if _owner_sms_db is not None:
                try:
                    from datetime import datetime as _dt, timezone as _tz
                    import asyncio as _aio
                    doc = {
                        "phone": phone,
                        "label": r.get("label", phone),
                        "kind": kind or "activity",
                        "body": body,
                        "queued_at": _dt.now(_tz.utc).isoformat(),
                        "sent_at": None,
                    }

                    async def _enqueue(d=doc):
                        await _owner_sms_db.owner_sms_queue.insert_one(d)

                    _aio.create_task(_enqueue())
                    queued = True
                    queued_count += 1
                except Exception as ex:  # noqa: BLE001
                    logger.warning("owner_sms_queue enqueue err: %s", ex)
            report.append({"to": phone, "label": r.get("label", phone),
                           "sent": False, "queued": queued,
                           "reason": "quiet_hours" if queued else "quiet_hours_enqueue_failed"})
            continue
        # Live send
        res = send_sms(phone, body)
        entry = {"to": phone, "label": r.get("label", phone),
                 "queued": False, **res}
        report.append(entry)
        if res.get("sent"):
            any_sent = True
        elif res.get("error"):
            errors.append(f"{phone}: {res['error']}")

    return {
        "sent": any_sent,
        "provider": "twilio",
        "error": None if any_sent or queued_count else ("; ".join(errors) or "all recipients failed"),
        "recipients": report,
        "queued": queued_count,
        "quiet_hours_active": quiet_now,
        "priority_override": priority,
    }


def _booking_details_for_owner(booking: dict) -> str:
    """Build a rich SMS body with every field the driver/owner needs to
    dispatch the ride: route, pickup/dropoff, passengers, luggage, days,
    additional drivers, extra fees, notes. Kept under ~4 SMS segments."""
    lines = [
        f"Service : {booking.get('item_name','')}",
        f"Type    : {(booking.get('service_type') or '').upper()}",
        f"Date    : {booking.get('booking_date','')}",
        f"Guest   : {booking.get('customer_name','')}",
        f"Phone   : {booking.get('customer_phone','')}",
        f"Email   : {booking.get('customer_email','')}",
        f"Pax     : {booking.get('passengers',1)}",
    ]
    if booking.get("pickup_location"):
        lines.append(f"Pickup  : {booking['pickup_location']}")
    if booking.get("dropoff_location"):
        lines.append(f"Dropoff : {booking['dropoff_location']}")
    if booking.get("service_type") == "rental":
        lines.append(f"Days    : {booking.get('days',1)}")
        if booking.get("additional_drivers"):
            lines.append(f"Drivers+: {booking['additional_drivers']} (+${booking.get('additional_driver_fee',0):.0f})")
        if booking.get("deposit_amount"):
            lines.append(f"Deposit : ${booking['deposit_amount']:.0f} (refundable)")
    if booking.get("service_type") == "taxi":
        if booking.get("extra_luggage"):
            lines.append(f"Bags+   : {booking['extra_luggage']} (+${booking.get('luggage_fee',0):.0f})")
        if booking.get("passenger_fee"):
            lines.append(f"Pax fee : +${booking['passenger_fee']:.0f}")
    if booking.get("notes"):
        note = str(booking["notes"])[:120]
        lines.append(f"Notes   : {note}")
    lines.append(f"Total   : {_fmt_money(booking.get('total',0))}")
    lines.append(f"Pay via : {(booking.get('payment_method') or '?').upper()}")
    return "\n".join(lines)


def notify_owner_activity(kind: str, sms_body: str, email_subject: Optional[str] = None,
                          email_html: Optional[str] = None) -> dict:
    """Fire-and-forget owner SMS + optional email for lightweight site
    activity events (signups, gallery submissions, group inquiries,
    referral conversions, etc.). Kept small and dependency-free so any
    endpoint can drop it in without pulling in the full booking-notify
    scaffolding. Returns a delivery report.

    Never raises — callers wrap in their own try/except and never let a
    notification failure block the user response.
    """
    owner_email = (get_secret("ADMIN_EMAIL") or "").strip()
    report = {"kind": kind,
              "sms": {"sent": False, "provider": "none", "error": None},
              "email": {"sent": False, "provider": "none", "error": None}}
    report["sms"].update(send_owner_sms(sms_body[:600], kind=kind or "activity"))
    if owner_email and email_subject and email_html:
        report["email"].update(send_email(owner_email, email_subject, email_html, sms_body, category="admin"))
    return report


def notify_guest_review_followup(booking: dict, review_url: str,
                                   prefs: Optional[dict] = None) -> dict:
    """24-48h after a completed trip, nudge the guest with a dedicated
    "how was it?" SMS + email that asks for a Google review. Fires for
    EVERY completed booking (not just 5-star raters), so guests who never
    tapped the in-app rating link still get asked. Idempotent via
    `review_followup_sent_at` on the booking doc.
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False

    report = {
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "sms":   {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
    }

    who = (booking.get("customer_name") or "there").split(" ")[0]
    trip = booking.get("item_name") or "your trip with us"
    driver = booking.get("driver_name") or booking.get("assigned_driver") or "the team"
    bid = booking.get("id", "")

    subject = f"How was {trip}, {who}? ⭐"
    text = (
        f"Hi {who},\n\n"
        f"Hope you had a great time on {trip} yesterday.\n\n"
        f"If {driver} looked after you well, would you take 30 seconds to\n"
        f"share it on Google? Public reviews are the single biggest thing\n"
        f"that helps our small Bahamian business:\n"
        f"{review_url}\n\n"
        f"If something fell short, just reply to this email — I read every\n"
        f"one personally and will make it right.\n\n"
        f"Cheers,\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:700;">Hope you had a great trip</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:28px;line-height:1.15;">How was {trip}, {who}?</h1>
      <p style="color:#64748B;font-size:15px;margin:14px 0 0;line-height:1.6;">
        Thanks for riding with us. If <strong>{driver}</strong> looked after you well,
        would you take 30 seconds to share it on Google? Public reviews are the single
        biggest thing that helps a small Bahamian operator like us.
      </p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:28px;margin-top:22px;text-align:center;">
        <div style="font-size:36px;letter-spacing:10px;color:#FBBC05;line-height:1;">★ ★ ★ ★ ★</div>
        <a href="{review_url}" style="display:inline-block;background:#4285F4;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;font-size:15px;margin-top:16px;">Leave a Google review →</a>
        <p style="color:#94a3b8;font-size:11px;margin-top:12px;">One tap · opens Google Maps</p>
      </div>
      <div style="background:#FFF7E6;border:1px solid #F5DFA1;border-radius:14px;padding:16px;margin-top:18px;">
        <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#A88235;font-weight:700;">Something fall short?</div>
        <p style="color:#0B3B5C;font-size:13.5px;margin:6px 0 0;line-height:1.6;">
          Just reply to this email — I read every one personally and will make it right.
        </p>
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Booking {bid} · Rox Taxi Service &amp; Tours · Nassau</p>
    </div>
    """

    if email_enabled and booking.get("customer_email"):
        result = send_email(booking["customer_email"], subject, html, text, category="confirmation")
        report["email"].update(result)
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        sms = (
            f"Rox Taxi: hope {trip} was great, {who}! If {driver} did well, "
            f"would you share on Google (30 sec)? {review_url} · Reply here if anything fell short."
        )
        result = send_sms(booking["customer_phone"], sms)
        report["sms"].update(result)
    else:
        report["sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    return report


def notify_guest_google_review_prompt(booking: dict, review_url: str,
                                       prefs: Optional[dict] = None) -> dict:
    """After a 5★ in-app rating, follow up with a "please share on Google"
    SMS + email so authentic reviews keep flowing. Idempotency stamp
    lives on the booking (`google_review_prompt_sent_at`) — this
    function itself is safe to call multiple times, it just re-sends.
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False

    report = {
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "sms":   {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
    }

    who = (booking.get("customer_name") or "there").split(" ")[0]
    driver = booking.get("driver_name") or booking.get("assigned_driver") or "your Rox driver"

    subject = f"⭐ Would you share that on Google, {who}? — {booking['id']}"
    text = (
        f"Hi {who},\n\n"
        f"Thanks for the 5-star rating for {driver} — it made our day.\n\n"
        f"Would you take 30 seconds to post it on Google? It's the single "
        f"biggest thing that helps our small Bahamian business:\n"
        f"{review_url}\n\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:700;">Thank you</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:26px;">You just made our day, {who} ⭐</h1>
      <p style="color:#64748B;font-size:14px;margin-top:12px;">
        Thanks for the 5-star rating for <strong>{driver}</strong>. If you
        have 30 seconds, would you post it on Google? A public review is the
        single biggest thing that helps our small Bahamian business earn the
        trust of the next family that lands at LPIA.
      </p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-top:20px;text-align:center;">
        <div style="font-size:32px;letter-spacing:8px;color:#FBBC05;">★ ★ ★ ★ ★</div>
        <a href="{review_url}" style="display:inline-block;background:#4285F4;color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;font-size:14px;margin-top:14px;">Share on Google →</a>
        <p style="color:#94a3b8;font-size:11px;margin-top:14px;">Opens Google Maps · one-tap 5-star form</p>
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Booking {booking['id']} · Rox Taxi Service &amp; Tours · Nassau</p>
    </div>
    """

    if email_enabled and booking.get("customer_email"):
        result = send_email(booking["customer_email"], subject, html, text, category="confirmation")
        report["email"].update(result)
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        sms = (
            f"Rox: ⭐ Thanks for the 5★ for {driver}! Would you share on Google (30 sec)? "
            f"{review_url}"
        )
        result = send_sms(booking["customer_phone"], sms)
        report["sms"].update(result)
    else:
        report["sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    return report


def notify_guest_trip_complete(booking: dict, prefs: Optional[dict] = None,
                                rating_link: str = "", tip_link: str = "") -> dict:
    """Fires when the driver marks the ride `completed`.

    Sends the guest a "How was it?" SMS + email with a 1-tap rating
    link and a driver tip top-up prompt while the trip is still fresh.
    Idempotency lives on the caller.
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False

    report = {
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "sms":   {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
    }

    who = (booking.get("customer_name") or "there").split(" ")[0]
    driver = booking.get("driver_name") or booking.get("assigned_driver") or "your driver"
    item = booking.get("item_name") or "your Rox ride"

    subject = f"🎉 How was your Rox ride? — {booking['id']}"
    text = (
        f"Hi {who},\n\n"
        f"You just wrapped up {item} with {driver}. Thanks for riding with Rox!\n\n"
        f"Rate the trip in one tap: {rating_link}\n"
        f"Bump {driver}'s tip: {tip_link}\n\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:700;">Trip complete</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:26px;">How was your ride, {who}? 🎉</h1>
      <p style="color:#64748B;font-size:14px;margin-top:12px;">
        You just wrapped up <strong>{item}</strong> with <strong>{driver}</strong>. Thanks for riding with Rox — a quick tap tells us how it went.
      </p>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-top:20px;text-align:center;">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#64748B;font-weight:700;">Rate this ride</div>
        <div style="font-size:32px;margin:12px 0 4px;letter-spacing:6px;color:#D4A94A;">☆ ☆ ☆ ☆ ☆</div>
        <a href="{rating_link}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;font-size:13px;margin-top:12px;">Tap to rate →</a>
      </div>

      <div style="background:#0B3B5C;color:#fff;border-radius:16px;padding:20px;margin-top:16px;text-align:center;">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#D4A94A;font-weight:700;">Loved {driver}?</div>
        <p style="color:#F8F5EC;font-size:14px;margin:10px 0 12px;">Add to their tip in one tap — drivers keep 100%.</p>
        <a href="{tip_link}" style="display:inline-block;background:#D4A94A;color:#0B3B5C;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;font-size:13px;">Bump the tip →</a>
      </div>

      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Booking {booking['id']} · Rox Taxi Service &amp; Tours · Nassau</p>
    </div>
    """

    if email_enabled and booking.get("customer_email"):
        result = send_email(booking["customer_email"], subject, html, text, category="confirmation")
        report["email"].update(result)
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        sms = (
            f"Rox: 🎉 Thanks for riding with {driver}! Rate in 1 tap: {rating_link}"
            f" · Bump the tip: {tip_link}"
        )
        result = send_sms(booking["customer_phone"], sms)
        report["sms"].update(result)
    else:
        report["sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    return report


def notify_guest_picked_up(booking: dict, prefs: Optional[dict] = None) -> dict:
    """Fires the moment the driver scans the guest's QR at pickup.

    Sends the guest a "You're on your way" SMS + email so they know
    the driver has confirmed pickup and the trip is officially rolling.
    Idempotency lives on the caller (guarded by the `status` check in
    the /driver-checkin endpoint) — this function itself is safe to
    invoke multiple times, it just re-sends.
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False

    report = {
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "sms":   {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
    }

    who = booking.get("customer_name") or "there"
    pickup_time = booking.get("driver_confirmed_pickup_time") or booking.get("booking_time") or ""
    pickup_loc = booking.get("driver_confirmed_pickup_location") or booking.get("pickup_location") or ""
    driver = booking.get("driver_name") or booking.get("assigned_driver") or "Your Rox driver"

    subject = f"✅ You're on your way — Rox booking {booking['id']}"
    text = (
        f"Hi {who},\n\n"
        f"{driver} has confirmed your pickup{f' at {pickup_time}' if pickup_time else ''}"
        f"{f' from {pickup_loc}' if pickup_loc else ''}. You're officially rolling with Rox.\n\n"
        f"  Confirmation: {booking['id']}\n"
        f"  Service: {booking.get('item_name','')}\n\n"
        f"Track live: https://roxtaxi.com/track?id={booking['id']}\n"
        f"Anything urgent? WhatsApp us: https://wa.me/12424322587\n\n"
        f"Enjoy the ride,\n— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#059669;font-weight:700;">Pickup Confirmed</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:26px;">You're on your way, {who} 🚕</h1>
      <p style="color:#64748B;font-size:14px;margin-top:12px;">
        <strong>{driver}</strong> just scanned your pass{f' at <strong>{pickup_time}</strong>' if pickup_time else ''}. Your ride is officially underway.
      </p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;margin-top:20px;">
        <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#64748B;">Confirmation</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:24px;color:#0B3B5C;margin-top:4px;">{booking['id']}</div>
        <div style="color:#0B3B5C;font-size:14px;margin-top:12px;"><strong>{booking.get('item_name','')}</strong></div>
        {f'<div style="color:#64748B;font-size:13px;margin-top:4px;">Pickup: {pickup_loc}</div>' if pickup_loc else ''}
      </div>
      <a href="https://roxtaxi.com/track?id={booking['id']}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;font-size:13px;margin-top:20px;">Track your ride →</a>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Enjoy the Bahamas — we're glad you're riding with us.</p>
    </div>
    """

    if email_enabled and booking.get("customer_email"):
        result = send_email(booking["customer_email"], subject, html, text, category="confirmation")
        report["email"].update(result)
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        sms = (
            f"Rox: ✅ {driver} confirmed your pickup"
            f"{f' at {pickup_time}' if pickup_time else ''}. Booking {booking['id']} is rolling. "
            f"Track: roxtaxi.com/track?id={booking['id']}"
        )
        result = send_sms(booking["customer_phone"], sms)
        report["sms"].update(result)
    else:
        report["sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    return report


def notify_owner_booking_created(booking: dict) -> dict:
    """Alert the business owner the moment a booking hits the DB.

    Sends BOTH channels the owner is set up for:
      • SMS  → `ADMIN_SMS_NUMBER` (fallback `WHATSAPP_NUMBER`)
      • Email → `ADMIN_EMAIL`

    Either channel is skipped silently if its credentials aren't set,
    so a partially-configured environment (SMS-only, or email-only)
    still works. Returns a combined report so admin can see which
    channel actually landed.
    """
    owner_email = (get_secret("ADMIN_EMAIL") or "").strip()

    report = {"sms": {"sent": False, "provider": "none", "error": None},
              "email": {"sent": False, "provider": "none", "error": None}}

    body_text = (
        f"🚕 NEW BOOKING {booking['id']}\n"
        f"{_booking_details_for_owner(booking)}\n"
        f"👉 roxtaxi.com/admin/bookings/{booking['id']}"
    )

    # Auto-promote high-value bookings to priority so the owner wakes up
    # even during quiet-hours. Threshold is admin-editable via
    # /admin/owner-sms/high-value-threshold and defaults to $500.
    total = 0.0
    try:
        total = float(booking.get("total") or 0)
    except Exception:  # noqa: BLE001
        total = 0.0
    threshold = get_high_value_threshold()
    force_priority = threshold > 0 and total >= threshold
    if force_priority:
        body_text = f"💎 HIGH-VALUE {_fmt_money(total)} — " + body_text
    report["sms"].update(send_owner_sms(body_text, kind="booking", force_priority=force_priority))
    report["sms"]["high_value_override"] = force_priority

    if owner_email:
        subject = f"🚕 New booking {booking['id']} — {booking.get('customer_name','?')}"
        html = f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#FAF9F6;">
          <h2 style="font-family:Georgia,serif;color:#0B3B5C;margin:0 0 4px;">New booking</h2>
          <div style="font-family:'JetBrains Mono',monospace;font-size:22px;color:#0B3B5C;">{booking['id']}</div>
          <pre style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-top:16px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#334155;white-space:pre-wrap;">{_booking_details_for_owner(booking)}</pre>
          <a href="https://roxtaxi.com/admin/bookings/{booking['id']}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;margin-top:12px;font-weight:700;">Open in admin →</a>
        </div>
        """
        report["email"].update(send_email(owner_email, subject, html, body_text, category="admin"))
    else:
        report["email"]["error"] = "ADMIN_EMAIL not set"

    # Keep backwards-compat top-level keys for existing callers that
    # only read `sent`/`provider`.
    report["sent"] = bool(report["sms"].get("sent") or report["email"].get("sent"))
    report["provider"] = (
        f"{report['sms'].get('provider','')}+{report['email'].get('provider','')}"
    ).strip("+") or "none"
    return report


def notify_owner_payment_received(booking: dict, provider: str = "stripe") -> dict:
    """Alert the owner the moment a booking is marked paid.

    Fires from every payment path (Stripe webhook, PayPal capture, Zelle
    mark). Sends BOTH owner SMS and owner email so both records exist.
    """
    owner_email = (get_secret("ADMIN_EMAIL") or "").strip()

    report = {"sms": {"sent": False, "provider": "none", "error": None},
              "email": {"sent": False, "provider": "none", "error": None}}

    body_text = (
        f"💰 PAYMENT RECEIVED {_fmt_money(booking.get('total',0))} via {provider.upper()}\n"
        f"Booking  : {booking['id']}\n"
        f"{_booking_details_for_owner(booking)}\n"
        f"👉 roxtaxi.com/admin/bookings/{booking['id']}"
    )

    report["sms"].update(send_owner_sms(body_text, kind="payment"))

    if owner_email:
        subject = f"💰 Payment received · {_fmt_money(booking.get('total',0))} · {booking['id']}"
        html = f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#FAF9F6;">
          <h2 style="font-family:Georgia,serif;color:#0B3B5C;margin:0 0 4px;">Payment received</h2>
          <div style="color:#059669;font-size:22px;font-weight:700;margin-top:4px;">{_fmt_money(booking.get('total',0))} <span style="color:#64748B;font-size:14px;font-weight:400;">via {provider.upper()}</span></div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:18px;color:#0B3B5C;margin-top:8px;">{booking['id']}</div>
          <pre style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-top:16px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#334155;white-space:pre-wrap;">{_booking_details_for_owner(booking)}</pre>
          <a href="https://roxtaxi.com/admin/bookings/{booking['id']}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;margin-top:12px;font-weight:700;">Open in admin →</a>
        </div>
        """
        report["email"].update(send_email(owner_email, subject, html, body_text, category="admin"))
    else:
        report["email"]["error"] = "ADMIN_EMAIL not set"

    report["sent"] = bool(report["sms"].get("sent") or report["email"].get("sent"))
    report["provider"] = (
        f"{report['sms'].get('provider','')}+{report['email'].get('provider','')}"
    ).strip("+") or "none"
    return report


def notify_booking_received(booking: dict, prefs: Optional[dict] = None) -> dict:
    """Immediate acknowledgment email for bookings in `pending_payment` state.

    Sent as soon as the booking is created (before Stripe/PayPal completes) so
    the guest has proof we captured their request — including pickup location,
    date/time, and current status. Once payment settles the guest also gets
    the full confirmation email from notify_booking_confirmed().
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False
    report = {
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "sms":   {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
    }

    has_email_target = bool(email_enabled and booking.get("customer_email"))
    has_sms_target = bool(sms_enabled and booking.get("customer_phone"))
    if not has_email_target:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"
    if not has_sms_target:
        report["sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"
    if not (has_email_target or has_sms_target):
        return report

    pickup = booking.get("pickup_location") or "—"
    dropoff = booking.get("dropoff_location") or "—"
    status_label = (booking.get("status") or "pending").replace("_", " ").title()
    subject = f"We've got your booking {booking['id']} — awaiting payment"
    text = (
        f"Hi {booking.get('customer_name','')},\n\n"
        f"Thanks for booking with Rox Taxi — we've captured your request and it's now awaiting payment.\n\n"
        f"  Confirmation: {booking['id']}\n"
        f"  Status: {status_label}\n"
        f"  Service: {booking.get('item_name','')}\n"
        f"  Date & time: {booking.get('booking_date','')}\n"
        f"  Pickup: {pickup}\n"
        f"  Dropoff: {dropoff}\n"
        f"  Passengers: {booking.get('passengers', 1)}\n"
        f"  Total: {_fmt_money(booking.get('total', 0))}\n\n"
        f"Once payment is complete you'll receive a full confirmation. You can also finish paying anytime at\n"
        f"https://roxtaxi.com/pay?id={booking['id']}\n\n"
        f"Questions? WhatsApp us: https://wa.me/12424322587\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:0 0 8px;">Got it, {booking.get('customer_name','')} — awaiting payment.</h1>
      <p style="color:#64748B;">We've captured your booking request. Complete payment to lock it in.</p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-top:20px;">
        <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#64748B;">Confirmation</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:26px;color:#0B3B5C;margin-top:4px;">{booking['id']}</div>
        <div style="display:inline-block;margin-top:8px;padding:4px 10px;border-radius:999px;background:#FEF3C7;color:#92400E;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">{status_label}</div>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0;">
        <div><strong style="color:#0B3B5C;">{booking.get('item_name','')}</strong></div>
        <div style="color:#64748B;font-size:14px;margin-top:6px;">Date &amp; time: <strong>{booking.get('booking_date','')}</strong></div>
        <div style="color:#64748B;font-size:14px;">Pickup: <strong>{pickup}</strong></div>
        <div style="color:#64748B;font-size:14px;">Dropoff: {dropoff}</div>
        <div style="color:#64748B;font-size:14px;">Passengers: {booking.get('passengers', 1)}</div>
        <div style="color:#64748B;font-size:14px;margin-top:8px;">Total: <span style="color:#E86A3C;font-weight:600;">{_fmt_money(booking.get('total',0))}</span></div>
        <a href="https://roxtaxi.com/pay?id={booking['id']}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;margin-top:18px;font-size:14px;">Complete payment →</a>
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Rox Taxi Service &amp; Tours · Nassau, Bahamas · 24/7 dispatch</p>
    </div>
    """
    result = send_email(booking["customer_email"], subject, html, text, category="confirmation")
    report["email"].update(result)
    return report


def notify_refund_issued(
    booking: dict, *, amount: float, provider: Optional[str] = None,
    refund_id: Optional[str] = None, ok: bool = True,
    error: Optional[str] = None, prefs: Optional[dict] = None,
    reason: Optional[str] = None,
) -> dict:
    """Email the guest a refund receipt.

    When the provider API returned OK (`ok=True`) we tell the guest the
    money is on its way (5–10 business days). When it didn't, we still
    email them with a `manual refund within 2 business days` wording so
    there's no silence while admin processes it by hand.

    Optional `reason` surfaces on the receipt — admins can jot a short
    note (e.g. "Weather cancel", "Rate adjustment") that lands verbatim
    in both the audit trail and the guest's inbox.
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    report = {"email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled}}
    if not email_enabled or not booking.get("customer_email"):
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"
        return report

    bid = booking["id"]
    first = (booking.get("customer_name") or "there").split(" ")[0]
    provider_label = {
        "stripe": "your original credit card",
        "paypal": "your PayPal account",
    }.get((provider or "").lower(), "your original payment method")
    eta_line = (
        "You'll see it back on " + provider_label + " within 5–10 business days."
        if ok else
        "Our team will manually complete the refund to " + provider_label + " within 2 business days — "
        "we'll email you the moment it clears."
    )
    status_badge = (
        '<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#D1FAE5;color:#065F46;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">Refund sent</span>'
        if ok else
        '<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#FEF3C7;color:#92400E;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">Manual refund in progress</span>'
    )
    refund_id_html = (
        f'<div style="color:#64748B;font-size:13px;margin-top:4px;">Refund reference: <span style="font-family:\'JetBrains Mono\',monospace;">{refund_id}</span></div>'
        if refund_id else ""
    )
    _reason = (reason or "").strip()
    reason_html = (
        f'<div style="margin-top:14px;padding:12px 14px;background:#F8FAFC;border-left:3px solid #D4A94A;border-radius:6px;">'
        f'<div style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#64748B;font-weight:700;">Reason</div>'
        f'<div style="color:#0B3B5C;font-size:14px;margin-top:3px;">{_reason}</div>'
        f'</div>'
        if _reason else ""
    )
    reason_text = f"\nReason: {_reason}\n" if _reason else ""

    subject = (
        f"Refund of {_fmt_money(amount)} sent for booking {bid}"
        if ok else
        f"Refund of {_fmt_money(amount)} is on the way — booking {bid}"
    )
    text = (
        f"Hi {first},\n\n"
        f"We've " + ("issued" if ok else "scheduled") + f" a refund of {_fmt_money(amount)} for your Rox booking {bid}.\n"
        f"{eta_line}\n\n"
        + (f"Refund reference: {refund_id}\n\n" if refund_id else "")
        + reason_text
        + (f"Service: {booking.get('item_name','booking')}\n"
           f"Original total: {_fmt_money(booking.get('total',0))}\n\n")
        + "Questions? WhatsApp +1 (242) 432-2587 or reply to this email.\n"
        + "— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:800;">
        Refund notice
      </div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:26px;line-height:1.15;">
        Hi {first}, your refund of <span style="color:#059669;">{_fmt_money(amount)}</span> is sorted.
      </h1>
      <p style="color:#64748B;font-size:14px;margin:12px 0 0;">{eta_line}</p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:22px;margin-top:18px;">
        {status_badge}
        <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#64748B;font-weight:700;margin-top:12px;">Booking</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:20px;color:#0B3B5C;margin-top:4px;">{bid}</div>
        <div style="color:#64748B;font-size:13px;margin-top:4px;">{booking.get('item_name','booking')}</div>
        {refund_id_html}
        {reason_html}
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:16px 0;">
        <div style="display:flex;justify-content:space-between;color:#64748B;font-size:13px;">
          <span>Original total</span><span>{_fmt_money(booking.get('total',0))}</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:#059669;font-size:16px;font-weight:700;margin-top:4px;">
          <span>Refunded</span><span>{_fmt_money(amount)}</span>
        </div>
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:22px;">
        Rox Taxi Service &amp; Tours · Nassau, Bahamas · WhatsApp +1 (242) 432-2587
      </p>
    </div>
    """
    result = send_email(booking["customer_email"], subject, html, text, category="payment")
    report["email"].update(result)
    report["ok"] = ok
    report["amount"] = amount
    if error:
        report["provider_error"] = error
    return report


def notify_reschedule_confirmation(
    booking: dict, *, old_pickup_iso: str, new_pickup_iso: str,
    new_return_iso: Optional[str] = None, price_delta: float = 0.0,
    old_total: Optional[float] = None, new_total: Optional[float] = None,
    qr_url: str = "", pass_url: str = "",
    prefs: Optional[dict] = None,
) -> dict:
    """Email the guest a reschedule confirmation.

    Includes:
      - Old vs new pickup time (formatted)
      - Updated boarding-pass QR embedded + "Open full boarding pass" CTA
      - Itemised price-change line when the weekend surcharge is adjusted
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    report = {"sent": False, "provider": "none", "error": None, "enabled": email_enabled}
    if not email_enabled or not booking.get("customer_email"):
        report["error"] = "Disabled by admin" if not email_enabled else "No email address"
        return report

    def _fmt(iso: Optional[str]) -> str:
        if not iso:
            return "—"
        try:
            from datetime import datetime as _dt
            d = _dt.fromisoformat(iso.replace("Z", "+00:00"))
            return d.strftime("%A, %b %-d · %-I:%M %p")
        except Exception:  # noqa: BLE001
            return iso[:16]

    bid = booking["id"]
    first = (booking.get("customer_name") or "there").split(" ")[0]
    svc = booking.get("item_name") or booking.get("service_type") or "booking"
    old_s = _fmt(old_pickup_iso)
    new_s = _fmt(new_pickup_iso)
    return_s = _fmt(new_return_iso) if new_return_iso else ""

    # Price-delta line — only renders when there's a surcharge change.
    delta_html = ""
    delta_text = ""
    if price_delta and old_total is not None and new_total is not None:
        if price_delta > 0:
            tone = ("background:#FEF3C7;border-left:3px solid #D97706;",
                    "#92400E", "weekend surcharge added")
        else:
            tone = ("background:#D1FAE5;border-left:3px solid #059669;",
                    "#065F46", "weekend surcharge removed")
        sign = "+" if price_delta > 0 else "−"
        delta_html = (
            f'<div style="{tone[0]}border-radius:8px;padding:14px 16px;margin-top:14px;">'
            f'<div style="font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:{tone[1]};font-weight:800;">Price change · {tone[2]}</div>'
            f'<div style="margin-top:6px;color:#0B3B5C;font-size:13px;">'
            f'<div style="display:flex;justify-content:space-between;color:#64748B;">'
            f'<span>Previous total</span><span>{_fmt_money(old_total)}</span></div>'
            f'<div style="display:flex;justify-content:space-between;color:{tone[1]};font-weight:700;margin-top:2px;">'
            f'<span>Adjustment</span><span>{sign}{_fmt_money(abs(price_delta))}</span></div>'
            f'<div style="display:flex;justify-content:space-between;color:#0B3B5C;font-weight:800;margin-top:4px;padding-top:6px;border-top:1px solid rgba(0,0,0,.08);">'
            f'<span>New total</span><span>{_fmt_money(new_total)}</span></div>'
            f'</div></div>'
        )
        delta_text = (
            f"\nPrice adjustment: {sign}{_fmt_money(abs(price_delta))}\n"
            f"Previous total: {_fmt_money(old_total)}\n"
            f"New total:      {_fmt_money(new_total)}\n"
        )

    return_block = f'<div style="color:#64748B;font-size:13px;margin-top:4px;">Return: {return_s}</div>' if return_s else ""
    qr_block = (
        f'<div style="text-align:center;margin-top:18px;">'
        f'<div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#D4A94A;font-weight:800;">Updated pickup QR</div>'
        f'<img src="{qr_url}" alt="Pickup QR" style="width:160px;height:160px;margin:10px auto;display:block;border:1px solid #EFE7D5;padding:8px;background:#fff;border-radius:12px;" />'
        f'<a href="{pass_url}" style="display:inline-block;color:#0B3B5C;font-size:13px;font-weight:700;text-decoration:none;border-bottom:1px solid #0B3B5C;">Open full boarding pass →</a>'
        f'</div>'
        if qr_url else ""
    )

    subject = f"Rebooked — {new_s} · {bid}"
    text = (
        f"Hi {first},\n\n"
        f"Your Rox booking {bid} is rebooked.\n"
        f"Was: {old_s}\n"
        f"Now: {new_s}\n"
        + (f"Return: {return_s}\n" if return_s else "")
        + delta_text
        + f"\nService: {svc}\n"
        + f"Boarding pass: {pass_url}\n\n"
        + "— Rox Taxi Service & Tours · WhatsApp +1 (242) 432-2587"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:800;">
        Reschedule confirmed
      </div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:26px;line-height:1.15;">
        Hi {first}, your pickup is moved.
      </h1>
      <p style="color:#64748B;font-size:14px;margin:12px 0 0;">
        We've updated your Rox booking <strong>{bid}</strong>. Here's the new plan:
      </p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:22px;margin-top:16px;">
        <div style="display:flex;justify-content:space-between;color:#94A3B8;font-size:12px;text-decoration:line-through;">
          <span>Was</span><span>{old_s}</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:#0B3B5C;font-size:16px;font-weight:800;margin-top:6px;">
          <span>Now</span><span>{new_s}</span>
        </div>
        {return_block}
        <div style="color:#64748B;font-size:12px;margin-top:10px;">{svc}</div>
        {delta_html}
        {qr_block}
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:22px;">
        Rox Taxi Service &amp; Tours · Nassau, Bahamas · WhatsApp +1 (242) 432-2587
      </p>
    </div>
    """
    result = send_email(booking["customer_email"], subject, html, text, category="confirmation")
    report.update(result)
    return report


def notify_checkout_abandonment(intent: dict, *, resume_url: str) -> dict:
    """Fire a ONE-time branded nudge email 30 min after a guest hit step 2
    of the booking modal but didn't finish paying. The `resume_url` opens
    `/resume-checkout` on the site which rehydrates the booking modal
    with their exact quote; valid for 24 hours.

    Palette matches the modernised checkout screen (navy hero, orange CTA,
    gold eyebrow) so the thread feels continuous — "you were here, come
    back to the exact page you left."
    """
    report = {"sent": False, "provider": "none", "error": None, "kind": "checkout_abandonment"}
    email = (intent.get("customer_email") or "").strip()
    if not email:
        report["error"] = "No email on intent"
        return report
    first = ((intent.get("customer_name") or "there").split(" ") or ["there"])[0]
    item = intent.get("item_name") or "your Rox booking"
    total = float(intent.get("total") or 0.0)
    pax_line = (f"{intent.get('pax')} guest{'s' if (intent.get('pax') or 0) != 1 else ''}"
                if intent.get("pax") else "")
    pre_date = intent.get("booking_date") or ""
    try:
        from datetime import datetime as _dt_cls  # noqa: PLC0415
        _dt = _dt_cls.fromisoformat(str(pre_date).replace("Z", "+00:00"))
        pre_date = _dt.strftime("%A, %b %-d · %-I:%M %p")
    except Exception:  # noqa: BLE001
        pass

    subject = f"Finish your Rox booking — {_fmt_money(total)} held for 24 hrs"
    text = (
        f"Hi {first},\n\n"
        f"You started a Rox booking for {item} and stepped away before paying.\n"
        f"Your quote of {_fmt_money(total)} is locked in for 24 hours.\n\n"
        f"Finish here: {resume_url}\n\n"
        f"— Rox Taxi Service & Tours · WhatsApp +1 (242) 432-2587"
    )
    html = f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"/><meta name="color-scheme" content="light dark"/>
    <style>
      @media (prefers-color-scheme: dark) {{
        .rox-canvas {{ background:#0b0f16 !important; }}
        .rox-outer  {{ background:#111827 !important; }}
        .rox-card   {{ background:#1F2937 !important; border-color:#374151 !important; }}
        .rox-sub    {{ color:#CBD5E1 !important; }}
        .rox-lb     {{ color:#94A3B8 !important; }}
        .rox-vl     {{ color:#F9FAFB !important; }}
      }}
    </style></head>
    <body class="rox-canvas" style="margin:0;padding:0;background:#F3F4F6;">
      <div class="rox-outer" style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;background:#FAF9F6;">
        <div style="background:linear-gradient(135deg,#0B3B5C,#132a4a);padding:32px;color:#fff;">
          <div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#D4A94A;font-weight:800;">
            Your quote is still live
          </div>
          <h1 style="font-family:Georgia,serif;color:#fff;margin:10px 0 4px;font-size:26px;line-height:1.15;">
            {first}, you're one tap from booked.
          </h1>
          <p class="rox-sub" style="color:rgba(255,255,255,.7);font-size:14px;margin:0;">
            We held your price for the next 24 hours. Come back and we'll take it from there.
          </p>
        </div>
        <div style="padding:22px 32px;">
          <div class="rox-card" style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:22px;">
            <div class="rox-lb" style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#64748B;font-weight:700;">Your trip</div>
            <div class="rox-vl" style="color:#0B3B5C;font-size:17px;margin-top:4px;font-weight:700;">{item}</div>
            {f'<div style="color:#64748B;font-size:13px;margin-top:6px;">{pre_date}{" · " + pax_line if pax_line else ""}</div>' if pre_date or pax_line else ''}
            <hr style="border:none;border-top:1px solid #E2E8F0;margin:16px 0;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <span class="rox-lb" style="color:#64748B;font-size:13px;">Total (VAT & fees in)</span>
              <span style="font-family:Georgia,serif;font-size:26px;color:#E86A3C;font-weight:800;">{_fmt_money(total)}</span>
            </div>
          </div>
        </div>
        <div style="padding:0 32px 24px;">
          <a href="{resume_url}" style="display:block;background:#E86A3C;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:14px 20px;border-radius:999px;font-size:14px;">
            Finish booking →
          </a>
          <p class="rox-lb" style="color:#64748B;font-size:11px;margin:10px 0 0;text-align:center;">
            Link expires in 24 hours. Need a change? Reply here or WhatsApp +1 (242) 432-2587.
          </p>
        </div>
      </div>
    </body></html>
    """
    result = send_email(email, subject, html, text, category="marketing")
    report.update(result)
    return report


def notify_new_admin_device(
    *, to_email: Optional[str], sub: str, device: str, ip: str,
    city: Optional[str], when_iso: str, revoke_url: str,
) -> dict:
    """Owner alert: a brand-new admin device just signed in.

    Fired by `routes/auth.py` when the login's device signature doesn't
    match any existing admin_sessions row for that admin (sub). Fans out
    an owner SMS via `send_owner_sms` AND an email so the owner can tap
    through to the Sessions Monitor and revoke if it wasn't them.
    """
    location = f"{city} · " if city else ""
    sms_body = (
        f"🔐 NEW ADMIN LOGIN: {device} ({location}IP {ip or 'unknown'}) "
        f"signed into {sub}. If this wasn't you, open /admin and revoke the session."
    )
    report = {"kind": "new_admin_device",
              "sms": {"sent": False, "provider": "none", "error": None},
              "email": {"sent": False, "provider": "none", "error": None}}
    try:
        report["sms"].update(send_owner_sms(sms_body[:600], kind="security", force_priority=True))
    except Exception as e:  # noqa: BLE001
        report["sms"]["error"] = str(e)
    if to_email:
        html = f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#FAF9F6;">
          <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#DC2626;font-weight:800;">
            New admin device
          </div>
          <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:24px;">
            Someone just signed into admin on a new device.
          </h1>
          <p style="color:#64748B;font-size:14px;margin:14px 0 0;">
            If this was you, you can safely ignore this email. If it wasn't,
            open the Sessions Monitor and revoke the session immediately.
          </p>
          <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:18px;margin-top:16px;">
            <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#64748B;font-weight:700;">Device</div>
            <div style="color:#0B3B5C;font-size:16px;margin-top:3px;font-weight:600;">{device}</div>
            <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#64748B;font-weight:700;margin-top:12px;">Location / IP</div>
            <div style="color:#0B3B5C;font-size:14px;margin-top:3px;">{city or 'Unknown city'} — {ip or 'unknown'}</div>
            <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#64748B;font-weight:700;margin-top:12px;">When</div>
            <div style="color:#0B3B5C;font-size:14px;margin-top:3px;">{when_iso}</div>
          </div>
          <a href="{revoke_url}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:999px;margin-top:16px;font-size:13px;">
            Review signed-in devices →
          </a>
          <p style="color:#94a3b8;font-size:11px;margin-top:22px;">
            Rox Taxi admin security · If you need help, reply to this email.
          </p>
        </div>
        """
        try:
            report["email"].update(send_email(
                to_email, "[Rox Admin] New device signed in", html,
                sms_body, category="admin",
            ))
        except Exception as e:  # noqa: BLE001
            report["email"]["error"] = str(e)
    return report




def notify_booking_confirmed(booking: dict, prefs: Optional[dict] = None) -> dict:
    """Send email + SMS on confirmed booking.

    Email HTML includes a `prefers-color-scheme: dark` block so Gmail
    for mobile, Apple Mail, and Outlook with dark mode render the
    navy hero + card as legible against a dark surround.

    Args:
        booking: booking dict.
        prefs: optional site config prefs {notify_email_enabled: bool, notify_sms_enabled: bool}.

    Returns:
        Delivery report: {
          "email": {"sent","provider","error","enabled"},
          "sms":   {"sent","provider","error","enabled"},
        }
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False

    report = {
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "sms": {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
    }

    subject = f"Booking {booking['id']} confirmed — Rox Taxi Service & Tours"
    body_text = _booking_summary_text(booking)
    _base = "https://roxtaxi.com"
    _pass_url = f"{_base}/booking/{booking['id']}/pass"
    _qr_img_url = f"{_base}/api/bookings/{booking['id']}/qr.png"
    _invoice_url = f"{_base}/api/bookings/{booking['id']}/receipt.pdf"
    # Invoice section is only shown AFTER payment settles — the
    # `payment_status == "paid"` gate avoids promising guests an invoice
    # for a Zelle booking that hasn't been reconciled yet.
    _paid = (booking.get("payment_status") or "").lower() == "paid"
    _invoice_html = (
        f"""
      <!-- Paid invoice — issued automatically once payment settles -->
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;margin-top:20px;">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#059669;font-weight:700;">Payment received ✓</div>
        <div style="color:#0B3B5C;font-size:18px;margin-top:4px;font-weight:700;">Your invoice is ready</div>
        <div style="color:#64748B;font-size:13px;margin-top:4px;">PDF receipt with the full line-item breakdown, VAT, and processing fee.</div>
        <a href="{_invoice_url}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:999px;font-size:13px;margin-top:12px;">Download invoice (PDF) →</a>
      </div>
        """
        if _paid else ""
    )
    # ─── Branded confirmation HTML (matches /checkout look-and-feel) ──
    # Navy header + orange CTA + gold "Rox" eyebrow — same palette as the
    # modernised checkout screen so the guest sees one coherent brand
    # thread from booking → inbox → pickup.
    _formatted_date = booking.get('booking_date', '')
    try:
        from datetime import datetime as _dt_cls  # noqa: PLC0415
        _dt = _dt_cls.fromisoformat(str(_formatted_date).replace('Z', '+00:00'))
        _formatted_date = _dt.strftime('%A, %b %-d · %-I:%M %p')
    except Exception:  # noqa: BLE001
        pass

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <style>
        /* ─── Dark-mode overrides ─────────────────────────────────
           Gmail/Apple Mail/Outlook that honour prefers-color-scheme
           swap the beige canvas + white card for near-black equivalents
           and lift text to high-contrast on-dark values. The navy hero
           and the gold accents are kept intact because they already
           contrast correctly on both themes. ────────────────────── */
        @media (prefers-color-scheme: dark) {{
          .rox-canvas    {{ background:#0b0f16 !important; }}
          .rox-outer     {{ background:#111827 !important; }}
          .rox-card      {{ background:#1F2937 !important; border-color:#374151 !important; }}
          .rox-h1-sub    {{ color:#CBD5E1 !important; }}
          .rox-detail-lb {{ color:#94A3B8 !important; }}
          .rox-detail-vl {{ color:#F9FAFB !important; }}
          .rox-foot      {{ color:#94A3B8 !important; }}
          .rox-foot-link {{ color:#D4A94A !important; }}
          .rox-pre-date  {{ color:#64748B !important; }}
          .rox-total-lb  {{ color:#94A3B8 !important; }}
          .rox-track-cta {{ background:#E86A3C !important; }}
          .rox-boarding-sub {{ color:#F8F5EC !important; }}
          .rox-invoice-card {{ background:#1F2937 !important; border-color:#374151 !important; }}
          .rox-invoice-title {{ color:#F9FAFB !important; }}
          .rox-invoice-sub   {{ color:#94A3B8 !important; }}
        }}
      </style>
    </head>
    <body class="rox-canvas" style="margin:0;padding:0;background:#F3F4F6;">
      <div class="rox-outer" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#FAF9F6;">
        <!-- Navy hero: eyebrow + headline + confirmation code -->
        <div style="background:linear-gradient(135deg,#0B3B5C 0%,#132a4a 100%);padding:36px 32px 44px;color:#fff;">
          <div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#D4A94A;font-weight:800;">
            Rox Taxi Service &amp; Tours
          </div>
          <h1 style="font-family:Georgia,serif;color:#fff;margin:12px 0 6px;font-size:28px;line-height:1.1;">
            You're booked, {booking.get('customer_name', 'friend').split(' ')[0]}.
          </h1>
          <p class="rox-h1-sub" style="color:rgba(255,255,255,.7);font-size:14px;margin:0;">
            Confirmation is final — here's everything you need for pickup.
          </p>
          <div style="margin-top:22px;padding:14px 18px;background:rgba(212,169,74,.12);border:1px solid rgba(212,169,74,.3);border-radius:12px;">
            <div style="font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:#D4A94A;font-weight:700;">Booking code</div>
            <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:24px;color:#fff;margin-top:4px;letter-spacing:.08em;">{booking['id']}</div>
          </div>
        </div>

        <!-- Trip details card -->
        <div style="padding:24px 32px;">
          <div class="rox-card" style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:22px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
              <div style="flex:1;">
                <div class="rox-detail-lb" style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#64748B;font-weight:700;">Service</div>
                <div class="rox-detail-vl" style="color:#0B3B5C;font-size:17px;margin-top:4px;font-weight:700;">{booking.get('item_name', 'Rox booking')}</div>
                <div style="color:#64748B;font-size:13px;margin-top:10px;">
                  <span class="rox-pre-date" style="color:#94A3B8;">Pickup · </span>{_formatted_date}
                </div>
              </div>
              <div style="text-align:right;">
                <div class="rox-total-lb" style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#64748B;font-weight:700;">Total</div>
                <div style="font-family:Georgia,serif;font-size:24px;color:#E86A3C;font-weight:700;margin-top:4px;">{_fmt_money(booking.get('total', 0))}</div>
              </div>
            </div>
          </div>
          {_invoice_html}
        </div>

        <!-- Boarding pass panel: navy w/ QR, gold "Save to phone" CTA -->
        <div style="padding:0 32px 24px;">
          <div style="background:#0B3B5C;color:#fff;border-radius:16px;padding:24px;text-align:center;">
            <div style="font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#D4A94A;font-weight:800;">
              Rox boarding pass
            </div>
            <div style="margin:16px auto 10px;background:#fff;border-radius:14px;padding:12px;display:inline-block;">
              <img src="{_qr_img_url}" width="180" height="180" alt="Pickup QR" style="display:block;border-radius:4px;" />
            </div>
            <p class="rox-boarding-sub" style="color:#F8F5EC;font-size:13px;margin:4px 0 0;max-width:380px;margin-left:auto;margin-right:auto;line-height:1.4;">
              Show this QR to your Rox driver at pickup — one scan and you're on your way.
            </p>
            <a href="{_pass_url}" style="display:inline-block;background:#D4A94A;color:#0B3B5C;text-decoration:none;font-weight:800;padding:12px 24px;border-radius:999px;font-size:13px;margin-top:16px;">
              Save to phone →
            </a>
          </div>
        </div>

        <!-- Orange CTA band — primary action matches checkout -->
        <div style="padding:0 32px 24px;">
          <a href="{_base}/track?id={booking['id']}" class="rox-track-cta" style="display:block;background:#E86A3C;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:14px 20px;border-radius:999px;font-size:14px;">
            Track your booking live →
          </a>
        </div>

        <!-- Footer: brand line + support -->
        <div style="padding:0 32px 36px;text-align:center;">
          <div style="font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:#94A3B8;font-weight:700;">
            Rox Taxi Service &amp; Tours
          </div>
          <p class="rox-foot" style="color:#64748B;font-size:12px;margin:8px 0 0;line-height:1.5;">
            Nassau · Paradise Island · The Bahamas<br/>
            Questions? WhatsApp <a class="rox-foot-link" style="color:#0B3B5C;font-weight:700;text-decoration:none;" href="https://wa.me/12424322587">+1 (242) 432-2587</a>
          </p>
        </div>
      </div>
    </body>
    </html>
    """

    if email_enabled and booking.get("customer_email"):
        # Attach the branded invoice PDF when the booking is paid so the
        # guest has a real receipt offline — no round-trip required.
        attachments = []
        if _paid:
            try:
                from pdf_utils import build_receipt_pdf
                pdf_bytes = build_receipt_pdf(booking)
                attachments.append({
                    "filename": f"Rox-Invoice-{booking['id']}.pdf",
                    "content": pdf_bytes,
                    "mime_type": "application/pdf",
                })
            except Exception as ex:  # noqa: BLE001
                logger.warning("invoice attachment build err: %s", ex)
        result = send_email(booking["customer_email"], subject, html, body_text,
                             category="confirmation", attachments=attachments or None)
        report["email"].update(result)
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        _tail = f" · Invoice: {_invoice_url}" if _paid else ""
        sms = (
            f"Rox Taxi: Booking {booking['id']} confirmed for {booking['item_name']} on {booking['booking_date']}. "
            f"Total {_fmt_money(booking.get('total',0))}. Pickup pass (driver scans this): {_pass_url}{_tail}"
        )
        result = send_sms(booking["customer_phone"], sms)
        report["sms"].update(result)
    else:
        report["sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    return report


def send_booking_reminder(booking: dict, prefs: Optional[dict] = None, driver_number: Optional[str] = None) -> dict:
    """Day-of-booking reminder — email + SMS to guest and SMS to the on-call
    driver / owner. Sent by the background loop in server.py once, when the
    trip is within the next 24 hours (idempotency via `reminder_sent_at`).

    Args:
        booking: the booking dict as stored in Mongo.
        prefs: site_config prefs {notify_email_enabled, notify_sms_enabled}.
        driver_number: E.164 number of the driver/dispatcher to alert (usually
            ADMIN_SMS_NUMBER). Set to None to skip driver SMS.

    Returns:
        {"email": {...}, "guest_sms": {...}, "driver_sms": {...}}
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False

    report = {
        "email":      {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "guest_sms":  {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
        "driver_sms": {"sent": False, "provider": "none", "error": None, "enabled": bool(driver_number)},
    }

    subject = f"Reminder — Your Rox Taxi booking {booking['id']} is coming up"
    text = (
        f"Hi {booking['customer_name']},\n\n"
        f"Just a reminder for your Rox Taxi booking:\n\n"
        f"  Confirmation: {booking['id']}\n"
        f"  Service: {booking['item_name']}\n"
        f"  Date: {booking['booking_date']}\n"
        f"  Pickup: {booking.get('pickup_location','—')}\n"
        f"  Dropoff: {booking.get('dropoff_location','—')}\n"
        f"  Passengers: {booking.get('passengers', 1)}\n\n"
        f"Track your ride live: https://roxtaxi.com/track?id={booking['id']}\n"
        f"Need to change something? WhatsApp us: https://wa.me/12424322587\n\n"
        f"Safe travels — see you soon.\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:0 0 8px;">See you soon!</h1>
      <p style="color:#64748B;">Hi {booking['customer_name']}, a quick reminder for your Rox Taxi trip.</p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-top:20px;">
        <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#64748B;">Confirmation</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:26px;color:#0B3B5C;margin-top:4px;">{booking['id']}</div>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0;">
        <div><strong style="color:#0B3B5C;">{booking['item_name']}</strong></div>
        <div style="color:#64748B;font-size:14px;margin-top:4px;">Date: <strong>{booking['booking_date']}</strong></div>
        <div style="color:#64748B;font-size:14px;">Pickup: {booking.get('pickup_location','—')}</div>
        <div style="color:#64748B;font-size:14px;">Dropoff: {booking.get('dropoff_location','—')}</div>
        <div style="color:#64748B;font-size:14px;">Passengers: {booking.get('passengers', 1)}</div>
      </div>
      <p style="color:#64748B;font-size:13px;margin-top:20px;">
        <a style="color:#D4A94A;font-weight:600;text-decoration:none;" href="https://roxtaxi.com/track?id={booking['id']}">Track live →</a>
        &nbsp;·&nbsp;
        <a style="color:#25D366;font-weight:600;text-decoration:none;" href="https://wa.me/12424322587">Message us on WhatsApp</a>
      </p>
      <p style="color:#94a3b8;font-size:11px;margin-top:28px;">Rox Taxi Service &amp; Tours · Nassau, Bahamas · 24/7 dispatch</p>
    </div>
    """

    if email_enabled and booking.get("customer_email"):
        result = send_email(booking["customer_email"], subject, html, text, category="confirmation")
        report["email"].update(result)
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        guest_sms = (
            f"Rox Taxi reminder: {booking['item_name']} on {booking['booking_date']}. "
            f"Confirm #{booking['id']}. Pickup: {booking.get('pickup_location','—')}. "
            f"Track: roxtaxi.com/track?id={booking['id']} · WhatsApp changes: wa.me/12424322587"
        )
        result = send_sms(booking["customer_phone"], guest_sms)
        report["guest_sms"].update(result)
    else:
        report["guest_sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    if driver_number:
        driver_sms = (
            f"🚕 DAY REMINDER · Booking {booking['id']}\n"
            f"{booking['booking_date']} · {booking['item_name']}\n"
            f"Guest: {booking['customer_name']} · {booking.get('customer_phone','')}\n"
            f"Pickup: {booking.get('pickup_location','—')}\n"
            f"Dropoff: {booking.get('dropoff_location','—')}\n"
            f"Pax: {booking.get('passengers', 1)}"
        )
        # Fan out to EVERY owner cellphone in ADMIN_SMS_NUMBER (not just
        # the single driver_number). `kind="booking"` honours each
        # recipient's subscription + quiet-hours preference.
        report["driver_sms"].update(send_owner_sms(driver_sms, kind="booking"))

    # Admin email digest — matches the fan-out above so the owner has a
    # written record of today's manifest, not just an SMS.
    owner_email = (get_secret("ADMIN_EMAIL") or "").strip()
    report.setdefault("admin_email", {"sent": False, "provider": "none", "error": None,
                                       "enabled": bool(owner_email)})
    if owner_email:
        admin_subject = f"🚕 Day-of reminder · Booking {booking['id']} · {booking['booking_date']}"
        admin_html = f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#FAF9F6;">
          <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#D4A94A;font-weight:700;">Day-of reminder</div>
          <h2 style="font-family:Georgia,serif;color:#0B3B5C;margin:4px 0 8px;">{booking['item_name']}</h2>
          <div style="font-family:'JetBrains Mono',monospace;font-size:18px;color:#0B3B5C;">{booking['id']}</div>
          <pre style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-top:16px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#334155;white-space:pre-wrap;">Guest:   {booking['customer_name']} · {booking.get('customer_phone','')}
Date:    {booking['booking_date']}
Pickup:  {booking.get('pickup_location','—')}
Dropoff: {booking.get('dropoff_location','—')}
Pax:     {booking.get('passengers', 1)}</pre>
          <a href="https://roxtaxi.com/admin/bookings/{booking['id']}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;margin-top:12px;font-weight:700;">Open in admin →</a>
        </div>
        """
        report["admin_email"].update(send_email(owner_email, admin_subject, admin_html, driver_sms if driver_number else "", category="admin"))

    return report


def send_return_leg_nudge(booking: dict, driver_number: Optional[str] = None, prefs: Optional[dict] = None) -> dict:
    """Fires 30 minutes before a round-trip taxi booking's return_time so
    the driver never misses the swing-back pickup AND the guest gets a
    light heads-up to start wrapping up. Two SMS legs — no email (this is
    time-sensitive, SMS-only).

    Skips cancellations, missing driver numbers, and any booking without
    both `round_trip=True` AND a `return_time` field. Guest SMS respects
    the admin's site-wide `notify_sms_enabled` toggle.

    Returns: {"kind": "return_leg_nudge",
              "driver_sms": {sent, provider, error, enabled},
              "guest_sms":  {sent, provider, error, enabled}}.
    """
    prefs = prefs or {}
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False
    guest_phone = booking.get("customer_phone") or ""
    report = {
        "kind": "return_leg_nudge",
        "driver_sms": {"sent": False, "provider": "none", "error": None, "enabled": bool(driver_number)},
        "guest_sms":  {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled and bool(guest_phone)},
    }

    return_time = str(booking.get("return_time") or "").strip()
    if not return_time:
        report["driver_sms"]["error"] = "No return_time on booking"
        report["guest_sms"]["error"]  = "No return_time on booking"
        return report

    # ── Driver leg — dispatch details, keeps the swing-back on time. ──
    if driver_number:
        driver_sms = (
            f"⏰ RETURN LEG in 30 min · Booking {booking['id']}\n"
            f"Return pickup: {return_time} today\n"
            f"Guest: {booking['customer_name']} · {guest_phone}\n"
            f"Was: {booking.get('dropoff_location','—')} → back to {booking.get('pickup_location','—')}\n"
            f"Pax: {booking.get('passengers', 1)}"
        )
        report["driver_sms"].update(send_sms(driver_number, driver_sms))
    else:
        report["driver_sms"]["error"] = "No driver number configured"

    # ── Guest leg — friendly heads-up, no dispatch noise. ──
    if sms_enabled and guest_phone:
        pickup = booking.get("pickup_location") or "the pickup spot"
        first_name = (booking.get("customer_name") or "").split(" ")[0] or "there"
        # Google Maps universal deep-link — one tap on iOS/Android/desktop
        # opens the pickup address in Maps. Uses the /?q= form because it
        # works even when Maps.app isn't installed (falls back to web).
        try:
            from urllib.parse import quote_plus as _qp
            maps_link = f"https://maps.google.com/?q={_qp(str(pickup))}"
        except Exception:  # noqa: BLE001
            maps_link = ""
        guest_sms = (
            f"Hi {first_name}! Your Rox driver is heading back for you 🌊 — "
            f"arriving in 30 min at {pickup} for the {return_time} pickup. "
            f"Booking #{booking['id']}."
        )
        if maps_link:
            guest_sms += f"\nMap the pickup: {maps_link}"
        guest_sms += "\nWhatsApp us: wa.me/12424322587"
        report["guest_sms"].update(send_sms(guest_phone, guest_sms))
    else:
        report["guest_sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    return report


def send_rental_return_reminder(
    booking: dict,
    return_date_iso: str,
    office_phone: str = "",
    prefs: Optional[dict] = None,
    driver_number: Optional[str] = None,
) -> dict:
    """Return-day reminder for a car rental — email + SMS to guest, SMS to
    the owner/driver. Includes the exact return date, the office phone for
    extensions, and a rebook link for a fresh rental.

    Args:
        booking: the rental booking doc.
        return_date_iso: computed return date (YYYY-MM-DD or ISO).
        office_phone: the office phone (E.164 or display string) shown in the
            body so the guest can call to extend. Defaults to WhatsApp only.
        prefs: {notify_email_enabled, notify_sms_enabled}.
        driver_number: E.164 dispatcher number to alert; None to skip.

    Returns: same shape as send_booking_reminder plus `kind`: "rental_return".
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False

    report = {
        "kind": "rental_return",
        "email":      {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "guest_sms":  {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
        "driver_sms": {"sent": False, "provider": "none", "error": None, "enabled": bool(driver_number)},
    }

    return_pretty = str(return_date_iso).split("T")[0]
    tel_href = "".join(ch for ch in (office_phone or "+12424322587") if ch.isdigit() or ch == "+")
    tel_display = office_phone or "+1 (242) 432-2587"

    subject = f"Return today — Rental {booking['id']} ({booking['item_name']})"
    text = (
        f"Hi {booking['customer_name']},\n\n"
        f"Your Rox car rental is due back today ({return_pretty}).\n\n"
        f"  Confirmation: {booking['id']}\n"
        f"  Vehicle: {booking['item_name']}\n"
        f"  Pickup date: {booking['booking_date']}\n"
        f"  Days: {booking.get('days', 1)}\n"
        f"  Return date: {return_pretty}\n\n"
        f"NEED MORE TIME?\n"
        f"Call the office at {tel_display} to extend your rental, or book a\n"
        f"fresh set of dates online at https://roxtaxi.com/rentals — walk-in\n"
        f"or WhatsApp changes are welcome up until return time.\n\n"
        f"Thanks for driving with Rox!\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:0 0 8px;">Return day today.</h1>
      <p style="color:#64748B;">Hi {booking['customer_name']}, your car rental is due back today.</p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-top:20px;">
        <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#64748B;">Confirmation</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:26px;color:#0B3B5C;margin-top:4px;">{booking['id']}</div>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0;">
        <div><strong style="color:#0B3B5C;">{booking['item_name']}</strong></div>
        <div style="color:#64748B;font-size:14px;margin-top:4px;">Pickup: <strong>{booking['booking_date']}</strong> · Days: <strong>{booking.get('days',1)}</strong></div>
        <div style="color:#E86A3C;font-size:15px;font-weight:600;margin-top:8px;">Return today: {return_pretty}</div>
      </div>
      <div style="margin-top:22px;background:#FFF7E6;border:1px solid #F5DFA1;border-radius:14px;padding:18px;">
        <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#A88235;font-weight:700;">Need more time?</div>
        <p style="color:#0B3B5C;font-size:14px;margin:6px 0 12px;">Call the office to extend your rental, or reserve a fresh set of dates online.</p>
        <a href="tel:{tel_href}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;font-size:13px;margin-right:8px;">Call {tel_display}</a>
        <a href="https://roxtaxi.com/rentals" style="display:inline-block;background:#D4A94A;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;font-size:13px;">Rebook new dates</a>
      </div>
      <p style="color:#64748B;font-size:13px;margin-top:20px;">
        Prefer chat? <a style="color:#25D366;font-weight:600;text-decoration:none;" href="https://wa.me/12424322587">WhatsApp us</a>.
      </p>
      <p style="color:#94a3b8;font-size:11px;margin-top:28px;">Rox Taxi Service &amp; Tours · Nassau, Bahamas · 24/7 dispatch</p>
    </div>
    """

    if email_enabled and booking.get("customer_email"):
        result = send_email(booking["customer_email"], subject, html, text, category="confirmation")
        report["email"].update(result)
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        guest_sms = (
            f"Rox Rental: Your {booking['item_name']} (#{booking['id']}) is due back TODAY {return_pretty}. "
            f"Need more time? Call {tel_display} or rebook: roxtaxi.com/rentals · WhatsApp: wa.me/12424322587"
        )
        result = send_sms(booking["customer_phone"], guest_sms)
        report["guest_sms"].update(result)
    else:
        report["guest_sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    if driver_number:
        driver_sms = (
            f"🔑 RENTAL RETURN · #{booking['id']}\n"
            f"Return: {return_pretty}\n"
            f"{booking['item_name']}\n"
            f"Guest: {booking['customer_name']} · {booking.get('customer_phone','')}\n"
            f"Days: {booking.get('days', 1)} · Deposit: {_fmt_money(booking.get('deposit_amount', 0))}"
        )
        result = send_sms(driver_number, driver_sms)
        report["driver_sms"].update(result)

    return report


def send_photo_share_nudge(booking: dict, prefs: Optional[dict] = None) -> dict:
    """Post-trip "share your photos" email nudge — fires ~24h after the trip.

    Goal: fill the /gallery + /cruise-groups-nassau "Recent group tours" strip
    with real customer photos instead of stock imagery. Email only (no SMS —
    a photo-upload ask over SMS feels spammy after the trip is done).

    Skips cancellations, missing email addresses, and when the admin has
    disabled email notifications globally.

    Returns: {"kind": "photo_nudge", "email": {sent, provider, error, enabled}}.
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    report = {
        "kind": "photo_nudge",
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
    }

    if not email_enabled:
        report["email"]["error"] = "Disabled by admin"
        return report
    if not booking.get("customer_email"):
        report["email"]["error"] = "No email address"
        return report

    first_name = (booking.get("customer_name") or "there").split(" ")[0]
    trip_name = booking.get("item_name") or "your Rox tour"
    subject = f"Got any photos from your {trip_name}? — Rox Taxi"

    gallery_url = "https://roxtaxi.com/gallery#submit"
    review_url = "https://g.page/r/roxtaxi/review"  # placeholder Google review shortlink

    text = (
        f"Hi {first_name},\n\n"
        f"Hope you had a great time on your {trip_name} with us.\n\n"
        f"If you snapped any shots on the tour, we'd love to feature them.\n"
        f"Send one over here (takes ~10 seconds):\n"
        f"{gallery_url}\n\n"
        f"Approved photos land on our public gallery and — if it's a group\n"
        f"shot — on the 'Recent group tours' strip that other travellers see\n"
        f"before they book. It's the quickest way to help another family\n"
        f"pick their perfect Nassau day.\n\n"
        f"Loved the trip? A quick Google review helps enormously:\n"
        f"{review_url}\n\n"
        f"Any questions or a next trip in mind — just reply to this email or\n"
        f"WhatsApp us at +1 (242) 432-2587.\n\n"
        f"Cheers,\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:700;">Thanks for riding with Rox</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:30px;line-height:1.1;">Got any photos from your trip?</h1>
      <p style="color:#64748B;font-size:15px;margin:12px 0 0;">Hi {first_name} — hope you had a great time on <strong style="color:#0B3B5C;">{trip_name}</strong>. If you snapped a few shots, we'd love to feature them.</p>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-top:22px;">
        <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#64748B;font-weight:700;">Share a photo</div>
        <p style="color:#0B3B5C;font-size:14px;margin:8px 0 16px;line-height:1.55;">
          Approved photos appear on our public <a href="https://roxtaxi.com/gallery" style="color:#0B3B5C;font-weight:600;">gallery</a>
          and — if it's a group shot — on the <em>Recent group tours</em> strip other travellers see before they book. Takes about ten seconds.
        </p>
        <a href="{gallery_url}" style="display:inline-block;background:#D4A94A;color:#0B192C;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px;font-size:14px;">Upload a photo →</a>
      </div>

      <div style="margin-top:22px;background:#FFF7E6;border:1px solid #F5DFA1;border-radius:14px;padding:18px;">
        <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#A88235;font-weight:700;">Loved the trip?</div>
        <p style="color:#0B3B5C;font-size:14px;margin:6px 0 12px;">A quick Google review helps small Bahamian operators like us more than you'd guess.</p>
        <a href="{review_url}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;font-size:13px;">Leave a Google review</a>
      </div>

      <p style="color:#64748B;font-size:13px;margin-top:22px;">
        Questions or a next trip in mind? Just reply to this email or <a style="color:#25D366;font-weight:600;text-decoration:none;" href="https://wa.me/12424322587">WhatsApp us</a>.
      </p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Rox Taxi Service &amp; Tours · Nassau, Bahamas · Booking #{booking.get('id','')}</p>
    </div>
    """

    result = send_email(booking["customer_email"], subject, html, text, category="confirmation")
    report["email"].update(result)
    return report


def send_featured_notification(submission: dict) -> dict:
    """Notify a guest that their submitted photo has just been pinned as
    featured across the site. Free virality — many guests share the link on
    their own socials once they see themselves featured.

    Email-only, best-effort. Returns delivery-status dict.
    """
    email = (submission or {}).get("submitter_email") or ""
    if not email:
        return {"sent": False, "provider": "none", "error": "No submitter email"}

    name = (submission.get("submitter_name") or "there").split(" ")[0]
    caption = (submission.get("caption") or "").strip()
    subject = "Your photo is now featured on Rox Taxi 🎉"

    groups_url = "https://roxtaxi.com/cruise-groups-nassau#recent-group-tours"
    gallery_url = "https://roxtaxi.com/gallery"

    text = (
        f"Hi {name},\n\n"
        f"Quick note — we just pinned your Nassau photo as a FEATURED shot on\n"
        f"the Rox Taxi & Tours site. It'll show up on our homepage, in the\n"
        f"Groups landing 'Recent group tours' strip, and on the main gallery.\n\n"
        f"See it live:\n"
        f"  {groups_url}\n\n"
        f"Feel free to share the link with friends who are planning a Nassau\n"
        f"trip — nothing sells a Bahamas day out like a real guest photo.\n\n"
        f"Thanks for sending it in — and if you're ever back on the island,\n"
        f"reply to this email and we'll set you up with a 10% welcome-back\n"
        f"discount on any tour.\n\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:700;">You're featured</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:30px;line-height:1.1;">Your photo is now featured 🎉</h1>
      <p style="color:#64748B;font-size:15px;margin:12px 0 0;">
        Hi {name} — we just pinned your Nassau shot as a <strong style="color:#0B3B5C;">Featured</strong> photo across the Rox Taxi site: homepage, Groups landing, and the main gallery.
      </p>
      {f'<blockquote style="margin:16px 0 0;padding:12px 16px;border-left:3px solid #D4A94A;color:#0B3B5C;font-style:italic;background:#fff;">&ldquo;{caption}&rdquo;</blockquote>' if caption else ''}

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-top:22px;">
        <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#64748B;font-weight:700;">See it live</div>
        <p style="color:#0B3B5C;font-size:14px;margin:8px 0 16px;line-height:1.55;">
          Your photo now leads our <em>Recent group tours</em> strip. Feel free to share the link with friends planning a Nassau trip.
        </p>
        <a href="{groups_url}" style="display:inline-block;background:#D4A94A;color:#0B192C;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px;font-size:14px;margin-right:8px;">View on Groups page →</a>
        <a href="{gallery_url}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;font-size:13px;">Full gallery</a>
      </div>

      <div style="margin-top:22px;background:#FFF7E6;border:1px solid #F5DFA1;border-radius:14px;padding:18px;">
        <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#A88235;font-weight:700;">Coming back?</div>
        <p style="color:#0B3B5C;font-size:14px;margin:6px 0 0;">
          Reply to this email and we'll set you up with a <strong>10% welcome-back discount</strong> on any tour.
        </p>
      </div>

      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Rox Taxi Service &amp; Tours · Nassau, Bahamas · <a href="https://wa.me/12424322587" style="color:#25D366;text-decoration:none;font-weight:600;">WhatsApp</a></p>
    </div>
    """

    return send_email(email, subject, html, text, category="confirmation")



def send_suspicious_login_alert(*, to_email: str, name: str, method: str,
                                city: str, country: str, device: str,
                                ip: str, when_iso: str,
                                sessions_url: str) -> dict:
    """Alert the account owner that a new session opened from a new city or a
    very different device/browser than their prior login. One-way "if this
    wasn't you, revoke it" nudge that links straight to the Active Sessions
    card so they can hit Sign Out Everywhere in two taps.

    Email-only (never SMS — a phishy-looking SMS about account activity is
    worse than no alert).
    """
    first = (name or "there").strip().split(" ")[0] or "there"
    loc_line = ", ".join([p for p in (city, country) if p]) or "an unfamiliar location"
    subject = f"New sign-in to your Rox Taxi account from {loc_line}"
    when_pretty = (when_iso or "").replace("T", " ").split(".")[0] + " UTC"
    text = (
        f"Hi {first},\n\n"
        f"We just spotted a new sign-in to your Rox Taxi account:\n\n"
        f"  When   : {when_pretty}\n"
        f"  From   : {loc_line}\n"
        f"  Device : {device}\n"
        f"  Method : {method}\n"
        f"  IP     : {ip}\n\n"
        f"If this was you — great, nothing to do.\n\n"
        f"If it wasn't, open your Active Sessions and hit \"Sign out everywhere\":\n"
        f"  {sessions_url}\n\n"
        f"Then set a new password from the login page. This alert only fires\n"
        f"when a new city or a very different device signs in — routine\n"
        f"sign-ins from your usual gear stay quiet.\n\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:700;">Account security</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:26px;line-height:1.15;">New sign-in from {_html_escape(loc_line)}</h1>
      <p style="color:#64748B;font-size:15px;margin:14px 0 0;">
        Hi {_html_escape(first)} — we just spotted a new sign-in to your Rox Taxi account. If this was you, you're all set. If it wasn't, revoke it below.
      </p>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;margin-top:20px;">
        <table style="width:100%;font-size:13px;color:#0B3B5C;border-collapse:collapse;">
          <tr><td style="color:#64748B;padding:4px 0;">When</td><td style="text-align:right;font-weight:600;">{_html_escape(when_pretty)}</td></tr>
          <tr><td style="color:#64748B;padding:4px 0;">From</td><td style="text-align:right;font-weight:600;">{_html_escape(loc_line)}</td></tr>
          <tr><td style="color:#64748B;padding:4px 0;">Device</td><td style="text-align:right;font-weight:600;">{_html_escape(device)}</td></tr>
          <tr><td style="color:#64748B;padding:4px 0;">Method</td><td style="text-align:right;font-weight:600;">{_html_escape(method)}</td></tr>
          <tr><td style="color:#64748B;padding:4px 0;">IP</td><td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;">{_html_escape(ip)}</td></tr>
        </table>
      </div>

      <div style="margin:22px 0 8px;">
        <a href="{_html_escape(sessions_url)}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px;font-size:14px;">Wasn't me — sign out everywhere</a>
      </div>
      <p style="color:#64748B;font-size:12px;margin:10px 0 22px;">
        Or paste this link: <span style="color:#0B3B5C;word-break:break-all;">{_html_escape(sessions_url)}</span>
      </p>
      <div style="border-top:1px solid #E2E8F0;padding-top:18px;color:#94a3b8;font-size:12px;">
        We only send this when a new city or a very different device signs in — routine sign-ins from your usual gear stay quiet. If in doubt, reset your password from the login page.
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:20px;">Rox Taxi Service &amp; Tours · Nassau, Bahamas</p>
    </div>
    """
    return send_email(to_email, subject, html, text, category="confirmation")


def _html_escape(s: str) -> str:
    import html as _h
    return _h.escape(str(s or ""), quote=True)


def send_new_country_signup_alert(*, to_email: str, new_user_email: str,
                                  new_user_name: str, country: str, city: str,
                                  region: str, ip: str, isp: str, when_iso: str,
                                  is_first_ever: bool = True,
                                  admin_url: str = "") -> dict:
    """Owner-only alert: a new customer just signed up from a country we've
    never seen a signup from before. Signal-first, low-noise (fires ONCE per
    country ever). Handy for spotting fraud waves from new regions before
    they generate chargebacks.
    """
    subject = f"[Rox Fraud Watch] First-ever signup from {country or 'Unknown'} — {new_user_email}"
    when_pretty = (when_iso or "").replace("T", " ").split(".")[0] + " UTC"
    loc = ", ".join([p for p in (city, region, country) if p]) or "an unknown location"
    text = (
        f"Heads-up — a brand-new account was just created from a country you\n"
        f"have never had a customer from before.\n\n"
        f"  When    : {when_pretty}\n"
        f"  Email   : {new_user_email}\n"
        f"  Name    : {new_user_name or '(not provided)'}\n"
        f"  Country : {country or 'Unknown'}\n"
        f"  Region  : {region or ''}\n"
        f"  City    : {city or ''}\n"
        f"  IP      : {ip}\n"
        f"  ISP     : {isp or 'unknown'}\n\n"
        f"If the country lines up with a real inquiry you're expecting, great —\n"
        f"nothing to do. If it feels off (VPN, unusual for your customer mix,\n"
        f"or you're seeing multiple signups from the same subnet), you can:\n"
        f"  • Freeze the account from the admin panel\n"
        f"  • Watch for their first booking and flag the payment for review\n\n"
        f"You'll only get this alert the FIRST time each country appears in\n"
        f"your signup base. Repeat signups from the same country stay quiet.\n\n"
        f"— Rox Taxi Fraud Watch"
    )
    admin_link = admin_url or ""
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#DC2626;font-weight:700;">Fraud watch · Owner alert</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:24px;line-height:1.2;">
        First-ever signup from <span style="color:#DC2626;">{_html_escape(country or 'Unknown')}</span>
      </h1>
      <p style="color:#64748B;font-size:14px;margin:12px 0 0;">
        A brand-new account was just created from a country you've never had a customer from before. Worth a quick glance to rule out fraud.
      </p>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;margin-top:20px;">
        <table style="width:100%;font-size:13px;color:#0B3B5C;border-collapse:collapse;">
          <tr><td style="color:#64748B;padding:5px 0;">When</td><td style="text-align:right;font-weight:600;">{_html_escape(when_pretty)}</td></tr>
          <tr><td style="color:#64748B;padding:5px 0;">Email</td><td style="text-align:right;font-weight:600;">{_html_escape(new_user_email)}</td></tr>
          <tr><td style="color:#64748B;padding:5px 0;">Name</td><td style="text-align:right;font-weight:600;">{_html_escape(new_user_name or '(not provided)')}</td></tr>
          <tr><td style="color:#64748B;padding:5px 0;">Location</td><td style="text-align:right;font-weight:600;">{_html_escape(loc)}</td></tr>
          <tr><td style="color:#64748B;padding:5px 0;">IP</td><td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;">{_html_escape(ip)}</td></tr>
          <tr><td style="color:#64748B;padding:5px 0;">ISP</td><td style="text-align:right;font-size:12px;">{_html_escape(isp or 'unknown')}</td></tr>
        </table>
      </div>

      {"<div style='margin:22px 0 8px;'><a href='" + _html_escape(admin_link) + "' style='display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px;font-size:14px;'>Open Admin · Review user</a></div>" if admin_link else ""}

      <div style="border-top:1px solid #E2E8F0;padding-top:18px;margin-top:22px;color:#94a3b8;font-size:12px;line-height:1.55;">
        <strong style="color:#64748B;">Why you're getting this:</strong> This alert fires ONCE per country ever. Repeat signups from the same country stay quiet — so if you're seeing this, it's genuinely a first.
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:18px;">Rox Taxi Fraud Watch · Nassau, Bahamas</p>
    </div>
    """
    return send_email(to_email, subject, html, text, category="info")


def send_signup_burst_alert(*, to_email: str, country: str, burst_count: int,
                            window_minutes: int, recent_emails: list,
                            sample_city: str, sample_ip: str,
                            admin_url: str = "") -> dict:
    """Owner-only alert: >N signups clustered from a single country in a
    tight time window. Different signal from the "first-ever country" alert
    — this one fires when the same country suddenly floods, which is the
    classic fraud-farm / VPN-abuse pattern. Fires at most once per country
    per hour so a real spike doesn't create an email storm.
    """
    subject = f"[Rox Fraud Watch] Burst — {burst_count} signups from {country or 'Unknown'} in {window_minutes} min"
    joined = "\n".join(f"  • {e}" for e in (recent_emails or [])[:10])
    text = (
        f"Cluster detected — {burst_count} accounts just signed up from\n"
        f"{country or 'Unknown'} inside a {window_minutes}-minute window.\n\n"
        f"Sample city : {sample_city or 'unknown'}\n"
        f"Sample IP   : {sample_ip or 'unknown'}\n\n"
        f"Recent emails from this burst:\n{joined}\n\n"
        f"What this usually means:\n"
        f"  • Fraud farm testing accounts before running stolen cards\n"
        f"  • VPN/proxy exit node routing many bots through one country\n"
        f"  • Legit surge if you just ran a targeted ad in that market\n\n"
        f"What to do next:\n"
        f"  • Open the Fraud Watch card in Admin → Dashboard\n"
        f"  • Check if any of these emails already have bookings\n"
        f"  • If suspicious, freeze the accounts or raise Turnstile\n\n"
        f"You'll only get this alert once per country per hour — even if\n"
        f"the burst keeps going, subsequent signups stay quiet until an\n"
        f"hour has passed.\n\n"
        f"— Rox Taxi Fraud Watch"
    )
    admin_link = admin_url or ""
    email_rows = "".join(
        f'<div style="font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#0B3B5C;padding:4px 0;border-bottom:1px dashed #E2E8F0;">{_html_escape(e)}</div>'
        for e in (recent_emails or [])[:10]
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#DC2626;font-weight:700;">Fraud watch · Burst detected</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:24px;line-height:1.2;">
        <span style="color:#DC2626;">{burst_count}</span> signups from {_html_escape(country or 'Unknown')} in {window_minutes} min
      </h1>
      <p style="color:#64748B;font-size:14px;margin:12px 0 0;">
        Cluster spotted — this is the classic pattern before a fraud wave. Worth a quick review to rule out card-testing bots.
      </p>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;margin-top:20px;">
        <table style="width:100%;font-size:13px;color:#0B3B5C;border-collapse:collapse;">
          <tr><td style="color:#64748B;padding:5px 0;">Country</td><td style="text-align:right;font-weight:600;">{_html_escape(country or 'Unknown')}</td></tr>
          <tr><td style="color:#64748B;padding:5px 0;">Signups in window</td><td style="text-align:right;font-weight:700;color:#DC2626;">{burst_count}</td></tr>
          <tr><td style="color:#64748B;padding:5px 0;">Window</td><td style="text-align:right;font-weight:600;">{window_minutes} minutes</td></tr>
          <tr><td style="color:#64748B;padding:5px 0;">Sample city</td><td style="text-align:right;font-weight:600;">{_html_escape(sample_city or 'unknown')}</td></tr>
          <tr><td style="color:#64748B;padding:5px 0;">Sample IP</td><td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;">{_html_escape(sample_ip or 'unknown')}</td></tr>
        </table>
      </div>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:16px 20px;margin-top:14px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.24em;color:#94a3b8;font-weight:700;margin-bottom:8px;">Recent burst emails</div>
        {email_rows or '<div style="color:#94a3b8;font-size:12px;">(no emails to preview)</div>'}
      </div>

      {"<div style='margin:22px 0 8px;'><a href='" + _html_escape(admin_link) + "' style='display:inline-block;background:#DC2626;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px;font-size:14px;'>Open Fraud Watch · Review burst</a></div>" if admin_link else ""}

      <div style="border-top:1px solid #E2E8F0;padding-top:18px;margin-top:22px;color:#94a3b8;font-size:12px;line-height:1.55;">
        <strong style="color:#64748B;">Why you're getting this:</strong> More than 3 signups landed from the same country in under an hour. This alert fires at most once per country per hour — a real spike will still be captured but you won't get spammed.
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:18px;">Rox Taxi Fraud Watch · Nassau, Bahamas</p>
    </div>
    """
    return send_email(to_email, subject, html, text, category="info")


def send_airport_pre_pickup_reminder(booking: dict, prefs: Optional[dict] = None,
                                     flight_delay_min: Optional[int] = None,
                                     reschedule_url: Optional[str] = None,
                                     new_pickup_iso: Optional[str] = None) -> dict:
    """T-60min "we're picking you up in an hour" reminder for airport-bound
    bookings. Deliberately checklist-heavy so guests aren't scrambling in
    the driveway looking for a lost passport:
      • All personal belongings collected from the room / villa
      • Flight status confirmed (online) — not delayed, not cancelled
      • Online check-in complete + boarding pass on phone
      • Passport in-hand (biggest cause of "we have to turn around" calls)

    When `flight_delay_min` is >= 120, the template pivots — instead of a
    bare checklist, it leads with "your flight is delayed ~X min, want to
    shift your pickup?" and includes a one-tap `reschedule_url` that moves
    the pickup by the same amount.
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False
    is_delayed = flight_delay_min is not None and flight_delay_min >= 120 and reschedule_url
    report = {
        "kind": "airport_pre_pickup",
        "flight_delayed": bool(is_delayed),
        "flight_delay_min": flight_delay_min,
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "sms":   {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
    }
    guest_first = (booking.get("customer_name") or "there").split(" ")[0]
    pickup = booking.get("pickup_location") or "your pickup point"
    dropoff = booking.get("dropoff_location") or "the airport"
    flight = (booking.get("flight_number") or "").strip()
    when = booking.get("booking_date") or ""
    when_pretty = when.replace("T", " ").split("+")[0][:16] if when else ""
    new_when_pretty = (new_pickup_iso or "").replace("T", " ").split("+")[0][:16] if new_pickup_iso else ""

    if is_delayed:
        delay_hrs = flight_delay_min // 60
        delay_lbl = f"~{delay_hrs} hr{'s' if delay_hrs != 1 else ''}"
        subject = f"Flight delayed {delay_lbl} — shift your Rox pickup? Booking {booking['id']}"
        text = (
            f"Hi {guest_first},\n\n"
            f"Heads up — your flight {flight} is showing a {delay_lbl} delay.\n"
            f"Original pickup: {when_pretty}\n"
            f"Suggested new pickup: {new_when_pretty}\n\n"
            f"Tap here to shift your pickup automatically:\n{reschedule_url}\n\n"
            f"If the delay resolves, ignore this — we'll stick with the original pickup time.\n\n"
            f"Pre-departure checklist (still applies):\n"
            f"  [ ] Passport in carry-on\n"
            f"  [ ] All belongings collected\n"
            f"  [ ] Flight status confirmed\n"
            f"  [ ] Online check-in done + boarding pass on phone\n\n"
            f"Questions? WhatsApp us: +1 (242) 432-2587\n\n"
            f"— Rox Taxi Service & Tours"
        )
        html = f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
          <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#DC2626;font-weight:800;">✈️ Flight delayed {_html_escape(delay_lbl)}</div>
          <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:26px;line-height:1.15;">
            Hi {_html_escape(guest_first)}, want to shift your Rox pickup?
          </h1>
          <p style="color:#64748B;font-size:14px;margin:12px 0 0;">
            Your flight <strong style="color:#0B3B5C;">{_html_escape(flight)}</strong> is showing a <strong style="color:#DC2626;">{_html_escape(delay_lbl)}</strong> delay. We'd rather not have you sitting at the pickup point while the plane's still on approach.
          </p>

          <div style="background:#fff;border:2px solid #DC2626;border-radius:16px;padding:22px;margin-top:20px;text-align:center;">
            <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#DC2626;font-weight:800;">One-tap reschedule</div>
            <div style="margin-top:12px;font-size:13px;color:#64748B;">Original pickup</div>
            <div style="font-family:'JetBrains Mono',monospace;color:#94a3b8;text-decoration:line-through;font-size:16px;">{_html_escape(when_pretty)}</div>
            <div style="margin-top:8px;font-size:13px;color:#059669;font-weight:600;">Suggested new pickup</div>
            <div style="font-family:'JetBrains Mono',monospace;color:#0B3B5C;font-size:20px;font-weight:800;">{_html_escape(new_when_pretty)}</div>
            <div style="margin-top:18px;">
              <a href="{_html_escape(reschedule_url)}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:999px;font-size:15px;box-shadow:0 8px 24px rgba(220,38,38,0.35);">Shift my pickup →</a>
            </div>
            <div style="margin-top:12px;font-size:11px;color:#94a3b8;">Nothing changes until you tap. Keep the original time if the delay resolves.</div>
          </div>

          <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;margin-top:18px;">
            <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#D4A94A;font-weight:800;">Still on your checklist</div>
            <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:13px;color:#0B3B5C;">
              <tr><td style="padding:4px 0;">🛂 Passport in carry-on</td></tr>
              <tr><td style="padding:4px 0;">🧳 All belongings collected</td></tr>
              <tr><td style="padding:4px 0;">✈️ Confirm the final flight status before you leave</td></tr>
              <tr><td style="padding:4px 0;">📱 Boarding pass saved to Wallet</td></tr>
            </table>
          </div>

          <div style="margin:22px 0 4px;">
            <a href="https://roxtaxi.com/track?id={booking['id']}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;font-size:13px;">Track driver</a>
            <a href="https://wa.me/12424322587" style="display:inline-block;margin-left:8px;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;font-size:13px;">WhatsApp us</a>
          </div>
          <p style="color:#94a3b8;font-size:11px;margin-top:22px;">— Rox Taxi Service &amp; Tours · Nassau, Bahamas</p>
        </div>
        """
    else:
        subject = f"1 hour to your Rox airport pickup — Booking {booking['id']}"
        text = (
        f"Hi {guest_first},\n\n"
        f"Your Rox driver arrives in ~1 hour at {pickup} to take you to {dropoff}.\n"
        f"Pickup time: {when_pretty} (local Nassau time)\n"
        + (f"Flight: {flight}\n\n" if flight else "\n")
        + f"Quick pre-departure checklist — takes 2 minutes:\n"
        f"  [ ] Passport in your carry-on (biggest 'turn around' cause)\n"
        f"  [ ] All personal belongings collected from the room\n"
        f"  [ ] Flight status confirmed online — no delays/cancellations\n"
        f"  [ ] Online check-in complete + boarding pass saved to phone/wallet\n\n"
        f"Track your driver live: https://roxtaxi.com/track?id={booking['id']}\n"
        f"Anything wrong? WhatsApp us: +1 (242) 432-2587\n\n"
        f"Safe travels — see you soon.\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:700;">1 hour to pickup</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:26px;line-height:1.15;">
        Hi {_html_escape(guest_first)}, your Rox airport pickup is in ~1 hour.
      </h1>
      <p style="color:#64748B;font-size:14px;margin:12px 0 0;">
        We'll be at <strong style="color:#0B3B5C;">{_html_escape(pickup)}</strong> to take you to <strong style="color:#0B3B5C;">{_html_escape(dropoff)}</strong> around <strong style="color:#0B3B5C;">{_html_escape(when_pretty)}</strong>.{f' Flight <strong style="color:#0B3B5C;">{_html_escape(flight)}</strong>.' if flight else ''}
      </p>

      <div style="background:#fff;border:2px solid #D4A94A;border-radius:16px;padding:22px;margin-top:20px;">
        <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#D4A94A;font-weight:800;">Pre-departure checklist</div>
        <div style="font-family:Georgia,serif;color:#0B3B5C;font-size:18px;margin-top:4px;">2 minutes to check — saves the trip</div>

        <table style="width:100%;margin-top:16px;border-collapse:collapse;font-size:14px;color:#0B3B5C;">
          <tr>
            <td style="vertical-align:top;padding:8px 0;width:32px;font-size:20px;">🛂</td>
            <td style="padding:8px 0;"><strong>Passport</strong> — in your carry-on, not the checked bag. Biggest cause of "turn around" calls.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:8px 0;font-size:20px;">🧳</td>
            <td style="padding:8px 0;"><strong>All belongings collected</strong> — check drawers, safe, bathroom, charger sockets.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:8px 0;font-size:20px;">✈️</td>
            <td style="padding:8px 0;"><strong>Flight status confirmed</strong> — check your airline app or FlightAware. Delays / cancellations happen.</td>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:8px 0;font-size:20px;">📱</td>
            <td style="padding:8px 0;"><strong>Online check-in done</strong> — boarding pass in Apple Wallet / Google Wallet. Skip the airline counter.</td>
          </tr>
        </table>
      </div>

      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;margin-top:18px;">
        <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#64748B;">Booking</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:20px;color:#0B3B5C;margin-top:4px;">{_html_escape(booking['id'])}</div>
        <div style="color:#0B3B5C;font-size:13px;margin-top:6px;">{_html_escape(booking.get('item_name',''))}</div>
      </div>

      <div style="margin:22px 0 4px;">
        <a href="https://roxtaxi.com/track?id={booking['id']}" style="display:inline-block;background:#0B3B5C;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px;font-size:14px;">Track driver live →</a>
        <a href="https://wa.me/12424322587" style="display:inline-block;margin-left:8px;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px;font-size:13px;">WhatsApp us</a>
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:22px;">Safe travels. — Rox Taxi Service &amp; Tours · Nassau, Bahamas</p>
    </div>
    """

    if email_enabled and booking.get("customer_email"):
        report["email"].update(send_email(booking["customer_email"], subject, html, text, category="confirmation"))
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        if is_delayed:
            delay_hrs = flight_delay_min // 60
            checklist_sms = (
                f"Rox Taxi: Flight {flight} delayed ~{delay_hrs}h. Shift pickup to {new_when_pretty}? Tap: {reschedule_url}"
            )
        else:
            checklist_sms = (
                f"Rox Taxi: 1hr to pickup at {pickup}. Quick check — Passport ✓ "
                f"Belongings ✓ Flight confirmed ✓ Checked in online ✓"
                + (f" Flight {flight}." if flight else "")
                + f" Track: roxtaxi.com/track?id={booking['id']}"
            )
        report["sms"].update(send_sms(booking["customer_phone"], checklist_sms))
    else:
        report["sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    return report


def make_reschedule_token(booking_id: str, delay_min: int, secret: str) -> str:
    """HMAC-signed capability token that lets a guest one-tap shift their
    pickup by `delay_min` minutes. Format: `<bid>.<delay>.<sig>`. No
    expiry embedded — the endpoint enforces "must be within 12 hours of
    the original pickup" so a leaked token from a past booking can't be
    replayed against a future one.
    """
    payload = f"{booking_id}:{delay_min}"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{booking_id}.{delay_min}.{sig}"


def verify_reschedule_token(token: str, secret: str) -> Optional[dict]:
    """Return {booking_id, delay_min} if the token is signed correctly,
    else None. Constant-time compare guards against timing attacks."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        bid, delay_str, sig = parts
        delay_min = int(delay_str)
        expected = hmac.new(secret.encode(), f"{bid}:{delay_min}".encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return None
        return {"booking_id": bid.upper(), "delay_min": delay_min}
    except Exception:  # noqa: BLE001
        return None


def send_driver_eta_notification(booking: dict, minutes_away: int = 5,
                                 prefs: Optional[dict] = None) -> dict:
    """Fires ONCE when the driver's live GPS enters the pickup radius. Tells
    the guest "your driver is X minutes away" so they can head down to the
    lobby / port gate. Both SMS + email (SMS is the primary channel — email
    is a lock-screen fallback).
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False
    report = {
        "kind": "driver_eta",
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "sms":   {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
    }
    guest_first = (booking.get("customer_name") or "there").split(" ")[0]
    pickup = booking.get("pickup_location") or booking.get("item_name") or "your pickup point"
    subject = f"Rox driver ~{minutes_away} min away — Booking {booking['id']}"
    text = (
        f"Hi {guest_first},\n\n"
        f"Your Rox driver is close — about {minutes_away} minutes from {pickup}.\n"
        f"Booking: {booking['id']}\n"
        f"Track live: https://roxtaxi.com/track?id={booking['id']}\n\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#E86A3C;font-weight:700;">~{minutes_away} minutes away</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:26px;">Hi {_html_escape(guest_first)}, your Rox driver is close.</h1>
      <p style="color:#64748B;font-size:14px;margin:14px 0 0;">
        About <strong style="color:#E86A3C;">{minutes_away} minutes</strong> out from <strong style="color:#0B3B5C;">{_html_escape(pickup)}</strong>. Head down when you're ready.
      </p>
      <div style="margin:22px 0 4px;">
        <a href="https://roxtaxi.com/track?id={booking['id']}" style="display:inline-block;background:#E86A3C;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px;font-size:14px;">Track live →</a>
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:22px;">Rox Taxi Service &amp; Tours · Nassau, Bahamas</p>
    </div>
    """
    if email_enabled and booking.get("customer_email"):
        report["email"].update(send_email(booking["customer_email"], subject, html, text, category="confirmation"))
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"
    if sms_enabled and booking.get("customer_phone"):
        sms = f"Rox Taxi: Driver ~{minutes_away} min from {pickup} (Booking {booking['id']}). Track: roxtaxi.com/track?id={booking['id']}"
        report["sms"].update(send_sms(booking["customer_phone"], sms))
    else:
        report["sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"
    return report


def send_driver_arrival_notification(booking: dict, prefs: Optional[dict] = None) -> dict:
    """Fires when the driver taps "I've arrived" from their mobile screen.
    Sends BOTH an SMS (fastest read-receipt) and an email (for lock-screen
    fallback / hotel front desk). Includes booking id + pickup so a guest
    with multiple bookings knows which driver is out front.

    Returns: {"email": {...}, "sms": {...}} — same shape as other notifiers.
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    sms_enabled = prefs.get("notify_sms_enabled", True) is not False
    report = {
        "kind": "driver_arrival",
        "email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled},
        "sms":   {"sent": False, "provider": "none", "error": None, "enabled": sms_enabled},
    }

    pickup = booking.get("pickup_location") or booking.get("item_name") or "your pickup point"
    guest_first = (booking.get("customer_name") or "there").split(" ")[0]
    driver_note = (booking.get("driver_note") or "").strip()

    subject = f"Your Rox driver has arrived — Booking {booking['id']}"
    text = (
        f"Hi {guest_first},\n\n"
        f"Your Rox driver is at {pickup} and ready when you are.\n"
        f"Booking: {booking['id']}\n"
        f"Service: {booking.get('item_name','')}\n\n"
        + (f"Driver note: {driver_note}\n\n" if driver_note else "")
        + f"Track live: https://roxtaxi.com/track?id={booking['id']}\n"
        f"Need to reach us? WhatsApp +1 (242) 432-2587\n\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#059669;font-weight:700;">Your driver is here</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:28px;line-height:1.15;">
        Hi {_html_escape(guest_first)}, your Rox driver just arrived.
      </h1>
      <p style="color:#64748B;font-size:15px;margin:14px 0 0;">
        We're at <strong style="color:#0B3B5C;">{_html_escape(pickup)}</strong> and ready when you are.
      </p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;margin-top:20px;">
        <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#64748B;">Booking</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:24px;color:#0B3B5C;margin-top:4px;">{_html_escape(booking['id'])}</div>
        <div style="color:#0B3B5C;font-size:14px;margin-top:6px;">{_html_escape(booking.get('item_name',''))}</div>
        {f'<div style="color:#0B3B5C;font-size:13px;margin-top:10px;padding:10px 12px;background:#F7F5EF;border-radius:10px;font-style:italic;">Driver: &ldquo;{_html_escape(driver_note)}&rdquo;</div>' if driver_note else ''}
      </div>
      <div style="margin:22px 0 4px;">
        <a href="https://roxtaxi.com/track?id={booking['id']}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px;font-size:14px;">Track live →</a>
        <a href="https://wa.me/12424322587" style="display:inline-block;margin-left:8px;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px;font-size:13px;">WhatsApp us</a>
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:22px;">Rox Taxi Service &amp; Tours · Nassau, Bahamas · 24/7 dispatch</p>
    </div>
    """

    if email_enabled and booking.get("customer_email"):
        report["email"].update(send_email(booking["customer_email"], subject, html, text, category="confirmation"))
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        sms = (
            f"Rox Taxi: Your driver is HERE at {pickup} (Booking {booking['id']})."
            + (f" Note: {driver_note}." if driver_note else "")
            + f" Track: roxtaxi.com/track?id={booking['id']}"
        )
        report["sms"].update(send_sms(booking["customer_phone"], sms))
    else:
        report["sms"]["error"] = "Disabled by admin" if not sms_enabled else "No phone number"

    return report


def send_password_reset_email(*, to_email: str, name: str, reset_url: str,
                              expires_in_minutes: int = 60) -> dict:
    """Password-reset link email. Category "confirmation" reuses the same
    transactional From: address as booking confirmations."""
    first = (name or "there").strip().split(" ")[0] or "there"
    subject = "Reset your Rox Taxi password"
    text = (
        f"Hi {first},\n\n"
        f"We got a request to reset your Rox Taxi account password.\n"
        f"Click the link below within the next {expires_in_minutes} minutes to set a new one:\n\n"
        f"  {reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email — your\n"
        f"current password stays active and no one else can use this link.\n\n"
        f"— Rox Taxi Service & Tours"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#D4A94A;font-weight:700;">Account security</div>
      <h1 style="font-family:Georgia,serif;color:#0B3B5C;margin:8px 0 4px;font-size:28px;line-height:1.15;">Reset your password</h1>
      <p style="color:#64748B;font-size:15px;margin:14px 0 0;">
        Hi {first} — we got a request to reset your Rox Taxi account password. Click the button below to choose a new one. This link expires in <strong>{expires_in_minutes} minutes</strong>.
      </p>
      <div style="margin:24px 0;">
        <a href="{reset_url}" style="display:inline-block;background:#D4A94A;color:#0B192C;text-decoration:none;font-weight:800;padding:12px 26px;border-radius:999px;font-size:14px;">Reset password →</a>
      </div>
      <p style="color:#64748B;font-size:12px;margin:8px 0 0;">Or paste this link into your browser:</p>
      <p style="color:#0B3B5C;font-size:12px;word-break:break-all;margin:2px 0 22px;">{reset_url}</p>
      <div style="border-top:1px solid #E2E8F0;padding-top:18px;color:#94a3b8;font-size:12px;">
        Didn't request this? You can ignore this email — your current password stays active. If you're worried, reply and we'll look into it.
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Rox Taxi Service &amp; Tours · Nassau, Bahamas</p>
    </div>
    """
    return send_email(to_email, subject, html, text, category="confirmation")

