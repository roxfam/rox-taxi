# Rox Taxi Service & Tours — Bahamas

## Original Problem Statement
A booking website for taxi, tours, and car rentals in The Bahamas (Nassau & Paradise Island focus).
Must support: pre-booking excursions/tours, car rentals, taxi status tracking, online payments
(Stripe, PayPal, Zelle), Facebook page integration, admin panel, group/wedding bookings with PDF
quotes, Claude AI live chat widget, luggage fees, extra-passenger fees, 15% cancellation fee
(48-hr notice), Saturday blackout dates, custom logo, Namecheap hosting compatibility.

## Architecture
- **Frontend**: React 19 + Tailwind + Framer Motion + Shadcn UI, Cormorant Garamond serif headings
- **Backend**: FastAPI + Motor (async MongoDB)
- **Integrations**: Claude Sonnet 4.6 (chat, Emergent LLM Key), Stripe BYOK (Flow B), Emergent Google Auth
- **Placeholders**: Twilio SMS + SendGrid email (keys to be added by user, graceful fallback)

## Key Constants
- `LUGGAGE_FEE_USD=3`, `LUGGAGE_MAX=10`
- `EXTRA_PASSENGER_FEE_USD=5`, `EXTRA_PASSENGER_INCLUDED=2`
- `RENTAL_DEPOSIT_USD=150` — refundable, applied automatically on rental bookings
- `CANCELLATION_FEE_PCT=0.15`, `CANCELLATION_NOTICE_HOURS=48`
- `CLOSED_WEEKDAYS={5}` (Saturday), applies to taxi + rental

