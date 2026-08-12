# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 12b — Google Reviews Auto-Sync: 4-Star Quality Filter + ENV Priority
- `_sync_google_reviews_bg()` reads `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` from env FIRST (falls back to `site_config` for admin-panel convenience).
- **Only reviews with rating ≥ 4 are stored as active**; 1–3 star reviews counted in `last_skipped_low_rating` but never surface on the homepage.
- If a previously-kept review drops below 4★ on a later sync, the existing DB row is soft-hidden (`active=false`, `hidden_reason="below_4_stars"`) so the homepage reflects the star drift automatically.
- Homepage `<GoogleReviews />` already reads from `/api/reviews` (DB-backed) — 4+ star filter applies transparently.
- Verified end-to-end with mocked Places API: 5-review payload (5·4·3·5·2 stars) → **only 5 and 4-star ones stored**; simulated star drop → previously-kept row soft-hidden.

### Feb 12f — Driver Return-Leg SMS Nudge (30-min-before)
- New `send_return_leg_nudge()` in `notifications.py` — driver-only SMS (no guest ping) that says "⏰ RETURN LEG in 30 min · Booking {id} · Return pickup: {return_time} today · Guest: {name/phone} · Was: {dropoff} → back to {pickup} · Pax: {n}".
- Background reminder loop in `server.py` now scans for taxi bookings with `round_trip=True + return_time`, not cancelled/completed, no `return_leg_nudge_sent_at`. When the return timestamp (booking_date's calendar day + return_time) falls in [now, now+30m], the driver SMS fires and the doc is stamped.
- Uses the same 10-min interval + ADMIN_SMS_NUMBER as the existing day-of reminder loop — no new cron needed.
- Verified end-to-end: seeded a booking with return_time 15 min out → tick sent the driver SMS + stamped `return_leg_nudge_sent_at`.

### Feb 12e — Round-Trip Return-Time Picker
- New `return_time` field on `BookingCreate` model (backend) — stored on the booking doc when `round_trip=True` so drivers know exactly when to swing back for pickup.
- Frontend `Taxi.jsx`: right below the round-trip toggle, a gold-bordered "RETURN PICKUP TIME" card appears (fade-in animation) with a native `<input type="time">` picker + explainer copy ("we'll radio the driver so they swing back on the dot. Leave blank if flexible.").
- Verified end-to-end: booked port-love-beach with round-trip + return_time=16:30 → booking doc persisted `return_time: 16:30` alongside `round_trip_discount: $8.00`.

### Feb 12d — Per-Person Beach Taxi Fares + 2-Person Minimum + Round-Trip Support
- Added 4 new taxi services with `pricing_mode: "per_person"`:
  - `port-love-beach` — Downtown/Cruise Port → Love Beach @ $20/person
  - `port-cable-beach` — Downtown/Cruise Port → Cable Beach @ $10/person
  - `port-arawak-beach` — Downtown/Cruise Port → Arawak Cay Beach @ $7/person
  - `paradise-love-beach` — Paradise Island → Love Beach @ $30/person
- **2-person minimum enforcement**: solo travelers on any per-person route are billed at the 2-person rate (base = price × max(2, pax)). Booking flow adds a `billed_passengers` field and a note explaining the minimum. UI shows an orange "2-person minimum — you'll be billed as 2 passengers" line while pax=1, then grey "Priced per passenger · billed for N" from 2 upward.
- Booking flow (backend `create_booking` + frontend `BookingFlow.jsx`) reads `pricing_mode` on the taxi service — for `per_person` routes, base = price × max(2, passengers) and the flat-fare extra-passenger surcharge is skipped so guests aren't double-charged.
- Round-trip discount (10% off both legs) applies to per-person routes exactly like flat-fare routes — the checkbox already lives on every taxi booking modal.
- Taxi page cards show "/ person" suffix next to the price on the 4 new services.

### Feb 12c — Warm-Lead Discount Nudge + One-Time-Per-User Codes + Duplicate-Signup Guard + Collapsible Mobile Language Tab + Evening Urgency Whisper
- **Warm-lead promo card**: 4 admin-editable fields (`warm_lead_promo_enabled`, `warm_lead_promo_code`, `warm_lead_promo_discount_pct`, `warm_lead_promo_description`) surface a gold-bordered promo card inside the chat panel for returning visitors (3rd+ session). Copy-to-clipboard button, `chat-warm-lead-promo` testid.
- **Evening urgency whisper** (`GET /api/booking/urgency`): fires only past 5 PM Nassau time; renders a small "🔥 Only X of 5 slots left today" line inside the promo card AND the softer nudge state. Slot count = clamp(1, 5 − today's bookings, 4) so returning visitors always feel gentle scarcity in prime same-day-booking window.
- **`POST /api/chat/track-promo-copy`** — records each copy with IP + visit count; surfaced on `admin/analytics/warm-lead` as `promo_copies` + `promo_copy_uniques`.
- **One-time-per-user promo enforcement**: new `promo_redemptions` MongoDB collection tracks each auto-applied promotion per (promo_id, ip, user_id, email). Before applying `_best_active_promo` in booking creation, we check if that identity triple has already redeemed — if yes, promo is silently skipped and booking proceeds at full price. Redemption logged on booking insert.
- **`GET /api/promo/status`** — returns `has_redeemed` (across ANY promo for this IP or logged-in user) + `has_copied_warm_lead`. `PromoBanner` hides banner when `has_redeemed=true`; chat widget shows softer "Ready to book with your X% off?" nudge (testid `chat-warm-lead-nudge`) instead of the full copy card when they've copied but not booked.
- **Duplicate signup guard**: at `POST /auth/register`, reject if the same IP already has a user with the exact (case-insensitive) name → prevents fraud/spam multi-accounts from the same device. Hard cap: max 3 signups per IP in a rolling 90-day window as a backstop. Users get a friendly message routing them to sign-in or support. `name_lower` + `signup_ip` are indexed lookup fields on new user docs.
- **Collapsible mobile Language selector**: mobile drawer's `<LanguageSwitcher variant="mobile" />` is now a tap-to-expand tab (`lang-switcher-mobile-toggle` + `lang-switcher-mobile-panel`) instead of an always-visible 2-col grid — keeps the mobile menu footer tidy.
- Verified end-to-end: PUT config → GET `/api/promo/status` (before/after seeding a redemption doc) → warm-lead visitor sees full card, then after "copy" sees "Ready to book?" nudge on next session.

### Feb 12 — Google Reviews Auto-Sync + Email Blocklist + Warm-Lead Analytics
### Feb 12 — Warm-Lead Signal on Chat Widget
### Feb 11 — Real Google Reviews (Admin Paste) + Fraud Freeze Button
### Feb 10 — Signup Burst Alert + Fraud Watch Map + SEO Ranking Boost
### Feb 7 — Turnstile CAPTCHA + First-Country Signup Alert + Rate Limit Failed Logins

### Earlier
- Optional Taxi Add-on with A/B upsell testing, Kids pricing, Photo Delete
- Advanced Blackout Date System + Downtime Financial Analytics + Insurance PDF + CSV
- Removed Yacht/Horse tours; new turquoise-boat hero photo

## Prioritized Backlog

### P0
- **Apple Login** — waiting on user's $99/yr Apple Developer account.

### P1
- **Refresh remaining hero slides** (Atlantis, Rose Island, Junkanoo).
- **User Action**: Fill `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` in `backend/.env` (or Admin → Site Config) to activate 6-hourly auto-sync.
- **User Action**: Paste Google / Bing / Yandex verification codes in Admin → Site Config.
- **User Action**: Submit sitemap in Google Search Console + Bing Webmaster.

### P2
- More Fraud Watch additions (auto-freeze at threshold · VPN/proxy detection · device fingerprint · signup velocity chart · booking fraud detection · IP watchlist · card-testing detector · chargeback risk score · dedicated Fraud Watch tab).
- Modularize `server.py` (>3900 lines).

## Third-party Integrations
- Google Places API (New) — auto-sync via env `GOOGLE_PLACES_API_KEY` (4+ star filter)
- Cloudflare Turnstile · IndexNow (Bing + Yandex + Seznam)
- ip-api.com · pycountry · react-simple-maps · ui-avatars.com
- Claude Sonnet 4.6 (Chat) + 4.5 (Vision) — Emergent LLM Key
- Stripe · Twilio · SendGrid · AviationStack · Facebook Graph · Mega.io

## Scheduled Tasks (`.emergent/crons.yml`)
- `sync-google-reviews` — every 6h; keeps only 4+ star reviews

## Test Credentials
Admin: `roxfam2509@gmail.com` / `admin123`
