"""Unit tests for facebook._optimise_for_facebook Pillow-based auto-crop.

Ensures output is always 1200x630 RGB JPEG regardless of input dimensions/mode,
and falls back to original bytes on decode failure.
"""
import io
import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from facebook import _optimise_for_facebook  # noqa: E402


def _make_jpeg(size, color=(120, 180, 220)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _make_rgba_png(size, color=(255, 0, 0, 128)):
    buf = io.BytesIO()
    Image.new("RGBA", size, color).save(buf, format="PNG")
    return buf.getvalue()


class TestOptimiseForFacebook:
    def test_portrait_jpeg_cropped_to_1200x630(self):
        raw = _make_jpeg((500, 1200))
        out, mime = _optimise_for_facebook(raw)
        assert mime == "image/jpeg"
        img = Image.open(io.BytesIO(out))
        assert img.size == (1200, 630)
        assert img.mode == "RGB"

    def test_wide_jpeg_cropped_to_1200x630(self):
        raw = _make_jpeg((3000, 1500))
        out, mime = _optimise_for_facebook(raw)
        assert mime == "image/jpeg"
        img = Image.open(io.BytesIO(out))
        assert img.size == (1200, 630)
        assert img.mode == "RGB"

    def test_rgba_png_converted_to_rgb_jpeg(self):
        raw = _make_rgba_png((800, 800))
        out, mime = _optimise_for_facebook(raw)
        assert mime == "image/jpeg"
        img = Image.open(io.BytesIO(out))
        assert img.mode == "RGB"
        assert img.size == (1200, 630)

    def test_junk_bytes_fallback(self):
        junk = b"not-an-image"
        out, mime = _optimise_for_facebook(junk)
        assert out == junk
        assert mime == "image/jpeg"
