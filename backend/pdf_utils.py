"""PDF generation helpers — wedding-package quote + booking receipt.

Kept in a dedicated module to keep server.py lean. Callers supply a plain
dict; these functions return raw PDF bytes (no I/O).
"""
import os
import urllib.request
from io import BytesIO
from datetime import datetime, timezone

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image


NAVY = colors.HexColor("#0B3B5C")
GOLD = colors.HexColor("#D4A94A")
CORAL = colors.HexColor("#E86A3C")
GREY = colors.HexColor("#64748B")
SAND = colors.HexColor("#FBF7EF")
INK = colors.HexColor("#0B192C")

# Cached Rox Taxi logo — read from the local frontend build (portable
# after VPS deploy), converted to PNG for reportlab (which handles webp
# poorly on some builds), and reused on every PDF.
_LOGO_CACHE = "/tmp/rox_logo.png"
_LOCAL_LOGO_CANDIDATES = [
    "/app/frontend/public/logo-gold.webp",
    "/app/frontend/build/logo-gold.webp",
    "/app/frontend/public/logo-mark.png",
]
# Optional remote fallback (overridable via env for future CDN moves)
_LOGO_URL = os.environ.get(
    "PDF_LOGO_URL",
    "https://roxtaxi.com/logo-gold.webp",
)


def _load_logo():
    """Return a reportlab Image flowable for the header, or None on failure.
    We prefer a hard failure to render *without* a logo over a broken PDF."""
    try:
        if not os.path.exists(_LOGO_CACHE):
            raw = None
            # 1) Prefer a bundled local file — always available on the VPS.
            for path in _LOCAL_LOGO_CANDIDATES:
                if os.path.exists(path):
                    with open(path, "rb") as fh:
                        raw = fh.read()
                    break
            # 2) Fall back to the public URL only if no local file found.
            if raw is None:
                raw = urllib.request.urlopen(_LOGO_URL, timeout=8).read()
            # Convert webp/png → PNG via PIL for maximum reportlab compat.
            from PIL import Image as PILImage
            im = PILImage.open(BytesIO(raw)).convert("RGBA")
            im.save(_LOGO_CACHE, "PNG")
        img = Image(_LOGO_CACHE, width=1.1 * inch, height=1.1 * inch)
        img.hAlign = "LEFT"
        return img
    except Exception:
        return None


