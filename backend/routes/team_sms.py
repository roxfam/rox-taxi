"""Team SMS roster — per-area notification recipients.

Separate from the owner-admin SMS roster (`notifications._owner_recipients_cache`,
which gets everything). This roster lets the admin assign *per-area* phone
numbers for ground teams (Cable Beach beach crew, taxi dispatch, tour guides,
etc.) so each team only receives SMS for their lane.

Model
-----
Each row stored under `site_config.team_sms_recipients` as:
    {
        "id":     str (uuid),         # stable id for admin edits
        "label":  str,                # e.g. "Cable Beach beach team"
        "phone":  str,                # E.164, e.g. "+12424341945"
        "areas":  list[str],          # ["cable_beach", "taxi", ...]
        "enabled": bool,
        "quiet_hours": bool,          # suppress 22:00-04:00 Nassau
    }

Known areas
-----------
See `TEAM_AREAS`. Admin UI renders these as toggle chips per row.
"""
from typing import Optional, List
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, Field


_db = None
_require_admin = None
_now_iso = None


def configure(*, db, require_admin, now_iso):
    global _db, _require_admin, _now_iso  # noqa: PLW0603
    _db = db
    _require_admin = require_admin
    _now_iso = now_iso


async def _require_admin_dep(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
):
    if not callable(_require_admin):
        raise HTTPException(500, "team_sms admin dep not configured")
    return await _require_admin(request, authorization, x_csrf_token)


router = APIRouter()


# ─── Area taxonomy ───────────────────────────────────────────────────────
# Order controls the chip order in the admin UI. Keep this list short —
# every area shown here is a real notification path hooked up somewhere.
TEAM_AREAS = [
    {"id": "cable_beach", "label": "Cable Beach day"},
    {"id": "taxi",        "label": "Taxi bookings"},
    {"id": "tour",        "label": "Tours & excursions"},
    {"id": "car_rental",  "label": "Car rentals"},
    {"id": "group",       "label": "Group / wedding"},
    {"id": "incident",    "label": "Driver / incident"},
]


# Seed numbers injected on first boot if the roster is empty. Keeps the
# Cable Beach team number pre-wired for the owner — they can edit / delete
# from the dashboard any time.
_SEED_TEAMS = [
    {
        "label": "Cable Beach beach team",
        "phone": "+12424341945",
        "areas": ["cable_beach"],
        "enabled": True,
        "quiet_hours": False,  # Beach team sees day-of bookings any time
    },
]


# ─── Data access ─────────────────────────────────────────────────────────
async def list_team_recipients() -> list[dict]:
    cfg = await _db.site_config.find_one({"_id": "main"}) or {}
    return list(cfg.get("team_sms_recipients") or [])


async def seed_if_empty() -> None:
    """Called on startup. If the roster has nothing, insert the default
    Cable Beach team number so admins don't have to type it in."""
    existing = await list_team_recipients()
    if existing:
        return
    rows = []
    for s in _SEED_TEAMS:
        rows.append({**s, "id": uuid.uuid4().hex[:10]})
    await _db.site_config.update_one(
        {"_id": "main"},
        {"$set": {"team_sms_recipients": rows}},
        upsert=True,
    )


# ─── Pydantic ────────────────────────────────────────────────────────────
class TeamSMSRecipient(BaseModel):
    id: Optional[str] = Field(None, max_length=20)
    label: str = Field(..., min_length=1, max_length=80)
    phone: str = Field(..., min_length=5, max_length=24)
    areas: list[str] = Field(default_factory=list)
    enabled: bool = True
    quiet_hours: bool = False


class TeamSMSBatch(BaseModel):
    recipients: list[TeamSMSRecipient]


# ─── Admin endpoints ─────────────────────────────────────────────────────
@router.get("/notifications/team-sms")
async def admin_list_team_sms(_admin: str = Depends(_require_admin_dep)):
    return {
        "recipients": await list_team_recipients(),
        "areas": TEAM_AREAS,
    }


@router.put("/notifications/team-sms")
async def admin_save_team_sms(
    batch: TeamSMSBatch, _admin: str = Depends(_require_admin_dep),
):
    """Replace the full roster. Admin UI always posts the full list — this
    keeps the data flow simple and avoids ordering bugs with per-row
    PATCH endpoints."""
    valid_area_ids = {a["id"] for a in TEAM_AREAS}
    cleaned = []
    seen_phones: set[str] = set()
    for r in batch.recipients[:40]:
        phone = (r.phone or "").strip()
        if not phone or not phone.startswith("+"):
            continue  # Reject anything that isn't E.164
        if phone in seen_phones:
            continue  # No duplicates
        seen_phones.add(phone)
        areas = [a for a in (r.areas or []) if a in valid_area_ids][:12]
        cleaned.append({
            "id": r.id or uuid.uuid4().hex[:10],
            "label": (r.label or "").strip()[:80],
            "phone": phone,
            "areas": areas,
            "enabled": bool(r.enabled),
            "quiet_hours": bool(r.quiet_hours),
        })
    await _db.site_config.update_one(
        {"_id": "main"},
        {"$set": {"team_sms_recipients": cleaned,
                  "team_sms_updated_at": _now_iso()}},
        upsert=True,
    )
    return {"recipients": cleaned, "areas": TEAM_AREAS}


# ─── Dispatch helper ─────────────────────────────────────────────────────
_NASSAU = timezone(timedelta(hours=-5))


def _in_quiet_hours() -> bool:
    """Nassau quiet hours = 22:00-04:00. Mirrors the owner-SMS rule."""
    h = datetime.now(_NASSAU).hour
    return h >= 22 or h < 4


async def send_team_sms(area: str, body: str) -> dict:
    """Fire SMS to every enabled team recipient whose `areas` includes
    `area`. Quiet-hours recipients are silently skipped during the Nassau
    quiet window (they can still catch up by call-log the next morning).

    Returns a small summary dict — ``{"attempted": n, "skipped_quiet": m,
    "numbers": [...]}`` — mostly for debug + regression tests.
    """
    try:
        from notifications import send_sms
    except Exception:  # noqa: BLE001
        return {"attempted": 0, "skipped_quiet": 0, "numbers": []}
    quiet = _in_quiet_hours()
    recipients = await list_team_recipients()
    attempted = 0
    skipped = 0
    reached: list[str] = []
    for r in recipients:
        if not r.get("enabled", True):
            continue
        if area not in (r.get("areas") or []):
            continue
        if quiet and r.get("quiet_hours"):
            skipped += 1
            continue
        phone = (r.get("phone") or "").strip()
        if not phone:
            continue
        try:
            send_sms(phone, body)
            reached.append(phone)
            attempted += 1
        except Exception as e:  # noqa: BLE001
            logging.getLogger(__name__).warning("team sms err %s: %s", phone, e)
    return {"attempted": attempted, "skipped_quiet": skipped, "numbers": reached}
