# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 12 — Google Reviews Auto-Sync + Email Blocklist + Warm-Lead Analytics
**Google Reviews Auto-Sync (Places API + 6-hour cron):**
- `.emergent/crons.yml` runs `POST /api/cron/sync-google-reviews` every 6 hours (`0 */6 * * *`).
- `WEBHOOK_CRON_SECRET` added to `backend/.env`; cron endpoint verifies bearer via `hmac.compare_digest` (401 without / 200 with).
- New `routes/cron.py` with the endpoint + background worker `_sync_google_reviews_bg()` — calls Places API (New) `GET https://places.googleapis.com/v1/places/{placeId}` with `X-Goog-FieldMask: reviews,rating,userRatingCount`.
- Upserts each review into `reviews` with `source="google"`, dedupe key `google_review_id`. Success/error tracked in `cron_runs` collection.
- Two new fields on `SiteConfigUpdate`: `google_places_api_key`, `google_place_id` — pasted in Admin → Site Config → **Google Places auto-sync**. Sync stays dormant until BOTH are set.
- Manual **"Sync from Google now"** button in Admin → Reviews panel triggers `POST /api/admin/reviews/sync-google-now` (same background worker).

**Email Domain Blocklist (Fraud Watch addition):**
- 33 disposable-email providers seeded (mailinator, tempmail, guerrillamail, yopmail…).
- New endpoints: `GET/POST/DELETE /api/admin/email-blocklist`. Custom entries stored in `blocked_email_domains`; seed defaults can be whitelisted per-entry without a code push.
- `is_email_domain_blocked()` helper wired into `POST /auth/register` — returns 400 with friendly message before the account is created.
- Verified: signup with `test@tempmail.com` → blocked; signup with `test@gmail.com` → passes.

**Warm-Lead Analytics:**
- Public `POST /api/chat/track-open` (called once per session by `ChatWidget.jsx` — sessionStorage-guarded).
- New `GET /api/admin/analytics/warm-lead` — 30-day window: warm opens, first-timer opens, unique visitors, engagement rates, `warm_vs_first_lift_pct`.
- New `<WarmLeadCard />` on Admin Dashboard: 4 stat tiles + colored lift badge (green ↑ / red ↓). Empty-state copy when no warm-lead traffic yet.
- Verified end-to-end with seeded data: 8 warm opens / 12 first-timer opens → +120.6% lift badge rendered.

### Feb 12 — Warm-Lead Signal on Chat Widget
- Client-side session counter (localStorage + sessionStorage guard, StrictMode-safe).
- 3rd+ session → chat greeting swaps to "Back again? Ask us anything — returning visitors get priority booking help" + 3-second amber FAB glow.

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
- **User Action**: Paste Google Cloud Places API key + Place ID in Admin → Site Config → Google Places auto-sync (enables 6-hourly auto-refresh).
- **User Action**: Paste Google / Bing / Yandex verification codes in Admin → Site Config.
- **User Action**: Submit sitemap in Google Search Console + Bing Webmaster.

### P2
- **More Fraud Watch additions** (deferred from menu): booking fraud detection · IP watchlist · card-testing detector · chargeback risk score · auto-freeze escalation · dedicated Fraud Watch tab.
- Referral-card test locator.
- Pin Undo Toast finalization.
- Modularize `server.py` (>3900 lines).

## Third-party Integrations
- Google Places API (New) — auto-sync reviews (user-owned key)
- Cloudflare Turnstile · IndexNow (Bing + Yandex + Seznam)
- ip-api.com (IP → country) · pycountry (name → ISO)
- react-simple-maps + world-atlas (fraud map SVG)
- ui-avatars.com (fallback review avatars)
- Claude Sonnet 4.6 (Chat) + 4.5 (Vision) — Emergent LLM Key
- Stripe · Twilio · SendGrid · AviationStack · Facebook Graph · Mega.io

## Scheduled Tasks (`.emergent/crons.yml`)
- `sync-google-reviews` — every 6h, pulls Places API top-5 reviews

## Test Credentials
Admin: `roxfam2509@gmail.com` / `admin123`
