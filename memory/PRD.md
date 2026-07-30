# Rox Taxi Service & Tours — PRD

## Problem statement (unchanged)
Nassau/Paradise Island taxi + tours + car-rental booking platform. Fixed-fare
tariffs, PayPal + Stripe + Zelle payments, Twilio SMS + SendGrid email
notifications, admin panel, live GPS driver tracking, Claude AI live chat,
cruise-port focus. Owner: roxfam2509@gmail.com / +1 (242) 432-2587.

## Users
1. **Guests / cruise passengers** — book from mobile, need clarity, trust, speed
2. **Owner (roxfam2509@gmail.com)** — accepts payments, dispatches drivers
3. **Drivers** — receive assignments, share live GPS

## Stack
React + FastAPI + MongoDB. Frontend at 3000, backend at 8001, ingress `/api/*`.
LIVE integrations: Twilio SMS, PayPal (live keys), SendGrid, Emergent LLM key
(Claude Sonnet 4.6 chat + Emergent Google auth), Stripe (test), Google Translate.

## Feature status snapshot — Feb 2026

### ✅ Shipped Feb 2026 (namecheap-vps deploy hardening)
- **Removed "Multi Island / Coming Soon" city switcher** from header (Freeport/Exuma/Andros hidden from UI). Backend `/cities` + `/cities/:slug` route retained.
- **CORS hardened for production** — `backend/server.py` no longer sends `allow_credentials=True` with wildcard origins (silently killed auth in prod). New behavior: when `CORS_ORIGINS` env is set, credentials + explicit origins; blank → wildcard + no credentials.
- **`CORS_ORIGINS` documented** in `.env.example` + `DEPLOYMENT.md` step 6a.
- **ChatWidget FAB & panel logo** switched from Emergent CDN → local `/logo-gold.webp` (portable after VPS deploy).
- **PDF receipts logo** — `pdf_utils.py` now reads from `frontend/public/logo-gold.webp` first, falls back to `PDF_LOGO_URL` env (defaults to `https://roxtaxi.com/logo-gold.webp`).
- **Referral card timeout fix** — `MyBookings.jsx` now renders the `[data-testid="referral-card"]` wrapper unconditionally for logged-in users, with a skeleton state while `/referrals/summary` is loading. Playwright selectors no longer time out.
- **Image Health panel (NEW)** — `GET /api/admin/images/scan` HEAD-checks every image URL across home slides, tours, rentals, taxi services, and approved guest photos concurrently (semaphore=16). New "Image Health" tab in `/admin/manage` shows total scanned / broken / healthy counts, per-item error, copy-URL, open, and one-tap "Fix" link to the matching catalog tab. Verified: 63/63 healthy on current catalog.

### ✅ Shipped Feb 2026 (License v7: Trusted-tier tuning + Anniversary Perk + 2x Referral Boost)
- **`TRUSTED_MIN_RENTALS` raised to 5** — Rox Trusted badge now earned over a full vacation season.
- **Anniversary Perk** — added `ANNIVERSARY_PERK_PCT = 15` / `ANNIVERSARY_PERK_WINDOW_DAYS = 30`. Daily branch in `_license_maintenance_loop` finds Rox Trusted guests whose first approved rental was ≥ 365 days ago, generates a personal code (`ROXY1-XXXXXX`), emails an anniversary offer, and stores `anniversary_perk` on the user doc + `anniversary_perk_sent_at` flag (idempotent).
- **Trusted Referral Boost** — `TRUSTED_REFERRAL_MULTIPLIER = 2` doubles the credit awarded in `_award_referral_credit` whenever the referrer is Rox Trusted.

### ✅ Shipped earlier this session
- Rox Trusted Traveller Tier + License Renewal Nudge.
- Expiry countdown + Rotate license from My Bookings + Admin OCR correction + Guest Wallet.
- AI OCR + selfie face-match via Claude Sonnet 4.5 vision + One-tap SMS approve.
- Elegant upload page with guide overlays, 14-day retention, expiry alerts.
- Per-category email senders, SEO overhaul, VPS deploy readiness pass.
- **License Renewal Nudge** — new branch in `_license_maintenance_loop` scans user wallets daily and emails guests when their saved license is 45 days or fewer from expiry. Idempotent via `users.license_wallet_nudged_at`. Email routes via `confirmation@roxtaxi.com` and links straight to `/my/bookings` with the elegant Rotate flow.
- **Rox Trusted Traveller Tier** — helpers `_approved_rental_count(email)` + `_is_trusted_traveller(email)` (≥ `TRUSTED_MIN_RENTALS = 3` prior approved rentals). New rental bookings for trusted guests with a valid wallet get an **auto-approved license** (`from_trusted_tier: true`, `reviewed_by: rox-trusted-auto`) — no upload SMS/email sent, no admin action needed. Guests still see a golden "Rox Trusted Traveller" card on the upload page if they land there.
- **Admin panel & upload page badges** — `★ Rox Trusted` chip in the admin licenses row (gold on cream), and a large gold hero card on `/upload-license` for trusted guests.
- Verified end-to-end: seeded 3 approved rentals for `trusted-qa@example.com`, 4th booking auto-applied wallet with `status:approved, from_trusted_tier:True, reviewed_by:rox-trusted-auto`.

