"""DB-backed secret manager with env fallback.

Reads secrets from `site_config.secrets` in MongoDB, falls back to environment
variables when a DB value is absent or empty. This lets the admin rotate API
tokens (Facebook, Twilio, SendGrid, etc.) live via the admin panel without
editing the .env file or restarting the backend.

The cache is populated at startup (call `prime()` once during app startup)
and refreshed on every write via `set_secret()`.

Contract:
    from secrets_store import get_secret
    token = get_secret("FB_PAGE_ACCESS_TOKEN")

Registry (`TOKEN_REGISTRY`) drives the admin panel UI — group, label, help
text, and sensitivity flag per managed key.
"""
from __future__ import annotations

import os
from typing import Optional

_db = None
_cache: dict[str, str] = {}


# Groups of admin-manageable secrets. Ordered for UI display.
# `sensitive=True` → masked in GET responses (returns "••••XXXX" tail).
TOKEN_REGISTRY: list[dict] = [
    # Facebook Auto-Post
    {"key": "FB_PAGE_ID",            "group": "Facebook",    "label": "Page ID",              "sensitive": False, "help": "Numeric Facebook Page ID that posts publish to."},
    {"key": "FB_PAGE_ACCESS_TOKEN",  "group": "Facebook",    "label": "Page Access Token",    "sensitive": True,  "help": "Long-lived Page token — needs pages_manage_posts + pages_read_engagement."},
    {"key": "FB_GRAPH_VERSION",      "group": "Facebook",    "label": "Graph API Version",    "sensitive": False, "help": "Defaults to v20.0."},
    {"key": "FB_AUTOPOST_ENABLED",   "group": "Facebook",    "label": "Auto-Post Enabled",    "sensitive": False, "help": "Set to 'true' or 'false'."},
    {"key": "FB_SITE_URL",           "group": "Facebook",    "label": "Site URL (for captions)", "sensitive": False, "help": "Appears in every auto-generated caption."},

    # Twilio SMS
    {"key": "TWILIO_ACCOUNT_SID",    "group": "Twilio SMS",  "label": "Account SID",          "sensitive": True,  "help": "Starts with AC…"},
    {"key": "TWILIO_AUTH_TOKEN",     "group": "Twilio SMS",  "label": "Auth Token",           "sensitive": True,  "help": "Twilio API auth token."},
    {"key": "TWILIO_FROM_NUMBER",    "group": "Twilio SMS",  "label": "From Number (E.164)",  "sensitive": False, "help": "e.g. +12202228965"},
    {"key": "ADMIN_SMS_NUMBER",      "group": "Twilio SMS",  "label": "Admin/Owner Number",   "sensitive": False, "help": "Booking alerts SMS to the owner."},

    # SendGrid + SMTP
    {"key": "SENDGRID_API_KEY",      "group": "Email",       "label": "SendGrid API Key",     "sensitive": True,  "help": "Preferred email path. Falls back to SMTP if empty."},
    {"key": "SENDGRID_FROM_EMAIL",   "group": "Email",       "label": "SendGrid From Email",  "sensitive": False, "help": "Verified sender identity in SendGrid."},
    {"key": "SMTP_HOST",             "group": "Email",       "label": "SMTP Host",            "sensitive": False, "help": "Fallback: e.g. mail.privateemail.com"},
    {"key": "SMTP_PORT",             "group": "Email",       "label": "SMTP Port",            "sensitive": False, "help": "587 (STARTTLS) or 465 (SSL)."},
    {"key": "SMTP_USER",             "group": "Email",       "label": "SMTP User",            "sensitive": False, "help": "SMTP username / mailbox address."},
    {"key": "SMTP_PASSWORD",         "group": "Email",       "label": "SMTP Password",        "sensitive": True,  "help": "SMTP mailbox password."},
    {"key": "SMTP_FROM",             "group": "Email",       "label": "SMTP From",            "sensitive": False, "help": "Defaults to SMTP_USER if empty."},
    {"key": "SMTP_USE_TLS",          "group": "Email",       "label": "SMTP Use TLS",         "sensitive": False, "help": "'true' or 'false'. Ignored on port 465."},
    {"key": "EMAIL_FROM_CONFIRMATION","group": "Email",      "label": "From: Confirmations",  "sensitive": False, "help": "Sender for booking confirmations, reminders, paid receipts. e.g. confirmation@roxtaxi.com"},
    {"key": "EMAIL_FROM_QUOTES",     "group": "Email",       "label": "From: Quotes",         "sensitive": False, "help": "Sender for custom-quote request replies. e.g. quotes@roxtaxi.com"},
    {"key": "EMAIL_FROM_INFO",       "group": "Email",       "label": "From: Info / Contact", "sensitive": False, "help": "Sender for contact-form + group-inquiry replies. e.g. info@roxtaxi.com"},

    # Stripe
    {"key": "STRIPE_API_KEY",        "group": "Stripe",      "label": "Stripe Secret Key",    "sensitive": True,  "help": "sk_live_… or sk_test_…"},
    {"key": "STRIPE_WEBHOOK_SECRET", "group": "Stripe",      "label": "Webhook Signing Secret","sensitive": True, "help": "whsec_… from the Stripe webhook dashboard."},

    # PayPal
    {"key": "PAYPAL_CLIENT_ID",      "group": "PayPal",      "label": "Client ID",            "sensitive": True,  "help": "REST API app client ID."},
    {"key": "PAYPAL_SECRET",         "group": "PayPal",      "label": "Client Secret",        "sensitive": True,  "help": "REST API app secret."},
    {"key": "PAYPAL_MODE",           "group": "PayPal",      "label": "Mode",                 "sensitive": False, "help": "'sandbox' or 'live'."},

    # AviationStack
    {"key": "AVIATIONSTACK_API_KEY", "group": "AviationStack","label": "API Key",             "sensitive": True,  "help": "Flight tracker widget uses this."},

    # Emergent LLM (Claude / GPT / Gemini)
    {"key": "EMERGENT_LLM_KEY",      "group": "Emergent LLM","label": "Universal LLM Key",    "sensitive": True,  "help": "sk-emergent-… Powers the chat concierge."},

    # Web Push (VAPID)
    {"key": "VAPID_PUBLIC_KEY",      "group": "Web Push",    "label": "VAPID Public Key",     "sensitive": False, "help": "Base64url — served to browsers to subscribe."},
    {"key": "VAPID_PRIVATE_KEY",     "group": "Web Push",    "label": "VAPID Private Key",    "sensitive": True,  "help": "Base64url — signs push payloads."},
    {"key": "VAPID_SUBJECT",         "group": "Web Push",    "label": "VAPID Subject (mailto)", "sensitive": False, "help": "mailto:admin@example.com"},

    # Google OAuth (only if you swap out Emergent-managed Google Auth)
    {"key": "GOOGLE_CLIENT_ID",      "group": "Google OAuth","label": "OAuth Client ID",      "sensitive": False, "help": "Only needed if you self-host Google sign-in."},
    {"key": "GOOGLE_CLIENT_SECRET",  "group": "Google OAuth","label": "OAuth Client Secret",  "sensitive": True,  "help": "Only needed if you self-host Google sign-in."},
]

