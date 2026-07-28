# Rox Taxi Service & Tours — PRD

Bahamas (Nassau + Paradise Island) taxi + tours + car rental booking platform.

## Original problem statement
Bahamas taxi/tour website with pre-booking, car rentals, taxi tracking, payments (Stripe/PayPal/Zelle),
Facebook, admin panel, PDF quotes, live chat, complex pricing, cancellation policy, custom logo,
Twilio SMS, SMTP email, GPS tracking, editable catalog.

## Architecture
- React + Tailwind + Shadcn/UI (frontend), FastAPI + Motor + MongoDB (backend)
- Backend modularized: server.py + routes/{payments,admin}.py + seed_data.py + pdf_utils.py + notifications.py
- Admin UI modularized (65-line AdminManage.jsx + panels in /pages/admin/: CatalogPanel, EditModal, PriceHistoryModal, ImagePickerModal, ImagesPanel, MessagesPanel, SiteConfigPanel, HomeSlidesPanel, shared.jsx)
- Integrations: Stripe, PayPal, Twilio, SMTP/SendGrid, Claude

## Implemented
- Booking flows (taxi/tours/rentals), payments, notifications w/ delivery report + CSV
- Admin dashboard: bookings, deposits, stats, contact messages, PDF quotes
- Live driver GPS + contact form + Google Reviews UI
- Catalog Image Manager + shared photo library + logo upload
- Site Config (social/Zelle/notifications)
- ChatWidget (Claude) + Messenger handoff
- Rentals full CRUD (year/make/model/color/body/seats)
- Price History Log + Admin Price Editor + Reset-to-seed + quick promo shortcuts
- Strike-through promo pricing on public pages via annotate_promo backend helper
- **Dynamic home hero carousel** — 9 slides, admin-managed, 10s auto-advance, random start, 0.4s Ken Burns pop-zoom, 1.2s crossfade, next-image preload. Per-slide `link_url` + `link_label` powers a per-slide gold CTA (e.g. Baha Mar → bahamar.com).
- **External operator booking URLs per tour** — 9 tours with published pricing:
  - Blue Lagoon Island Beach Day — $109 → bluelagoonisland.com
  - Three-Island Boat Hopping — $149 → getyourguide.com
  - Paradise Island & Atlantis City Tour — $195 → atlantisbahamas.com/things-to-do
  - Rose Island Reef Snorkeling — $139 → viator.com
  - Dolphin Encounters Close Encounter — $200 → dolphinencounters.com
  - Pearl Island Snorkel + Beach — $189 → pearlislandbahamas.com
  - Sandy Toes Rose Island — $149 → sandytoesbahamas.com
  - Exuma Cays Powerboat Day — $275 → powerboatadventures.com
  - Atlantis Aquaventure Waterpark Day Pass — $210 → atlantisbahamas.com/waterpark
- Gold "Rox Taxi Service" logo in header

## Home hero slides
1. Unlock Nassau
2. Atlantis, direct (Wikimedia BHA_Atlantis_Bridge)
3. Rose Island reefs
4. Junkanoo golden hour
5. Fish Fry, Arawak Cay
6. Exuma swimming pigs (Wikimedia Vorobek)
7. Straw Market & Bay Street (Wikimedia 2024)
8. Fort Charlotte (Wikimedia)
9. Baha Mar Resort — CTA links to bahamar.com

## Backlog
- **P2** Real Google Places live reviews (needs Google Cloud API key)
- **P2** `promo_ends_at` auto-expiry for sale badges
- **P2** "Featured on home" for rentals
- **P2** User-supplied Baha Mar photo (current Wikimedia Reflection panoramio can be swapped when a better photo is available)

## Credentials
`/app/memory/test_credentials.md` — admin@roxtaxi.com / admin123