### ✅ Shipped earlier this session
- Expiry countdown + Rotate saved license from My Bookings.
- Admin inline OCR correction + Guest Wallet card in My Bookings.
- AI OCR + selfie face-match via Claude Sonnet 4.5 vision.
- Guest wallet auto-save on approve + reuse card + one-tap SMS approve.
- Elegant upload page with guide overlays.
- 14-day retention, expiry-before-pickup alerts.
- Per-category email senders, SEO overhaul, VPS deploy readiness pass.
- **Expiry countdown on wallet card** — `GET /my/license-wallet` now returns `days_to_expiry` and `expires_soon` (≤30d). The wallet card in `/my/bookings` cross-fades between three tiers: **green "Ready to reuse"**, **amber "Nd to expiry"** (with warning line), **red "Expired"** — so returning guests refresh before their trip.
- **Rotate saved license from My Bookings** — new authenticated endpoint `POST /api/my/license-wallet/rotate` accepts front + back + selfie + optional metadata. Partial rotations preserve untouched fields. Admin gets an email + SMS heads-up that the wallet was rotated. Frontend: "Rotate license" button opens a compact modal (`WalletCard.jsx`) with three file pickers and 3 metadata inputs. No new booking required.

### ✅ Shipped earlier this session
- Admin inline OCR correction + Guest Wallet card in My Bookings.
- AI OCR + selfie face-match via Claude Sonnet 4.5 vision (background task).
- Guest wallet auto-save on approve + reuse card on upload page.
- One-tap SMS approve, optional selfie, 14-day retention, expiry-before-pickup alerts.
- Elegant upload page with guide overlays + trust chips.
- Per-category email senders (`confirmation@`/`quotes@`/`info@`).
- SEO overhaul, JSON-LD, sitemap.
- Namecheap VPS deploy readiness pass + smoke-test script.
- Rental extension e2e test 12/12.
- **Admin OCR correction** — new `PATCH /api/admin/bookings/{id}/license/fields` endpoint + inline **"OCR fields (edit to fix)"** row in the admin licenses panel (Name / Number / Expiry / Region). One keystroke away from fixing a wrong AI-read; Save button appears only when dirty.
- **Guest Wallet in My Bookings** — signed-in customers see a new indigo **"Saved license · Guest wallet"** card at the top of `/my/bookings` with masked number, expiry, "View saved photo →" and a **"Forget it"** button. Powered by `GET/DELETE /api/my/license-wallet`. Shows an "Expired" chip when the license expiry has passed.

### ✅ Shipped earlier this session
- AI OCR + selfie face-match via Claude Sonnet 4.5 vision (background task).
- Guest wallet (auto-save on approve, reuse card on upload page).
- One-tap SMS approve, optional selfie, 14-day retention, expiry alerts.
- Elegant upload page with guide overlays.
- Per-category email senders, SEO overhaul, VPS deploy readiness.
- **AI license verification via Claude Sonnet 4.5 vision** — background task after every upload calls Claude with front + back + selfie images and returns structured JSON. Populates `license.ai_name`, `ai_license_number`, `ai_expiry_date`, `ai_state_or_country`, `ai_selfie_match` (0-100), `ai_notes`. Any guest-blank field is auto-filled with the OCR result. New module `/app/backend/license_ai.py` keeps the LLM integration isolated. Verified with a synthetic Bahamas license image: OCR nailed number `BS2026-98765`, expiry `2030-05-15`, country `BAHAMAS`.
- **Admin panel chips** — selfie face-match chip (green ≥75, amber 60-74, red <60), state chip, AI note warning, and `♻ Guest wallet` badge for reused licenses.
- **Guest Wallet** — `_save_wallet_license` copies an approved license snapshot to the user's profile on both admin-approve and SMS one-tap-approve; upserts by email so guest-only checkouts still get a wallet. `GET /bookings/{id}/wallet-license-preview` + `POST /bookings/{id}/reuse-wallet-license` power a "Reuse my saved license?" card on the upload page (indigo gradient, one-tap). Reuse creates a fresh pending license on the new booking; admin still one-tap approves via SMS (per user's safety preference). Wallet is valid forever until `expiry_date` passes.

