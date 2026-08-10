# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 10 — SEO Ranking Boost (Google + Bing/MSN + Yandex + DuckDuckGo)
- New `routes/seo.py` router with three endpoints:
  - `GET /api/sitemap.xml` — dynamic sitemap, rebuilt on every hit from live catalog (tours, rentals, packages) with fresh `lastmod`. 40 URLs on first run.
  - `POST /api/admin/seo/indexnow-ping` — pushes URLs to Cloudflare/Bing/Yandex/Seznam IndexNow for instant re-crawl. Verified working (HTTP 202 back on test push).
- IndexNow key file (`9f2c8b4a6e1d7a3f5b9e2c8d4a6f1e7b.txt`) live at site root (HTTP 200).
- `SiteConfigUpdate` model gained six verification fields: `google_verification`, `bing_verification`, `yandex_verification`, `pinterest_verification`, `facebook_verification`, `norton_verification`.
- New `<SeoVerification />` React component mounts once at app load, reads `/api/site-config`, injects verification `<meta>` tags into `<head>`.
- Admin → Site Config panel gained a new "Search engine verification" section + "Ping Bing + Yandex now" button (test IDs: `seo-*-verification`, `indexnow-ping-btn`).
- Enhanced JSON-LD on `/taxi`, `/tours`, `/rentals`:
  - Taxi: added `BreadcrumbList` + `AggregateRating` to schema graph.
  - Rentals: added per-vehicle `Vehicle` schema with brand, seats, price, availability, priceValidUntil → unlocks rich-card pricing snippets in SERPs.
- Improved `robots.txt`: explicit rules for Googlebot, Bingbot, msnbot, YandexBot, DuckDuckBot, Applebot, GPTBot, Google-Extended, ClaudeBot, PerplexityBot. Blocks SemrushBot / AhrefsBot / DotBot aggressively.
- Bahamas-specific keyword strengthening on Car Rental page meta (added: "hire car Nassau", "no credit card car rental Nassau", "PayPal car rental Bahamas", "Zelle car rental Nassau", "van rental Bahamas 8 passenger", "cheapest rental Nassau", etc.).

### Feb 7 — Suspicious Signup Alert + Turnstile CAPTCHA + Rate Limit Failed Logins
- Turnstile on signup, login, forgot-password (both frontend widget + backend siteverify).
- Owner-only fraud-watch alert fires once per country the first time a signup arrives from a country never seen before.
- 5-strikes-and-15-min-cool-down rate limit on both admin `/auth/login` and customer `/auth/login-email` (`login_failures` Mongo collection, `_check_login_rate_limit` helper).

### Earlier (previous session)
- Optional Taxi Add-on with custom admin pricing & A/B upsell testing
- Kids pricing UI, Photo Delete in Admin Gallery, Nissan NV200 Cargo Rental
- Advanced Blackout Date System + Downtime Financial Analytics (Reason Presets, YoY Delta, $ cost, sparklines) + CSV + Insurance-Ready PDF
- Removed Yacht and Horse tours; new turquoise-boat hero photo

## Prioritized Backlog

### P0
- **Apple Login** — waiting on user's $99/yr Apple Developer account.

### P1
- **Google Reviews — real reviews attach** — Started but paused. Two paths agreed: (a) Google Places API auto-sync + (b) Manual paste via admin panel. Need user's Google Cloud API key + Place ID for (a).
- **Refresh remaining hero slides** (Atlantis, Rose Island, Junkanoo) with proprietary photos.
- **Verify baseline prices** — audit partner live pages, drift must be < $5.
- **User Action**: Paste Google / Bing / Yandex verification codes into Admin → Site Config → Search engine verification.
- **User Action**: Submit `https://roxtaxi.com/api/sitemap.xml` in Google Search Console + Bing Webmaster.
- **User Action**: Run `sudo bash scripts/install-backup-cron.sh` on live VPS.

### P2
- **Fraud Watch Dashboard** — Map + country table in admin (signup_country field ready).
- Referral-card test locator.
- Pin Undo Toast finalization.
- Split Driver Leaderboard by individual names.
- Modularize `server.py` (>3900 lines).

## Third-party Integrations
- Cloudflare Turnstile (Signup/Login/Reset CAPTCHA)
- IndexNow (Bing + Yandex + Seznam + Naver instant re-crawl)
- ip-api.com (IP → country for fraud watch)
- Claude Sonnet 4.6 (Chat) + 4.5 (Vision) — Emergent LLM Key
- Stripe (Payments), Twilio (SMS), SendGrid (Email), AviationStack (Flights), Facebook Graph, Mega.io (Backups)

## Test Credentials
Admin: `roxfam2509@gmail.com` / `admin123`
