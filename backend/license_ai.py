"""AI-assisted license verification via Claude Sonnet 4.5 vision.

Single call per license upload that batches:
  1. OCR — reads name, license number, expiry, issuing state/country from the
     front (+ back if provided) photo.
  2. Selfie face-match — rates 0-100 whether the guest in the selfie matches
     the portrait on the license.

Best-effort: every failure is swallowed and returns an empty dict so upload
flows never break because of an LLM hiccup.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from pathlib import Path
from typing import Optional

log = logging.getLogger("rox.license_ai")


async def analyze_license(
    front_path: Optional[Path],
    back_path: Optional[Path],
    selfie_path: Optional[Path],
    api_key: str,
    session_id: str,
) -> dict:
    """Run OCR + face-match in one Claude vision call. Never raises."""
    if not api_key or not (front_path or back_path):
        return {}
    try:
        from emergentintegrations.llm.chat import (
            LlmChat, UserMessage, ImageContent, TextDelta, StreamDone,
        )
        images = []
        desc: list[str] = []
        for path, label in (
            (front_path, "front of driver's license"),
            (back_path, "back of driver's license"),
            (selfie_path, "selfie of the driver holding / next to the license"),
        ):
            if path and path.exists():
                b64 = base64.b64encode(path.read_bytes()).decode()
                images.append(ImageContent(image_base64=b64))
                desc.append(label)
        if not images:
            return {}

        prompt = (
            "You are helping a rental-car company verify a customer's driver's license.\n"
            f"Images attached in order: {', '.join(desc)}.\n\n"
            "Return ONLY a JSON object with these exact keys (no markdown fences, no commentary):\n"
            "{\n"
            '  "name_on_license": "full name printed on the license, or empty string",\n'
            '  "license_number": "license or document number, or empty string",\n'
            '  "expiry_date": "YYYY-MM-DD if visible, or empty string",\n'
            '  "state_or_country": "issuing state or country, or empty string",\n'
            '  "selfie_match_confidence": integer 0-100 '
            "(0 if no selfie was provided or the faces clearly differ, 100 if very confident same person),\n"
            '  "notes": "short one-line note if anything looks off (expired, blurry, glare, tampering), or empty string"\n'
            "}"
        )
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message="You extract structured data from driver's license photos. Reply with strict JSON only.",
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        text = ""
        async for ev in chat.stream_message(UserMessage(text=prompt, file_contents=images)):
            if isinstance(ev, TextDelta):
                text += ev.content
            elif isinstance(ev, StreamDone):
                break
        raw = text.strip()
        # Strip common markdown fences.
        if raw.startswith("```"):
            raw = raw.strip("`").lstrip()
            if raw.lower().startswith("json"):
                raw = raw[4:].lstrip()
        # Try to isolate the first {...} block if the model added prose.
        if not raw.startswith("{"):
            i = raw.find("{"); j = raw.rfind("}")
            if i >= 0 and j > i:
                raw = raw[i : j + 1]
        data = json.loads(raw)
        # Normalise types.
        try:
            data["selfie_match_confidence"] = int(max(0, min(100, int(data.get("selfie_match_confidence", 0)))))
        except Exception:  # noqa: BLE001
            data["selfie_match_confidence"] = 0
        for k in ("name_on_license", "license_number", "expiry_date", "state_or_country", "notes"):
            data[k] = str(data.get(k) or "").strip()
        return data
    except asyncio.CancelledError:
        raise
    except Exception as e:  # noqa: BLE001
        log.warning("license AI analysis failed: %s", e)
        return {"_error": str(e)[:200]}
