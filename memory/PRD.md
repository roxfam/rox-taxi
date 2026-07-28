# Rox Taxi Service & Tours — Product Requirements

Bahamas (Nassau + Paradise Island) taxi, tours and car rental booking platform.

## Original problem statement (verbatim intent)
Website offering taxi + tours in The Bahamas (Nassau & Paradise Island). Support:
pre-booking excursions/tours, car rentals, taxi status tracking, online payments (Stripe/PayPal/Zelle),
Facebook page linkage, admin panel; Group/Wedding PDF quotes, Claude AI live chat, complex pricing
(luggage fees, extra-passenger fees after 2 pax, $150 car rental deposit, $25 extra-driver fee), 15%
cancellation fee (48h notice), custom logo uploads, Twilio SMS + SendGrid SMTP notifications, Namecheap
hosting/email compat, delivery-status tracking, live GPS driver tracking, editable catalog items.

## Architecture
- Frontend: React + Tailwind + Shadcn/UI (/app/frontend)
- Backend: FastAPI + Motor + MongoDB (/app/backend)
- server.py modularized → routes/payments.py, routes/admin.py, seed_data.py, pdf_utils.py, notifications.py
- AdminManage split into /app/frontend/src/pages/admin/ (CatalogPanel, EditModal, PriceHistoryModal, ImagePickerModal, ImagesPanel, MessagesPanel, SiteConfigPanel, HomeSlidesPanel, shared.jsx)
- Live integrations: Stripe, PayPal, Twilio, SMTP/SendGrid, Claude (Emergent LLM key)

## Implemented (chronological, highlights)
- Booking flows: Taxi / Tours / Rentals with complex pricing (pax, luggage, deposit, extra-driver fee)
- Payments: live PayPal + Stripe + Zelle + PayPal.me
- Notifications: Twilio SMS + SendGrid/SMTP email + admin delivery report + CSV export
- Admin dashboard: bookings, deposits, stats, group inquiries, contact messages
- Group / Wedding PDF quotes (pdf_utils.py)
- Live driver GPS tracking (DriverShare + DriverLiveBanner on /track)
- Contact form + Google Reviews UI + /api/contact endpoint + admin Messages tab
- Catalog Image Manager + shared Photo Library ImagePicker + logo upload
- Site Config panel (Facebook/Messenger/Google reviews/Zelle/notification prefs)
- ChatWidget (Claude Sonnet) + Messenger handoff
- **[2026-02-28] Rental vehicle full-attribute admin CRUD** (year/make/model/color/body/seats)
- **[2026-02-28] Price History Log + Admin Price Editor** — PATCH /admin/{kind}/{id}/price + audit trail modal
- **[2026-02-28] Seed persistence** — `price` + `price_history` use `$setOnInsert`; `delete_many` removed
- **[2026-02-28] Blackout date text bolder** on /rentals
- **[2026-02-28] Reset-to-seed price** button in the price editor (seed_price stored on every startup)
- **[2026-02-28] AdminManage refactor** — 1026 → 65 line orchestrator + 8 per-panel modules
- **[2026-02-28] Strike-through promo pricing** — reason containing promo/sale/discount + decrease → `promo` annotation on public list endpoints → PromoPrice component renders `~~$X~~ $Y SALE` on /rentals, /tours, /taxi. Admin CatalogPanel row also strikes through
- **[2026-02-28] Dynamic home hero carousel** — /home-slides collection with 7 seed slides (Nassau, Atlantis, Rose Island, Junkanoo, Fish Fry, Exuma pigs, Straw Market). Auto-advances 6s, randomized starting slide, prev/next/dot controls, admin-managed via /admin/manage → Home Slides tab (full CRUD + up/down reorder + active toggle)
- **[2026-02-28] External operator booking URL per tour** — optional `external_booking_url` field; /tours cards render 'Or book on official operator site ↗' secondary link when set (internal Book button kept)
- **[2026-02-28] CatalogPanel race fix** — `alive` flag + setItems([]) on kind change so stale /admin/tours doesn't overwrite freshly loaded /admin/rentals

## Data model
- `db.bookings`: {id, items, total, status, pax, extra_drivers, deposit_amount, notified_at, notification_status: {email, sms}}
- `db.tours` / `db.taxi_services` / `db.rentals`: {id, name, description, price, seed_price, price_history: [{old_price, new_price, reason, changed_by, changed_at}], image_url, category, active, ...kind-specific}
  - Tours may also have `external_booking_url`
  - Rentals also: year, make, model, color, body, seats
- `db.home_slides`: {id, title, subtitle, image_url, order, active}
- `db.site_config`: {facebook_url, tripadvisor_url, logo_url, google_reviews_url, messenger_url, notify_email_enabled, notify_sms_enabled, ...}
- `db.contact_messages`: {name, email, phone, subject, message, status, created_at}

## Backlog / Next
- **P2** Wire real Google Places API pull for reviews (needs Google Cloud API key from user).
- **P2** Client-side thumbnail size selector expansion (already have compact/comfort for images >20).
- **P2** Optional: enable "Featured on home" checkbox for rentals (currently hidden).
- **P2** Consider a "promo end date" field so sale badges auto-expire without an admin edit.

## Testing
Latest: `/app/test_reports/iteration_13.json` (all backend pass, race fix applied). Iteration 14 kicked off for home carousel + external URL + refactor regression.

## Credentials
`/app/memory/test_credentials.md` — admin@roxtaxi.com / admin123