def build_wedding_pdf(inquiry: dict) -> bytes:
    """Render a wedding-package quote PDF. `inquiry` must include:
      _pdf_rows: list[[label, "$amount"]] pre-formatted line items,
      _subtotal: float,
      _disc_pct: float (0..1),
      estimated_total: optional float (falls back to subtotal - discount).
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("title", parent=styles["Title"], fontName="Times-Italic", fontSize=32, textColor=NAVY, spaceAfter=6, leading=34)
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=GREY, spaceAfter=18, letterSpacing=1)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Times-Italic", fontSize=18, textColor=NAVY, spaceBefore=10, spaceAfter=8)
    p = ParagraphStyle("p", parent=styles["Normal"], fontName="Helvetica", fontSize=10, textColor=INK, leading=14, spaceAfter=6)
    small = ParagraphStyle("small", parent=styles["Normal"], fontName="Helvetica", fontSize=8, textColor=GREY, leading=11)

    story = []
    logo = _load_logo()
    if logo:
        story.append(logo)
        story.append(Spacer(1, 6))
    story.append(Paragraph("ROX TAXI SERVICE AND TOURS", sub))
    story.append(Paragraph(f"Wedding Package for <font color='#D4A94A'><i>{inquiry.get('customer_name','the happy couple')}</i></font>", title))
    story.append(Paragraph(f"REFERENCE {inquiry['id']} · EVENT DATE {inquiry.get('event_date','')} · {inquiry.get('guest_count',0)} GUESTS", sub))

    lines = list(inquiry.get("_pdf_rows", []))
    if lines:
        story.append(Paragraph("Your package", h2))
        tbl = Table([["Item", "Amount"]] + lines, colWidths=[4.5 * inch, 1.5 * inch], hAlign="LEFT")
        tbl.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
            ("BACKGROUND", (0, 0), (-1, 0), SAND),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
            ("LINEBELOW", (0, -1), (-1, -1), 0.5, GREY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SAND]),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("FONTNAME", (1, 1), (1, -1), "Courier"),
            ("TEXTCOLOR", (1, 1), (1, -1), NAVY),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 12))

    subtotal = float(inquiry.get("_subtotal", 0))
    disc_pct = float(inquiry.get("_disc_pct", 0))
    discount = subtotal * disc_pct
    total = float(inquiry.get("estimated_total") or (subtotal - discount))

    totals_rows = [["Subtotal", f"${subtotal:,.2f}"]]
    if disc_pct:
        totals_rows.append([f"Group discount ({int(disc_pct*100)}%)", f"-${discount:,.2f}"])
    totals_rows.append(["Estimated total", f"${total:,.2f}"])

    tot = Table(totals_rows, colWidths=[4.5 * inch, 1.5 * inch], hAlign="LEFT")
    tot.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, -1), (-1, -1), "Times-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 14),
        ("TEXTCOLOR", (0, -1), (-1, -1), CORAL),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.5, NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tot)

    story.append(Spacer(1, 24))
    story.append(Paragraph("What happens next", h2))
    story.append(Paragraph(
        "Our concierge will confirm final pricing within <b>2 hours</b> during business hours. Once you approve, "
        "we send a Stripe / PayPal / Zelle link and lock in your date. Cancellations at least 48 hours before the "
        "service are refundable minus a 15% fee.",
        p,
    ))

    if inquiry.get("notes"):
        story.append(Spacer(1, 6))
        story.append(Paragraph("Your notes", h2))
        story.append(Paragraph(inquiry["notes"].replace("\n", "<br/>"), p))

    story.append(Spacer(1, 30))
    story.append(Paragraph(
        "Rox Taxi Service &amp; Tours · Nassau, New Providence · The Bahamas<br/>"
        "hello@roxtaxi.com · facebook.com/roxtaxiservice · Estimate valid 30 days from date of issue.",
        small,
    ))

    doc.build(story)
    return buf.getvalue()


def build_receipt_pdf(booking: dict) -> bytes:
    """Render a booking receipt PDF from a `booking` dict."""
    buf = BytesIO()
    doc_pdf = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.75 * inch, rightMargin=0.75 * inch, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("t", parent=styles["Title"], fontName="Times-Italic", fontSize=30, textColor=NAVY, spaceAfter=6, leading=32)
    sub = ParagraphStyle("s", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=GREY, spaceAfter=18)
    h2 = ParagraphStyle("h", parent=styles["Heading2"], fontName="Times-Italic", fontSize=16, textColor=NAVY, spaceBefore=8, spaceAfter=6)
    p = ParagraphStyle("p", parent=styles["Normal"], fontName="Helvetica", fontSize=10, textColor=INK, leading=14, spaceAfter=6)
    small = ParagraphStyle("sm", parent=styles["Normal"], fontName="Helvetica", fontSize=8, textColor=GREY, leading=11)

    now_iso = datetime.now(timezone.utc).isoformat()
    paid = booking.get("payment_status") == "paid"
    status_label = "PAID" if paid else "PENDING PAYMENT"

    story = []
    logo = _load_logo()
    if logo:
        story.append(logo)
        story.append(Spacer(1, 6))
    story.append(Paragraph("ROX TAXI SERVICE AND TOURS", sub))
    story.append(Paragraph(f"Booking receipt for <font color='#D4A94A'><i>{booking.get('customer_name','')}</i></font>", title))
    story.append(Paragraph(f"REFERENCE {booking['id']} · {status_label} · ISSUED {now_iso[:10]}", sub))

    rows = [["Service", booking.get("item_name", "-")]]
    rows.append(["Date", str(booking.get("booking_date", ""))])
    if booking.get("pickup_location"):
        rows.append(["Pickup", booking["pickup_location"]])
    if booking.get("dropoff_location"):
        rows.append(["Dropoff", booking["dropoff_location"]])
    rows.append(["Passengers", str(booking.get("passengers", 1))])
    if booking.get("service_type") == "rental":
        rows.append(["Days", str(booking.get("days", 1))])
    rows.append(["Payment method", str(booking.get("payment_method", "-")).title()])

    story.append(Paragraph("Details", h2))
    dtl = Table(rows, colWidths=[1.7 * inch, 4.3 * inch], hAlign="LEFT")
    dtl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, SAND]),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(dtl)
    story.append(Spacer(1, 14))

    base = float(booking.get("price", 0)) * max(1, int(booking.get("days", 1)))
    lug = float(booking.get("luggage_fee", 0))
    pax = float(booking.get("passenger_fee", 0))
    total = float(booking.get("total", base + lug + pax))
    amt_rows = [["Base fare" if booking.get("service_type") != "rental" else f"Rental × {booking.get('days',1)} day(s)", f"${base:,.2f}"]]
    if lug:
        amt_rows.append([f"Extra luggage ({booking.get('extra_luggage',0)} × $3)", f"${lug:,.2f}"])
    if pax:
        amt_rows.append(["Group fee (3+ passengers)", f"${pax:,.2f}"])
    amt_rows.append(["Total", f"${total:,.2f}"])

    tot = Table(amt_rows, colWidths=[4.5 * inch, 1.5 * inch], hAlign="LEFT")
    tot.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, -1), (-1, -1), "Times-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 14),
        ("TEXTCOLOR", (0, -1), (-1, -1), CORAL if paid else NAVY),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (1, 0), (1, -2), "Courier"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.5, NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tot)

    if paid:
        story.append(Spacer(1, 12))
        story.append(Paragraph("<font color='#D4A94A'><b>PAID IN FULL</b></font> — thank you for choosing Rox.", p))
    else:
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>Payment pending.</b> Complete payment via the link in your confirmation email or contact us on WhatsApp.", p))

    story.append(Spacer(1, 18))
    story.append(Paragraph("Cancellation policy", h2))
    story.append(Paragraph(
        "Cancel 48+ hours before service to receive a refund minus a 15% cancellation fee. Cancellations within 48 hours are non-refundable.",
        p,
    ))

    story.append(Spacer(1, 24))
    story.append(Paragraph(
        "Rox Taxi Service &amp; Tours · Nassau, New Providence · The Bahamas<br/>"
        "hello@roxtaxi.com · facebook.com/roxtaxiservice · Keep this receipt for your records.",
        small,
    ))

    doc_pdf.build(story)
    return buf.getvalue()
