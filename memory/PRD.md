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
- **Customer auth** — email/password + Emergent Google, JWT/session cookie, 1h idle auto-logout via `IDLE_TIMEOUT_MINUTES`, heartbeat endpoint, login_events audit log, auto-links past bookings by email. Signup/Login pages, MyBookings dashboard with cancel + pay balance + download receipt actions.
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

### 🎯 Backlog — Wave 2 (revenue/trust)
- ~~Airport flight tracker~~ ✅ shipped
- **Cross-sell "Add a tour" upsell** on booking success (LPIA→Atlantis → suggest Blue Lagoon $109 for tomorrow).
- **Gift cards / prepaid credits** via Stripe.
- **Package deals** — auto-generated bundles (e.g. "Airport + Tour + Airport return = $210 save $20").
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
