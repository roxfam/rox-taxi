# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 11 — Real Google Reviews (Admin Paste) + Fraud Freeze Button
**Reviews:**
- New `reviews` MongoDB collection + admin CRUD in `admin.py`:
  - `GET/POST/PUT/DELETE /api/admin/reviews` with `ReviewIn` model (author_name, rating 1-5, text, relative_time, profile_photo_url, author_url, active).
  - Public `/api/reviews` now reads from DB and **computes rating + total from actual pasted reviews** (no more inflated 4.9/187 seed data).
  - Empty state returns `{rating: 0, total: 0, reviews: []}` — the frontend's `GoogleReviews.jsx` already hides the section when data is empty (`if (!data) return null`).
- New `<ReviewsPanel />` admin component with paste form (5-star selector, textarea, author URL, relative-time chip), live avg-rating stat, deep link to Google Business dashboard.
- New "Reviews" tab wired into `AdminManage.jsx` between Promotions and Images.
- Auto-generates a colored initial avatar (`ui-avatars.com`) when profile photo is blank so the homepage card never breaks.

**Country Freeze:**
- New `country_freezes` Mongo collection with `frozen_until` ISO timestamp.
- New endpoints: `POST /api/admin/country-freeze` (freeze N hours or hours=0 to unfreeze) + `GET /api/admin/country-freezes` (list active).
- Signup burst alert card now shows a **red "FROZEN" badge + green "Unfreeze"** or blue "Freeze 24h" button on each country row.
- `POST /auth/register` checks `country_freezes` before creating an account and returns **HTTP 403** if the signup IP resolves to a frozen country ("Signups from your region are temporarily unavailable").
- `signup-countries` analytics endpoint now overlays `frozen_until` + `freeze_reason` on each country row.

### Feb 10 — Signup Burst Alert + Fraud Watch Map + SEO Ranking Boost
- Burst alert on >3 signups per country per hour (1-alert-per-country-per-hour cooldown).
- Interactive world map + ranked table on Admin Dashboard.
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
- **Refresh remaining hero slides** (Atlantis, Rose Island, Junkanoo).
- **User Action**: Paste real Google Business reviews in Admin → Manage catalog → **Reviews** tab.
- **User Action**: Paste Google / Bing / Yandex verification codes in Admin → Site Config → Search engine verification.
- **User Action**: Submit `https://roxtaxi.com/api/sitemap.xml` in Google Search Console + Bing Webmaster.

### P2
- Google Places API auto-sync (deferred — user picked manual paste route first).
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
