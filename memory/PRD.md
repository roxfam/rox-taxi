# Rox Taxi & Tours Bahamas — PRD

## Problem statement
Website offering taxi and tours in the Bahamas — excursions, taxi tracking, prices per service, online pre-booking payments, car rental page with online booking paid via Zelle / Credit Card / PayPal, plus Facebook page link and admin panel.

## Personas
- Traveler booking airport transfers, excursions and rentals from web/mobile.
- Admin (owner/dispatcher) managing bookings & statuses.

## Core Requirements (locked)
- Public browsing: taxi services, tours, car rentals with prices & images.
- Online booking flow with customer details & confirmation code.
- Payments: Stripe (card + PayPal via Stripe managed) or Zelle manual instructions.
- Booking status tracker: Confirmed → Driver Assigned → En Route → Arrived → Completed.
- Facebook: https://www.facebook.com/roxtaxiservice/ linked in header, footer, contact.
- Admin panel: login, KPI dashboard, all bookings, filter + update status.
- Live AI chat widget (Claude Sonnet 4.6 via Emergent LLM key) streaming answers on pricing/booking.

## Implemented (Feb 2026)
- FastAPI backend with routes: /api/tours, /api/taxi-services, /api/rentals, /api/site-config,
  /api/bookings (create+get), /api/admin/bookings, /api/admin/stats, /api/admin/bookings/{id}/status,
  /api/payments/checkout, /api/payments/status/{id}, /api/webhook/stripe, /api/auth/login,
  /api/chat/stream (SSE), /api/chat/history.
- Stripe via emergentintegrations Flow B (Bahamas not supported by claimable sandbox).
- React frontend with Playfair Display + Manrope; Caribbean Luxury Neuter theme.
- Pages: Home, Taxi, Tours, Rentals, Track, Contact, Payment success/cancel, Admin login, Admin dashboard.
- ChatWidget in bottom-right on all customer pages with streaming SSE responses.

## Backlog / Next
- P1: Email/SMS booking confirmation
- P1: Admin CRUD for tours & rental fleet (currently seeded, read-only)
- P2: Real GPS driver tracking (mobile app for drivers)
- P2: Multi-language (English/Spanish/French)
- P2: Reviews/testimonials, blog for SEO
