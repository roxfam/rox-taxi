# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 10 — Signup Burst Alert (Fraud Watch trigger #2)
- New `send_signup_burst_alert()` email template in `notifications.py`.
- New `_maybe_send_signup_burst_alert()` helper in `routes/auth.py` runs alongside the existing first-country alert:
  - Threshold: >3 signups from the same country inside a rolling 60-minute window.
  - Dedupe: at most one alert per country per hour (`signup_burst_alerts` collection stores `last_sent_at`).
  - Email includes: country, count, window, sample city/IP, up to 10 recent burst emails, CTA linking to admin fraud-watch card.
- Wired into `POST /auth/register` as a fire-and-forget `asyncio.create_task` so signup latency is untouched.
- Verified end-to-end (4 test cases): 3 signups→no alert · 4th→1 alert with "4 · Nigeria" in subject · 5th/6th during cooldown→no re-alert · after 60min cooldown→re-alert fires.

### Feb 10 — Fraud Watch Map (Admin Signup Geography)
- `GET /api/admin/analytics/signup-countries` aggregates users by country (pycountry ISO-3 fuzzy match).
- `<SignupCountriesCard />` on Admin Dashboard: interactive world map + amber-to-navy fill + red pins sized by count + ranked table with dates.

### Feb 10 — SEO Ranking Boost
- Dynamic `/api/sitemap.xml` (40 URLs, fresh lastmod).
- IndexNow push to Bing/Yandex/Seznam (verified HTTP 202).
- 6 verification meta tag fields (Google, Bing, Yandex, Pinterest, Facebook, Norton).
- Rich JSON-LD: per-rental Vehicle schema, BreadcrumbList + AggregateRating on Taxi/Rentals.
- Improved robots.txt with explicit rules for 10+ crawlers.
- Bahamas-specific keyword strengthening on Car Rental meta.

### Feb 7 — Turnstile CAPTCHA + First-country Signup Alert + Rate Limit Failed Logins
- Cloudflare Turnstile on signup/login/forgot-password (frontend widget + backend siteverify).
- Owner-only alert fires once per country on FIRST-ever signup from that country.
- 5-strikes-and-15-min-cool-down rate limit on both admin/customer login.

### Earlier
- Optional Taxi Add-on with A/B upsell testing, Kids pricing, Photo Delete in Admin Gallery
- Advanced Blackout Date System + Downtime Financial Analytics + Insurance PDF + CSV
- Removed Yacht/Horse tours; new turquoise-boat hero photo; 2017 Nissan NV200 Cargo Rental

## Prioritized Backlog

### P0
- **Apple Login** — waiting on user's $99/yr Apple Developer account.

### P1
- **Google Reviews — real reviews attach** — Started but paused. Needs user's Google Cloud API key + Place ID.
- **Refresh remaining hero slides** (Atlantis, Rose Island, Junkanoo).
- **User Action**: Paste Google / Bing / Yandex verification codes in Admin → Site Config → Search engine verification.
- **User Action**: Submit `https://roxtaxi.com/api/sitemap.xml` in Google Search Console + Bing Webmaster.

### P2
- Referral-card test locator.
- Pin Undo Toast finalization.
- Split Driver Leaderboard by individual names.
- Modularize `server.py` (>3900 lines).

## Third-party Integrations
- Cloudflare Turnstile · IndexNow (Bing + Yandex + Seznam)
- ip-api.com (IP → country) · pycountry (name → ISO)
- react-simple-maps + world-atlas (fraud map SVG)
- Claude Sonnet 4.6 (Chat) + 4.5 (Vision) — Emergent LLM Key
- Stripe · Twilio · SendGrid · AviationStack · Facebook Graph · Mega.io

## Test Credentials
Admin: `roxfam2509@gmail.com` / `admin123`
