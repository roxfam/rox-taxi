# Rox Taxi Service & Tours — PRD

## Original Problem Statement
Website offering taxi and tours in The Bahamas (Nassau & Paradise Island focus). Key features: pre-booking excursions/tours, car rentals, taxi tracking, online payments, complex pricing logic, admin panel, group/wedding bookings, Claude AI live chat, cancellation fees, custom logo, Twilio SMS & SendGrid SMTP, live GPS driver tracking, external booking links, JSON-LD SEO schema, customer authentication, flight tracking, client photo gallery uploads with Facebook auto-posting, Driver's License Upload & Trusted Traveller Wallet, backend modularization, VPS deployment, automated DB backups, FB Conversion Pixels, complex booking pricing, sophisticated Driver tracking, dynamic Tour bundles, Optional Taxi Add-on A/B testing, Kids pricing, Advanced Fleet Blackout & Downtime Financial Reporting.

## What's Implemented (Feb 2026)

### Feb 16 (late) — Refer-a-Friend Public Share Flow
- **New `/refer` page** (`ReferFriend.jsx`) — public share hub with sharer-name input, optional 240-char personal note, deterministic `FRIEND-{initials}-{4-char hash}` code, live message preview, and 6 share channels (WhatsApp, Email, Facebook, X/Twitter, Copy Link, Native Share).
- **Referral catcher** (`ReferralCatcher.jsx`, mounted globally in Layout) — parses `?ref=<code>&from=<name>` on every navigation, persists to `localStorage.rox_referral`, and shows a dismissible floating "10% off from {name}" ribbon on landing.
- **BookingFlow integration** — reads `rox_referral` on mount and applies a 10% "Friend-of-{name}" discount line on the pre-tip subtotal. Sends `referral_code`, `referred_by_name`, `referral_discount` in the `/bookings` POST payload for admin attribution.
- **Footer link** — "Refer a friend · 10% off" added to Services column, styled in brand gold to draw the eye.

### Feb 16 — Signature Tour Cross-Links + Rotating Reviews + Reagan Tour Refresh
- **Cross-linked `/nassau-with-reagan`** so the page finally gets internal traffic:
  - New "Signature Tour" callout card under the hero on `/drivers/reagan` (text + $225 flat, links to `/nassau-with-reagan`).
  - New slim gold ribbon above the homepage Featured Tours grid ("New: Nassau with Reagan · $225 flat").
- **Constantly-rotating Google reviews on Home**: `GoogleReviews.jsx` now pulls the widest 4+ star pool via `/api/reviews?limit=60`, rotates the visible 3-card window every 8s using framer-motion `AnimatePresence`, pauses on hover, refetches silently every 5 min. Subtle "Live" pulse indicator when the pool exceeds the visible window. Backend cron bumped from every 6h → every hour (`.emergent/crons.yml`). Backend `/api/reviews` now takes an optional `limit` (default 60, max 200) and enforces `rating >= 4` at the query level.
- **Reagan's languages** narrowed to English only (updated live DB record + catalog default + admin seed).
- **Nassau-with-Reagan tour is now 7 stops (~4 hours) at $225 flat**:
  - Route: Fort Fincastle + Queen's Staircase (30m) → Bay Street strip (45m) → **Bahamas Rum Cake Factory (20m, walk-in + samples included)** → Arawak Cay Fish Fry (45m) → Ardastra Gardens flamingos (45m) → Fort Montagu + beach (20m, free/included) → Atlantis self-tour on Paradise Island (30m, free lobby/Marina Village walk included, aquarium admission optional). Total ≈ 235 min on the ground.
  - Green "Included in the tour" badges on Rum Cake Factory, Fort Montagu, Atlantis. Per-person "Paid separately" chips on Rum Cake takeaways ($6 mini / $15–$25 full), Fish Fry meals ($15–$35 pp), Ardastra ($18 adult / $9 child), optional Atlantis Marine Habitat ($50+ pp).
  - Consolidated "Paid separately (per person)" callout below the $225 pricing block. Hero copy updated to "About four hours. Seven stops."