### ✅ Shipped earlier this session
- One-tap SMS approve, optional selfie, 14-day retention.
- Elegant upload page + guide overlay.
- Retention purge + expiry-before-pickup alerts.
- Per-category email senders + SEO overhaul + JSON-LD.
- Namecheap VPS deploy readiness pass.
- **One-tap SMS approve** — every "license pending" SMS + email now includes a secure per-booking approve link (`/api/admin/licenses/quick-approve/{id}?token=<16-byte>`). Tapping it approves the license, sends the guest their approval email, invalidates the token, and shows a styled confirmation page. Verified: first tap ⇒ approved, second tap ⇒ "Link invalid or expired".
- **Optional selfie photo** — third drop-zone on the upload page (labelled "Selfie next to your license (recommended)") with a face-silhouette guide. Stored as `license.selfie_url`, shown in the admin panel next to front + back (3-column grid), and included in the retention purge.
- **Retention shortened** to 14 days (`LICENSE_RETENTION_DAYS = 14`).

### ✅ Shipped earlier in this session
- Elegant driver's-license upload page with guide overlay, trust chips, animated status.
- License retention purge loop + expiry-before-pickup alerts.
- PUBLIC_SITE_URL registered in Admin → Tokens → Site.
- Full license CRUD + admin review queue.
- Per-category email senders (`confirmation@`/`quotes@`/`info@`).
- SEO overhaul + JSON-LD + sitemap.
- Rental extension e2e test 12/12.
- Namecheap VPS deploy readiness pass + `scripts/vps-smoke-test.sh`.
- **Elegant driver's-license upload page** (`/upload-license/:bookingId?t=…`) — serif hero, warm cream background with soft radial glow, drop-zone cards with **guide overlay** (corner brackets + placeholder mockups for front & back), live image previews, optional metadata drawer, trust chips (encrypted / staff only / auto-delete), WhatsApp fallback link, animated status banners for pending / approved / rejected.
- **License retention (auto-delete)** — new `_license_maintenance_loop` runs every 12 h, deletes license image files from disk `LICENSE_RETENTION_DAYS=30` days after rental end date, keeps the metadata + sets `license.purged_at` for audit. Admin panel shows a "Files purged (retention)" hint on old rows.
- **License expiry alerts** — helper `_license_expires_before_pickup(booking)` flags approved licenses whose `expiry_date` is earlier than pickup. Fires one-time admin SMS + email (`license.expiry_alerted_at` for idempotency), and shows a red **"Expires before pickup"** chip in the admin panel row (with red expiry-date text).
- **PUBLIC_SITE_URL registered** in Admin → Tokens → Site so links can be updated live without a redeploy; falls back to `https://roxtaxi.com`.
- **Driver's license capture for car rentals** (previously shipped) — full flow: `POST /bookings/{id}/license`, `GET /license/status`, admin `GET /admin/licenses`, `/license/approve` and `/license/reject`.

### ✅ Shipped earlier this session
- Per-category email senders (`confirmation@`/`quotes@`/`info@`).
- SEO overhaul for "Nassau taxi service Bahamas" (title, meta, JSON-LD, sitemap).
- Namecheap VPS deploy readiness check + `/app/scripts/vps-smoke-test.sh`.
- Rental extension e2e test passed 12/12.
- **Driver's license capture for car rentals** —
  - Backend: `POST /api/bookings/{id}/license` (public, token-guarded), `GET /api/bookings/{id}/license/status?t=…`, admin `GET /api/admin/licenses?status=…`, `POST /api/admin/bookings/{id}/license/approve` and `/reject`. Booking doc gets `license_upload_token` (random 24-char) on creation and a nested `license: {front_url, back_url, status: pending|approved|rejected, name_on_license, license_number, expiry_date, rejection_reason, reviewed_at, reviewed_by}`.
  - Guest flow: after a rental booking is created we email + SMS the guest a short link `/upload-license/{id}?t=<token>` (front + back, both optional, 8MB max, jpg/png/webp/heic).
  - Admin flow: **new "Licenses" tab** in `/admin/manage` with status filter (Pending / Approved / Rejected / Not uploaded), inline image preview, approve, reject-with-reason (fires guest re-upload email + SMS), copy-link.
  - Admin notify: SMS + email to admin the moment a new license is uploaded ("pending review").
  - Verified end-to-end on preview: booking → token → upload (front + back, name/number/expiry) → pending list shows 1 row.
- **Per-category email senders** — `send_email(..., category=...)` routes confirmations → `confirmation@roxtaxi.com`, quotes → `quotes@roxtaxi.com`, contact/group → `info@roxtaxi.com`.
- **SEO overhaul for "Nassau taxi service Bahamas"** — keyword-focused title/description, 45+ long-tail keywords, richer JSON-LD (LocalBusiness, TaxiService, BreadcrumbList, 11-question FAQ), sitemap with lastmod + image tags + per-attraction pages.
- **Baha Mar destination photo** — swapped to Grand Hyatt Baha Mar aerial hotel exterior in `Tours.jsx` (HUB_ATTRACTIONS).
- **Blue Lagoon destination photo** — swapped to Blue Lagoon Island private-beach aerial in `Tours.jsx` (HUB_ATTRACTIONS).
- **Namecheap VPS deploy readiness check — PASS.** Static scan confirmed: no hardcoded secrets, no preview URLs in runtime code, CORS/`allow_credentials` combo safe, `.env.example`s complete, `DEPLOYMENT.md` + `bootstrap-vps.sh` current.
- **VPS smoke-test script** — `/app/scripts/vps-smoke-test.sh` (7 automated checks: HTML, catalog APIs, admin login, TLS, HTTPS redirect).
- **Rental extension end-to-end test — 12/12 PASSED** on preview (`/app/backend/tests/test_rental_extension.py`). Live-key run to happen on production.

