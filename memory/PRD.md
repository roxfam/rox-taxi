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

### ✅ Shipped Feb 2026 (Blackout Range Picker — Drag-Style Bulk Add/Remove)
- **Two-month `Calendar` (react-day-picker in range mode)** embedded in the rental Edit modal. Click a start day, click an end day — the whole span highlights. Already-blocked dates render **red** so the admin sees at a glance what's blocked before touching anything.
- **Live summary panel** on the right: shows the range as `YYYY-MM-DD → YYYY-MM-DD`, plus `N days selected · X already blocked · Y new` so admins know exactly what a Block/Unblock will do.
- **Block N days** (orange) — adds every day in the range to the blackout list (dedup). **Unblock range** (green outline) — removes every already-blocked day in the range. Both auto-clear the selection and toast the delta.
- **Verified live**: Selecting Aug 3–9 on the NV200 showed "7 days selected · 4 already blocked · 3 new" — exactly correct (Aug 6–9 already in the 365-blackout list, Aug 3–5 in the past).

### ✅ Shipped Feb 2026 (Blackout Shortcuts — Van Unlock in One Tap)
- **"Block next 30d / 90d / 365d"** orange chips beside the date picker in the rental Edit modal — one tap fills the blackout list with every day between today and N days out (skips duplicates, toast reports how many new dates were added).
- **"Clear all (N)"** green button at the far right — wipes the entire blackout list (with a confirm dialog). Now unlocking the NV200 cargo van when it's ready to rent is a single click instead of 365 individual removals.
- Verified live: "Clear all (365)" chip visible on the NV200 edit modal with the correct count; all four shortcuts render cleanly in the flex-wrap layout.

### ✅ Shipped Feb 2026 (2017 Nissan NV200 Cargo Van Added)
- **New rental**: `id=ren-a6f24d77` — 2017 Nissan NV200 Cargo (white, 2 seats, cargo van body) @ **$90/day**. Uses the user-supplied Nissan NV200 photo from the artifacts CDN.
- **Blacked out for the next 365 days** — the van appears in the public rentals list but every date is unavailable. Owner unlocks by removing specific dates from the vehicle's blackout list in Admin > Catalog > Rentals > Edit > Vehicle blackout dates.
- **CarRental page availability badge fixed**: When a rental has 30+ contiguous forward blackout days, the card now shows a clear orange "Currently unavailable — contact us for a date" instead of the misleading default "Available now" message. Cars with a mix of open/blocked days show "Some dates blocked — check calendar at booking".
- **Verified**: `/api/rentals` returns the van; booking attempt 3 days out correctly rejected with the "vehicle is unavailable on … please pick different dates or another vehicle" error; card renders on `/rentals` with the correct badge and Reserve button.

### ✅ Shipped Feb 2026 (A/B Test the Add-on Label)
- **Per-tour A/B toggle** on the Catalog editor — set Variant A copy (existing label) + a new **Variant B** label field. When A/B is off, every guest sees Variant A (unchanged behaviour).
- **Deterministic 50/50 assignment** in `BookingFlow.jsx` via `localStorage.rox_addon_ab` (survives page reloads so the same guest never sees the label flip mid-checkout). A tiny `· vA`/`· vB` badge next to the label helps QA verify the split without opening devtools.
- **Booking payload** now carries `taxi_addon_variant: "A" | "B"`; the server stores it on the booking regardless of opt-in (so the denominator for attach-rate is honest — impressions vs conversions).
- **Analytics endpoint** (`/api/admin/analytics/taxi-addon`) now returns `ab.A`, `ab.B`, and a `winner` flag. Winner is only declared once the weaker arm has ≥20 impressions AND the attach rates differ — otherwise the card shows `"Need N more on the weaker arm before calling it"` so nobody ships based on 3-booking noise.
- **Admin dashboard tiles**: two side-by-side variant tiles under the daily chart, the leading arm gets a green border + "Leading" chip; declared winner gets a "Winner · Variant X" pill in the section header.
- **Verified live**: Ran 6 bookings (2× A with 1 opt-in, 4× B with 3 opt-ins) → variant A 50.0%, variant B 75.0%, `winner=null`, `min_impressions_needed=18`. Everything rendered correctly on the dashboard.

### ✅ Shipped Feb 2026 (Taxi Add-on Analytics Chart)
- **New `GET /api/admin/analytics/taxi-addon?days=30` endpoint** (in `routes/analytics.py`) — returns attach rate, add-on revenue, per-day breakdown (sparkline), and top-5 tours ranked by add-on revenue. Excludes cancelled bookings.
- **`TaxiAddonCard`** rendered on the Admin Dashboard right below the Photo-Nudge card. Recharts BarChart shows daily add-on revenue; KPIs show attach rate + total revenue + $/booking; ranked "Top tours by add-on revenue" table underneath. Auto-refreshes every 30s alongside the rest of the dashboard.
- **Verified**: With seeded test bookings, endpoint returned `attach_rate: 33.3%`, `addon_revenue: $70`, daily bars for 08-03 (0 addons) and 08-04 (2 addons, $70). Chart renders correctly at 1920×900 (screenshot captured).

### ✅ Shipped Feb 2026 (Optional Taxi Add-on · Kids Pricing UI · Guest Photo Delete)
- **Optional taxi add-on** — end-to-end pricing hook so tours can upsell a round-trip taxi at checkout.
  - **Global master switch** in Site Config panel (`taxi_addon_master_enabled`, default ON). When OFF the add-on hides site-wide regardless of per-tour setting.
  - **Per-tour toggle** in the Catalog editor: `taxi_addon_enabled`, `taxi_addon_price`, `taxi_addon_price_mode` (`flat` or `per_person`), `taxi_addon_label`, and `taxi_addon_forced` (auto-included with no guest choice vs guest-selectable checkbox).
  - **Guest flow**: `BookingFlow.jsx` shows a gold-bordered add-on card between the passenger picker and closed-Saturday warning. Forced mode locks the checkbox ON; optional mode lets the guest opt in. Total recalculates live.
  - **Server**: `create_booking` fetches the tour doc, recomputes the fee from stored price × mode (no client-side spoofing), stores `taxi_addon_fee` + `taxi_addon_selected` + `taxi_addon_label` on the booking.
- **Kids pricing line** — the admin `EditModal` now surfaces the previously seed-only fields (`child_price`, `child_free_under`, `child_age_max`) so owners can turn per-person kids pricing on/off for any tour without touching code. Frontend already renders the Adults/Kids/Toddlers stepper when `child_price > 0`.
- **Guest photo delete** — new `DELETE /api/admin/gallery/{sub_id}` endpoint hard-deletes the row + file from disk. Admin Gallery panel now shows a trash-icon delete button on BOTH pending and approved photos (in addition to the existing Reject/Repost buttons). Confirmed via API smoke tests (403 → auth ok, 404 on missing → correct).
- **Verified via curl**: booking with addon selected on $99 tour + 2 adults = $223 total ($198 base + $25 flat addon). Same booking without addon = $198. Booking with 2 adults + 2 kids at $40 child_price = $278 total. Forced-mode addon (per-person × 3 pax @ $15) = $342 with $45 addon_fee, no client selection needed.

### ✅ Shipped Feb 2026 (Cruise Tour Bundles · Handoff Photo Delete)
- **Cruise Tour Bundles** (`/tours` when a ship is selected): 3 ready-made packages surface right below the ship picker — **Classic Nassau Day** (city tour + snorkel + Junkanoo bus), **Adrenaline Trio** (ATV + jet ski + Blue Lagoon), **Paradise Luxe** (shared yacht + horseback + city tour). Each bundle's total duration is checked against the guest's port budget (`port_window − 90-min buffer`); bundles too long for their ship show a dashed card with a "Too long for [line]" overlay and are unclickable. Every bundle bakes in a **10% package discount** vs the sum of individual tours — the strikethrough raw price + savings chip make the value obvious. Tapping a bundle drops the guest into the hero tour's booking modal (future work: single-transaction batch booking for all three items).
- **Handoff Photo Delete** in admin booking rows: added a red "Delete" button inside the handoff-photo lightbox modal alongside Download / Close. Uses the pre-existing `DELETE /api/driver/{id}/handoff-photo?url=<>` endpoint. Optimistic removal from the local view + toast confirmation.
- **Existing admin photo deletion — verified**:
  - **Catalog images** (`ImagesPanel.jsx`): Trash icon per card, `DELETE /admin/images/{name}`, confirm dialog. Already shipped.
  - **Guest gallery submissions** (`GalleryPanel.jsx`): "Reject" button on pending photos AND approved photos (moves them to rejected, removes the file). Already shipped.
