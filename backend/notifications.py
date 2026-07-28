"""Email + SMS notifications. No-op if credentials aren't configured yet.

Every send helper returns a delivery-status dict so the caller can persist it
against the booking (used for admin dashboard delivery badges):

    {"sent": bool, "provider": str, "error": Optional[str]}
"""
import os
import logging
from typing import Optional

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


def send_email(to_email: str, subject: str, html: str, text: Optional[str] = None) -> dict:
    """Send email via SendGrid if configured, otherwise fall back to plain SMTP
    (Namecheap Private Email, Gmail SMTP, or any generic SMTP host).

    Returns a status dict: {sent, provider, error}.
    """
    api_key = os.environ.get("SENDGRID_API_KEY", "").strip()
    sender_sg = os.environ.get("SENDGRID_FROM_EMAIL", "").strip()

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
    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT", "587") or 587)
    user = os.environ.get("SMTP_USER", "").strip()
    pw = os.environ.get("SMTP_PASSWORD", "").strip()
    sender = os.environ.get("SMTP_FROM", "").strip() or user
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
    if not (host and user and pw and sender):
        logger.info("Neither SendGrid nor SMTP configured; skipping email to %s", to_email)
        return {"sent": False, "provider": "none", "error": sendgrid_err or "Email not configured"}
    try:
        import smtplib, ssl
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = to_email
        if text:
            msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        if port == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as server:
                server.login(user, pw)
                server.sendmail(sender, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                if use_tls:
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                server.login(user, pw)
                server.sendmail(sender, [to_email], msg.as_string())
        logger.info("SMTP email sent to %s via %s", to_email, host)
        return {"sent": True, "provider": "smtp", "error": None}
    except Exception as e:  # noqa: BLE001
        logger.warning("SMTP error: %s", e)
        return {"sent": False, "provider": "smtp", "error": str(e)}


def send_sms(to_number: str, body: str) -> dict:
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    from_num = os.environ.get("TWILIO_FROM_NUMBER", "").strip()
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


def notify_owner_booking_created(booking: dict) -> dict:
    """Send an SMS alert to the business owner the moment a booking hits the DB.
    Uses `ADMIN_SMS_NUMBER` env — falls back to `WHATSAPP_NUMBER` so we don't
    need duplicate configuration if the owner uses one phone for both.

    Returns Twilio send-report dict.
    """
    owner = (os.environ.get("ADMIN_SMS_NUMBER") or os.environ.get("WHATSAPP_NUMBER") or "").strip()
    if not owner:
        return {"sent": False, "provider": "none", "error": "ADMIN_SMS_NUMBER not set"}
    body = (
        f"🚕 NEW BOOKING {booking['id']}\n"
        f"{booking['item_name']}\n"
        f"👤 {booking['customer_name']} · {booking.get('customer_phone','')}\n"
        f"📅 {booking['booking_date']}\n"
        f"💵 Total {_fmt_money(booking.get('total',0))} via {booking.get('payment_method','?').upper()}\n"
        f"👉 roxtaxi.com/admin"
    )
    return send_sms(owner, body)


def notify_owner_payment_received(booking: dict, provider: str = "stripe") -> dict:
    """Send an SMS alert to the owner the moment a booking is marked paid.
    Fires from every payment path (Stripe webhook, PayPal capture, Zelle mark).
    """
    owner = (os.environ.get("ADMIN_SMS_NUMBER") or os.environ.get("WHATSAPP_NUMBER") or "").strip()
    if not owner:
        return {"sent": False, "provider": "none", "error": "ADMIN_SMS_NUMBER not set"}
    body = (
        f"💰 PAYMENT RECEIVED for {booking['id']}\n"
        f"{_fmt_money(booking.get('total',0))} via {provider.upper()}\n"
        f"👤 {booking['customer_name']}\n"
        f"🎯 {booking['item_name']}\n"
        f"📅 {booking['booking_date']}"
    )
    return send_sms(owner, body)


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

    subject = f"Booking {booking['id']} confirmed — Rox Taxi Service and Tours"
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
        result = send_email(booking["customer_email"], subject, html, body_text)
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
