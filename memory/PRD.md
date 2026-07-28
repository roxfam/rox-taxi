# Rox Taxi Service and Tours — PRD

## Original problem statement
Website offering taxi and tours in The Bahamas (Nassau + Paradise Island focus): pre-booking excursions/tours, car rentals, taxi status tracking, online payments (Stripe/PayPal/Zelle), Facebook page connection, and an admin panel. Product requirements: group/wedding bookings with PDF quotes, Claude AI live chat, complex pricing (luggage fees, extra passenger fees, $150 rental deposit, $25 extra driver fee), 15% cancellation fee, custom logo uploads, Twilio SMS + SendGrid SMTP notifications, Namecheap hosting compatibility, delivery status tracking, live GPS driver tracking, editable catalog with price history, external booking links for tours, dynamic home carousels.

## Deployed target
- Primary: Emergent preview / Namecheap Stellar (PHP + MySQL rewrite scaffolded under `/app/backend-php/` for future migration)
- Domain: roxtaxi.com (planned)

## Current owner data
- Phone: +1 (242) 432-2587
- WhatsApp: +12424322587
- Zelle: roxfam2509@gmail.com / +1 (347) 751-5251
- Facebook: https://www.facebook.com/roxtaxiservice/
- Google Business Profile: https://www.google.com/maps/place/ROX+TAXI+SERVICE/... (saved in site_config)
- Admin login: admin@roxtaxi.com / admin123 (see `/app/memory/test_credentials.md`)

## What's live (as of this session)
- Full booking flows: taxi, tours, rental with dynamic pricing (luggage +$3 each, extra passenger +$5 after 2, $150 rental deposit, +$25 extra driver, 15% cancel)
- **Rental 2-day minimum** enforced backend + frontend
- **Payments**: Stripe checkout, PayPal REST v2, Zelle instructions — shareable `/pay/:bookingId` page with all 3 methods + real credentials
- **Notifications**: Twilio SMS + SMTP email to customer AND owner (rich booking-details SMS on new booking + payment received)
- **Live GPS driver tracking** (Server-Sent Events)
- **Admin panel** (`/admin/manage`): Bookings dashboard, Catalog CRUD w/ price history, Images library, Home Slides, Site Config, Messages, Groups, **Payments panel (Stripe/PayPal/Zelle merged view + revenue totals + refund + mark-Zelle-paid)**, **Content panel (hero taglines, About copy, cancellation policy, FAQ)**
- **Photo Gallery** (`/gallery`) — masonry, category filters, lightbox, aggregates catalog + admin uploads
- **Home hero**: 10s dynamic carousel + Ken Burns + modern segmented Quick-Book widget (Taxi/Tours/Rentals tabs with animated pill)
- **About page** redesigned: 6-card "Promises" grid (kids ride included, 15% cancel policy, live GPS, on-time, fixed tariff, Wi-Fi fleet), Guest Stories (3 quotes + 5 stars), "Rox Taxi Service vs a street cab" comparison
- **Chat widget**: Claude Sonnet 4.6 with rich Rox R monogram, modern glass card, animated FAB w/ pulse ring, "Continue on WhatsApp" hand-off (deep-links wa.me with prefilled context)
- **SEO**: Full `<head>` overhaul — LocalBusiness/TaxiService/FAQ/WebSite JSON-LD, OpenGraph, Twitter Card, canonical, hreflang, sitemap.xml, robots.txt, Product ItemList schema for every tour
- **Marketplaces**: "Find us on" footer row — Facebook + Google Reviews (active), TripAdvisor/Viator/Yelp (dashed "coming soon"). Google Business URL wired site-wide.
- **Contact number** in footer + everywhere: +1 (242) 432-2587
- **Bold hover** labels on header social chips
- **"Make a Payment" gold button** in footer → /pay
- **Attention-grabbing price styling** globally (text-2xl / font-black / orange glow)

## Namecheap Stellar port (scaffolded, not yet deployed)
- `/app/backend-php/README-DEPLOYMENT.md` — full deployment doc
- `/app/backend-php/schema.sql` — complete MySQL DDL (13 tables)
- `/app/backend-php/public/.htaccess` + `api/.htaccess` — SPA fallback + API routing
- `/app/backend-php/public/api/index.php` — PHP 8 front controller with 50+ route table
- `/app/backend-php/public/api/lib.php` — DB, JWT, notifications (Twilio + SMTP), cURL helper
- `/app/backend-php/.env.example` — env template
- Missing: actual endpoint handler files (`routes/catalog.php`, `routes/bookings.php`, etc.) + migration script (`migrate_from_mongo.py`)

## Roadmap / P0 backlog
- [ ] Complete Namecheap PHP port: implement route handlers + Mongo→MySQL migration script (~2 more focused sessions)
- [ ] Wire real Google Places API for live Google Reviews carousel on Home (blocked on user's Google Places API key)
- [ ] Wire the Content panel outputs into public pages (currently editable but not yet consumed on Home/About/Contact)

## Roadmap / P1
- [ ] TripAdvisor, Viator, Yelp actual listings + un-dash the "coming soon" badges when live
- [ ] Google Ads + Meta Pixel tracking placeholders (needs GA4 + Meta Business ID)
- [ ] Ad-campaign conversion event schema (booking_created, payment_received)

## Roadmap / P2
- [ ] Client-side thumbnail-size selector in Admin Image Manager
- [ ] Consolidate `_admin_dep` and `_require_admin_placeholder` in `routes/admin.py`

## Last verified: iteration_16.json (100% backend, 100% frontend)
