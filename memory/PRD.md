# Rox Taxi Service & Tours — PRD

## Product Vision
A production-grade website for a Bahamian taxi + tours + car-rental business (Nassau & Paradise Island focus) with pre-booking, online payments, admin panel, and complete guest-lifecycle automations (SMS, email, cron jobs, referrals, tips, driver spotlights, real Google reviews).

## Core Requirements
- Booking flow (taxi, tours, rentals) with dynamic pricing (per-person, add-ons, taxi add-ons, referral discounts, tips)
- Stripe (BYOK via `STRIPE_API_KEY`), PayPal, Zelle payment paths
- Twilio SMS + SMTP email pipeline for every guest touch-point
- Admin console: catalog CRUD, bookings, deposits, notifications, reviews, referrals, deliverability, weekly reports
- Post-trip tip top-up flow (SMS 15 min after completion) + weekly owner report email
- Emergent Object Storage (no local disk uploads)
- Google Places API 4+ star reviews auto-sync (cron hourly)
- Driver tracking / QR check-in + Admin Audit Heatmap
- Referral system with 10% discount + admin leaderboard

## Personas
- **Owner** — reviews bookings, deliverability, and weekly performance from `/admin`; gets SMS + email pings for every meaningful site event.
- **Guest** — books taxi/tour/rental, receives SMS+email lifecycle nudges, tips post-trip.
- **Driver** — reads day-of manifest, scans QR at pickup.

---

## CHANGELOG

### Feb 2026 — Flight status fan-out + Admin Zelle Proof Card
- **Flight-status day-of fan-out** (`_flight_status_loop` in `server.py`, polls every 20 min): for every airport-pickup booking with a `flight_number`, hits AviationStack and fans out SMS to **admin + employee roster** (via `send_owner_sms(kind="dispatch", force_priority=True)`) on three transitions:
  1. `departed` → "✈ BA253 departed JFK → NAS (guest, booking X, pickup 2:15 PM). ETA …"
  2. `landed` → "🛬 BA253 LANDED at NAS. Guest (booking X) — head to pickup."
  3. `delay ≥ 30 min` (buckets of 30 min so repeat delays re-fire once) — both departure + arrival sides.
  Watch window = pickup ± [6h back, 24h forward]. Idempotent per-event via `booking.flight_events[]`. Uses the existing AviationStack cache so no quota blowout.
- **New helper `_fetch_flight_full`** returns the full flight snapshot (airline, departure/arrival IATA, scheduled/estimated/actual times, delay minutes). Stored on `booking.flight_last_snapshot` for admin visibility.
- **Admin Zelle Proof Card** mounted on `/admin` (`ZelleProofCard.jsx`): shows every pending Zelle proof with inline thumbnail/lightbox, Approve (atomic flip to paid + fires guest confirmation + owner "payment received" SMS), and Reject (with preset reasons + guest SMS explaining why). Auto-hides when no proofs are pending.

### Feb 2026 — Post-service review follow-up + Dolphin Swim home showcase + PayPal Vault + Zelle proof + incidentals
- **Review follow-up loop** (`_review_followup_loop` in `server.py`, fires every 30 min): 24h after `completed_at` the guest gets a dedicated SMS + email asking for a Google review. Idempotent via `review_followup_sent_at`. Skips guests who already got the 5-star growth-loop prompt. 7-day retro-fill window.
- **Dolphin Swim showcase on home page** — gold-ribbon hero section above Packages with two CTAs: "Book with Rox · $265" (deep-link into booking modal) + "Official site" (direct link to `bluelagoonisland.com/experience/dolphin-swim/`). Includes a side panel listing the 5 inclusions. Same external link now also lives on the tour card itself.
- **PayPal Vault** backend added — `create_vault_setup_token`, `exchange_vault_setup_token`, `charge_vaulted` in `paypal_client.py`. New admin routes in `payments.py`: `POST /admin/bookings/{id}/paypal-vault/{create,finalize,charge}` + `GET .../status`. Mirrors the Stripe card-hold pattern — admin sends a PayPal link, guest approves, admin can later off-session charge for incidentals.
- **Zelle payment proof workflow** — public `POST /bookings/{id}/zelle-proof` lets a guest upload a screenshot of their transfer (stored via Emergent Object Storage). Admin reviews via `GET /admin/zelle-proofs/pending`, then `POST .../zelle-proof/approve` (atomic flip to paid + fires confirmation + owner "payment received" SMS) or `POST .../zelle-proof/reject` (texts guest why).
- **Incidental Zelle requests** — admin can text/email guest a Zelle payment request (`POST /admin/bookings/{id}/zelle-request`) with amount + reason + memo. History stored on `booking.zelle_requests[]`.
- **Stripe card-on-file endpoints** gracefully return 503 when `STRIPE_API_KEY=sk_test_emergent` (shared Emergent sandbox cannot be used via raw Stripe REST). Lights up automatically when the owner wires their own live `STRIPE_API_KEY` via Manage → Secrets.
- **⚠ CRITICAL note**: last 5 "paid" bookings in prod DB were all Zelle (manually marked). Current `STRIPE_API_KEY=sk_test_emergent` — Stripe payments cannot reach the owner's live Stripe account until the live key is pasted into Manage → Secrets. Bahamas (BS) is NOT eligible for Stripe claimable sandbox, so the US-LLC key is the only path.

