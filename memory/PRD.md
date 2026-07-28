# Rox Taxi Service & Tours — PRD

Bahamas (Nassau + Paradise Island) taxi + tours + car rental booking platform.

## Original problem statement
Bahamas taxi/tour website with pre-booking, car rentals, taxi tracking, payments (Stripe/PayPal/Zelle),
Facebook, admin panel, PDF quotes, live chat, complex pricing, cancellation policy, custom logo,
Twilio SMS, SMTP email, GPS tracking, editable catalog.

## Architecture
- React + Tailwind + Shadcn/UI (frontend), FastAPI + Motor + MongoDB (backend)
- Backend modularized: server.py + routes/{payments,admin}.py + seed_data.py + pdf_utils.py + notifications.py
- Admin UI modularized into /pages/admin/ (CatalogPanel, EditModal, PriceHistoryModal, ImagePickerModal, ImagesPanel, MessagesPanel, SiteConfigPanel, HomeSlidesPanel, shared.jsx)
- Integrations: Stripe, PayPal, Twilio, SMTP/SendGrid, Claude (Emergent LLM key)

## Implemented
- Full booking flows (taxi / tours / rentals) with pricing, group bookings, PDF quotes
- Payments: PayPal, Stripe, Zelle, PayPal.me
- Notifications: SMS + Email + delivery report + CSV + admin toggles
- Live driver GPS tracking + contact form + Google Reviews UI + Messages tab
- Catalog Image Manager + shared photo library + logo upload/pick
- Site Config (social, Zelle, notifications)
- ChatWidget (Claude) + Messenger handoff
- Rentals full admin CRUD (year/make/model/color/body/seats)
- Price History Log + Admin Price Editor + Reset-to-seed + quick promo shortcuts
- Strike-through promo pricing on public pages
- **Dynamic home hero carousel** — 7 slides (Nassau/Atlantis/Rose/Junkanoo/Fish Fry/Exuma pigs/Straw Market). Admin-managed via /admin/manage. Auto-advance every 10s (slowed from 6s for premium feel). Randomized start, Ken Burns pop-zoom (0.4s), 1.2s crossfade, next-image preload.
- **External operator booking URLs per tour** — `external_booking_url` field wired to Blue Lagoon ($109), Atlantis ($195), Rose Island ($139), Island Hop ($149) with published rates.
- Gold "Rox Taxi Service" logo live in the header via site_config.

## Recent image swaps (2026-02)
- Sentra → 2021 Nissan Versa (uploaded photo)
- Trax SUV → uploaded white photo
- Blue Lagoon tour + NassauCarousel → uploaded aerial
- Atlantis home slide → Wikimedia BHA_Atlantis_Bridge shot
- Exuma pigs home slide → Wikimedia Vorobek swimming pigs
- Straw Market home slide → Wikimedia 2024 photo
- Header logo → gold "Rox Taxi Service" webp (jvc8oa3b)
- Baha Mar slide added then removed (no good public photo available)

## Backlog
- **P2** Baha Mar slide can be re-added once user supplies own photo
- **P2** Google Places live reviews (needs Google Cloud API key)
- **P2** `promo_ends_at` auto-expiry for sale badges
- **P2** "Featured on home" for rentals

## Credentials
`/app/memory/test_credentials.md` — admin@roxtaxi.com / admin123
