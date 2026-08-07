# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 7 — Suspicious Signup Alert (Fraud Watch)
- New `send_new_country_signup_alert()` email template in `notifications.py` (branded "Rox Fraud Watch" owner alert).
- New `_maybe_send_new_country_signup_alert()` helper in `routes/auth.py`:
  - Resolves signup IP → country via cached `visitor_geo_cache` (falls back to a live ip-api.com call with a 3s timeout on cache miss).
  - Stamps `signup_country`, `signup_city`, `signup_region`, `signup_ip` on every new user doc for future analytics.
  - Emails `ADMIN_EMAIL` **once per country ever** — repeat signups from a known country stay silent.
  - Runs as a `asyncio.create_task` so signup latency is not affected.
- Wired into `POST /auth/register` (new users only — existing pre-Google users don't re-fire).
- Existing users backfilled with `signup_country: "Legacy"` so historical accounts don't trigger false-positive alerts on next signup batch.
- Verified end-to-end: US signup with existing US user (no alert), first-ever NG signup (1 alert), second NG signup (no re-alert), private IP (no crash).

### Feb 7 — Cloudflare Turnstile CAPTCHA (Signup + Login + Password Reset)
- Added `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` to backend `.env`; `REACT_APP_TURNSTILE_SITE_KEY` to frontend `.env`.
- Backend `_verify_turnstile()` helper calls Cloudflare siteverify. Fails open (dev/preview) when secret is unset.
- Enforced on `POST /auth/register`, `POST /auth/login-email`, `POST /auth/forgot-password`.
- New `<TurnstileWidget />` component (loads CF script once, callbacks for solved/expired/error).
- Wired into `Signup.jsx`, `Login.jsx` (email tab + inline forgot-password form).
- Submit buttons stay disabled until challenge is solved.
- **⚠️ User action pending**: whitelist `bahamas-taxi-tours.preview.emergentagent.com` + `roxtaxi.com` in Turnstile → Hostname Management. User confirmed "managed" mode is set.

### Earlier (previous session)
- Optional Taxi Add-on with custom admin pricing & A/B upsell testing
- Kids pricing UI on Booking Flow
- Photo Delete Button in Admin Gallery
- 2017 Nissan NV200 Cargo Rental added
- Advanced Blackout Date System (Fleet-Wide Range Picker, Mini Calendars, Inline Reason Editor, Collapsed Range Chips)
- Downtime Financial Analytics (Reason Presets, YoY Delta, Downtime Cost in $, Sparklines)
- Downtime Matrix CSV Export + Insurance-Ready PDF (`reportlab`)
- Removed Yacht and Horse tours entirely
- Hero image on Nassau Homepage swapped to turquoise-boat photo

## Prioritized Backlog

### P0
- **Apple Login** — waiting on user's $99/yr Apple Developer account. Use `integration_playbook_expert_v2` when unblocked.

### P1
- **Refresh remaining hero slides** (Atlantis, Rose Island, Junkanoo) with proprietary photos.
- **Verify baseline prices** — audit partner live pages, drift must be < $5.
- **User Action**: Submit site to Google Search Console.
- **User Action**: Run `sudo bash scripts/install-backup-cron.sh` on live VPS.
- **User Action**: Whitelist preview + prod hostnames in Cloudflare Turnstile dashboard.

### P2
- Referral-card test locator (deferred).
- Pin Undo Toast finalization.
- Split Driver Leaderboard by individual names.
- Modularize `server.py` (>3900 lines).
- Rate-limit failed logins (cool-down after N wrong attempts).

## Third-party Integrations
- Cloudflare Turnstile (Signup/Login/Reset CAPTCHA) — user-owned site + secret keys
- ip-api.com (IP → country for fraud watch + analytics) — no key needed
- Claude Sonnet 4.6 (Live Chat) — Emergent LLM Key
- Claude Sonnet 4.5 (Vision OCR/Face Match) — Emergent LLM Key
- Stripe (Payments) — user API key
- Twilio (SMS) — user API key
- SendGrid (Email) — user API key
- AviationStack (Flight Tracking) — user API key
- Facebook Graph API — user API key
- Mega.io (DB Backups) — user credentials
- Emergent Google OAuth (customer login)

## Test Credentials
Admin: `roxfam2509@gmail.com` / `admin123`
