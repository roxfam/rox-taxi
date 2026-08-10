# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 10 — Fraud Watch Map (Admin Signup Geography)
- New `GET /api/admin/analytics/signup-countries` endpoint — aggregates users by `signup_country`, returns ranked rows with `iso3` (pycountry fuzzy match), count, first/last signup dates, sample city, latest email. Legacy + unknown accounts excluded from the map but surfaced as separate mini-stats.
- New `<SignupCountriesCard />` component rendered on Admin Dashboard:
  - Interactive world map (`react-simple-maps` + world-atlas TopoJSON on CDN) with 4-tier amber-to-navy fill scale by signup intensity.
  - Red pins on each country's centroid, sized by log(count) so single-signup countries stay visible next to clusters.
  - Ranked table beside the map with country, city, count, first-seen and last-seen dates.
  - Three mini-stats: unique countries, tracked signups, legacy users.
- Verified end-to-end (curl + screenshot): 7 countries + 14 pins rendered from seeded demo data; legacy count correctly shown (79).
- Test IDs added: `signup-countries-card`, `signup-countries-map`, `signup-countries-table`, `stat-unique-countries`, `stat-tracked-signups`, `stat-legacy-users`, `country-row-{slug}`, `country-count-{slug}`.

### Feb 10 — SEO Ranking Boost
- Dynamic `/api/sitemap.xml` (40 URLs, fresh lastmod).
- IndexNow push to Bing/Yandex/Seznam (verified HTTP 202) + admin "Ping now" button.
- 6 verification meta tag fields (Google, Bing, Yandex, Pinterest, Facebook, Norton) — pasted in admin panel, auto-injected into `<head>`.
- Rich JSON-LD: per-rental Vehicle schema, BreadcrumbList + AggregateRating on Taxi/Rentals.
- Improved robots.txt with explicit rules for Bingbot/YandexBot/DuckDuckBot/Applebot/GPTBot/ClaudeBot/PerplexityBot; aggressive scrapers throttled.
- Bahamas-specific keyword strengthening on Car Rental meta.

### Feb 7 — Suspicious Signup Alert + Turnstile CAPTCHA + Rate Limit Failed Logins
- Cloudflare Turnstile on signup, login, forgot-password (frontend widget + backend siteverify).
- Fraud-watch email alert fires once per country on first-ever signup from that country.
- 5-strikes-and-15-min-cool-down rate limit on both admin `/auth/login` and customer `/auth/login-email`.

### Earlier
- Optional Taxi Add-on with A/B upsell testing, Kids pricing, Photo Delete
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
