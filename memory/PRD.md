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
- **Owner** — reviews bookings, deliverability, and weekly performance from `/admin`.
- **Guest** — books taxi/tour/rental, receives SMS+email lifecycle nudges, tips post-trip.
- **Driver** — reads day-of manifest, scans QR at pickup.

---

## CHANGELOG

### Feb 2026 — Storage-backed image catalog + delivery detail + weekly report
- **Storage-backed Image List (P0)**: New Mongo `uploaded_images` collection mirrors every upload from `/api/admin/images`, `/api/admin/upload-logo`, and `/api/admin/drivers/{slug}/upload-headshot`. `/api/admin/images` GET now returns the real library (was empty because Emergent Object Storage lacks a list API). Delete removes DB rows so images disappear from the picker.
- **Post-Trip Tip Bump SMS live test**: Seeded booking `TIPBUMP-TEST`, triggered `/api/cron/send-tip-bump-sms` — Twilio delivered SMS to +12424322587. ✅ Verified end-to-end.
- **Delivery Report Card**: New collapsible "Details" panel inside every booking row's NotifyCell (`AdminDashboard.jsx`) — exposes provider (Twilio / SendGrid / SMTP) and full error text inline instead of tooltip-only. Also falls back to `acknowledgment_status` when the guest hasn't paid yet so pre-payment email failures surface.
- **Weekly Sales & Transaction Report**: 
  - New endpoint `GET /api/admin/analytics/weekly-report?days=7|14|30` with totals, delta vs prev period, daily trend, top services, payment-method split, deliverability.
  - New cron `POST /api/cron/send-weekly-report` (bearer-auth) — Monday 9am UTC via `.emergent/crons.yml`.
  - `POST /api/admin/analytics/weekly-report/send-now` — admin-triggered email test.
  - Frontend `WeeklyReportCard.jsx` on the dashboard — sparkline, top services table, payment methods breakdown, delta chips, "Email me now" button.

### Previous work carried over
- Reagan Itinerary Builder (14 stops, pick 7 for $235)
- Refer-a-Friend system with 10% discount + admin leaderboard
- Twilio SMS + SMTP email pipeline (notify_owner_booking_created, notify_booking_confirmed, tip bump, return-leg nudge, rental return, photo share)
- Google Reviews auto-sync (4+ stars, hourly) with Claude-drafted reply suggestions
- Emergent Object Storage migration for all uploads

---

## ROADMAP

### P0
- **User SMS verification** — do a live booking to confirm SMS lands on the guest's phone in production (owner already confirmed today with TIPBUMP-TEST run).
- **Apple Login** — BLOCKED, needs user's Apple Developer account. Use `integration_playbook_expert_v2` once unblocked.

### P1
- Refresh other hero slides (Atlantis, Rose Island, Junkanoo) with proprietary photos when owner delivers them.
- Admin filter on booking table: "failed deliverability last 24h" to isolate SMS/email errors.

### P2
- Referral card locator timeout in test suite (unauthenticated `/mybookings` state).
- Server.py refactor — split remaining route logic into `/app/backend/routes/`.

---

## Key Data
- Admin login: `roxfam2509@gmail.com` / `admin123`
- Owner SMS: +12424322587
- Cron secret: `WEBHOOK_CRON_SECRET`
- Test booking: `TIPBUMP-TEST` (completed, verified Twilio delivery)