## What's Implemented (Feb 2026)
- Home, Taxi, Tours, Rentals, Groups, Wedding Builder, Track, About, Contact, MyBookings, Login, PaymentReturn
- Admin: Login, Dashboard, Manage, Groups
- Bookings CRUD with pricing logic (base + luggage + extra pax + rental deposit)
- Cancellation policy (15% within 48hr, non-refundable inside 48hr)
- Saturday blackout for taxi + rental
- Wedding package builder → PDF quote
- Live Claude chat widget with SSE streaming
- Dynamic logo upload (admin panel)
- Emergent Google Auth + session cookies
- **[Feb 2026]** Bolder animated serif headings (site-wide) with entrance reveal + italic accent lift
- **[Feb 2026]** Book Now dropdown in header (Taxi / Tours / Rentals direct links) — desktop + mobile
- **[Feb 2026]** $150 refundable security deposit auto-applied to every car rental (backend + frontend)
- **[Feb 2026]** Popular Nassau destinations quick-picker on Taxi page (12 destinations mapped to best-fit service)
- **[Feb 2026]** Dedicated `/login` page + header "Sign in" button + mobile drawer login link
- **[Feb 2026]** PayPal Checkout (Smart Buttons) via PayPal Orders v2 REST — **LIVE mode**. Creates order via `POST /api/paypal/create-order`, captures via `POST /api/paypal/capture-order/{id}`. Config exposed via `GET /api/paypal/config`. Client renders buttons in-modal using `@paypal/react-paypal-js`. Verified with real live PayPal token + order.
- **[Feb 2026]** Twilio SMS notifications wired live — `notify_booking_confirmed` sends confirmation SMS from `+12202228965`. Account is TRIAL (upgrade to production to text unverified numbers). **Verified caller IDs so far: +12424322587, +12428039170.** SendGrid still awaiting API key; SMTP fallback available for email.
- **[Feb 2026]** Namecheap Private Email SMTP wired live — `confirmation@roxtaxi242.com` via `mail.privateemail.com:587` STARTTLS. Live test email confirmed delivered. Falls back automatically if SendGrid unavailable.
- **[Feb 2026]** Admin deposit release/forfeit UI — new `PATCH /api/admin/bookings/{id}/deposit` endpoint accepts `status: held|released|forfeited` + `reason`. Admin dashboard shows a **Deposits held** summary card + per-row Release / Forfeit buttons + reason modal + dedicated filter tabs. `GET /api/admin/stats` now returns deposit counts + total held amount.
- **[Feb 2026]** **Auto-refund on deposit Release** — when admin releases a deposit, the same payment provider used by the customer is called to issue a refund automatically. PayPal Checkout bookings: refunded via `POST /v2/payments/captures/{capture_id}/refund` using stored `paypal_capture_id`. Stripe bookings: refunded via `POST /v1/refunds` after resolving `payment_intent` from `checkout/sessions/{session_id}`. Zelle / PayPal.me stay manual with graceful error. `deposit_refund_provider`, `deposit_refund_status`, `deposit_refund_id`, `deposit_refund_error` stored on the booking. Admin modal has an auto-refund toggle (auto-disabled when the payment method can't be refunded programmatically).
- **[Feb 2026]** Logo swapped to the customer-provided gold "R" Rox Taxi mark (`/api/uploads/logo-4584cb46.png`).
- **[Feb 2026]** Bolder + more elegant "Quick book" widget on home page — serif italic headline, gold eyebrow accent, uppercase spaced meta labels, per-card accent-color hover glows and animated arrow icons.
- **[Feb 2026]** Elegant footer redesign — large serif wordmark with italic gold accent, animated hairline underlines on nav links, gold-bordered contact icons, framed payment method chips, refined bottom bar with "Made with care in Nassau" tagline. Footer now shows the site logo image with gold drop-shadow.
- **[Feb 2026]** Final logo swap to gold color mark (`/api/uploads/logo-00276520.webp`) — displays in header (with brand tagline) and footer (with drop-shadow glow).
- **[Feb 2026]** `PremiumIcon` component added (`/app/frontend/src/components/PremiumIcon.jsx`) — reusable premium icon coin with gradient face, glow ring, inner highlight, subtle noise; six tone variants (gold/orange/navy/teal/sand/slate) × four sizes. Available for future icon upgrades sitewide.
- **[Feb 2026]** **Additional Driver** option for car rentals ($25 flat per extra driver, max 4) — Booking modal adds a stepper; total + booking record now include `additional_drivers` and `additional_driver_fee`.
- **[Feb 2026]** Car catalog refresh — Compact = White 2019 Chevrolet Spark LT; Sedan = White 2021 Nissan Versa.
- **[Feb 2026]** **Admin Notifications Dashboard** — New "Notify" column in `/admin` bookings table shows per-booking `Email ✓/✗` and `SMS ✓/✗` badges with provider + error tooltips; paid rows expose a "Re-send" button that calls `POST /api/admin/bookings/{id}/resend-notification`. Site Config panel (`/admin/manage → Site Config`) exposes two toggles: **notify_email_enabled** and **notify_sms_enabled** — both persisted on the site_config doc, respected in `notify_booking_confirmed`, and default to `true`. Every notification attempt writes `notification_status` + `notified_at` onto the booking so delivery is auditable at a glance.
- **[Feb 2026]** **Taxi pickup/dropoff dropdowns** — Free-text pickup & dropoff inputs replaced with preset dropdown selects (LPIA, Cruise Port, Atlantis, Baha Mar, Downtown, Cable Beach, etc.) + an "Other — type a custom address…" escape hatch. Pre-fill from the destination cards continues to work.
- **[Feb 2026]** **DateTimePicker component** (`/app/frontend/src/components/DateTimePicker.jsx`) — shadcn Calendar (react-day-picker) + native time input, replaces the plain `<input type="datetime-local">` in the taxi/tour booking modal. Rentals use it with `includeTime={false}` for a date-only variant. Z-indexed above the booking modal (`z-[110]` vs modal `z-[100]`).
- **[Feb 2026]** **`force: true` override** on `POST /api/admin/bookings/{id}/resend-notification` — bypasses `notify_email_enabled`/`notify_sms_enabled` site-config toggles for one-off manual sends. Response now returns `{ booking_id, notification_status, notified_at, forced }`.
- **[Feb 2026]** **Messenger handoff** — the chat widget now surfaces a "Continue on Messenger" CTA (button in header + prominent gradient button under suggestions) that opens the Rox Taxi Facebook Messenger inbox in a new tab, pre-copies a context prefill referencing the visitor's latest question to the clipboard, and appends a hand-off note to the transcript. Backend `/api/site-config` auto-derives `messenger_url = https://m.me/<page-slug>` from `facebook_url` and admins can override it via the Site Config panel (new `messenger_url` field on `SiteConfigUpdate`). The chat FAB was lowered to `z-[85]` so booking modals still sit on top of it.

## Key API Endpoints
- `POST /api/bookings` — creates booking, applies deposit for rentals
- `GET /api/fees` — public fee reference (includes rental deposit policy)
- `POST /api/bookings/{id}/cancel` — cancellation with 15% fee
- `GET /api/rentals`, `GET /api/rentals/{id}/availability`
- `POST /api/auth/session`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/my/bookings` — authenticated user's bookings
- `POST /api/admin/upload-logo`
- `GET /api/paypal/config` — public client_id + mode
- `POST /api/paypal/create-order` — create a PayPal order for a booking
- `POST /api/paypal/capture-order/{order_id}` — capture approved order & mark booking paid

## Roadmap
### P0
- (none open)

### P1
- Stripe live-mode key when user is ready to accept real payments
- Consider a `force: true` param on `POST /admin/bookings/{id}/resend-notification` so admins can override the notify_email_enabled/notify_sms_enabled flags for a single manual send.

### P2
- Refactor `server.py` (~1680 lines) into `routes/`, `models/`, `services/`
- Regression pytest coverage under `/app/backend/tests` for pricing (deposit + luggage + pax + additional driver combinations)
- Replace `<input type="datetime-local">` in the taxi booking modal with a shadcn Calendar + time picker for a consistent design language.

## Files of Reference
- Backend: `/app/backend/server.py`, `/app/backend/notifications.py`
- Frontend pages: `/app/frontend/src/pages/{Home,Taxi,Tours,CarRental,BookingFlow,MyBookings,Login,WeddingBuilder,Groups}.jsx`
- Frontend layout: `/app/frontend/src/components/Layout.jsx`
- Frontend auth: `/app/frontend/src/lib/auth.jsx`
- Global styles: `/app/frontend/src/index.css`