_REGISTERED_KEYS = {t["key"] for t in TOKEN_REGISTRY}


def configure(db) -> None:
    """Wire in the async Motor db handle. Called once at app startup."""
    global _db
    _db = db


async def prime() -> None:
    """Load all secrets from Mongo into the in-memory cache."""
    global _cache
    if _db is None:
        _cache = {}
        return
    doc = await _db.site_config.find_one({"_id": "main"}) or {}
    _cache = {k: str(v) for k, v in (doc.get("secrets") or {}).items() if v not in (None, "")}


def get_secret(key: str, default: str = "") -> str:
    """Return DB-managed value if present, else env, else default. Sync API."""
    v = _cache.get(key)
    if v not in (None, ""):
        return v
    return os.environ.get(key, default)


async def set_secret(key: str, value: Optional[str]) -> None:
    """Upsert one secret. Empty string / None deletes the override."""
    if _db is None:
        raise RuntimeError("secrets_store not configured")
    field = f"secrets.{key}"
    if value in (None, ""):
        await _db.site_config.update_one({"_id": "main"}, {"$unset": {field: ""}}, upsert=True)
        _cache.pop(key, None)
    else:
        await _db.site_config.update_one({"_id": "main"}, {"$set": {field: str(value)}}, upsert=True)
        _cache[key] = str(value)


def snapshot_for_admin() -> list[dict]:
    """Return the token registry with current value status for the admin UI.

    Sensitive keys never expose the plaintext — only a `masked` tail and a
    `source` flag indicating whether the current value is coming from DB
    override, the .env file, or is unset.
    """
    out = []
    for reg in TOKEN_REGISTRY:
        key = reg["key"]
        db_val = _cache.get(key) or ""
        env_val = os.environ.get(key) or ""
        current = db_val or env_val
        source = "db" if db_val else ("env" if env_val else "unset")
        masked = ""
        preview = ""
        if current:
            if reg["sensitive"]:
                tail = current[-4:] if len(current) > 4 else ""
                masked = f"••••{tail}" if tail else "••••"
            else:
                # Non-sensitive: show full value so admin can double-check.
                preview = current
        out.append({
            **reg,
            "source": source,
            "has_value": bool(current),
            "masked": masked,
            "value": preview,     # non-sensitive plaintext only
            "db_override": bool(db_val),
        })
    return out


def is_registered(key: str) -> bool:
    return key in _REGISTERED_KEYS