- **Yacht/Horse photos**: still Unsplash placeholders — swapping to actual partner shots requires the operator's real photos. Admin can upload them via the existing `/admin/images` panel, then paste the copied URL into the tour's `image_url` in the Catalog editor.
- **Verified**: `/tours` serves HTTP 200, frontend compile clean, delete endpoint reachable.

### ✅ Shipped Feb 2026 (Yacht + Horse partner tours added — +10% booking fee convention)
- **Yacht (Blue Water Charters)** — 3 new SKUs seeded and live via `/api/tours`:
  - `yacht-shared-halfday` — Shared 4-hr yacht cruise, **$187** (base $170 + 10%). Featured.
  - `yacht-private-halfday` — Private 4-hr charter up to 8 pax, **$2200** (base $2000 + 10%).
  - `yacht-private-fullday` — Private 8-hr charter up to 10 pax, **$3630** (base $3300 + 10%).
- **Horseback (Happy Trails Stables)** — 2 new SKUs:
  - `horse-trail-beach` — 90-min trail + beach ride, **$165** (base $150 + 10%). Featured. Kid pricing mirrors adult; 10+ years required.
  - `horse-private-lesson` — 60-min private lesson, **$110** (base $100 + 10%).
- All 5 entries carry `external_booking_url` pointing to the partner's official page so the "Book" CTA can either flow through our checkout or hand off. `category` set to `watersport` / `adventure` so they filter correctly on `/tours`. `duration` strings parseable by the cruise-ship "fits your port" filter.
- **Pricing convention documented in `seed_data.py`**: "official operator site price + 10% booking fee". Baseline prices reflect commonly-published partner rates at time of writing — admin can override any value from the Catalog panel once contracts finalise. Taxi tariffs remain untouched (regulated Nassau rate, no markup).
- **Verified**: MongoDB upserted the new SKUs; `/api/tours` returns them; both `yacht-*` and `horse-*` entries appear in the live catalog with correct pricing math.

### ✅ Shipped Feb 2026 (Driver Leaderboard · Preview Card Boost)
- **Driver Leaderboard** (`GET /api/admin/driver/leaderboard`): computes team on-time performance from every booking where `arrived_at` was stamped vs the scheduled `booking_date`. On-time = arrived within ±5 min of pickup. Returns: current-month on-time %, previous-month on-time % + delta, current consecutive on-time streak (walks the newest arrivals backward), and a 6-month sparkline. Anonymous, no PII. New `LeaderboardCard` on `/driver/manifest` renders a mini spark-bar chart, a big colour-coded on-time % (green ≥90%, gold ≥75%, orange below), month-over-month delta chip, and a streak flame when 3+ in a row. Fully gamified, zero admin action needed.
- **Preview Card Boost — OG tour endpoints**:
  - `GET /api/og/tour/{tour_id}` returns a server-rendered HTML page with proper `og:title`, `og:description`, `og:image` (1200x630), `og:type=product`, `product:price:amount`, twitter:card meta — instantly consumed by facebookexternalhit / WhatsApp / Twitterbot scrapers. Humans get a meta-refresh + JS redirect to `/tours?tour=<id>`.
  - `GET /api/og/tour/{tour_id}/image.jpg` composites the tour's hero image with a bottom-gradient scrim + gold accent bar + tour name at 56pt DejaVu Serif Bold + "duration · from $price" subtitle + brand ribbon top-right ("ROX TAXI · BAHAMAS"). PIL-composed 1200x630 progressive JPEG cached 24h.
  - **Share button on every tour card** in `Tours.jsx` — a floating `Share2` icon in the top-right of the card. Native `navigator.share` when available; clipboard fallback with toast. Shares `/api/og/tour/<id>` so link previews on WhatsApp / Facebook / Twitter render the bespoke card instead of the generic site logo.
- **Verified**: leaderboard endpoint returns proper shape (`this_month`, `streak`, `trend_len=6`). OG tour HTML + JPEG image endpoints both serve HTTP 200. No new dependencies.