### Feb 2026 — Dolphin Swim excursion + Admin Card-on-File / Zelle incidentals
- **New excursion live**: "Dolphin Swim — Blue Lagoon Island" at $265 (+ VAT + processing fee). Fields added: `age_requirement`, `includes` (6-item list). Tour cards + booking modal now render a "What's Included" box + age-req pill when a tour exposes these fields.
- **Admin Incidental Modal** (new `IncidentalModal.jsx`) opens from a per-row "Hold card / Zelle" button on `/admin`. Three tabs:
  1. **Stripe card hold** — creates a Stripe Checkout session in `mode=setup`, SMS + emails the guest a secure link. On return, backend polls the SetupIntent, extracts `payment_method` + `customer`, and surfaces "Visa •••• 4242" on the admin row. Guards: friendly 503 when `STRIPE_API_KEY` is the shared `sk_test_emergent` sandbox (raw REST needs a real/claimed key).
  2. **Zelle request** — admin enters amount + reason; backend texts & emails the guest with Zelle email/phone + memo = `{bookingId} · {reason}`. Audit trail stored on `booking.zelle_requests[]`.
  3. **Charge card** — off-session PaymentIntent charges the saved card for incidentals. Audit trail on `booking.card_hold.charges[]`.
- New backend module `/app/backend/card_hold.py` wraps the Stripe REST surface (setup checkout, retrieve session/intent/pm, charge saved card).
- New routes in `routes/payments.py`: `POST /admin/bookings/{id}/card-hold/{create,charge}`, `GET /admin/bookings/{id}/card-hold/status`, public `GET /card-hold/status/{session_id}`.
- New route in `routes/admin.py`: `POST /admin/bookings/{id}/zelle-request`.
- New frontend pages: `/card-hold/success` + `/card-hold/cancel` (polling Stripe setup confirmation).

### Feb 2026 — Day-of reminder now fans out to every owner phone + email
- `send_booking_reminder` upgraded: the single `driver_number` SMS was replaced by `send_owner_sms(kind="booking")`, so EVERY number in `ADMIN_SMS_NUMBER` gets the day-of manifest (currently +12424322587, +12424285524). Honours each recipient's subscription + quiet-hours + priority-override preferences.
- New `admin_email` section in the reminder report — the owner also gets a branded "Day-of reminder" HTML email with the full manifest (guest, phone, pickup, dropoff, pax) + a one-tap link to open the booking in admin.
- Guest SMS + guest email + per-booking idempotency (`reminder_sent_at`) unchanged — still fires once when the trip is in the next 24h via `_booking_reminder_loop()`.
- Verified live: all 4 channels (guest email, guest SMS, owner fan-out SMS, admin email) returned `sent: True` on the test booking.

### Feb 2026 — Post-payment invoice delivery
- **`notify_booking_confirmed` now attaches a "Download invoice (PDF) →" button** inside the confirmation email + the invoice link is appended to the SMS whenever `payment_status == "paid"`. The invoice section is suppressed for Zelle/pending-payment bookings so we never promise a receipt before the money lands.
- Links target the existing `GET /api/bookings/:id/receipt.pdf` endpoint (uses `pdf_utils.build_receipt_pdf`) — includes full line-item breakdown with VAT, processing fee, and deposit.
- Admin can resend any time via the existing `POST /api/admin/bookings/:id/resend-notification` endpoint (NotifyCell "resend" button).
- Verified: paid booking → confirmation email + SMS with invoice link both sent; pending booking → invoice section correctly suppressed; `/receipt.pdf` returns a valid `application/pdf` response.

