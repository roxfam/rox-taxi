"""Email + SMS notifications. No-op if credentials aren't configured yet.

Every send helper returns a delivery-status dict so the caller can persist it
against the booking (used for admin dashboard delivery badges):

    {"sent": bool, "provider": str, "error": Optional[str]}
"""
import logging
from typing import Optional

from secrets_store import get_secret

logger = logging.getLogger(__name__)


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
               category: Optional[str] = None) -> dict:
    """Send email via SendGrid if configured, otherwise fall back to plain SMTP
    (Namecheap Private Email, Gmail SMTP, or any generic SMTP host).

    Args:
        category: optional routing hint — "confirmation", "quotes", "info".
            When set, the From: address is resolved from EMAIL_FROM_<CATEGORY>
            for both SendGrid and SMTP paths.

    Returns a status dict: {sent, provider, error}.
    """
    api_key = get_secret("SENDGRID_API_KEY", "").strip()
    sender_sg = _sender_for_category(category) or get_secret("SENDGRID_FROM_EMAIL", "").strip()

    # 1) SendGrid path
    if api_key and sender_sg:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            message = Mail(from_email=sender_sg, to_emails=to_email, subject=subject, html_content=html, plain_text_content=text or "")
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

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = header_from
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to
        if text:
            msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

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


def notify_owner_booking_created(booking: dict) -> dict:
    """Send an SMS alert to the business owner the moment a booking hits the DB.
    Uses `ADMIN_SMS_NUMBER` env — falls back to `WHATSAPP_NUMBER` so we don't
    need duplicate configuration if the owner uses one phone for both.

    Returns Twilio send-report dict.
    """
    owner = (get_secret("ADMIN_SMS_NUMBER") or get_secret("WHATSAPP_NUMBER") or "").strip()
    if not owner:
        return {"sent": False, "provider": "none", "error": "ADMIN_SMS_NUMBER not set"}
    body = (
        f"🚕 NEW BOOKING {booking['id']}\n"
        f"{_booking_details_for_owner(booking)}\n"
        f"👉 roxtaxi.com/admin/bookings/{booking['id']}"
    )
    return send_sms(owner, body)


def notify_owner_payment_received(booking: dict, provider: str = "stripe") -> dict:
    """Send an SMS alert to the owner the moment a booking is marked paid.
    Fires from every payment path (Stripe webhook, PayPal capture, Zelle mark).
    """
    owner = (get_secret("ADMIN_SMS_NUMBER") or get_secret("WHATSAPP_NUMBER") or "").strip()
    if not owner:
        return {"sent": False, "provider": "none", "error": "ADMIN_SMS_NUMBER not set"}
    body = (
        f"💰 PAYMENT RECEIVED {_fmt_money(booking.get('total',0))} via {provider.upper()}\n"
        f"Booking  : {booking['id']}\n"
        f"{_booking_details_for_owner(booking)}\n"
        f"👉 roxtaxi.com/admin/bookings/{booking['id']}"
    )
    return send_sms(owner, body)


def notify_booking_received(booking: dict, prefs: Optional[dict] = None) -> dict:
    """Immediate acknowledgment email for bookings in `pending_payment` state.

    Sent as soon as the booking is created (before Stripe/PayPal completes) so
    the guest has proof we captured their request — including pickup location,
    date/time, and current status. Once payment settles the guest also gets
    the full confirmation email from notify_booking_confirmed().
    """
    prefs = prefs or {}
    email_enabled = prefs.get("notify_email_enabled", True) is not False
    report = {"email": {"sent": False, "provider": "none", "error": None, "enabled": email_enabled}}

    if not (email_enabled and booking.get("customer_email")):
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"
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


def notify_booking_confirmed(booking: dict, prefs: Optional[dict] = None) -> dict:
    """Send email + SMS on confirmed booking.

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
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width:560px;margin:0 auto;padding:32px;background:#FAF9F6;">
      <h1 style="font-family:Georgia,serif;color:#1A365D;margin:0 0 8px;">You're booked!</h1>
      <p style="color:#64748B;">Thanks {booking['customer_name']} — here's your confirmation.</p>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-top:24px;">
        <div style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#64748B;">Confirmation</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:28px;color:#1A365D;margin-top:4px;">{booking['id']}</div>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0;">
        <div><strong style="color:#1A365D;">{booking['item_name']}</strong></div>
        <div style="color:#64748B;font-size:14px;margin-top:4px;">Date: {booking['booking_date']}</div>
        <div style="color:#64748B;font-size:14px;">Total: <span style="color:#FF7F50;font-weight:600;">{_fmt_money(booking.get('total',0))}</span></div>
      </div>
      <p style="color:#64748B;font-size:13px;margin-top:24px;">Track your booking anytime at <a style="color:#00B4D8;" href="https://roxtaxi.com/track?id={booking['id']}">roxtaxi.com/track</a>.</p>
    </div>
    """

    if email_enabled and booking.get("customer_email"):
        result = send_email(booking["customer_email"], subject, html, body_text, category="confirmation")
        report["email"].update(result)
    else:
        report["email"]["error"] = "Disabled by admin" if not email_enabled else "No email address"

    if sms_enabled and booking.get("customer_phone"):
        sms = f"Rox Taxi: Booking {booking['id']} confirmed for {booking['item_name']} on {booking['booking_date']}. Total {_fmt_money(booking.get('total',0))}. Track: roxtaxi.com/track?id={booking['id']}"
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
        result = send_sms(driver_number, driver_sms)
        report["driver_sms"].update(result)

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

