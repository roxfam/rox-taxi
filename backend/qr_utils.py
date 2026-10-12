"""Scanner-friendly QR rendering: medium error correction, 4-module quiet zone, pure black on white."""
from io import BytesIO

import qrcode
from qrcode.constants import ERROR_CORRECT_M


def qr_png_bytes(data: str, box_size: int = 10) -> bytes:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=box_size, border=4)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
