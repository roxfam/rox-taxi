# Rox Taxi Service & Tours — Product Requirements

Bahamas (Nassau + Paradise Island focus) taxi, tours and car rental booking platform.

## Original problem statement (verbatim intent)
A website offering taxi and tours in The Bahamas (Nassau & Paradise Island). Must support:
pre-booking excursions/tours, car rentals, taxi status tracking, online payments (Stripe, PayPal, Zelle),
Facebook page linkage, admin panel. Also: Group/Wedding PDF quotes, Claude AI live chat, complex pricing
(luggage fees, extra-passenger fees after 2 pax, $150 car rental deposit, $25 extra-driver fee), 15%
cancellation fee (48 h notice), custom logo uploads, Twilio SMS + SendGrid SMTP notifications, Namecheap
hosting/email compatibility, delivery-status tracking, live GPS driver tracking, editable catalog items.

## Architecture
- Frontend: React + Tailwind + Shadcn/UI (/app/frontend)
- Backend: FastAPI + Motor + MongoDB (/app/backend)
- server.py modularized → routes/payments.py, routes/admin.py, seed_data.py, pdf_utils.py, notifications.py
- Live integrations: Stripe, PayPal, Twilio, SMTP/SendGrid, Claude (Emergent LLM key)

## Implemented (chronological)
- Booking flows: Taxi / Tours / Rentals with complex pricing (pax + luggage + deposit + extra-driver fee)
- Payments: live PayPal + Stripe checkouts, Zelle instructions, PayPal.me fallback
- Notifications: Twilio SMS + SendGrid/SMTP email with delivery report + CSV export + admin toggles + force-resend
- Admin dashboard: bookings, statuses, deposits (release/forfeit + auto-refund), stats
- Group / Wedding bookings + PDF quotes (pdf_utils.py)
- Live driver GPS tracking (DriverShare + DriverLiveBanner on /track)
- Contact Us: /contact form + Google Reviews UI + /api/contact endpoint + admin Messages tab
- Catalog Image Manager: /admin/images upload, list, delete + shared photo library ImagePicker
- Custom logo upload + Site Config panel (Facebook/Messenger/Google reviews/Zelle/notification prefs)
- ChatWidget (Claude Sonnet) + Messenger handoff UI derived from configured page slug
- **[2026-02-28] Rental vehicle full-attribute admin CRUD** — Year, Make, Model, Color, Body, Seats fields exposed in the Add/Edit modal for kind=rentals.
- **[2026-02-28] Price History Log + Admin Price Editor** — PATCH /api/admin/{kind}/{id}/price appends `{old_price,new_price,reason,changed_by,changed_at}` to `price_history[]`. Frontend PriceHistoryModal shows current price, new-price input, reason field, ±% delta, and audit table. Works for rentals / tours / taxi_services.
- **[2026-02-28] Seed persistence fix** — `price` + `price_history` now use `$setOnInsert` so admin edits survive backend restarts. `delete_many` was removed so admin-added items also persist.
- **[2026-02-28] Blackout date text bolder** on /rentals cards.
- **[2026-02-28] Photos swapped**: Trax SUV → uploaded white photo; Sentra → renamed to 2021 Nissan Versa (Orange).

## Data model additions this session
- `db.rentals` / `db.tours` / `db.taxi_services`: `price_history: [{old_price, new_price, reason, changed_by, changed_at}]`
- Rentals extended fields: `year, make, model, color, body`

## Backlog / Next
- **P1** Refactor AdminManage.jsx (~1026 lines) — split PriceHistoryModal, EditModal, ImagePickerModal, ImagesPanel, MessagesPanel, SiteConfigPanel into their own files under `/app/frontend/src/pages/admin/`.
- **P1** UI: "reset to seed default" price affordance so a seed price can be restored after admin edits.
- **P2** Wire real Google Places API pull for reviews (blocked on Google Cloud API key from user).
- **P2** Client-side thumbnail size selector default vs. compact in Image Manager once library grows.
- **P2** Optional: enable "Featured on home" checkbox for rentals (currently hidden for kind==='rentals').

## Testing
Last automated run: `/app/test_reports/iteration_12.json` — backend 10/10 pytest pass, frontend E2E of PriceHistoryModal passes 100%. Admin-added items persist across backend restart (verified).

## Credentials
`/app/memory/test_credentials.md` — admin@roxtaxi.com / admin123
