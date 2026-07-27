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

## Key API Endpoints
- `POST /api/bookings` — creates booking, applies deposit for rentals
- `GET /api/fees` — public fee reference (includes rental deposit policy)
- `POST /api/bookings/{id}/cancel` — cancellation with 15% fee
- `GET /api/rentals`, `GET /api/rentals/{id}/availability`
- `POST /api/auth/session`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/my/bookings` — authenticated user's bookings
- `POST /api/admin/upload-logo`

## Roadmap
### P0
- (none open)

### P1
- Wire Twilio SMS + SendGrid email notifications (backend logic exists as no-op fallback; add keys when ready)
- Stripe live-mode key when user is ready to accept real payments

### P2
- Refactor `server.py` (~1360 lines) into `routes/`, `models/`, `services/`
- Regression pytest coverage under `/app/backend/tests` for pricing (deposit + luggage + pax combinations)
- Admin: deposit release/capture workflow UI (mark deposit refunded/forfeited per booking)

## Files of Reference
- Backend: `/app/backend/server.py`, `/app/backend/notifications.py`
- Frontend pages: `/app/frontend/src/pages/{Home,Taxi,Tours,CarRental,BookingFlow,MyBookings,Login,WeddingBuilder,Groups}.jsx`
- Frontend layout: `/app/frontend/src/components/Layout.jsx`
- Frontend auth: `/app/frontend/src/lib/auth.jsx`
- Global styles: `/app/frontend/src/index.css`
