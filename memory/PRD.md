# Rox Taxi Service & Tours — Product Requirements

Bahamas (Nassau + Paradise Island) taxi, tours and car rental booking platform.

## Original problem statement
Website for a Bahamas (Nassau + Paradise Island) taxi and tour operator. Must support:
pre-booking excursions/tours, car rentals, taxi status tracking, online payments (Stripe/PayPal/Zelle),
Facebook page linkage, admin panel; Group/Wedding PDF quotes, Claude AI live chat, complex pricing
(luggage fees, extra-passenger fees after 2 pax, $150 car rental deposit, $25 extra-driver fee), 15%
cancellation fee (48h notice), custom logo uploads, Twilio SMS + SendGrid SMTP notifications, Namecheap
hosting/email compat, delivery-status tracking, live GPS driver tracking, editable catalog items.

## Architecture
- Frontend: React + Tailwind + Shadcn/UI (/app/frontend)
- Backend: FastAPI + Motor + MongoDB (/app/backend)
- Modular backend: server.py + routes/payments.py + routes/admin.py + seed_data.py + pdf_utils.py + notifications.py + paypal_client.py
- Modular admin UI: /app/frontend/src/pages/admin/ (CatalogPanel, EditModal, PriceHistoryModal, ImagePickerModal, ImagesPanel, MessagesPanel, SiteConfigPanel, HomeSlidesPanel, shared.jsx)
- Live integrations: Stripe, PayPal, Twilio, SMTP/SendGrid, Claude (Emergent LLM key)

## Implemented (feature summary)
- Booking flows: Taxi / Tours / Rentals with pricing (pax, luggage, deposit, extra-driver fee)
- Payments: live PayPal + Stripe + Zelle + PayPal.me
- Notifications: Twilio SMS + SendGrid/SMTP email + admin delivery report + CSV export + preference toggles
- Admin dashboard: bookings, deposits (release/forfeit/auto-refund), stats, group inquiries, contact messages
- Group / Wedding PDF quotes
- Live driver GPS tracking (DriverShare + DriverLiveBanner)
- Contact form + Google Reviews UI + admin Messages tab
- Catalog Image Manager + shared Photo Library ImagePicker + logo upload
- Site Config panel (social, Zelle, notifications, logo, contact)
- ChatWidget (Claude Sonnet) + Messenger handoff
- **Rentals**: full-attribute admin CRUD (year/make/model/color/body/seats) + strike-through promo
- **Price History Log** + Admin Price Editor with quick promo shortcuts + Reset-to-seed default
- **Strike-through promo pricing** on /rentals, /tours, /taxi (via `promo` annotation from server)
- **Dynamic home hero carousel** — /home-slides collection with 7 seed slides, admin CRUD, auto-advance 6s, random start, prev/next/dots, **Ken Burns zoom (scale 1.02 → 1.10 over dwell) + next-image preload**
- **External operator booking URL per tour** — optional field; /tours cards show "Or book on official operator site ↗" secondary link when set (internal Book button retained)
- Admin `alive`-guarded fetches prevent stale kind data flashes

## Data model
- `db.bookings`, `db.tours` / `db.taxi_services` / `db.rentals` (with `seed_price`, `price_history[]`, optional `promo`)
- Tours also: `external_booking_url`
- Rentals also: year, make, model, color, body, seats
- `db.home_slides`: {id, title, subtitle, image_url, order, active}
- `db.site_config`, `db.contact_messages`

## Backlog
- **P2** Wire real Google Places API pull for reviews (needs Google Cloud API key).
- **P2** `promo_ends_at` field so sale badges auto-expire without manual admin edit.
- **P2** Optional: "Featured on home" checkbox for rentals.
- **P2** Density selector (comfortable/compact) currently only shown when library > 20 photos — allow always.

## Testing
- Iteration_15: 100% (edit-external-url + clear/persist retest all green). Blue Lagoon restored to seed values.

## Credentials
`/app/memory/test_credentials.md` — admin@roxtaxi.com / admin123
