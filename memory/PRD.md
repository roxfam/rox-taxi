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

### ✅ Shipped this session
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
- **Facebook auto-post scope** — Backend + admin UI is fully wired (`facebook.py`, approve endpoint triggers `post_gallery_photo_to_facebook`, GalleryPanel shows the "will auto-post" hint, admin gets push confirmation). Token is valid and page (`Rox Taxi Service`, ID 1094615913735647, 26 followers) is reachable — but Facebook returned `(#200) pages_manage_posts is not available` because the app "Rox Taxi Service" (App ID 2873613109656683) is in Development Mode. Owner must (a) confirm they're listed as Admin at https://developers.facebook.com/apps/2873613109656683/roles/roles/ and (b) re-generate a Page token via Graph API Explorer with `pages_manage_posts` explicitly checked. Once a new token is pasted, no code change needed — just swap `FB_PAGE_ACCESS_TOKEN` in `backend/.env`. **Everything else is fully verified end-to-end (22/22 tests, iter_22).**

- **Facebook auto-crop + repost + approved-tab UI** (Feb 2026) — Approved submissions bucket in GalleryPanel with Pending / Approved tab switcher, FB status badge (posted/failed/not-sent), per-item Repost button (`POST /api/admin/gallery/{id}/repost-facebook`), and "view live post" ExternalLink icon when `facebook_post_id` is stored. Pillow (12.3.0) `_optimise_for_facebook` center-crops every upload to 1200×630 in-memory (respects EXIF rotation, flattens alpha PNGs, falls back gracefully on decode error). New backend endpoints: `GET /api/admin/gallery/approved`, `POST /api/admin/gallery/{id}/repost-facebook`. All covered by `/app/backend/tests/test_facebook_crop.py` + `test_iteration22_gallery_fb.py`.

- **Batch iter 23–24 (Feb 2026)** — shipped in one session:
  - **Fleet page `/fleet`** — 4 driver bios + 5 vehicles + trust notes. Backend `GET /api/fleet` + `PUT /api/admin/fleet`. Header nav updated.
  - **Baby / child seat rental add-on** — `$7 per seat / day`, **free** on rentals of **14+ days**. Backend `BABY_SEAT_FEE_USD=7`, `BABY_SEAT_MAX=3`, `BABY_SEAT_FREE_AFTER_DAYS=14`. Frontend counter block in BookingFlow (rental only) with live fee/free-badge preview.
  - **Admin-run Promotions** — new `Promotions` tab in `/admin/manage`. CRUD via `GET/POST/PATCH/DELETE /api/admin/promotions`. Live-only feed at `GET /api/promotions`. Auto-applies best-matching active promo (percent or fixed-USD) to every booking; excludes deposit + tip. Fields: label, description, discount_type, discount_value, applies_to[taxi/tour/rental/all], starts_at, ends_at, active.
  - **Home slide upgrades** — image resolutions bumped from `w=1920/2400` → `w=2560/3200` with `q=90`, `sharp=15`, `sat=15`, `auto=format` (Unsplash) or `2560px` (Wikimedia thumbs). Slide backgrounds get a `filter: brightness(1.08) contrast(1.14) saturate(1.12)` for richer color. Nassau carousel thumbnails also boosted.
  - **New home slide** — Ardastra Gardens Zoo, with flamingo photo and CTA linking to `https://ardastra.com/`.
  - **Package photo swap** — "Airport + Blue Lagoon + Airport" bundle renamed to "LPIA → Blue Lagoon → LPIA" (matches sibling package format) with owner-supplied LPIA terminal photo.

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