### Feb 2026 — Owner SMS on EVERY booking + EVERY payment (already shipped)
- `notify_owner_booking_created` fans out to every number in `ADMIN_SMS_NUMBER` via `send_owner_sms(kind="booking")`.
- `notify_owner_payment_received` fans out via `send_owner_sms(kind="payment")`.
- `payment` is in the default `priority_kinds` list so these alerts break through quiet-hours automatically; `booking` is auto-promoted to priority when total ≥ `owner_sms_high_value_threshold` (default $500).

### Feb 2026 — Front-page slide rename
- Renamed hero slide **"Rose Island reefs." → "Pearl & Athol Island."** (id: `hero-rose-island` → `hero-pearl-athol-island`) — subtitle preserved.
- Renamed hero slide **"Junkanoo golden hour." → "Junkanoo Beach."** (id: `hero-junkanoo` → `hero-junkanoo-beach`) — subtitle preserved.
- Both updates applied live to the `home_slides` Mongo collection AND persisted in `seed_data.py` so fresh installs pick up the new copy.

### Feb 2026 — Pricing overhaul: VAT, processing, cancellation, airport drop-off
- **10% Bahamas VAT** on every order EXCEPT point-to-point taxi fares. Deposits + driver tips are exempt (deposit is a refundable hold, tip is a gratuity).
- **4.5% processing fee** on every order (applied to subtotal + VAT, before deposit/tip).
- **20% cancellation fee** on taxi, tour, and excursion bookings (was 15%). Rentals now handled separately — deposit is always released back; base fare refunded when ≥48h notice, otherwise forfeit fare but keep deposit.
- **$25 airport drop-off fee** on rentals — new `rental_airport_dropoff` field on `BookingCreate` + auto-detects when "airport" or "LPIA" is typed into dropoff_location.
- **$150 rental hold deposit** kept as-is (existing `RENTAL_DEPOSIT_USD`) — verified applied automatically on every rental booking.
- **Stripe = instant** (already was) — `StripeCheckout` charges the full booking total on session complete; no deposit-mode split.
- Frontend `BookingFlow` mirrors the backend line-for-line: separate VAT + processing line items, airport-drop-off checkbox for rentals, and the new taxable-subtotal separation from deposit/tip.
- Verified live: taxi ($40) → total $41.80 (no VAT, just processing); tour ($235) → total $270.79 (VAT $47 + processing $12.79); rental (3d @ $75 + airport) → total ≈ $410 including $150 deposit + $25 airport fee + VAT + processing.

### Feb 2026 — Reviews Growth Loop
- **After every 5★ in-app rating**, the guest gets a follow-up SMS + email inviting them to post the review on Google. Powered by new `notify_guest_google_review_prompt(booking, review_url)` in `notifications.py`.
- **URL source**: reads `site_config.google_reviews_url` (or `google_business_url`) with a default fallback to Rox's actual g.page short-link so it works out of the box.
- **Wired into `POST /api/bookings/{id}/rate`** — fires when `stars >= 5`, guarded by `google_review_prompt_sent_at` stamp on the booking so re-submits + rating bumps never re-DM.
- **Verified**: 4★ → no prompt fired; 5★ → SMS + email delivered to guest with Google review link; repeat 5★ → idempotent (timestamp unchanged, no duplicate DM).

### Feb 2026 — Authentic Google reviews everywhere
- **Deleted dead `REVIEWS_SEED`** array in `server.py` (fake "Jamie R.", "Marcia D." etc. with pravatar avatars) — was never referenced but sat as a maintenance trap.
- **Contact page `GoogleReviewsCard`** rewired: was rendering a hard-coded fake "4.9" rating + a fake "Fast pickup at LPIA" blockquote. Now fetches `/api/reviews`, displays the live-averaged rating, real reviewer names, and rotates through authentic reviews every 9s.
- **All review surfaces now source from one place**: `routes/catalog.py::list_reviews` → `db.reviews` populated hourly by `routes/cron.py::_sync_google_reviews_bg` from the Google Places API.
- Verified: 6 real reviews live (Shernel Alexander, Stacey Hall, Blaine Thomas, Constance L, howard murray, Tami Weis) with valid `google_review_id`s and `source: "google"`.

### Feb 2026 — Trip-complete guest ping (rating + tip top-up)
- **`notify_guest_trip_complete()`** — new SMS + email helper fires the moment the driver marks the ride `completed`. Body includes:
  - **1-tap rating link** (`/rate?id=X&t=SIGNED_HMAC`) — 5-star tap UI; 5★ pathway offers a Google Review handoff.
  - **Tip top-up link** — reuses the existing signed `/tip-topup` route so drivers keep 100%.