### ✅ Shipped earlier this session
- **Round-trip taxi discount** — 10% off both legs, toggle in booking modal, computed server-side (base doubles, 10% off both legs, bridge toll applies once), shown on receipt.
- **Multi-day rental discount tiers** — 3% at 5+ days, 7% at 7+ days, 12% at 14+ days. Auto-applied server-side.
- **Tip field on booking** (`tip_amount` on model, accepted at booking-create time).
- **Custom route quote widget** — `/api/taxi/quote` + `/api/taxi/quote-request` + 14 canonical Nassau locations. On /taxi page: pick From + To → instant fare OR request-a-quote form with SMS + email alerts.
- **Live driver ETA** — Track page uses Haversine distance from customer's geolocation to driver's GPS ping, shows "Driver X min away · X.X km".
- **QR code on booking success** — cruise-passenger friendly, embeds tracking link.
- **Print-friendly receipt** — `/receipt/:bookingId` page with @media print CSS.
- **Live-stats social-proof badge** — `GET /api/live-stats`, shows "N booked / hr" chip in header.
- **8-language switcher** — Google Translate widget: EN, ES, FR, HT, DE, NL, ZH-CN, TR.
- **Elegant branding** — gradient serif "Rox Taxi Service" + italic serif "& Tours" wordmark with gold hairline accent in header, mobile drawer, footer.
- **Official gold-R monogram logo** (Feb 2026) — rolled out to header, mobile drawer, footer (white variant on navy), payment success page, printable receipt, and browser favicon / Apple touch icon. Static assets at `/logo-gold.webp`, `/logo-white.webp`, `/logo-mark.png` under `frontend/public/`.
- **Customer gallery submissions + admin approval queue** (Feb 2026) — public `GallerySubmitCard` on `/gallery` posts to `POST /api/gallery/submit` (multipart, ≤8MB, image only). New `GalleryPanel` in `/admin/manage?tab=gallery` lists pending submissions with Approve / Reject buttons hitting `POST /api/admin/gallery/{id}/approve|reject`. Approved photos flow into public `GET /api/gallery` under `category:"guests"`. Admin dashboard header includes a "Guest Photos" quick-link with pending-count badge so the operator can never miss a new submission. 12/12 backend pytests pass (`/app/backend/tests/test_gallery_submissions.py`).
- **Taxi fare edits** — LPIA→Downtown $40, LPIA→Cable Beach $35, Baha Mar↔Downtown $25, Downtown↔Paradise $20, Cruise Port→Baha Mar $25, LPIA→Cruise Port $40, Nassau→Adelaide $60, Hotel→Fish Fry $20, +Paradise Island→Montague Beach $20 (NEW).
- **Bug fix — Saturday closure** — was blocking any 7+ day rental (impossible to span a Saturday). Now only pickup date is validated; customers can keep the car through Saturday.
- **Deployment package** — `/app/deploy/` with:
  - `DEPLOYMENT_GUIDE.md` (3-path playbook: hybrid recommended)
  - `frontend_build/` (production React static — 285KB gzipped JS + 20KB CSS)
  - `mongo_export/` (BSON for `mongorestore`)
  - `mongo_json/` (per-collection portable JSON)
  - `backend_php_starter/` (paused PHP/MySQL rewrite scaffolding)
  - `rox_taxi_deploy_20260728.tar.gz` (1.5MB — single-file download)