### Feb 12ad — "Nassau with Reagan" Signature Tour Landing Page
- New public page at **`/nassau-with-reagan`** — hero with gold "Signature tour · with Reagan" ribbon, 4-stop itinerary (Fort Fincastle + Queen's Staircase → Bay Street → Fish Fry → Ardastra flamingos) with per-stop timings, transparent pricing card ($220 flat / +$30 extra pax / +$25 flamingo-show timing), "In Reagan's words" pull-quote, three "Book Reagan for this tour" CTAs.
- All CTAs deep-link to `/taxi?book=hourly-charter&driver=Reagan` so the booking modal auto-opens the hourly charter with "Request Reagan" already checked.
- SEO-defensible landing — nobody else has a Nassau tour "with Reagan."

### Feb 12ac — Driver Spotlight Admin Panel + Headshot Uploader
- New **Driver Spotlights tab** at `Admin → Manage → Driver Spotlights`. Each driver in `site_config.driver_spotlights` renders as a card in the left rail with their headshot, canonical name, and `/drivers/<slug>` deep-link.
- Full editor on the right: Display name · Tagline · Bio · Specialties · Years experience · Languages. Partial updates merge on top of prior fields (dotted `$set` per key so the bio isn't wiped when only the tagline changes).
- **Headshot uploader** — accepts PNG/JPG/WEBP up to 8MB, auto-crops to 512×512 JPEG via Pillow, saves to `/api/uploads/driver-<slug>-<hash>.jpg` and stamps the URL into `site_config.driver_spotlights.<slug>.headshot_url`. Public `/drivers/<slug>` reads it directly.
- Reagan seeded as a "starter" row (`_starter: True`) when the roster is empty so the first-time UX has a clear entry point instead of "Add driver + fill 6 fields from scratch".
- Backend endpoints: `GET /admin/drivers` · `PUT /admin/drivers/<slug>` · `POST /admin/drivers/<slug>/upload-headshot`.

### Feb 12ab — 240-Char Cap + Live Character Counter on Reply Drafts
- **Fixed draft-doubling bug**: swapped `chat.stream_message` (which was concatenating stream chunks twice on some replies) for `chat.send_message` — returns the full response in one shot. Blaine's doubled draft regenerated cleanly (178 chars).
- **Drafter prompt tightened**: hard 240-char cap in the system prompt with 7 explicit rules (2 sentences, one exclamation max, name the reviewer + driver, end with " — Rox"). Belt-and-suspenders `_hard_cap_240()` helper trims post-generation while preserving the sign-off.
- **Live character counter** in both admin surfaces — the Reviews Inbox card on `/admin` and each 5★ row inside Manage → Reviews. Grey under 200 chars, gold at 200-240, amber "trim to reduce PENDING risk" over 240. Textarea border tints amber too so long drafts self-flag.
- All 5 existing drafts regenerated under the new rules — 133/159/169/178/190 chars.

### Feb 12aa — Reviews Inbox on Admin Dashboard
- **New landing card** at the top of `/admin` — pulls every un-replied 5★ Google review with the Claude-drafted thank-you already loaded, so the owner can Copy → Open on Google → Post (or one-tap Post-to-Google once OAuth is connected) in ~30 seconds per morning.
- Backend endpoint: `GET /admin/reviews/inbox` — filters by `rating >= 5 AND owner_reply_posted_at IN [null, ""]`, sorted newest first.
- Card auto-hides when the inbox is empty and collapses on demand. Reagan-tagged reviews carry their gold "REAGAN" ribbon inside the inbox row too so the owner can prioritise driver-branded shout-outs.
- Fixed initial-load null crash — guards `data.reviews.map` behind the `!data` early-return.

### Feb 12z — Google Business Profile OAuth Post-to-Google Wired
- **Full OAuth flow scaffolded** in new `/app/backend/routes/gbp.py` — endpoints: `GET /admin/gbp/status` · `GET /admin/gbp/oauth/start` · `GET /admin/gbp/oauth/callback` · `POST /admin/gbp/disconnect` · `POST /admin/reviews/{id}/post-to-google`.
- Tokens (access + refresh + account/location IDs) persisted in `site_config.gbp_tokens`. Access token auto-refreshes on `<60s` from expiry via the refresh token.
- After OAuth callback, we auto-resolve the primary GCP business account + first location via `mybusinessaccountmanagement` + `mybusinessbusinessinformation` APIs so the owner never has to paste IDs.
- **Post-to-Google flow**: matches the local review to Google's MyBusiness v4 review resource by author + rating + text-prefix, then PUTs the reply. Caches `mybusiness_review_name` on the review doc so subsequent edits skip the scan.
- Admin ReviewsPanel now shows a **status pill**: yellow "OAuth not configured" · gold "Connect Google Business" · green "Google connected · {location}". Reply-draft toolbar gets a gold **"Post to Google"** button (only when connected) that replaces the manual Copy → Open → Paste dance.
- **`.env` slots added**: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (all blank — owner will paste after GCP approval).

### Feb 12y — Driver Spotlight Page + Request-a-Driver Booking Field
- **`/drivers/:slug` public page** — first driver: `/drivers/reagan`. Hero with headshot + "Guest-favourite" gold badge, 5.0 rating pill with review count, tagline + bio + specialties, facts (10+ years, Bahamian Creole, Nassau base), and pinned Google reviews carousel that filters by `driver_tags`. Backend endpoint `GET /api/drivers/:slug` self-seeds Reagan's profile so the page renders immediately; `site_config.driver_spotlights` lets the owner override bio + headshot without a deploy.
- **"Request a driver" checkbox** on every taxi booking. Free-text (defaults to "Reagan") so any name-drop works. Deep-link `/taxi?driver=Reagan` (fired from every Reagan-spotlight CTA) pre-checks the box on the booking modal. Stored on booking as `requested_driver` for dispatch to honour best-effort.
- Horse tours confirmed absent — the DB no longer contains "Private Horseback Lesson" or "Horseback Trail + Beach Ride"; removal from an earlier session took effect.

### Feb 12x — Reagan-Tagged Reviews + Attach-Rate Dashboard + Auto-Reply Drafter
- **Driver-tagged reviews** — sync now scans each review body for driver-name mentions (roster in `site_config.driver_name_tags`, default catches Reagan/Regan/Reggan). Tagged reviews get pinned to the front of the /reviews API list and render a gold "REAGAN DROVE THEM" ribbon on the homepage. 4 of our 5 Google reviews name-drop Reagan and now pin visibly.
- **Owner reply auto-drafter** — every fresh 5-star sync fires a Claude Sonnet 4.6 prompt that composes a warm, 2-sentence public reply mentioning the reviewer's first name (and driver if named). Draft persists on the review doc as `owner_reply_draft`. Admin ReviewsPanel exposes 4-button widget: **Copy** (clipboard), **Open on Google** (business.google.com/reviews), **Re-draft** (regenerate), **Save edit** (persist manual tweak). Falls back to a static template if the LLM key is missing.
- **Attach-Rate Dashboard** — `GET /api/admin/analytics/addon-attach-rate?days=N` groups the last N days of taxi bookings by service and counts add-on picks. Winners (≥25% attach + ≥4 attaches) auto-earn a gold **"Top pick"** ribbon on the public /taxi chip strip via a 10-min in-memory recommended-decorator cache on `/taxi-services`. New `AttachRateCard` under Admin Dashboard with day-range picker, Winners/All rows/Never-attached filter, revenue totals.
- Cleaned up admin.py load order — moved `_admin_dep` shim above endpoint definitions to fix `Depends()` resolution at module import time.

### Feb 12w — Google Reviews Live + Recently-Viewed Nav Dropdown
- **Google Reviews syncing live** — 5 five-star reviews now pulled from Google Places API (New) and rendering on the homepage "Reviews from real riders" section. Rating: 5.0 · 5+ reviews. Business: ROX TAXI SERVICE (`ChIJVXxKZCKt7gMR61X4WUuKbow`).
- **Root cause of prior silent failure**: API key had HTTP-referrer restrictions but the backend calls server-to-server (no referrer). Fixed by sending `Referer: https://roxtaxi.com/` header from the sync worker — matches the owner's Google Cloud referrer allowlist. Falls back gracefully if the site_config `site_url` is set to a different domain.
- Credentials saved to both `.env` (`GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID`) and `site_config` (belt-and-suspenders).
- **Recently-viewed picker** on both desktop and mobile nav dropdowns. LocalStorage-backed per-section cache (last 3 picks), pinned to the top of the picker menu with a gold "History" icon. Mobile now uses a custom bottom-sheet dropdown matching the desktop menu design (Recently viewed → All options → See all footer).

### Feb 12b — Google Reviews Auto-Sync: 4-Star Quality Filter + ENV Priority
- `_sync_google_reviews_bg()` reads `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` from env FIRST (falls back to `site_config` for admin-panel convenience).
- **Only reviews with rating ≥ 4 are stored as active**; 1–3 star reviews counted in `last_skipped_low_rating` but never surface on the homepage.
- If a previously-kept review drops below 4★ on a later sync, the existing DB row is soft-hidden (`active=false`, `hidden_reason="below_4_stars"`) so the homepage reflects the star drift automatically.
- Homepage `<GoogleReviews />` already reads from `/api/reviews` (DB-backed) — 4+ star filter applies transparently.
- Verified end-to-end with mocked Places API: 5-review payload (5·4·3·5·2 stars) → **only 5 and 4-star ones stored**; simulated star drop → previously-kept row soft-hidden.

### Feb 12s — Queen's Staircase Route + Round-Trip Price Override
- Added new taxi service `port-queens-staircase` — Downtown/Cruise Port → Queen's Staircase @ **$15 for first 2 passengers + $5 each additional**.
- **Round-trip price override**: new `round_trip_price_override` field on taxi services. When set, the RT base becomes exactly that value (no auto 10% off) — e.g. Queen's Staircase RT = **$30 flat** because the driver-wait cost is priced in. Extra-passenger surcharge ($5/pax over 2) still layers on top.
- Backend `create_booking` + frontend `BookingFlow.jsx` both honour the override; when the service doesn't ship one, standard `base×2 × 0.9` round-trip math applies.
- Verified via curl: 2 pax booking $15 one-way → `total_amount=$15`; 2 pax RT → base becomes $30 (no discount); 3 pax RT → $30 + $5 = $35.

### Feb 12r — Live Backup Driver Roster + On-Spot Picker
- New `backup_drivers` field on `site_config` — list of `{name, phone}` entries editable inline from Admin → Site Config → **Backup driver roster**. Add / edit / delete rows without touching code.
- `POST /api/admin/bookings/{id}/reassign-backup` now accepts an optional `driver_name` + `driver_phone` body. Resolution precedence: explicit phone → roster name match → first roster entry → legacy `BACKUP_DRIVER_PHONE` secret.
- `AdminDashboard.jsx` reassign flow: fetches the roster on click. Empty → single confirm; 1 driver → confirm with name/phone; 2+ drivers → prompt with numbered picker so owner picks one on the spot.
- Booking doc now stamps `reassigned_to_backup_name` + `reassigned_to_backup_phone` alongside the existing timestamp so admins can audit who took the trip.
- Removed horse-tour verification confirmed: 0 horse-related tours in the catalog (only "workhorse" string was in a taxi tagline, unrelated).

### Feb 12q — "Reassign to Backup Driver" Two-Tap Escalation
- New `POST /api/admin/bookings/{id}/reassign-backup` (admin-only) — texts the standby driver (`BACKUP_DRIVER_PHONE` secret) a fresh dispatch SMS with guest name, phone, pickup, service, pax count, and Google Maps link. Stamps `reassigned_to_backup_at` + `reassigned_to_backup_result` on the booking so the button fires only once.
- `AdminDashboard.jsx`: when a row is opened via `?focus=BOOKING_ID` (from the alert SMS magic-link), the focused row now exposes a big coral "🚨 Reassign to backup" button inline. Confirm dialog before firing. On success the button is replaced by a green "✓ Backup dispatched" badge.
- End-to-end flow from a mismatched GPS check-in: tap alert SMS "Reassign" link → Admin dashboard scrolled to the row → tap coral button → backup driver's phone lights up. Two taps.

### Feb 12p — Reassign Magic-Link in Owner GPS Alert SMS
- The alert SMS body now ends with `Reassign: {PUBLIC_URL}/admin?focus={booking_id}` — a one-tap link that opens the Admin dashboard already scrolled to the mismatched booking row with a 3.6-second amber highlight so the owner can reassign in one motion.
- `AdminDashboard.jsx` now reads `?focus=BOOKING_ID` on mount, waits for bookings to finish loading, then `scrollIntoView` + flashes the row via inline `backgroundColor` + `boxShadow` (auto-clears after 3.6s).
- Admin auth-wall already protects the route, so the focus param doesn't need its own HMAC.

### Feb 12o — Tel: Link in Owner GPS Mismatch Alert SMS
- The >2km driver GPS mismatch alert SMS now includes a one-tap `tel:{driver_phone}` line. On iOS/Android the number renders as a big blue call button — owner can dial the driver instantly from the notification without hunting through contacts.
- Driver phone resolution: `DRIVER_PHONE` secret first (new, roster-specific), falls back to `ADMIN_SMS_NUMBER` so this works today even before a separate driver secret is set.

### Feb 12n — Owner SMS Alert on >2km Driver Check-in Mismatch
- Extended `POST /api/bookings/{id}/driver-checkin` — after stamping the GPS ping, computes haversine distance to the closest anchor (same table as the Admin audit card). If the ping is >2km away, an owner alert SMS is sent to `ADMIN_SMS_NUMBER` via Twilio: "⚠ Rox driver GPS mismatch · Booking {id} · Driver checked in X.Y km away · Audit: roxtaxi.com/admin (Pickup GPS card)".
- Fire-and-forget — never blocks the check-in response. Records `driver_gps_alert_sent_at` + `driver_gps_alert_distance_m` on the booking doc so the same booking never double-alerts (if the driver re-scans, they only get one SMS).

### Feb 12m — Admin Driver Pickup GPS Audit
- New `GET /api/admin/analytics/pickup-audit` — 60-day window of every driver-scan check-in with `driver_pickup_lat/lng`. Uses haversine distance against a small keyword-matched anchor table (LPIA, Cruise Port, Cable Beach, Atlantis, Baha Mar, Junkanoo, Love Beach, Arawak Cay, Lyford Cay). Any ping >500m from the closest anchor is flagged.
- New Admin `PickupAuditCard` — clean vs flagged count pills at top, then a table with booking id, booked pickup, anchor, distance badge (green ≤500m, orange >500m), accuracy_m, and check-in timestamp. Flagged rows use the coral background so they jump out.
- Rendered on the Admin dashboard right below the WarmLeadCard.

### Feb 12l — Mobile Nav Category Dropdowns + EasyDrive Direct-Booking Banner + Driver GPS Stamp on Check-in
- **Mobile nav dropdowns**: Taxi / Tours / Car Rentals rows in the mobile drawer now have a chevron toggle that reveals a sub-menu (Airport transfers · Beach runs · Blue Lagoon · Compact · Luxury · EasyDrive direct · etc). Tapping the label still routes to the section landing page; only the chevron opens the panel. Desktop nav is untouched.
- **EasyDrive banner** on `/rentals` — gold-bordered card between the sort bar and fleet grid: "Prefer booking direct? Reserve on **easydrivecarrental.com** — prices match, no markup" with an external CTA (`easydrive-external-btn`).
- **Driver GPS ping on check-in**: `DriverScan.jsx` now requests one-shot browser Geolocation on tap of Confirm and posts `driver_pickup_lat/lng/accuracy_m` to the check-in endpoint. Values are optional — denied/timed-out permissions still let the driver complete the check-in. Backend stores them on the booking doc so admins can audit that check-ins actually happened at the meeting spot.
- Toast confirms "Pickup confirmed with GPS" when the ping succeeded, plain "Pickup confirmed" otherwise.

### Feb 12k — Driver QR Check-in (scan + confirm pickup time & location)
- Added `GET /api/bookings/{id}/qr.png` — returns a PNG QR code encoding `{PUBLIC_URL}/driver/scan?b={id}&t={hmac}`; HMAC-SHA256 (24-char) uses `JWT_SECRET` so IDs can't be brute-forced.
- Added `GET /api/bookings/{id}/scan-preview` — token-gated slim booking payload for the driver page (no financials).
- Added `POST /api/bookings/{id}/driver-checkin` — verifies HMAC token, marks status `picked_up`, stamps `driver_checked_in_at`, and lets the driver override `driver_confirmed_pickup_time` + `driver_confirmed_pickup_location` (useful when the meeting spot changes at the cruise port berth). Rejects if booking is cancelled/completed. Auto-sends the guest a "you've been checked in ✅" SMS (respects admin toggle).
- New `/driver/scan` frontend page (`DriverScan.jsx`) — dark boarding-pass style layout, loads booking via `?b=&t=`, exposes editable time + location inputs, and a big gold "Confirm pickup" button. Shows a green success banner + Track deep-link after check-in.
- `Track.jsx` renders the QR code inline (gold-bordered card, "Show driver on arrival") so guests can flash their phone at the driver.
- Calendar `.ics` DESCRIPTION now includes a "Show driver (QR check-in): …/track?id=…" line so the QR is always one tap away from the guest's calendar event.

### Feb 12j — Gold Rox Colour Badge on Calendar Events
- Added `X-APPLE-CALENDAR-COLOR:#D4A94A` + `X-WR-CALNAME:Rox Taxi Bookings` at the VCALENDAR level, plus `COLOR:#D4A94A` + `CATEGORIES:Rox Taxi` on every event.
- In Apple Calendar month view the pickup/return events now render with a gold dot instead of the default blue — instantly recognisable among the guest's other plans. Non-supporting clients (Outlook web, some Android) ignore the X- extensions gracefully.
- Verified: ICS output contains all 4 colour/category lines with the correct hex.

### Feb 12i — Add to Wallet / Calendar (.ics) on Booking Confirmation
- New `GET /api/bookings/{id}/calendar.ics` returns a valid VCALENDAR file with the pickup event and — for round-trip taxis with a `return_time` — a second event for the return leg. Each event carries the confirmation code, driver dispatch number, pickup address, Google Maps deep link, and a 30-min VALARM.
- Added "📅 Add to Wallet / Calendar" button to:
  - `PaymentReturn.jsx` (post-payment success page — gold-bordered next to "Copy payment link")
  - `BookingFlow.jsx` Zelle confirmation step
- iOS surfaces upcoming calendar events natively on the lock screen and in the Wallet-adjacent event chip, so this doubles as a lightweight wallet pass without any Apple Developer credentials.

### Feb 12h — Google Maps Deep Link in Guest Return-Leg SMS
- Guest return-leg SMS now includes a one-tap `https://maps.google.com/?q={pickup}` deep link — opens the pickup address in Maps on iOS/Android/desktop (falls back to web when the native app isn't installed).
- If the URL encoder ever fails at runtime, the SMS silently drops the map line rather than breaking the send.
- Verified via unit test: SMS body includes `Map the pickup: https://maps.google.com/?q=Junkanoo+Beach%2C+Nassau` for a Junkanoo Beach pickup.

### Feb 12g — Guest Return-Leg Heads-Up SMS
- Extended `send_return_leg_nudge()` to also SMS the guest at the same 30-min-before moment: "Hi {first_name}! Your Rox driver is heading back for you 🌊 — arriving in 30 min at {pickup} for the {return_time} pickup. Time to grab your towels! Booking #{id}."
- Respects the site-wide `notify_sms_enabled` admin toggle — falls back gracefully with a clear `error` reason on the report.
- Verified live: seeded RTNUDGE2 with return_time 15 min out → tick sent **both** legs via Twilio (driver + guest).

### Feb 12f — Driver Return-Leg SMS Nudge (30-min-before)
- New `send_return_leg_nudge()` in `notifications.py` — driver-only SMS (no guest ping) that says "⏰ RETURN LEG in 30 min · Booking {id} · Return pickup: {return_time} today · Guest: {name/phone} · Was: {dropoff} → back to {pickup} · Pax: {n}".
- Background reminder loop in `server.py` now scans for taxi bookings with `round_trip=True + return_time`, not cancelled/completed, no `return_leg_nudge_sent_at`. When the return timestamp (booking_date's calendar day + return_time) falls in [now, now+30m], the driver SMS fires and the doc is stamped.
- Uses the same 10-min interval + ADMIN_SMS_NUMBER as the existing day-of reminder loop — no new cron needed.
- Verified end-to-end: seeded a booking with return_time 15 min out → tick sent the driver SMS + stamped `return_leg_nudge_sent_at`.

### Feb 12e — Round-Trip Return-Time Picker
- New `return_time` field on `BookingCreate` model (backend) — stored on the booking doc when `round_trip=True` so drivers know exactly when to swing back for pickup.
- Frontend `Taxi.jsx`: right below the round-trip toggle, a gold-bordered "RETURN PICKUP TIME" card appears (fade-in animation) with a native `<input type="time">` picker + explainer copy ("we'll radio the driver so they swing back on the dot. Leave blank if flexible.").
- Verified end-to-end: booked port-love-beach with round-trip + return_time=16:30 → booking doc persisted `return_time: 16:30` alongside `round_trip_discount: $8.00`.

### Feb 12d — Per-Person Beach Taxi Fares + 2-Person Minimum + Round-Trip Support
- Added 4 new taxi services with `pricing_mode: "per_person"`:
  - `port-love-beach` — Downtown/Cruise Port → Love Beach @ $20/person
  - `port-cable-beach` — Downtown/Cruise Port → Cable Beach @ $10/person
  - `port-arawak-beach` — Downtown/Cruise Port → Arawak Cay Beach @ $7/person
  - `paradise-love-beach` — Paradise Island → Love Beach @ $30/person
- **2-person minimum enforcement**: solo travelers on any per-person route are billed at the 2-person rate (base = price × max(2, pax)). Booking flow adds a `billed_passengers` field and a note explaining the minimum. UI shows an orange "2-person minimum — you'll be billed as 2 passengers" line while pax=1, then grey "Priced per passenger · billed for N" from 2 upward.
- Booking flow (backend `create_booking` + frontend `BookingFlow.jsx`) reads `pricing_mode` on the taxi service — for `per_person` routes, base = price × max(2, passengers) and the flat-fare extra-passenger surcharge is skipped so guests aren't double-charged.
- Round-trip discount (10% off both legs) applies to per-person routes exactly like flat-fare routes — the checkbox already lives on every taxi booking modal.
- Taxi page cards show "/ person" suffix next to the price on the 4 new services.

### Feb 12c — Warm-Lead Discount Nudge + One-Time-Per-User Codes + Duplicate-Signup Guard + Collapsible Mobile Language Tab + Evening Urgency Whisper
- **Warm-lead promo card**: 4 admin-editable fields (`warm_lead_promo_enabled`, `warm_lead_promo_code`, `warm_lead_promo_discount_pct`, `warm_lead_promo_description`) surface a gold-bordered promo card inside the chat panel for returning visitors (3rd+ session). Copy-to-clipboard button, `chat-warm-lead-promo` testid.
- **Evening urgency whisper** (`GET /api/booking/urgency`): fires only past 5 PM Nassau time; renders a small "🔥 Only X of 5 slots left today" line inside the promo card AND the softer nudge state. Slot count = clamp(1, 5 − today's bookings, 4) so returning visitors always feel gentle scarcity in prime same-day-booking window.
- **`POST /api/chat/track-promo-copy`** — records each copy with IP + visit count; surfaced on `admin/analytics/warm-lead` as `promo_copies` + `promo_copy_uniques`.
- **One-time-per-user promo enforcement**: new `promo_redemptions` MongoDB collection tracks each auto-applied promotion per (promo_id, ip, user_id, email). Before applying `_best_active_promo` in booking creation, we check if that identity triple has already redeemed — if yes, promo is silently skipped and booking proceeds at full price. Redemption logged on booking insert.
- **`GET /api/promo/status`** — returns `has_redeemed` (across ANY promo for this IP or logged-in user) + `has_copied_warm_lead`. `PromoBanner` hides banner when `has_redeemed=true`; chat widget shows softer "Ready to book with your X% off?" nudge (testid `chat-warm-lead-nudge`) instead of the full copy card when they've copied but not booked.
- **Duplicate signup guard**: at `POST /auth/register`, reject if the same IP already has a user with the exact (case-insensitive) name → prevents fraud/spam multi-accounts from the same device. Hard cap: max 3 signups per IP in a rolling 90-day window as a backstop. Users get a friendly message routing them to sign-in or support. `name_lower` + `signup_ip` are indexed lookup fields on new user docs.
- **Collapsible mobile Language selector**: mobile drawer's `<LanguageSwitcher variant="mobile" />` is now a tap-to-expand tab (`lang-switcher-mobile-toggle` + `lang-switcher-mobile-panel`) instead of an always-visible 2-col grid — keeps the mobile menu footer tidy.
- Verified end-to-end: PUT config → GET `/api/promo/status` (before/after seeding a redemption doc) → warm-lead visitor sees full card, then after "copy" sees "Ready to book?" nudge on next session.

### Feb 12 — Google Reviews Auto-Sync + Email Blocklist + Warm-Lead Analytics
### Feb 12 — Warm-Lead Signal on Chat Widget
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
- **User Action**: Fill `GOOGLE_PLACES_API_KEY` + `GOOGLE_PLACE_ID` in `backend/.env` (or Admin → Site Config) to activate 6-hourly auto-sync.
- **User Action**: Paste Google / Bing / Yandex verification codes in Admin → Site Config.
- **User Action**: Submit sitemap in Google Search Console + Bing Webmaster.

### P2
- More Fraud Watch additions (auto-freeze at threshold · VPN/proxy detection · device fingerprint · signup velocity chart · booking fraud detection · IP watchlist · card-testing detector · chargeback risk score · dedicated Fraud Watch tab).
- Modularize `server.py` (>3900 lines).

## Third-party Integrations
- Google Places API (New) — auto-sync via env `GOOGLE_PLACES_API_KEY` (4+ star filter)
- Cloudflare Turnstile · IndexNow (Bing + Yandex + Seznam)
- ip-api.com · pycountry · react-simple-maps · ui-avatars.com
- Claude Sonnet 4.6 (Chat) + 4.5 (Vision) — Emergent LLM Key
- Stripe · Twilio · SendGrid · AviationStack · Facebook Graph · Mega.io

## Scheduled Tasks (`.emergent/crons.yml`)
- `sync-google-reviews` — every 6h; keeps only 4+ star reviews

## Test Credentials
Admin: `roxfam2509@gmail.com` / `admin123`