- **Wired into both status-change surfaces**:
  - `POST /api/driver/{id}/status` (mobile driver app) — first-completion guard on `trip_complete_notified_at`.
  - `PATCH /api/admin/bookings/{id}/status` (desktop admin) — same guard.
- **Public rating API** (both signed with HMAC of `BOOKING_LINK_SECRET`):
  - `GET /api/bookings/{id}/rating-info?t=` — returns booking summary + `already_rated` flag.
  - `POST /api/bookings/{id}/rate?t=` — stamps `customer_rating`, comment, and copies to `customer_ratings` collection for aggregation.
- **Owner activity SMS** on every rating so admins celebrate 5★ trips and jump on <4★ ones fast.
- Delivery report persisted to `booking.trip_complete_notification` for the admin notify-details drawer.
- Verified live: `picked_up` → `completed` transition sent SMS + email to guest phone/inbox; rating POST stamped the booking; owner got a `🌟 5★ for Reagan` ping.

### Feb 2026 — Guest pickup confirmation on QR scan
- **`notify_guest_picked_up(booking)`** — new SMS + email helper in `notifications.py`. Sends the guest a "You're on your way ✅" ping the moment the driver scans the QR at pickup.
- **Wired into `POST /api/bookings/{id}/driver-checkin`**: after the status flips to `picked_up`, we spawn the notification via `asyncio.to_thread` so a slow SMTP round-trip never holds up the driver's tap.
- **Idempotent by design** — the existing `if status in ("cancelled", "completed")` guard blocks re-scans from re-notifying. Verified: first scan sends SMS + email + persists `pickup_notification` + `pickup_notified_at`; second scan is a no-op with unchanged timestamps.
- Report stored on the booking (`pickup_notification`) so admins can inspect provider/error on the notify-details toggle.

### Feb 2026 — High-value booking auto-priority + guest QR boarding pass
- **High-Value Auto-Priority**: Bookings ≥ configurable USD threshold (default $500) auto-promote to priority — they break through quiet-hours regardless of the recipient's `booking` subscription. Admin editor at `Admin → Owner SMS → High-value auto-priority`. Endpoint: `PUT /api/admin/owner-sms/high-value-threshold`.
  - Verified: $95 booking during quiet hours → queued (0 sent); $525 booking → live-sent to both owners (`high_value_override: true`).
  - `💎 HIGH-VALUE $525` prefix on the owner SMS body so the notification stands out visually.
  - Setting threshold to 0 disables the override cleanly.
- **Guest QR Boarding Pass**: New `/booking/:id/pass` mobile-optimised page with the pickup QR the driver scans at pickup.
  - Fetches non-financial summary from new `GET /api/bookings/:id/public-summary`.
  - Renders as a shareable "boarding pass" card (Rox gold + navy).
  - "Save pass to Photos" (via html2canvas) + native Web Share fallback.
  - iOS/Android add-to-home-screen instructions inline.
  - QR link + `img` embed added to `notify_booking_confirmed` HTML email and confirmation SMS so guests see it the moment they book.
  - Apple/Google Wallet `.pkpass` generation deferred (needs Apple Developer + Google Wallet API creds).

