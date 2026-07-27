# Rox Taxi Service and Tours — Bahamas · PRD

## Problem statement
Website offering taxi and tours in the Bahamas — Nassau + Paradise Island focus. Includes excursions, taxi tracking, prices per service, online pre-booking, car rental page with online booking (Zelle / Credit Card / PayPal via Stripe / PayPal direct), Facebook + WhatsApp + TripAdvisor + Google Reviews links, admin panel, live AI chat, customer Google login.

## Brand
- Company: **Rox Taxi Service and Tours** (Nassau, Bahamas)
- Facebook: https://www.facebook.com/roxtaxiservice/
- Palette: Gold #D4A94A · Deep Navy #0B3B5C · Coral #E86A3C · Ivory #FBF7EF
- Type: Instrument Serif (display) + Geist (body) + Geist Mono

## Implemented (Feb 2026)
- Public browsing: taxi services, tours, car rentals (Nassau/PI focus)
- Featured excursions: Blue Lagoon, Paradise Island/Atlantis, Rose Island snorkel, Three-Island hopping, Exuma pigs (removed from home tagline per request)
- 5 rental cars: 2019 Chevy Spark, 2001 Nissan Sentra Orange, 2019 Chevy Malibu, 2025 Chevy Trax SUV, 2022 Chrysler Town & Country Mini-Van (with blackout dates per car)
- Booking flow: mandatory passengers, +$3/extra bag (first bag + carry-on free), +$5 group fee 3+ pax, per-day rentals
- Saturdays closed for taxi + rentals (backend rejects, frontend warns)
- 15% cancellation fee with 48hr notice policy; POST /api/bookings/{id}/cancel
- Payment: Stripe (Flow B / BYOK — Bahamas not sandbox eligible), PayPal.me direct link, Zelle manual instructions
- Booking status tracker: Confirmed → Driver Assigned → En Route → Arrived → Completed
- Google Reviews section (6 seeded, avg 4.9, 187+ reviews) — links to google search for Rox Taxi
- Live AI chat (Claude Sonnet 4.6 via SSE streaming, session memory)
- Bahamas image slider on home (Blue Lagoon, Atlantis, Bay Street, Cable Beach, Junkanoo, Queen's Staircase, Exuma, Rose Island)
- Modern menu: pill nav with sliding indicator on desktop, animated hamburger + slide-in drawer on mobile
- Elegant social/contact chips (WhatsApp, Phone, Facebook, TripAdvisor) with hover glow + tooltips
- About page (`/about`) — stats, story, values, team, CTA
- Admin console: /admin (bookings + stats), /admin/manage (CRUD tours/taxi/rentals/site config)
- Customer Google login (Emergent Managed Auth) → /my-bookings
- Notifications: SendGrid + Twilio wired (keys pending — no-op safely)
- Elegant hero photo (Bahamas overwater villa)

## Backlog
- P1: Wire in SendGrid + Twilio keys once provided; email/SMS on paid confirmation
- P1: Move Roxi (chat) to auto-create draft bookings from chat conversation
- P2: Real GPS driver tracking with driver mobile app
- P2: Multi-language (English/Spanish)
- P2: SEO blog, testimonials submission
