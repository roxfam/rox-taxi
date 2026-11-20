"""Normalise any typed phone number to E.164 (+country digits) so texts reach the guest."""
import re
from typing import Annotated

from pydantic import AfterValidator


def normalize_phone(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    plus = s.startswith("+")
    d = re.sub(r"\D", "", s)
    if not d:
        return s
    if plus:
        return "+" + d
    if d.startswith("00"):
        return "+" + d[2:]
    if len(d) == 7:  # local Bahamas number
        return "+1242" + d
    if len(d) == 10:  # Bahamas / US / Canada without country code
        return "+1" + d
    if len(d) == 11 and d.startswith("1"):
        return "+" + d
    return "+" + d


Phone = Annotated[str, AfterValidator(normalize_phone)]