### Feb 2026 — Priority override for revenue events
- **`payment` events always break through quiet-hours** — regardless of any recipient's `quiet_hours` preference. Configurable via `Admin → Owner SMS → Priority override` strip.
- Backend: `_is_priority_kind(kind)` short-circuits the quiet-hours queue. Priority list stored in `site_config.owner_sms_priority_kinds` (defaults to `["payment"]`; empty list auto-resets to `["payment"]` so revenue alerts can't be silenced by accident).
- New endpoint `PUT /api/admin/owner-sms/priority-kinds` + cache refresher.
- Frontend: red-bordered "Priority override" card pinned at the top of the Owner SMS tab with chip toggles per event kind.
- Verified live: booking during quiet-hours → queued; payment during quiet-hours → both owners live-sent (`priority_override: true`).

### Feb 2026 — Quiet hours + per-owner preferences
- **Per-Owner SMS Preferences**: New `owner_sms_recipients` array in `site_config`. Each entry: `{phone, label, subscriptions[], quiet_hours}`. Live editable at `Admin → Owner SMS` tab.
  - Subscriptions: `*` (all) or any subset of `booking / payment / contact_form / tip_topup / group_inquiry / gallery_submission / customer_signup / referral_conversion / activity`.
  - Cache refreshes every 60s from `site_config` — edits go live within one minute.
  - Env `ADMIN_SMS_NUMBER` acts as a safety fallback when the DB roster is empty.
- **SMS Quiet Hours (22:00-04:00 Nassau)**: Any SMS to a recipient with `quiet_hours=true` during the window is queued to `owner_sms_queue` instead of sent. New cron `POST /api/cron/flush-owner-sms-digest` fires hourly; internal worker gates on Nassau local time (04:30-05:30) with per-day idempotency so exactly one digest fires per morning.
- **Deliverability tail in the digest email**: The 5am digest email now shows a "last 7 days delivery health" line (email/SMS sent + failed + failure rate).
- **Admin manual controls**: `Flush digest now` button + queue-peek endpoint for smoke testing.

### Feb 2026 — Owner SMS fan-out (multi-recipient)
- **Two owner cellphones now ping on every event** — `ADMIN_SMS_NUMBER` is now comma-separated (`+12424322587,+12424285524`). New `send_owner_sms(body)` helper in `notifications.py` fans out to every recipient; returns a per-number delivery report.
- **All owner SMS paths refactored** to use the helper: `notify_owner_activity`, `notify_owner_booking_created`, `notify_owner_payment_received`, contact form, tip top-up, group inquiry, gallery submission, referral conversion, signup.
- **Verified live**: direct test sent to both numbers, both `sent: true`.

### Feb 2026 — Deliverability alerts + weekly report preview + full owner activity SMS
- **Owner Activity SMS (Feb 2026)** — Owner cellphone at `+12424322587` now pings on every meaningful site event:
  - New customer signup (auth.py register hook)
  - Referral conversion (server.py `_apply_referral_conversion_if_paid`)
  - Group inquiry (server.py `/group-inquiries`)
  - New guest photo submission (`routes/gallery.py`)
  - Contact form (already wired)
  - Tip top-up submitted (already wired)
  - New booking + payment received (already wired)
  All routed through `notifications.notify_owner_activity(kind, sms_body, ...)` — fire-and-forget, never blocks user response.
- **Weekly Report Preview** — `GET /api/admin/analytics/weekly-report/preview` returns the exact HTML that ships in the Monday email. Frontend "Preview email" button on `WeeklyReportCard` fetches with admin bearer and opens in a new tab via Blob URL.
- **Delivery Alert Thresholds** — Owner alert when SMS or email failure rate exceeds threshold (default 5%) in rolling 24h.
  - New endpoint `GET /api/admin/analytics/delivery-health?hours=24`
  - New endpoint `PUT /api/admin/analytics/delivery-health/threshold` (editable %)
  - New cron `POST /api/cron/check-delivery-alerts` — hourly, throttled to 1 alert per 6h per breach
  - Frontend "Armed / Over threshold" chip + inline threshold editor + "Test alert" button on WeeklyReportCard
- **Storage-backed Image List** — Mongo `uploaded_images` collection powers `/api/admin/images`.
- **Tip Bump SMS live-verified** — Twilio delivered to +12424322587.

### Cron schedule (`.emergent/crons.yml`)
- `sync-google-reviews` — hourly
- `send-tip-bump-sms` — every 5 min
- `send-weekly-report` — Monday 9am UTC
- `check-delivery-alerts` — hourly at :15

### Previous work carried over
- Reagan Itinerary Builder (14 stops, pick 7 for $235)
- Refer-a-Friend system with 10% discount + admin leaderboard
- Twilio SMS + SMTP email pipeline (booking, tip bump, return-leg, rental return, photo share)
- Google Reviews auto-sync (4+ stars, hourly) with Claude-drafted replies
- Emergent Object Storage migration for all uploads

---

## ROADMAP

### P0
- Confirm live SMS pipeline on production URL (Twilio verified; user should test one live signup).
- **Apple Login** — BLOCKED, needs user's Apple Developer account.

### P1
- Refresh hero slides (Atlantis, Rose Island, Junkanoo) with proprietary photos.
- SMS quiet-hours: suppress owner activity SMS between 10pm-7am Nassau time and batch into a morning digest (deferred — user opted for firehose).
- Admin filter on booking table: "failed deliverability last 24h".

### P2
- Referral card locator timeout in test suite.
- server.py refactor — continue splitting logic into `/app/backend/routes/`.

---

## Key Data
- Admin login: `roxfam2509@gmail.com` / `admin123`
- Owner SMS: +12424322587
- Cron secret: `WEBHOOK_CRON_SECRET`