- **Airport flight tracker** ✅ — AviationStack API integrated (`/api/flight/{fn}` with 10-min cache). New `FlightTrackerCard` on taxi bookings shows live flight status, ETA, delay minutes, and one-click "adjust pickup" that auto-syncs booking time to arrival + 25-min buffer. `flight_number` now stored on booking records. Free tier = 100 lookups/month; cached responses conserve quota.
- **Auto-refund on cancel** ✅ — `POST /api/bookings/{id}/cancel` now fires Stripe or PayPal refund APIs automatically when ≥48h notice + payment was made. Zelle refunds still owner-handled (booking notes it). `cancellation.refund_result` records provider ID + status. Frontend displays outcome in the cancel toast.
- **Blackout calendar** ✅ — Admin sets unavailable dates via `POST /api/admin/blackout-dates`. Public read via `GET /api/blackout-dates`. `_validate_open_day` blocks bookings on those dates with a friendly "We're offline on YYYY-MM-DD" message. Cache refreshed after each admin update. Verified end-to-end.
- **Tour upsell on booking success** ✅ — New `TourUpsellCard` on the PaymentSuccess page shows 2 contextually chosen tours based on the completed booking's dropoff (Atlantis / Cruise Port / Cable Beach). Direct links to `/tours#{id}`. Featured/popular tours ranked first.
- **Iteration 19 tests** ✅ — 15/15 backend pytest + FlightTrackerCard E2E validated (WU805 shows Western Air GGT→NAS with recommended pickup, ZZ9999 shows not-found, <3-char guard works, pickup-aligned indicator renders). Only sanitisation nit fixed (raw Stripe/PayPal error strings no longer leaked in refund_result.error).
- **Blackout dates admin UI** ✅ — New `BlackoutDatesSection` inside `SiteConfigPanel`. Date picker + Add button + list with per-row Remove. Persists via existing `POST /api/admin/blackout-dates` endpoint. Auto-refreshes cache. Data-testids: `admin-blackout-panel`, `admin-blackout-date-input`, `admin-blackout-add-btn`, `admin-blackout-list`, `admin-blackout-item-{date}`, `admin-blackout-remove-{date}`, `admin-blackout-empty`.

- **Admin Guest-Photos discoverability** (Feb 2026) — pending-count badge on `/admin` header ("Guest Photos" quick-link) so the owner never misses a new customer submission. AdminManage now supports `?tab=` deep-linking + URL sync on tab change. Verified 100% by testing agent (iteration_20). Test seeded 1 guest photo; approval flow round-trip clean.

