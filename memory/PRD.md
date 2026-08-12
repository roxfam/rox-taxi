# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 12 — Warm-Lead Signal on Chat Widget
- Client-side session counter (`localStorage.rox_visit_count`, bumped once per browser tab via `sessionStorage` guard) — no backend calls, works offline.
- Threshold: **3rd+ session** flips the visitor into "warm lead" mode.
- **Greeting swap** — first message becomes: *"Back again? Ask us anything — returning visitors get priority booking help — I'm Roxi 🌊, and I can pull up live prices…"* (vs generic on first visit).
- **Gentle 3-second amber glow** on the FAB the FIRST page load per session (guarded by `sessionStorage.rox_warm_glow_played` so navigating around doesn't retrigger).
- Injected via a scoped `@keyframes rox-warm-glow` stylesheet — fade-in at 15%, hold at 55%, fade-out to 0 by 100%.
- Accessibility: FAB `aria-label` and `title` swap to "Welcome back — chat with us" for returning visitors; hidden `data-warm-lead` + `data-visit-count` attrs for analytics/testing.
- Verified: 3rd+ visit → glow visible mid-animation + warm greeting · glow disappears after 3s · 1st visit → no glow + standard greeting.

### Feb 11 — Real Google Reviews (Admin Paste) + Fraud Freeze Button
- Reviews collection + admin CRUD + paste UI (new "Reviews" tab in Manage catalog).
- Public `/reviews` reads from DB (seed cleared; rating/total computed from real pasted rows).
- Country freeze — one-click "Freeze 24h" / "Unfreeze" per country on Fraud Watch card; `/auth/register` returns 403 for frozen countries.

### Feb 10 — Signup Burst Alert + Fraud Watch Map + SEO Ranking Boost
- Burst alert (>3 signups/country/hour, 1-hour cooldown).
- Interactive world map + ranked table.
- Dynamic sitemap, IndexNow push, verification meta tag fields, rich JSON-LD, improved robots.txt.

### Feb 7 — Turnstile CAPTCHA + First-Country Signup Alert + Rate Limit Failed Logins

### Earlier
- Optional Taxi Add-on with A/B upsell testing, Kids pricing, Photo Delete
- Advanced Blackout Date System + Downtime Financial Analytics + Insurance PDF + CSV
- Removed Yacht/Horse tours; new turquoise-boat hero photo

## Prioritized Backlog

### P0
- **Apple Login** — waiting on user's $99/yr Apple Developer account.

### P1
- **Google Reviews auto-sync** — user will paste API key + Place ID when ready. Infrastructure not built yet (paused).
- **Fraud Watch additions** — user asked about this but hasn't picked a subset yet (menu was: booking fraud detection · IP watchlist · email domain blocklist · card-testing detector · chargeback risk score · auto-freeze escalation · dedicated Fraud Watch tab).
- **Refresh remaining hero slides** (Atlantis, Rose Island, Junkanoo).
- **User Action**: Paste real Google reviews in Admin → Reviews tab.
- **User Action**: Paste Google / Bing / Yandex verification codes in Admin → Site Config.
- **User Action**: Submit sitemap in Google Search Console + Bing Webmaster.

### P2
- Referral-card test locator.
- Pin Undo Toast finalization.
- Modularize `server.py` (>3900 lines).

## Third-party Integrations
- Cloudflare Turnstile · IndexNow (Bing + Yandex + Seznam)
- ip-api.com (IP → country) · pycountry (name → ISO)
- react-simple-maps + world-atlas (fraud map SVG)
- ui-avatars.com (fallback review avatars)
- Claude Sonnet 4.6 (Chat) + 4.5 (Vision) — Emergent LLM Key
- Stripe · Twilio · SendGrid · AviationStack · Facebook Graph · Mega.io

## Test Credentials
Admin: `roxfam2509@gmail.com` / `admin123`