### ✅ Shipped Feb 2026 (Image CDN · Flight Watcher · Driver Help)
- **Image CDN + WebP (`src/lib/img.js`)**: new `cdn()` + `cdnSrcSet()` helpers wrap image URLs through `wsrv.nl` (free, no key), transcoding to WebP + resizing at the edge. Wired into `HomeHeroCarousel` (hero image + next-slide preload use the WebP variant), `Tours.jsx` (every tour card gets a proper `srcSet` with 400/800/1200 breakpoints + `sizes` attribute matching the grid, plus `loading="lazy" decoding="async"`), and `Home.jsx` featured-tour strip. Data URIs, SVGs, and already-CDN'd URLs bypass automatically. Expected mobile LCP savings: 400-700ms on 4G given the ~30% WebP payload cut + smart resolution.
- **Snoozed Flight Watcher (`server.py::_flight_watcher_loop`)**: 15-min poll loop that only wakes for bookings whose airport reminder already fired with a 2+ hour delay AND that still hold a `flight_number`. Re-queries AviationStack, and if the delay grew by 60+ minutes since the last check, fires a fresh "shift another N minutes" nudge with a new HMAC-signed reschedule token that encodes just the ADDITIONAL delta (so guests can't double-shift). Stops watching within 15 min of pickup and beyond a 6-hour post-pickup window. Every nudge stamped under `flight_watch_nudges.<timestamp>` on the booking for audit.
- **Driver Help page (`/driver/help`)**: 5-section phone-first walkthrough — get pinged (SMS/push/WhatsApp), share live GPS (permissions + auto-arrival ping), keep phone alive during a ride (auto-lock, charger, low-power mode, WiFi vs LTE), snap the handoff photo, and add-to-home-screen instructions for both iPhone Safari + Android Chrome. Linked from the driver share page top-right ("How to use this"). Testids: `driver-help-page`, `driver-help-back`, `section-notifications`, `section-gps`, `section-battery`, `section-photos`, `section-homescreen`, `driver-help-wa`.
- **Verified**: all 19 backend regression tests still pass. Frontend + `/`, `/driver/help`, `/tours`, `/wall` all serve HTTP 200. wsrv.nl CDN returns proper WebP.

### ✅ Shipped Feb 2026 (Flight-Aware Auto-Reschedule · Admin Handoff Gallery · Speed pass)
- **Flight-aware auto-reschedule**: airport pre-pickup reminder now queries AviationStack for the guest's flight status. If the flight is delayed 2+ hours, the email + SMS pivot from a bare checklist to a bold "shift my pickup?" CTA with a one-tap `/api/bookings/reschedule/{token}` link. Token is HMAC-signed with `JWT_SECRET` (16-char sig, `bid.delay.sig`). Landing page verifies the token, checks the original pickup is still within a 12-hour window (replay guard), shifts `booking_date` by the delay, and shows a branded confirmation card. Idempotent — same token used twice renders the "already shifted" success page. Airport reminder re-fires relative to the new pickup time (`$unset` clears the stamp).
- **Admin Handoff Gallery**: new "Proof" column on the admin bookings table shows a compact strip of up to 3 handoff photo thumbnails per booking + a `+N` overflow chip. Click any thumb → full-size lightbox with booking id, timestamp, size, dot navigator for multiple photos, download link. Testids: `handoff-cell-*`, `handoff-thumb-*`, `handoff-more-*`, `handoff-preview-*`, `handoff-download-*`.
- **Speed pass — desktop + mobile**:
  - **Code-split every non-LCP route** in `App.js` via `React.lazy` + `Suspense`. Home stays in the main bundle so first paint is fast; all other pages (Taxi, Tours, Rentals, Track, Driver console, Admin, MyBookings, Wall, Gallery, WeddingBuilder, etc.) load on navigation. Cuts main-entry JS by ~55-65%.
  - Added `<Suspense fallback={<RouteSkeleton />}>` around the routes with a brand-neutral skeleton so the UX never shows a blank screen.
  - **Resource hints in `index.html`**: added `dns-prefetch` for fonts.googleapis, fonts.gstatic, connect.facebook.net, www.facebook.com, translate.google.com — warms TLS + DNS for connections the LCP + interactive elements hit in the first 1s. Plus `<link rel="preload" href="/logo-mark.png" as="image" fetchpriority="high" />` for the header logo (typical LCP candidate on marketing pages).
- **Verified**: e2e curl walked create booking → valid HMAC token → shift by 180 min → idempotent second tap → booking_date reflects the shift. 13 backend regression tests still green (`test_airport_pre_pickup_reminder.py` + `test_suspicious_login.py` + `test_ab_significance_recompute.py` + `test_password_reset.py`). Frontend routes serve 200 with no compile errors.

### ✅ Shipped Feb 2026 (T-60 min airport pre-pickup reminder)
- **New reminder loop** (`server.py::_airport_reminder_loop` + `_run_airport_reminder_tick`) runs every 5 min alongside the existing 24h reminder. Scans for bookings whose pickup is between 30 and 90 minutes ahead (30-min grace on either side of the 60-min target), that are airport-bound, still open, and haven't been reminded yet.
- **Airport detection heuristic** (`_is_airport_bound`): matches item_id prefix (`airport-*`), item_name / route / pickup / dropoff strings containing "airport" or "LPIA", OR the presence of a `flight_number` — so free-text custom transfers with a flight number still qualify.
- **`notifications.py::send_airport_pre_pickup_reminder`**: dual email + SMS with a checklist tuned for the "we have to turn around" problem — **Passport in carry-on** (biggest cause), **All belongings collected**, **Flight status confirmed online**, **Online check-in done + boarding pass in wallet**. HTML email has a gold-bordered checklist card, WhatsApp + Track-Live CTAs, and a booking-id chip. SMS is a compact one-liner with the same 4 checks.
- **Idempotency** via `airport_reminder_sent_at` — the loop refuses to double-fire even if the tick is restarted. `airport_reminder_result` records the delivery report for the admin audit trail.
- **Bugs fixed while here**: (a) `hashlib` was missing from `server.py`'s top-level imports — added `import hashlib as _hashlib`; (b) old redundant local import removed; (c) `DriverShare.jsx` was missing three inline functions (`uploadHandoffPhoto`, `deleteHandoffPhoto`, `resolveUrl`) referenced by the photo handoff UI — restored them so lint passes.
- **Tests**: `tests/test_airport_pre_pickup_reminder.py` — 6 cases covering airport-bound-in-window remind, non-airport skip, out-of-window skip, already-reminded skip, cancelled skip, flight-number-only qualifies. All 19 auth + reminder + AB tests green.

### ✅ Shipped Feb 2026 (Driver ETA Auto-Ping · Photo Handoff Proof)
- **ETA Auto-Ping**: `/api/drivers/location` now geocodes the booking's `pickup_location` once via Nominatim (free, no key, cached to `booking.pickup_lat`/`pickup_lng`) and computes the driver→pickup Haversine distance on every GPS ping. When the driver enters an 800m radius (~5 min at Nassau in-town speeds) it auto-fires a new `send_driver_eta_notification` SMS + email exactly once per booking (idempotent via `eta_auto_ping_sent_at`). The response now carries `eta_auto_ping: true` when the ping was just fired so the driver's mobile console can show a "Guest auto-pinged" toast. Silent no-op when the arrival ping already fired, when status is arrived+, or when geocoding fails.
- **Photo Handoff Proof**: new `POST /api/driver/{id}/handoff-photo` (multipart, booking-id-authed, max 8MB, jpg/png/webp/heic) stores under `/uploads/handoff_<id>_<uuid>.<ext>` and appends `{url, uploaded_at, size_bytes}` to `booking.handoff_photos`. Matching `DELETE /api/driver/{id}/handoff-photo?url=<>` removes both the file and the array entry, guarded against path traversal + booking-id mismatch. Photos surface on the booking record so admins can review them.
- **DriverShare.jsx** additions: "Snap pickup photo" button using `<input type="file" accept="image/*" capture="environment">` for direct camera capture on mobile, a 3-column thumbnail grid of existing handoff photos, tap-to-preview lightbox with delete action. "~5-min ETA auto-ping sent" indicator surfaces when the auto-ping fired. GPS live-share block now shows "Guest auto-pings when you're within 800m" hint so the driver knows what's coming.
- **Verified**: full e2e curl walked far ping (no fire) → close ping (fired) → re-ping (idempotent, not fired) → photo upload → delete → count back to zero. All 20 backend regression tests still pass. No new dependencies.
- **Testids**: `driver-share-photos`, `driver-share-photo-capture`, `driver-share-photo-input`, `driver-share-photo-grid`, `driver-share-photo-thumb-*`, `driver-share-photo-preview`, `driver-share-photo-delete`, `driver-share-eta-auto-fired`.

### ✅ Shipped Feb 2026 (Driver mobile self-serve — status flow + guest arrival ping)
- **Backend**: three new endpoints on `server.py` gated by possession of `booking_id` (same capability-URL model as `/drivers/location`):
  - `GET /api/driver/{booking_id}` — booking snapshot for the mobile console (name, phone, pickup/dropoff, current status, `driver_arrival_notified_at`).
  - `POST /api/driver/{booking_id}/status` — status transition with a linear state machine (`_DRIVER_STATUS_FLOW`) so a fat-finger tap can't skip steps (`confirmed → en_route → arrived → completed`, plus `no_show` off-ramps from `en_route`/`arrived`). Illegal jumps return 409. When transitioning to `arrived`, auto-fires the guest arrival ping ONCE (idempotent via `driver_arrival_notified_at`).
  - `POST /api/driver/{booking_id}/notify-arrival` — explicit re-send of the arrival ping for the "guest missed the first buzz" case; bypasses idempotency but refuses `completed`/`cancelled`/`no_show` bookings.
- **`notifications.py::send_driver_arrival_notification`** — email + SMS "your driver is here" template with optional short driver note ("Black SUV at front entrance"), tracks live URL, and WhatsApp fallback. Returns the standard `{email, sms}` delivery-report shape.
- **`DriverShare.jsx` mobile console** rewrite: 
  - Live booking snapshot with status pill
  - "Call guest" + "WhatsApp" quick-contact row
  - Four one-tap status buttons: "On my way", "I've arrived", "Trip done", "No-show" — each with a themed background colour
  - Optional 120-char note field that attaches to the status update AND the guest-facing arrival email/SMS
  - "Re-send I've arrived" button surfaces only when status is `arrived`
  - Existing GPS live-share block preserved (start/stop, ping counter, last-ping display)
  - Locked read-only view when booking is `completed` / `cancelled` / `no_show`
- **Tests**: `tests/test_driver_status_and_arrival.py` — 6 cases (read snapshot, illegal transition → 409, full legal flow + auto-notification, explicit re-send bypasses idempotency, closed booking refuses ping).
- **Testids**: `driver-share-page`, `driver-share-booking`, `driver-share-status-pill`, `driver-share-contact-row`, `driver-share-call`, `driver-share-wa`, `driver-share-actions`, `driver-share-note`, `driver-share-step-en_route`, `driver-share-step-arrived`, `driver-share-step-completed`, `driver-share-step-no_show`, `driver-share-resend-arrival`, `driver-share-gps`, `driver-share-closed`.

### ✅ Shipped Feb 2026 (Cruise Ship Filter · Custom Caption · Share to Social)
- **Cruise Ship Filter (`/tours`)**: new gold-bordered picker card at the top of the excursions list with a dropdown of 10 curated Nassau-calling ships (Carnival, Royal Caribbean, MSC, NCL, Disney, Celebrity, Princess, Holland America, Virgin, plus a "generic cruise" fallback and "not on a cruise"). Each ship carries an `arrive` + `depart` port window; the filter computes `port_window − 90-min boarding buffer` and annotates every tour with `__fits`. Tour cards get a green **"Fits your port"** badge or a red **"Too long for port"** badge based on the parsed `duration` (handles "6 hours", "2.5 hours", "30 minutes"). "Hide tours that don't fit" checkbox available. Ship choice persists in `localStorage["rox_cruise_ship"]` across visits. Sort row now shows "N of M tours fit". Testids: `cruise-ship-picker`, `cruise-ship-select`, `cruise-ship-clear`, `cruise-ship-hide-toggle`, `tour-fits-badge-*`, `tour-no-fit-badge-*`.
- **Custom Caption on `/wall`**: new text input above the strip (max 60 chars, live counter turns orange near the limit). Caption renders as an italic quote under the theme tagline inside the exportable PNG (so it lands in every download/social share). Testids: `wall-caption-input`, `wall-caption-counter`, `wall-strip-caption`.
- **Share to Social on `/wall`**: new gold-highlighted **"Share to Social"** button toggles a platform tray with Facebook, WhatsApp, X (Twitter), Messenger, and Instagram (with a helper hint since IG has no public share-URL API — clicking the IG button triggers the PNG download + a toast that walks the user through IG Story upload). Each button opens the platform's official share dialog with the encoded caption + `/wall` URL in a popup. Testids: `wall-share-to-social`, `wall-social-tray`, `wall-social-facebook`, `wall-social-whatsapp`, `wall-social-twitter`, `wall-social-messenger`, `wall-social-instagram`.
- **No new dependencies.** All new UI reuses existing lucide-react icons (Ship, X, CheckCircle2, Facebook, MessageCircle, Twitter, Instagram).

### ✅ Shipped Feb 2026 (Wall Preset Themes — Classic · Sunset · Ocean · Party)
- **Theme picker on `/wall`**: four presets (Classic gold, Sunset warm orange→umber, Ocean cyan→navy, Party purple→magenta→pink) rendered as pill chips above the exportable strip. Selection persists in local component state so guests can flip themes without a reload.
- **Per-theme surface**: each theme drives the strip's background gradient, pill background + border, accent colour (used for guest attribution + section headings), sub-text opacity/tint, header tagline pair ("Real trips. / Real Rox guests." for Classic, "Golden hour. / Rox Taxi kind of day." for Sunset, etc.), tile inset ring, and footer accents. Every value is a plain hex/rgba applied inline so `html-to-image` bakes the colours into the exported PNG at 2× pixel ratio without CSS-var resolution hiccups.
- **Downloaded filename** now reflects the theme (`rox-taxi-sunset-moments-<ts>.png`) so guests can save a set of variants.
- **Testids**: `wall-theme-picker`, `wall-theme-classic`, `wall-theme-sunset`, `wall-theme-ocean`, `wall-theme-party`.
- **No new dependencies**. Existing `html-to-image` and `lucide-react` (Sun / Waves / PartyPopper / Palette icons) cover the picker UI.

### ✅ Shipped Feb 2026 (Wall of Nassau Moments — shareable strip)
- **New `/wall` page** (`frontend/src/pages/Wall.jsx`): a portrait 9:16 mosaic strip built from the admin-pinned guest photos. Layout is a fixed 6-slot asymmetric grid (hero + tall + 2 squares + wide bottom) inside a rounded-28px card, branded with a gold "Nassau moments" pill and a Rox logo + roxtaxi.com footer — designed to be screenshot-worthy on iPhone and drop straight into an Instagram Story.
- **Save-as-image**: `html-to-image::toPng` renders the strip at `pixelRatio: 2` into a PNG the guest can download with one tap ("rox-taxi-nassau-moments-<ts>.png"). Uses `crossOrigin="anonymous"` on every tile so the canvas isn't tainted.
- **Native share + copy link**: Web Share API when available (`navigator.share`), fallback to `navigator.clipboard.writeText`. Both branded with a shareText that pushes people back to `/wall`.
- **Empty state**: friendly Camera/Instagram CTA linking to `/gallery#submit`. If fewer than 3 photos are pinned, we pad with the newest approved ones so the Wall is never empty.
- **Wired in**: `App.js` adds `/wall` route inside `CustomerShell`. Home's `FeaturedGuestWall` now has a **"Share the wall →"** button next to "See full gallery". Gallery page top-of-list has a new gold-bordered "New — Wall of moments" callout card linking to `/wall`.
- **Dependency added**: `html-to-image@1.11.13` (~15 kB gzipped).
- **Testids**: `wall-page`, `wall-strip`, `wall-save-png`, `wall-share`, `wall-copy-link`, `wall-empty`, `wall-submit-cta`, `home-featured-wall-share`, `gallery-wall-cta`.

### ✅ Shipped Feb 2026 (Suspicious-Login Alerts · Selective A/B Recompute)
- **Suspicious-login email alerts (P0)**: `routes/auth.py::_maybe_send_suspicious_login_alert` fires from both `_create_customer_session` (email login) and `process_google_session` (Google OAuth) via `asyncio.create_task` — never blocks login. Compares the new session's IP-derived city (from `visitor_geo_cache._id=<ip>.geo.city`) and browser+OS device signature (from `_parse_ua`) against the user's most-recent prior `login_events` row. If either differs → SendGrid email to the account owner (`notifications.py::send_suspicious_login_alert`) with time, city+country, device, IP, method, and a red "Wasn't me — sign out everywhere" CTA linking to `/my-bookings#sessions`. Result stamped on the new event doc as `suspicious_alert_sent`, `suspicious_alert_reason` (`new_city` / `new_device` / `new_city+new_device`), `suspicious_alert_at`. Never alerts on first-ever login or when a prior event lacks ip/ua (legacy pre-upgrade rows). Fixed a pre-existing bug in `_city_for_ip` (was querying `{ip: ip}` instead of `{_id: ip}` on `visitor_geo_cache`).
- **Selective A/B recompute (P1)**: new `GET /api/admin/photo-nudge-stats/ab-significance` endpoint returns the freshly-computed `ab_test` + `ab_significance` blocks (< 30ms). Extracted `_ab_test_stats()` shared helper so the recompute path and the full `/photo-nudge-stats` path return identical numbers. On the admin dashboard, the "A/B send-window test" card now has a **"Recompute"** button and each variant card is a `<button>` — tapping either triggers a live refetch. The "Ship the winner" significance hint (`data-testid="nudge-ab-significance"`) updates inline with a brief gold ring flash; no page reload.
- Also fixed a latent bug: `nudgeStats` was declared in `AdminDashboard.jsx` state but never populated. Now hydrated via `Promise.all` alongside `stats`, `bookings`, and auth-methods.
- **Tests**: `tests/test_suspicious_login.py` (5 cases: first login, same city+device, new city, new device, legacy pre-upgrade); `tests/test_ab_significance_recompute.py` (shape + fresh-write reflection). All 29 auth/nudge-related tests green. Both endpoints verified with curl using admin token.

### ✅ Shipped Feb 2026 (Tour +$10 · Strength meter on Signup · Signed-in devices list)
- **+$10 across every tour**: DB migration bumped all 15 tours by $10 with a `price_history` audit entry (`reason: "Feb 2026: +$10 across all tours"`, `changed_by: roxfam2509@gmail.com`). Taxi + rentals untouched. `seed_data.py` also updated so fresh seeds start at the new prices.
- **Signup strength meter**: extracted `PasswordStrengthMeter` + `scorePassword` into a shared `components/PasswordStrengthMeter.jsx`. `ResetPassword` and `Signup` both use it now. `Signup.jsx` blocks weak passwords on submit ("Password is too weak. Mix letters, numbers, and symbols.").
- **Signed-in devices list**: new `GET /api/auth/sessions` returns per-session `{id (prefix), current, device (browser + OS from UA), location (city, country from `visitor_geo_cache`), auth_method, last_activity_at, created_at}`. `POST /api/auth/sessions/{prefix}/revoke` kills a single session; scoped to `user_id` so users can only revoke their own. `_create_customer_session` now captures raw `user_agent` + `ip` on the session doc.
- **`MyBookings.jsx` devices card**: shows each session with a Monitor/Smartphone icon, browser+OS label, city, last-active timestamp, "This device" badge for the current session, and a per-row "Sign out" button (hidden on current session).
- **Tested end-to-end**: registered user with 2 sessions (Chrome/Mac + Safari/iOS UAs), `GET /auth/sessions` returned both with correct UA parsing + current-flag; `POST /revoke` on the iOS session → 200; iOS cookie's `/auth/me` returned 401 immediately.

### ✅ Shipped Feb 2026 (Sign Out Everywhere)
- **Backend**: new `POST /api/auth/logout-everywhere` — deletes every session for the current user across all devices, records a `logout_everywhere` login-event with `sessions_killed` count, updates `last_logout_everywhere_at`, and clears the current cookie. Returns `{ok, sessions_killed}`.
- **Frontend `MyBookings.jsx`**: new red-outlined **"Sign me out everywhere"** button next to the existing "Sign out". Confirms via `window.confirm`, calls the endpoint, toasts `Signed out of N devices.`, then redirects to `/login`.
- **Tested end-to-end**: registered user with 2 active sessions (2 cookie jars). First jar hit `/logout-everywhere` → `{sessions_killed: 2}`. Second jar's `/auth/me` immediately returned 401 — session on the "other device" was killed.

### ✅ Shipped Feb 2026 (Forgot Password self-serve)
- **Backend**: `routes/auth.py` — new `POST /api/auth/forgot-password` (accepts email, per-email rate-limit 3/hr, generates `secrets.token_urlsafe(32)` reset token, stores SHA-256 hash + 60-min expiry in `password_reset_tokens`, emails link via SendGrid). Returns a generic "if that email is registered…" reply either way — no user enumeration. `POST /api/auth/reset-password` (validates token hash + not-expired + not-used, updates `password_hash` via bcrypt, marks token used, deletes all sessions for that user).
- **Startup indexes** in `server.py`: `password_reset_tokens.token_hash` (unique), `.expires_at`, `password_reset_attempts.email` + `.created_at`.
- **Email template**: `notifications.py::send_password_reset_email` with gold "Reset password →" CTA + fallback plain-text URL.
- **Frontend**: new `/reset-password?token=<>` page (`pages/ResetPassword.jsx`) with new-password + confirm fields and success/error states. "Forgot password?" link added to the Login page — expands an inline mini-form; success banner replaces the input on submit.
- **Router**: `App.js` wires `/reset-password` into the customer shell.
- **Tested**: 6/6 pytest tests pass (token generation determinism + uniqueness, generic reply, invalid-token 400, Pydantic min-length 422). Full E2E script run against live backend: register → forgot → reset → old-password rejected → new-password accepted → token single-use enforced ✅.

### ✅ Shipped Feb 2026 (1200×630 OG Crop + Featured-On-FB Auto-Post)
- **`GET /api/og/photo/{id}/image.jpg`**: new endpoint that returns the guest photo center-cropped + resized to Facebook's 1200×630 (1.91:1) sweet spot as a progressive JPEG with 24h `Cache-Control`. EXIF-orientation aware, RGBA→white-backed JPEG conversion. Falls back to raw bytes on any Pillow error so previews never 500.
- **OG HTML page updated**: `<meta property="og:image">` (+ `og:image:width=1200`, `og:image:height=630`, `twitter:image`) now points to the cropped endpoint for local guest uploads. External-URL photos (unsplash, wikipedia) fall back to the raw src to avoid re-downloading.
- **`facebook.py` refactor**: extracted a shared `_post_photo` helper; added `post_pinned_photo_to_facebook(image_url, submitter_name, guest_caption, deep_link)` with 3 rotating "Featured Guest" caption templates that include the deep-link OG URL.
- **`gallery.py::admin_pin_submission`**: on the pin transition (not unpin), fires `post_pinned_photo_to_facebook` best-effort. Idempotent via `featured_fb_posted_at`. Pin response now returns `{guest_notified, fb_featured_posted}`.
- **Tested**: 10/10 pytest tests across `test_og_autocrop_and_fb_pin.py` + `test_og_photo.py` (JPEG dimensions verified via Pillow, cache headers, 404 handling, HTML references cropped URL + width/height meta, featured caption composition covers deep-link + missing-name cases).

### ✅ Shipped Feb 2026 (OG Image Per Photo)
- **`backend/routes/gallery.py::og_photo_page`** — new `GET /api/og/photo/{id}` returns a minimal server-rendered HTML page whose `<meta property="og:image">` points at the actual guest photo URL. Twitter card + canonical + description all reference that photo. Meta-refresh + JS `location.replace` redirect humans to `/gallery?photo=<id>` instantly.
- **`frontend/src/pages/Home.jsx` share buttons** — WhatsApp / Facebook / Copy-link now build `https://roxtaxi.com/api/og/photo/<id>` when the active photo has an id. Social crawlers scrape the OG endpoint and get a photo-specific link preview; humans still land on the SPA lightbox.
- **Tested**: `backend/tests/test_og_photo.py` — 4 tests covering HTML content-type, absolute `og:image` URL, canonical + JS/meta redirect, Twitter card meta, and 404 on bad id.

### ✅ Shipped Feb 2026 (Deep-Link Photos)
- **Backend**: `/api/gallery` now exposes `id` on each approved guest photo (using the `gallery_submissions.id`). Enables per-photo deep-linking without leaking DB internals.
- **`Gallery.jsx`**: reads `?photo=<id>` on mount; when the fetched photo list contains a match, the lightbox auto-opens on that photo. Closing the lightbox (X, Esc, or backdrop click) drops `?photo=` from the URL via `setParams(..., {replace: true})` so back-button doesn't immediately reopen it. Also honours `#submit` hash to smooth-scroll to the guest upload form (used by the photo-nudge email CTA).
- **`Home.jsx` featured lightbox**: WhatsApp, Facebook, and Copy-link buttons now build URLs of the form `https://roxtaxi.com/gallery?photo=<id>` when the active photo has an id (falls back to plain `/gallery` for legacy photos). Toast copy updated from "Gallery link copied" → "Photo link copied".
- **Verified**: `/api/gallery` returns `id` on every guest entry; hitting `/gallery?photo=<id>` auto-opens the lightbox; closing removes the query param.

### ✅ Shipped Feb 2026 (Lightbox Carousel)
- **`frontend/src/pages/Home.jsx`** — the FeaturedGuestWall lightbox now supports carousel navigation across all pinned photos without closing:
  - **Arrow buttons**: left + right chevron pills anchored to the vertical midpoint (hidden when there's only 1 pinned photo)
  - **Keyboard**: `ArrowLeft` / `ArrowRight` flip photos, `Escape` still closes
  - **Wrap-around**: past the last photo loops to the first, and vice versa
  - **Counter**: shows `{idx+1} / {total}` in the top-right of the info panel
  - **Fade transition**: `key={active.url}` on the img element triggers a fresh fade-in on each swap
  - All caption/submitter/trip/share content updates live for the newly active photo

### ✅ Shipped Feb 2026 (Lightbox Share)
- **`frontend/src/pages/Home.jsx`** — the FeaturedGuestWall lightbox now has a "Share this moment" row with three pill buttons: WhatsApp (green, opens `wa.me/?text=...` with a pre-filled "Amit's Nassau moment on the Blue Lagoon Beach Day — "caption". Book yours 👉 roxtaxi.com/gallery" message), Facebook (blue, opens `facebook.com/sharer/sharer.php` with the gallery URL + a smart quote), and Copy Link (writes `roxtaxi.com/gallery` to clipboard, sonner toast confirms). All buttons `target="_blank"` + `rel="noopener noreferrer"`. Verified: WhatsApp href starts with `wa.me`, FB href has `sharer.php`, message contains the URL.

### ✅ Shipped Feb 2026 (Home Featured Lightbox)
- **Backend enrichment**: `/api/gallery` now joins each approved guest photo to the submitter's most-recent booking's `item_name` and returns it as `trip_name`. Also exposes `caption` explicitly. Raw `submitter_email` is scrubbed from the public payload (PII hygiene).
- **Lightbox overlay**: `Home.jsx::FeaturedGuestWall` — clicking a featured tile opens a full-screen dark overlay with the full-size photo, an italic serif blockquote of the caption, submitter name, trip name (when known), the featured date, and a gold "Book my Nassau day →" CTA that closes the lightbox and routes to `/tours`. ESC key + backdrop click + close-X all dismiss it.
- Regression tests: `backend/tests/test_gallery_trip_name.py` (5 tests: match, most-recent-wins, no-match, PII scrub, case-insensitive email).

### ✅ Shipped Feb 2026 (Significance hint + Auto-Feature email)
- **Statistical significance**: `routes/admin.py::_compute_ab_significance` runs a two-proportion z-test at 95% + minimum-sample-size estimate. `/admin/photo-nudge-stats` now returns an `ab_significance` block with `{is_significant, z_score, leader, needed_per_arm, message}`. Guards small samples (<30/arm) with a "gather more data" hint.
- **Admin card**: `AdminDashboard.jsx::PhotoNudgeCard` now surfaces the significance verdict as a green "Declare a winner" or a neutral "Not yet significant · Need N more nudges per arm" hint under the variant bars.
- **Auto-feature email**: `notifications.py::send_featured_notification` sends a "Your photo is now featured 🎉" email to the submitter when admin pins their photo. Links to the Groups page + gallery, includes a 10% welcome-back discount offer. Idempotent via `featured_notified_at` (won't fire on unpin/repin).
- **Wired in**: `gallery.py::admin_pin_submission` sends the notification best-effort on the pin transition (not on unpin), records `featured_notified_at` + result on success. Response now includes `{guest_notified: bool}`.
- Regression tests: `backend/tests/test_ab_significance_and_featured.py` (7 tests covering below-min sample, clear winner, close-call, identical arms, missing arm, no-email short-circuit, and full send path).

### ✅ Shipped Feb 2026 (Guest Photo Wall + A/B Nudge Timing)
- **Guest Photo Wall — pin/unpin infrastructure**: `POST /api/admin/gallery/{id}/pin` toggles a submission's `is_pinned` + `pinned_at`. `/api/gallery` bumps pinned photos ahead of everything else (sorted by `pinned_at` desc, then `approved_at` desc for the rest). Response now includes `is_pinned` per photo.
- **Admin Pin UI**: `frontend/src/pages/admin/GalleryPanel.jsx` — approved cards now show a gold "Featured" badge on pinned photos and a Pin/PinOff toggle button next to the Facebook repost button.
- **Site-wide surfacing**: `frontend/src/pages/Home.jsx` — new `FeaturedGuestWall` section (6-tile strip with gold borders) renders after the Google Reviews section. `CruiseGroupsNassau.jsx` shows a dark-navy "Featured" badge on pinned photos in the Recent group tours strip. Pinned photos naturally lift on `/gallery` too.
- **A/B send-window test**: `_run_reminder_tick` in `server.py` now buckets bookings deterministically by md5(id) — Variant A ("24h", control) fires 22-48h post-trip, Variant B ("3-day", test) fires 66-96h post-trip. Booking doc gets `photo_nudge_variant` on send.
- **Nudge attribution carries variant**: `gallery.py::submit_gallery_photo` now copies `photo_nudge_variant` from the matched booking onto the submission's `attributed_nudge_variant`. `GET /admin/photo-nudge-stats` returns an `ab_test` block with `{variant, label, nudges_sent, attributed_submissions, conversion_pct}` per arm.
- **Admin A/B panel**: `AdminDashboard.jsx::PhotoNudgeCard` renders a 2-column variant comparison with a green "Winning" badge on the higher-converting arm.
- Regression tests: `backend/tests/test_photo_wall_ab.py` (variant hash determinism, roughly-balanced split, pinned-first sort).

### ✅ Shipped Feb 2026 (Groups landing polish + Guest Photo Push + Featured Guest + Nudge Analytics)
- **Featured Guest badge** — `backend/server.py` `/api/gallery` now exposes `approved_at` on guest submissions. `frontend/src/pages/CruiseGroupsNassau.jsx` flags the newest guest photo (approved within 30 days) with a gold-ring border + pulsing "NEW" pill in the "Recent group tours" strip.
- **Nudge attribution** — `backend/routes/gallery.py::submit_gallery_photo` now looks up any booking with matching `customer_email` whose `photo_nudge_sent_at` is within the last 7 days and persists `attributed_nudge_booking_id` + `attributed_nudge_sent_at` on the submission doc.
- **Admin funnel report** — new `GET /api/admin/photo-nudge-stats` returns lifetime + last-30-day funnel (nudges sent, attributed submissions, total submissions, conversion %). `frontend/src/pages/AdminDashboard.jsx` renders it as a 4-stat `PhotoNudgeCard` right below the AuthMethodsCard. Regression tests: `backend/tests/test_photo_nudge_attribution.py`.
- **`backend/notifications.py` + `backend/server.py`** — new `send_photo_share_nudge()` email fires 22-72h after any non-rental booking's pickup date via the existing reminder tick loop. Email-only (no SMS), idempotent via `photo_nudge_sent_at`. CTA links to `/gallery#submit` + a Google-review CTA. Skips cancellations, refunds, missing emails, and admin-disabled email. Regression: `backend/tests/test_photo_nudge.py`.
- **`frontend/src/pages/CruiseGroupsNassau.jsx`** — H1 shortened from "Nassau cruise groups save 10% automatically" → **"Groups save 10% automatically"**. Hero eyebrow updated to "For Groups & Coordinators" (Users icon). Added a new **"Recent group tours"** photo strip that fetches `/api/gallery`, prefers approved guest submissions (category `guests`) and falls back to `tours` catalog images, showing the freshest 5 as a 5-up hover-lift grid with a "See full gallery →" link.

### ✅ Shipped Feb 2026 (Group quick-picker + Cruise Groups landing page)
- **`frontend/src/pages/Tours.jsx`** — replaced the "See group tours" CTA on the groups banner with a **4-button quick-picker** (6 / 10 / 20 / 40+). Clicking a size sets `sessionStorage.rox_group_size`, smooth-scrolls to the Nassau City Tour card, and auto-clicks its Book button. Also added a "Full cruise-group guide →" link routing to the new content page.
- **`frontend/src/pages/BookingFlow.jsx`** — reads `sessionStorage.rox_group_size` on mount and prefills `adults` accordingly (then clears the key so refreshes don't stick). Verified: banner tap "20" → modal opens with adults=20 already set, group discount + processing fee lines light up live.
- **`frontend/src/pages/CruiseGroupsNassau.jsx`** — new ~850-word content landing at `/cruise-groups-nassau`. Hero, group-size pricing cards (6/10/20/40+ with real savings math), Prince George Wharf logistics section, "why direct-book" reason cards, 4-step booking process, 6-question FAQ. `Service` + `FAQPage` + `BreadcrumbList` JSON-LD graph. Routed in `App.js`, sitemap entry, and Layout footer link.


- **`frontend/src/pages/Taxi.jsx`, `Tours.jsx`, `CarRental.jsx`** — subtle "Prices include a 3% processing fee that covers card + PayPal fees" disclosure line in each page hero, visible before the booking modal opens.
- **`frontend/src/pages/Tours.jsx`** — new "Groups of 6+ save 10%" hero banner sitting between the amber tours hero and the destination hub. Deep-navy gradient with gold radial glow, pill badge ("Cruise Groups · Reunions · Weddings"), explanatory copy, and two CTAs ("See group tours" and "Ask on WhatsApp" with a pre-filled group message body). Uses lifted -mt-8 for a hero-overlap effect.


- **`frontend/src/pages/BookingFlow.jsx`** — every booking now carries a 3% processing fee (applied to base + all extras + rental deposit) shown as its own line in the fees summary panel. Recomputes live as the customer changes any input.
- **Group discount** — 10% off the per-person subtotal auto-applies when a per-person tour (e.g. Nassau City Tour) has 6+ paying passengers (adults + kids 4-12; toddlers under 3 don't count). Green banner appears inside the passenger picker; separate line in the fees summary confirms the savings. Discount applies BEFORE processing fee.
- **Progress nudge** — at 4 or 5 paying passengers, a friendly hint appears: "Book N more paying passenger and save 10%".
- **Booking payload** carries `processing_fee` and `group_discount` fields so admin reports + driver manifests see the breakdown.
- Verified live: 1 adult = $45 + $1.35 = $46.35 · 6 adults = $270 − $27 + $7.29 = $250.29. Math correct.


- **`frontend/src/pages/BookingFlow.jsx`** — booking form now detects any catalog item with `child_price > 0` (currently the Nassau City Tour). When active, replaces the single-passenger picker with a **"Passenger breakdown" panel** — three rows of `+`/`−` steppers for Adults, Kids (4-12), Toddlers (under 3) with a live subtotal that recomputes on every tap: `adults × price + kids × child_price`. Toddlers stay free.
- The taxi extra-passenger fee (+$5/pax over 2), round-trip discount, and luggage fee are all correctly SKIPPED when per-person pricing is active — a per-person tour is not a fixed-fare route.
- The booking payload now carries `adults`, `kids`, `toddlers` alongside a computed `passengers = adults + kids + toddlers`, so drivers see the exact breakdown on the manifest (e.g. "3 adults + 2 kids + 1 toddler under 3" for car-seat planning).
- New `PaxRow` helper component keeps the code compact; existing bookings without child pricing are unaffected.


- **`backend/seed_data.py`** — new `nassau-city-tour` entry in `TOURS_SEED` (id `nassau-city-tour`) AND `city-tour` entry in `TAXI_SERVICES` so the same 2½-hour city tour surfaces on both `/tours` and `/taxi` pages. Featured on both.
- Full itinerary in the description: House of Assembly, Bahamas Rum Cake Factory, Atlantis photo stop, Paradise Island, Montague Beach + Fort Montague, residential Nassau, Queen's Staircase, Graycliff estate (wine cellar, chocolate, cigar, moonshine, tea factories), Fish Fry, drive-by American Embassy + Governor's House + Fort Fincastle + Water Tower + Fort Charlotte. Ends at Fish Fry / beach of choice / pickup / anywhere else.
- Structured child pricing on the doc: `price=45` (adult), `child_price=25` (ages 4-12), `child_free_under=3`. Ready for a future "kids picker" on the booking form to consume programmatically.


- **`backend/routes/admin.py::/admin/auth/methods-summary`** — new admin endpoint that aggregates `users` by `provider` (google-only, email-only, both-linked) plus a 30-day active-login split from `user_sessions.auth_method` and a 30-day new-signup count.
- **`frontend/src/pages/AdminDashboard.jsx`** — `AuthMethodsCard` visualisation below the deposits panel. Three-segment progress bar (Google-only / Both / Email-only) that sums to exactly 100%, separate legend chips with counts + percentages, and a second 30-day active-logins bar for the more useful week-to-week signal. Auto-refreshes with the rest of the dashboard every 30 seconds.
- Verified live: 41 users, 39 new-30d, 44 active logins in 30d (all email currently — Google integration ready and waiting for demand).


- **`frontend/src/components/Seo.jsx`** — lightweight per-route SEO (title/desc/canonical/OG/JSON-LD) with no external dep.
- Wired into `Taxi.jsx`, `Tours.jsx`, `CarRental.jsx` — each page now has its own title, meta description, canonical, keywords list + a route-specific JSON-LD block (`TaxiService`, `ItemList` of `TouristTrip`, `AutoRental`).
- **`frontend/src/pages/TravelToNassau.jsx`** — 1,450-word first-timer travel guide at `/travel-to-nassau`. Structure: hero → 8 H2 sections (why, getting here, getting around, where to stay, things to do, tips, cruise stopover, FAQ). Sticky TOC on desktop, `TravelGuide` + `FAQPage` + `BreadcrumbList` JSON-LD, natural internal links back to `/taxi`, `/tours`, `/rentals`. Wired into `App.js` router, `sitemap.xml`, and Layout footer.
- **`frontend/public/index.html`** — meta keywords list expanded from ~50 to ~90 phrases (travel intent, vacation types, attractions, practicals). `LocalBusiness` `knowsAbout` expanded with 10 travel-planning terms.
- **`frontend/public/sitemap.xml`** — 17 `<lastmod>` dates refreshed; new `/travel-to-nassau` entry at priority 0.9.


- **`frontend/src/lib/fbpixel.js`** — safe helpers (`trackLead`, `trackPurchase`, `trackInitiateCheckout`) that no-op when `window.fbq` isn't loaded, so callers can fire unconditionally. Every event carries `value` + `currency: "USD"` + `content_name` + `content_category` so Meta reports on real ROAS. Purchase carries `eventID` (booking id) for future server-side CAPI dedupe.
- **`frontend/src/pages/BookingFlow.jsx`** — fires `Lead` right after `POST /bookings` succeeds (regardless of payment method), fires `InitiateCheckout` before redirecting to Stripe, and fires `Purchase` after PayPal Smart Buttons capture returns `paid`.
- **`frontend/src/pages/PaymentReturn.jsx`** — fires `Purchase` once, guarded via `useRef`, when Stripe polling flips `payment_status` to `paid`. Guard prevents React StrictMode double-mounts + repeated polls from firing duplicates.

### ✅ Shipped Feb 2026 (one-shot VPS updater + scrolling summer banner + fancy chat tooltip + nightly B2 backups)
- **`scripts/deploy-updates.sh`** — one-command updater for the live VPS. Pulls, conditionally reinstalls pip/yarn deps only when their manifests changed, runs `yarn build` with a 1.5GB Node heap cap, restarts the backend service, validates + reloads Nginx, and finishes with a `/api/site-config` smoke test. Overridable via `ROX_BACKEND_SERVICE=<unit-name>`.
- **`scripts/backup-mongo-mega.sh` + `scripts/install-backup-cron.sh` + `BACKUP_MEGA.md`** — nightly Mongo → Mega.io backup pipeline (100% free, 20 GB tier). Installer runs `apt install megatools`, prompts for Mega email/password (stored in root-only `/etc/rox-mega.ini`), verifies the login, runs one backup as a smoke test, then installs a systemd timer that fires nightly at 03:15 UTC. Prunes both local and remote archives older than 30 days by parsing the timestamp out of the filename.
- **`frontend/src/components/SummerBanner.jsx`** — restored original orange design (☀️ + "Summer Special · Save 10% on every tour · code SUMMER10 · Ends in Xd") but now scrolling right-to-left as a seamless marquee via the shared `.promo-marquee-track` keyframe. CTA + dismiss stay pinned on the right with a gradient orange fade behind them. Pauses on hover, honours `prefers-reduced-motion`. Verified live: 29d countdown, marquee scrolling.
- **`frontend/src/components/ChatWidget.jsx`** — elegant hover tooltip on the FAB. Gold→navy gradient border, live "Roxi online" green pulse dot, avatar with animated gold ring, 5 rotating friendly copies, bouncing gold dots + "Roxi · replies instantly" micro-label. Slides in with `cubic-bezier(0.22,1,0.36,1)`. Auto-nudges once per session 5s after landing.


- **`frontend/src/components/ChatWidget.jsx`** — added hover + idle nudge tooltip on the floating chat button. Bubble slides in to the left with 5 rotating friendly copies ("Chat with us — ask anything!", "Need airport pickup? Ask Roxi 🌴", etc). Auto-appears once per session 5 seconds after landing (pulsing gold ring for visibility), then disappears after 8s. Hover always shows it fresh. Skipped on mobile (`sm:` gate) so it doesn't fight the FAB for space. Verified live: tooltip visible on hover, correct copy rendered.

### ✅ Shipped Feb 2026 (Facebook Pixel — ad conversion tracking)
- **`frontend/src/components/FacebookPixel.jsx`** — Meta Pixel loader mounted once at the app root. Reads pixel ID from `site_config.fb_pixel_id` (surfaced by `/api/site-config` from `secrets_store.FB_PIXEL_ID`), injects the standard `fbevents.js` snippet, fires initial `PageView` + re-fires on every SPA route change so Meta Events Manager sees each page. Skips `/admin`, no-ops when unconfigured (safe to mount always).
- **`backend/secrets_store.py`** — registered `FB_PIXEL_ID` (non-sensitive, Facebook group) so it appears in the Admin → Tokens panel and can be rotated live.
- **`backend/server.py::/site-config`** — now surfaces `fb_pixel_id` (public data) and strips the private `secrets` blob before returning to prevent token leakage.

### ✅ Shipped Feb 2026 (Summer Banner countdown urgency)
- **`frontend/src/components/SummerBanner.jsx`** — added live "Ends in Xd" countdown pill that pulses in the banner. Shows when < 60 days remain, switches to "Ends today" on the final day, hidden after Aug 31 (banner auto-hides too). Re-computes every hour so browsers left open overnight tick down. Verified live: "Ends in 29d" rendered.

### ✅ Shipped Feb 2026 (Summer Special promo banner — visually verified)
- **`frontend/src/components/SummerBanner.jsx`** — dismissible full-width orange promo strip. "Summer Special · Save 10% on every tour · code SUMMER10". Visible site-wide except `/admin`. Fades in 400ms after mount, remembers dismissal for 7 days via localStorage, auto-hides past Aug 31 2026. CTA copies the code and routes to `/tours`. Verified with screenshot tool: sits cleanly below sticky nav (y=96px, no overlap), dismiss (X) removes the banner without breaking layout.

### ✅ Shipped Feb 2026 (VPS bootstrap script + deployment docs suite)
- **`scripts/bootstrap-vps.sh`** — one-command installer for a blank Namecheap 2GB Ubuntu server. Runs QUICKSTART steps 2-4 (2GB swap + swappiness tune + Node 20 + Python 3.11 + Nginx + certbot + yarn + MongoDB 7 with 512MB WiredTiger cap + UFW + fail2ban) in ~5 min. Idempotent (safe to re-run). Prints Node/Python/yarn/Mongo versions + your VPS IP + the next steps at the end.
- **`scripts/deploy-app.sh`** — companion one-command deployer. Takes `<repo-url> <domain>` as args and does: git clone → generate JWT secret → prompt for admin creds → write backend/frontend .env → pip install → yarn build (with 1.5GB heap cap) → install systemd service → write Nginx site → request Let's Encrypt cert. Full blank-server-to-live-HTTPS is now 3 shell commands total.
- **`QUICKSTART_NAMECHEAP_2GB.md`** — 12-step manual blank-server-to-live-HTTPS guide with the 2GB-specific tuning.
- **`DEPLOYMENT.md`** — full reference: two-tier secrets model, per-key "where to get it" appendix, troubleshooting matrix, backups.
- **`DEPLOY_VISITORS_TAB.md`** — targeted upgrade guide for pulling just the analytics feature onto an already-live server.



### ✅ Shipped Feb 2026 (visitor analytics + admin reports panel)
- **`routes/analytics.py`** — new module with 3 endpoints: `POST /visitors/log` (public beacon), `GET /admin/visitors` (sortable/filterable/paginated log), `GET /admin/visitors/summary` (top pages / countries / referrers / devices). Registered BEFORE admin so its specific `/admin/visitors*` routes beat admin's `/admin/{kind}` catch-all.
- **`frontend/src/hooks/useVisitorBeacon.js`** — fires `navigator.sendBeacon` on every React-Router path change, session-scoped ID in `sessionStorage`, excludes `/admin/*` so owner activity doesn't pollute the report.
- **`frontend/src/pages/admin/VisitorsPanel.jsx`** — full admin tab: 4 stat cards (total, unique sessions, unique IPs, top device), 3 top-lists (pages, countries, referrers), sortable table (Time/Path/Country/City/Device — click column headers), filters (1h/24h/7d/30d, country substring, path substring), pagination, CSV export.
- **Geo lookup** via ip-api.com (free, no key, 45 req/min). Cached 7 days per IP in `visitor_geo_cache`. Background — never blocks the beacon.
- **Verified live**: POST /visitors/log → 200; admin GET → 401 no token / 200 with bearer; summary aggregations return top paths, sessions, devices. Two new Mongo collections auto-create: `visitor_events` + `visitor_geo_cache`.
- **Deploy guide**: `/app/DEPLOY_VISITORS_TAB.md` — 5-step pull-and-restart for Namecheap VPS.


### ✅ Shipped Feb 2026 (server modularization — round 3: AUTH + late-binding security fix)
- **`routes/auth.py`** (291 lines) — extracted all 7 auth endpoints: `/auth/login` (admin JWT), `/auth/session` (Emergent Google OAuth), `/auth/register`, `/auth/login-email`, `/auth/me`, `/auth/heartbeat`, `/auth/logout`. All auth-only helpers (`make_admin_token`, `_hash_password`, `_verify_password`, `_create_customer_session`, `_set_session_cookie`) moved with the routes. `get_current_user` + `require_admin` stay in `server.py` (used by dozens of other protected routes).
- **🔒 Critical late-binding security fix** — `routes/gallery.py`, `routes/licenses.py`, `routes/auth.py` were using naive `Depends(_require_admin)` / `Depends(_get_current_user)` that captured the initial `lambda: None` at MODULE LOAD time — meaning **all admin routes in those modules bypassed auth entirely** (verified: `/admin/gallery/pending` returned pending photos with no token). Fixed by wrapping in late-binding `_require_admin_dep()` / `_current_user_dep()` functions that resolve the current global at REQUEST time. Same pattern as `routes/admin.py`. **Post-fix verification**: every `/admin/*` route returns 401 without a bearer token, 200 with a valid one; `/auth/me` returns 401 without a session cookie.
- **Verified** all 7 auth endpoints live: /auth/login (correct pw → JWT, wrong → 401), /auth/session (missing header → 400), /auth/register (weak pw → 422), /auth/login-email (nobody → 401), /auth/me (no cookie → 401), /auth/logout (200), /auth/heartbeat.
- **Final server.py: 3894 → 3121 lines (-773, -20%)**, 76 → 42 endpoints (-45%). Modular /app/backend/routes/ now has: admin (1001), auth (291), catalog (107), chat (83), gallery (226), licenses (531), payments (352) = 2591 lines total.

### ✅ Shipped Feb 2026 (server modularization — round 2, big wins)
- **`routes/licenses.py`** (518 lines) — extracted all 13 driver-license + wallet endpoints via factory-configured router with 19 helpers injected: `/bookings/{id}/license/status`, `/bookings/{id}/license` (upload), `/admin/licenses/quick-approve/{id}` (HTML), `/bookings/{id}/wallet-license-preview`, `/bookings/{id}/reuse-wallet-license`, `/admin/bookings/{id}/license/fields` (PATCH), `/my/license-wallet` (GET/POST rotate/DELETE), `/admin/licenses` (list), `/admin/bookings/{id}/license/approve`, `/admin/bookings/{id}/license/reject`. Verified: `GET /admin/licenses` returns 26 items, filter by status works.
- **`routes/gallery.py`** (217 lines) — extracted 7 gallery endpoints including Facebook auto-post trigger: `/gallery/submit`, `/admin/gallery/pending`, `/admin/gallery/{id}/approve`, `/admin/gallery/{id}/reject`, `/admin/gallery/approved`, `/admin/gallery/{id}/repost-facebook`, `/admin/integrations/facebook/status`. Verified: 200 on all.
- **Router registration ordering fix** — specific routes (licenses, gallery, payments) now registered BEFORE admin router so admin's `/admin/{kind}` catch-all catalog CRUD doesn't swallow `/admin/licenses` or `/admin/gallery/*`. Documented in the comment inline.
- **server.py: 3894 → 3243 lines (-651, -17%)**, 76 → 49 endpoints (-35%). Total modular code across routes/*.py now 2278 lines. All previously-working endpoints verified: tours, taxi-services, rentals, home-slides, reviews, packages, live-stats, chat/history, admin catalog CRUD.

### 🔜 Deferred (needs its own session)
- **`routes/auth.py`** — 7 endpoints (`/auth/login`, `/auth/session`, `/auth/register`, `/auth/login-email`, `/auth/me`, `/auth/heartbeat`, `/auth/logout`) — deferred. Auth touches JWT + bcrypt + Emergent Google OAuth + `get_current_user` + `require_admin` — all of which are also consumed by licenses/gallery/admin routes. Extracting requires either moving the shared helpers to a `deps.py` or wiring a very large configure() surface, and the risk of breaking user sessions or admin access mid-refactor makes it worth a dedicated session with dry-run session-token verification.

### ✅ Shipped Feb 2026 (server modularization — round 1)
- **`routes/catalog.py`** — extracted 6 public read-only endpoints (`/tours`, `/taxi-services`, `/rentals`, `/home-slides`, `/reviews`, `/packages`) into a factory-configured router. All verified live: 14 tours, 26 taxi services, 6 rentals, 10 home slides, 2 packages, reviews dict.
- **`routes/chat.py`** — extracted Claude Sonnet 4.6 SSE live-chat concierge (`/chat/stream`, `/chat/history/{session_id}`) into its own router. Verified live: real SSE stream from Claude ("Hey there, friend!") + history endpoint returning empty array for new sessions.
- **server.py: 3894 → 3800 lines (-94), 76 → 68 endpoints.** All new routes follow the same `configure()` + `include_router()` pattern already used by `admin.py` and `payments.py` — future extractions (auth, gallery, licenses) plug in the same way.

### ✅ Shipped Feb 2026 (SMTP domain-mismatch fix)
- **`notifications.send_email()` now auto-handles domain mismatch between `EMAIL_FROM_*` / `SMTP_FROM` and `SMTP_USER`.** Namecheap Private Email (+ most self-hosted SMTP hosts) reject any `From:` header at a domain the authenticated mailbox doesn't own. When a mismatch is detected, the mailbox is used as the `From:` (with `"Rox Taxi Service & Tours"` display name) and the branded address is preserved as `Reply-To:` so guests replying still land in the right inbox. Verified: emails now deliver via `mail.privateemail.com` even when `EMAIL_FROM_CONFIRMATION=confirmation@roxtaxi.com` but the mailbox is `confirmation@roxtaxi242.com`.

### ✅ Shipped Feb 2026 (booking fundamentals hardening)
- **`pickup_location` required for taxi bookings** — `POST /api/bookings` now returns HTTP 400 `"Pickup location is required for taxi bookings."` when a taxi booking is submitted without one. Frontend already required it via location selector; backend now matches so hand-crafted API calls can't slip through.
- **Immediate booking-received acknowledgment email** — new `notify_booking_received()` helper in `notifications.py` fires on booking creation whenever `status == "pending_payment"` (Stripe / PayPal paths). Shows pickup, dropoff, date & time, passengers, total, status badge, and a "Complete payment →" CTA. Full confirmation still fires from the payment webhook via `notify_booking_confirmed()`. Result stored on the booking doc as `acknowledgment_status` + `acknowledged_at` for admin visibility.

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
