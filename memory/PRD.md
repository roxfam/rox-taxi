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
