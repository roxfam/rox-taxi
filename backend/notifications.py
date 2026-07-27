"""Email + SMS notifications. No-op if credentials aren't configured yet."""
import os
import logging

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


def send_email(to_email: str, subject: str, html: str, text: str | None = None) -> bool:
    """Send email via SendGrid if configured, otherwise fall back to plain SMTP
    (Namecheap Private Email, Gmail SMTP, or any generic SMTP host)."""
    api_key = os.environ.get("SENDGRID_API_KEY", "").strip()
    sender_sg = os.environ.get("SENDGRID_FROM_EMAIL", "").strip()

    # 1) SendGrid path
    if api_key and sender_sg:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            message = Mail(from_email=sender_sg, to_emails=to_email, subject=subject, html_content=html, plain_text_content=text or "")
            resp = SendGridAPIClient(api_key).send(message)
            return 200 <= resp.status_code < 300
        except Exception as e:  # noqa: BLE001
            logger.warning("SendGrid error: %s — falling back to SMTP", e)

    # 2) Generic SMTP path (Namecheap Private Email, Zoho, Gmail, etc.)
    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT", "587") or 587)
    user = os.environ.get("SMTP_USER", "").strip()
    pw = os.environ.get("SMTP_PASSWORD", "").strip()
    sender = os.environ.get("SMTP_FROM", "").strip() or user
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
    if not (host and user and pw and sender):
        logger.info("Neither SendGrid nor SMTP configured; skipping email to %s", to_email)
        return False
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
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("SMTP error: %s", e)
        return False


def send_sms(to_number: str, body: str) -> bool:
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    from_num = os.environ.get("TWILIO_FROM_NUMBER", "").strip()
    if not (sid and token and from_num):
        logger.info("Twilio not configured; skipping SMS to %s", to_number)
        return False
    try:
        from twilio.rest import Client
        client = Client(sid, token)
        client.messages.create(from_=from_num, to=to_number, body=body)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("Twilio error: %s", e)
        return False


def notify_booking_confirmed(booking: dict) -> None:
    """Send email + SMS on confirmed booking."""
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
    send_email(booking["customer_email"], subject, html, body_text)

    sms = f"Rox Taxi: Booking {booking['id']} confirmed for {booking['item_name']} on {booking['booking_date']}. Total {_fmt_money(booking.get('total',0))}. Track: roxtaxi.com/track?id={booking['id']}"
    send_sms(booking["customer_phone"], sms)