- **Package deals frontend + admin push + driver manifest** (Feb 2026, this pass):
  - **PackagesStrip** — new component on `/` (`data-testid="packages-strip"`) presenting the 2 seeded bundles (airport-atlantis-airport, airport-tour-airport) with subtotal → package price, savings badge, item list, "Book bundle" CTA that deep-links to `/contact?package={id}`. Auto-hides when no active packages. Also exports a compact `variant="booking"` mode for future embedding in the booking flow.
  - **Admin Web Push (VAPID)** — `pywebpush` server-side, service worker at `/sw.js`, endpoints: `GET /api/admin/push/vapid-public-key`, `POST /api/admin/push/subscribe`, `POST /api/admin/push/unsubscribe`, `POST /api/admin/push/test`. Auto-triggered on new bookings and new guest-photo submissions. `PushToggle` in admin header lets the owner enable / test / disable with one tap. VAPID keys already generated + stored in `backend/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Dead subscriptions (410 Gone) auto-cleaned.
  - **Driver Manifest** `/driver/manifest` — mobile-first navy screen for the owner/driver: today's bookings with time chips, per-card tap-to-call + WhatsApp + Google Maps buttons, and one-tap advance button (Confirmed → Assigned → En route → Arrived → Completed) hitting `PATCH /api/admin/bookings/{id}/status`. Backed by new `GET /api/admin/driver/manifest?date=YYYY-MM-DD`. Auto-refreshes every 60s. Discoverable via a "Manifest" quick-link in the admin dashboard header (`data-testid="admin-nav-manifest"`).

- **Facebook auto-post on approval** (Feb 2026) — when the admin approves a guest photo, backend fires `POST /{PAGE_ID}/photos` on the Facebook Graph API (v20.0) with a rotating caption drawn from 3 approved templates (`{name}` + `{website}` placeholders). Result is stored on the submission (`facebook_posted`, `facebook_post_id`, `facebook_error`) and the admin receives a Web Push confirming "Guest photo published ✓" or a failure alert. Facebook is best-effort — approval always succeeds locally. Config: `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`, `FB_GRAPH_VERSION`, `FB_AUTOPOST_ENABLED`, `FB_SITE_URL` in `backend/.env`. Diagnostics: `GET /api/admin/integrations/facebook/status`. Rox Taxi Service page (26 followers) confirmed reachable and token valid — pending `pages_manage_posts` scope grant.

### 🚧 In-flight — awaiting user action
- **Admin Tokens & Secrets panel** ✅ (Feb 2026, this pass) — new `/admin/manage?tab=tokens` shows **29 keys across 9 groups** (Facebook, Twilio SMS, Email/SendGrid+SMTP, Stripe, PayPal, AviationStack, Emergent LLM, Web Push VAPID, Google OAuth). Backed by `secrets_store.py` (DB-managed values override `.env` at read time, cached in-process). Facebook.py and notifications.py now resolve creds via `get_secret()` so token rotation is hot-swappable — no restart. Sensitive values are masked (`••••XXXX`), Facebook group has a **Test Connection** button hitting `GET /api/admin/tokens/facebook/status`. Endpoints: `GET /api/admin/tokens`, `PUT /api/admin/tokens`, `DELETE /api/admin/tokens/{key}`. **Copy .env snapshot** buttons (masked / plaintext-download) via `GET /api/admin/tokens/env-snapshot?reveal=bool` — for handoff / migration. 10/10 backend pytest pass (`test_iteration25_tokens.py`), full frontend regression clean.
- **Tours page → Attraction Discovery Hub** ✅ (Feb 2026, this pass) — `/tours` now leads with a 4-card discovery hub (Ardastra $15, Atlantis $20, Blue Lagoon $20, Baha Mar $20) linking to the existing micro-landings; original 13-tour "Curated Excursions" section preserved below with sort controls intact. Data-testid: `attractions-hub-grid` + `hub-card-{slug}`.
- **Attraction landing hero images fixed** ✅ — Atlantis / Blue Lagoon / Baha Mar heroes now use reliable Unsplash URLs (previously broken Wikimedia CORS-blocked URLs).
- **Paradise Island & Atlantis City Tour photo swap** ✅ — replaced Unsplash SUV with the owner-supplied Majestic Tours van photo (`08y2qvto_684289985_...jpg`) on the `atlantis-tour` card.
- **Rose Island Reef Snorkeling photo swap** ✅ — owner-uploaded underwater snorkeling shot (`hndk8d8i_img_2696snorkelling.webp`) on the `snorkel-rose` card.
- **Gallery broken-file cleanup** ✅ (Feb 2026, this pass) — 14 broken images resolved:
  - 5 home-slide Wikimedia URLs (hero-atlantis / hero-exuma / hero-straw / hero-fort-charlotte / hero-baha-mar) — replaced with reliable Unsplash URLs in both `seed_data.py` **and** existing Mongo docs (since seed uses `$setOnInsert`).
  - 2 tour Wikimedia URLs (tou-6509fb7e Exuma pigs, tou-acf99d2e Atlantis Aquaventure) + 1 Pexels 403 (island-hop) — replaced in Mongo.
  - 8 legacy guest-photo relative URLs (`/uploads/guest_*.png`) — canonicalised at read time in `GET /api/gallery` (`_canonicalise` helper) **and** migrated existing `db.gallery_submissions.url` values to `/api/uploads/...` in one shot. `submit_gallery_photo` now stores the `/api/` prefix for new uploads.
  - Full site scan post-fix: 38/38 gallery items reachable, 44/44 images render on `/gallery` with zero HTTP 4xx responses.

- **Multi-city foundation** ✅ (Feb 2026, this pass) — 4-city registry (`GET /api/cities`) with Nassau active + Freeport/Exuma/Andros in coming-soon mode. Header `CitySwitcher` dropdown; non-Nassau slugs route to `/cities/:slug` **ComingSoon** splash with email wait-list capture (`POST /api/waitlist` → `db.waitlist`, dedup on {email, city}). Choice persists in localStorage.
- **Referral rewards** ✅ (Feb 2026, this pass) — every new signup auto-gets a `ROX-XXXXXX` code + `credit_balance` field. Optional `referral_code` accepted in `POST /api/auth/register` (silently ignored if invalid to prevent enumeration). `_apply_referral_conversion_if_paid` hook in `payments._mark_paid` fires once per referee's first paid booking, awards **$25** every 5th conversion to the referrer's balance. `GET /api/referrals/summary` returns code + counts + progress. Signup form has referral input (auto-fills from `?ref=CODE`), MyBookings shows a referral card with copy-link + stats + progress bar to next reward. **Nudge banner** shows at the top of MyBookings when `next_reward_at ≤ 2` and `total_converted > 0` — a bright gold "Your $25 credit unlocks in N more referrals" strip with a Copy invite link CTA (`referral-nudge-banner` testid).
- **Credit auto-apply at checkout** ✅ (Feb 2026, this pass) — on booking creation, if the customer email maps to a user with `credit_balance > 0`, up to the remaining total is auto-applied. Stored as `referral_credit` + `referral_credit_pending=true` on the booking. `_apply_referral_conversion_if_paid` deducts the amount from the user's `credit_balance` only when the booking transitions to paid (via `payments._mark_paid`), so cancellations / failed checkouts never burn credits. Verified end-to-end: $50 credit user booking $40 taxi → total $0 (credit applied 40, still $50 pending on user until pay); $100 booking → total $50 (capped at 50 credit); guest with no credit → full $40 unchanged.
- **`/fleet` cleanup** ✅ (Feb 2026, this pass) — removed dead `GET /api/fleet` + `PUT /api/admin/fleet` + `FleetUpdate` model. Fleet seed block kept (no cost) but public endpoints now return 404. Frontend Fleet page was already gone.
- **Deployment package** ✅ (Feb 2026, this pass) — `/app/DEPLOYMENT.md` (432-line VPS Pulsar guide) + `/app/scripts/bootstrap-vps.sh` (one-shot installer for Node 20, Python 3.11, MongoDB 7, Nginx, Certbot, UFW, fail2ban, yarn, swap) + `/app/backend/.env.example` + `/app/frontend/.env.example`. Zero-broken-link scan: 15/15 frontend routes + 8/8 API endpoints return 200.

- **Facebook auto-post scope** — Backend + admin UI is fully wired (`facebook.py`, approve endpoint triggers `post_gallery_photo_to_facebook`, GalleryPanel shows the "will auto-post" hint, admin gets push confirmation). Token is valid and page (`Rox Taxi Service`, ID 1094615913735647, 26 followers) is reachable — but Facebook returned `(#200) pages_manage_posts is not available` because the app "Rox Taxi Service" (App ID 2873613109656683) is in Development Mode. Owner must (a) confirm they're listed as Admin at https://developers.facebook.com/apps/2873613109656683/roles/roles/ and (b) re-generate a Page token via Graph API Explorer with `pages_manage_posts` explicitly checked. **Now hot-swappable via `/admin/manage?tab=tokens` → Facebook → FB_PAGE_ACCESS_TOKEN** — paste new token, click Save, no restart needed.

- **Facebook auto-crop + repost + approved-tab UI** (Feb 2026) — Approved submissions bucket in GalleryPanel with Pending / Approved tab switcher, FB status badge (posted/failed/not-sent), per-item Repost button (`POST /api/admin/gallery/{id}/repost-facebook`), and "view live post" ExternalLink icon when `facebook_post_id` is stored. Pillow (12.3.0) `_optimise_for_facebook` center-crops every upload to 1200×630 in-memory (respects EXIF rotation, flattens alpha PNGs, falls back gracefully on decode error). New backend endpoints: `GET /api/admin/gallery/approved`, `POST /api/admin/gallery/{id}/repost-facebook`. All covered by `/app/backend/tests/test_facebook_crop.py` + `test_iteration22_gallery_fb.py`.

- **Batch iter 23–24 (Feb 2026)** — shipped in one session:
  - **Fleet page `/fleet`** — 4 driver bios + 5 vehicles + trust notes. Backend `GET /api/fleet` + `PUT /api/admin/fleet`. Header nav updated.
  - **Baby / child seat rental add-on** — `$7 per seat / day`, **free** on rentals of **14+ days**. Backend `BABY_SEAT_FEE_USD=7`, `BABY_SEAT_MAX=3`, `BABY_SEAT_FREE_AFTER_DAYS=14`. Frontend counter block in BookingFlow (rental only) with live fee/free-badge preview.
  - **Admin-run Promotions** — new `Promotions` tab in `/admin/manage`. CRUD via `GET/POST/PATCH/DELETE /api/admin/promotions`. Live-only feed at `GET /api/promotions`. Auto-applies best-matching active promo (percent or fixed-USD) to every booking; excludes deposit + tip. Fields: label, description, discount_type, discount_value, applies_to[taxi/tour/rental/all], starts_at, ends_at, active.
  - **Home slide upgrades** — image resolutions bumped from `w=1920/2400` → `w=2560/3200` with `q=90`, `sharp=15`, `sat=15`, `auto=format` (Unsplash) or `2560px` (Wikimedia thumbs). Slide backgrounds get a `filter: brightness(1.08) contrast(1.14) saturate(1.12)` for richer color. Nassau carousel thumbnails also boosted.
  - **New home slide** — Ardastra Gardens Zoo, with flamingo photo and CTA linking to `https://ardastra.com/`.
  - **Package photo swap** — "Airport + Blue Lagoon + Airport" bundle renamed to "LPIA → Blue Lagoon → LPIA" (matches sibling package format) with owner-supplied LPIA terminal photo.

- **Ardastra Gardens taxi routes + slide zoom-out + missing endpoint fix** (Feb 2026):
  - Two new taxi routes seeded: `downtown-ardastra` ($15) and `airport-ardastra` ($35) — both featured on `/taxi` with the flamingo photo.
  - `HomeHeroCarousel` now uses `background-size: contain` for `hero-ardastra` specifically (with a navy fill), so the whole family + flamingoes photo is visible instead of being top-cropped by `cover`.
  - **Bug fix**: `/api/taxi-services` was missing entirely — `Taxi.jsx` silently swallowed the 404 with `.catch(() => {})`. Added `@api_router.get("/taxi-services")` returning all active routes. All 26 fixed-fare routes now render on `/taxi`.

- **Attraction landing pages — batch 2** (Feb 2026) — `/tours/atlantis`, `/tours/blue-lagoon`, `/tours/baha-mar` shipped using the reusable `AttractionLanding` component. Each pulls live taxi routes from `/api/taxi-services`, links to the official external booking site, and lists hours + admission notes + 4 highlights. — new `AttractionLanding` component (reusable for Atlantis, Blue Lagoon, Baha Mar, etc.) + first instance at `/tours/ardastra`. Hero image, description, sidebar with address / hours / flamingo march times (10:30 · 2:15 · 4:15), auto-loaded taxi route cards ($15 downtown / $35 LPIA) with per-route "Book this ride" CTA, feature grid, and external CTA to `https://ardastra.com/`.
- **PromoBanner continuous marquee** (Feb 2026) — sitewide banner now scrolls the promo unit continuously (32s loop, pauses on hover, honours `prefers-reduced-motion`). Duplicated 4× in the DOM so the scroll never runs out of content.
- **Admin Promotions toggle UX** (Feb 2026) — button labels now read "On — click to turn OFF" (green) and "Off — click to turn ON" (grey outline) so the current state is unambiguous.

### 🎯 Backlog — Wave 2 (revenue/trust)
- ~~Airport flight tracker~~ ✅ shipped
- ~~Cross-sell "Add a tour" upsell~~ ✅ shipped
- ~~Gift cards / prepaid credits~~ ✅ shipped
- ~~Package deals~~ ✅ backend + auto-seed shipped; admin editor UI still pending
- **Verified TripAdvisor/Google badge** with real review stars.
- **"5 bookings today" ticker** widget under hero (backend `/api/live-stats` already exposes `bookings_last_24h`).
- **Selfie / license verification** for car rentals (deposit-dispute protection).

### 🔁 Backlog — Wave 3 (retention/ops)
- Frequent-rider punch card (10th taxi free).
- Birthday coupons (capture at signup, email on birthday).
- Post-trip "Leave a Google review" SMS at +6h via Twilio.
- Weekly Monday revenue email to owner.
- Driver dispatch SMS on "driver_assigned" status change.
- CSV / Excel export from admin panel.
- **Admin push notifications** via Web Push API (VAPID keys, service worker) — replace SMS-only alerts, free forever, works when Twilio is over budget.
- **Driver mobile app view** `/driver/manifest` — driver logs in, sees all today's assigned bookings on one screen with pickup/dropoff, phone tap-to-call, one-tap "en route → arrived → completed" status buttons.
- ~~**Auto-refund on cancellation**~~ ✅ shipped
- ~~**Blackout calendar in admin**~~ ✅ shipped (backend + `/api/admin/blackout-dates`; admin UI panel still to add in SiteConfigPanel).

### 🎨 Backlog — Wave 4 (polish)
- Tip chips on Pay page (backend `tip_amount` already accepted).
- Return-trip one-click upsell on booking confirmation.
- Weather badge on tour cards (OpenWeather).
- Sticky "Book on WhatsApp" mobile bar after 30s scroll.
- Live Google reviews via Places API (needs key).
- Admin Image Manager thumbnail-size selector.
- PHP/MySQL Namecheap Stellar rewrite (paused scaffolding in `/app/backend-php/`).

### 🚀 Backlog — Wave 5 (growth plays)
- **Fleet page / driver bios** `/fleet` — photos of each car + driver profile card (years driving, languages, cruiser reviews). Returning cruisers rebook the same driver → massive retention.
- **Multi-city expansion** — architecture already supports it via `location` field on catalog items. Add city switcher in header (Nassau / Freeport / Exuma / Andros), scope catalog + booking flow + admin panel by `location`. Separate SEO landing pages `/nassau`, `/freeport`, etc.
- **Referral rewards** — every 5th successful referral = $25 credit. Add `referral_code` to user model (auto-generated at signup), `referrals` collection tracking referrer/referee/status, `POST /api/referrals/claim`, credit balance shown in MyBookings, apply at checkout as coupon.

## Testing
- iteration_17.json — customer auth (this session, backend + frontend).
- iteration_16.json — pre-auth baseline.
- Admin login: roxfam2509@gmail.com / admin123.
- Customer auth: create via `/signup` or `POST /api/auth/register`.

## Key endpoints added this session
- `POST /api/auth/register`, `POST /api/auth/login-email`, `POST /api/auth/heartbeat`
- `GET /api/taxi/locations`, `POST /api/taxi/quote`, `POST /api/taxi/quote-request`
- `GET /api/live-stats`

## Key models updated
- `BookingCreate` — added `round_trip: bool`, `tip_amount: float`
- Fees updated: `ROUND_TRIP_DISCOUNT_PCT = 0.10`, `RENTAL_DISCOUNT_TIERS`

## Architecture notes
- Customer sessions share `db.user_sessions` collection with Emergent Google Auth
- Idle timeout enforced server-side in `get_current_user` + client-side heartbeat every 60s
- `db.login_events` audits every login/logout/auto_logout_idle
- Google Translate widget uses cookie-based selection; `#google_translate_element` host lives in `index.html`

## Owner details
- Email: roxfam2509@gmail.com · Phone/WhatsApp: +1 (242) 432-2587
- Zelle: roxfam2509@gmail.com / +1 (347) 751-5251
- PayPal.me: paypal.com/paypalme/roxtaxiservice (live)
