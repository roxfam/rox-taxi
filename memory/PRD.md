# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 7 — Cloudflare Turnstile CAPTCHA (Signup + Login + Password Reset)
- Added `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` to backend `.env`; `REACT_APP_TURNSTILE_SITE_KEY` to frontend `.env`.
- Backend `_verify_turnstile()` helper in `routes/auth.py` calls Cloudflare siteverify. Fails open (dev/preview) when secret is unset.
- Enforced on `POST /auth/register`, `POST /auth/login-email`, `POST /auth/forgot-password` (returns 400 if missing/invalid).
- New `<TurnstileWidget />` component (loads CF script once, renders the widget, callbacks for solved/expired/error).
- Wired into `Signup.jsx`, `Login.jsx` (email tab + inline forgot-password form).
- Submit buttons stay disabled until the challenge is solved.
- **⚠️ Requires user action**: add `bahamas-taxi-tours.preview.emergentagent.com` + `roxtaxi.com` in Cloudflare Turnstile dashboard → Hostname Management.

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
- Pin Undo Toast finalization (verify undo cancels FB post + notification).
- Split Driver Leaderboard by individual names.
- Modularize `server.py` (>3900 lines).

## Third-party Integrations
- Cloudflare Turnstile (Signup/Login/Reset CAPTCHA) — user-owned site + secret keys
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
