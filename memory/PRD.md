# Rox Taxi Service & Tours — PRD

## Product Vision
A production-grade website for a Bahamian taxi + tours + car-rental business (Nassau & Paradise Island focus) with pre-booking, online payments, admin panel, and complete guest-lifecycle automations (SMS, email, cron jobs, referrals, tips, driver spotlights, real Google reviews).

## Core Requirements
- Booking flow (taxi, tours, rentals) with dynamic pricing (per-person, add-ons, taxi add-ons, referral discounts, tips)
- Stripe (BYOK via `STRIPE_API_KEY`), PayPal, Zelle payment paths
- Twilio SMS + SMTP email pipeline for every guest touch-point
- Admin console: catalog CRUD, bookings, deposits, notifications, reviews, referrals, deliverability, weekly reports
- Post-trip tip top-up flow (SMS 15 min after completion) + weekly owner report email
- Emergent Object Storage (no local disk uploads)
- Google Places API 4+ star reviews auto-sync (cron hourly)
- Driver tracking / QR check-in + Admin Audit Heatmap
- Referral system with 10% discount + admin leaderboard

## Personas
- **Owner** — reviews bookings, deliverability, and weekly performance from `/admin`; gets SMS + email pings for every meaningful site event.
- **Guest** — books taxi/tour/rental, receives SMS+email lifecycle nudges, tips post-trip.
- **Driver** — reads day-of manifest, scans QR at pickup.

---


### Feb 2026 — Home Page Cable Beach Promotion (Cruise + Local)
- **Dual-audience promotion** card at the top of the home page (ahead of Dolphin Swim) with two side-by-side lanes:
  - **Cruise passengers** → "Straight off the port, on the sand in 15 min · $10 one-way · $20 round-trip" with Ship icon and `?src=cruise` deeplink for attribution
  - **Bahamians & residents** → "Your weekend reset, dinner included · Group of 6+? Gift the whole day" with Hotel icon and `?src=local` deeplink
- **Social proof + urgency row**: `From $40 · ★ 4.9 · 320+ reviews · Same-day booking available`
- **Water-sports hook**: cruise lane chip reads "Parasail · jet ski" and local lane highlights "Jerk · BBQ · seafood"
- CTA bar now shows two buttons (`Book from $40 · instant` + `See what's included`) and the trust micro-copy `Pay Stripe or PayPal · full refund up to 24h out`
- Shadow and radius elevated for stronger shelf prominence; hero image zooms subtly on hover


### Feb 2026 — Team SMS Routing + Admin-wide Cable Beach Alerts
- **Admin numbers now receive Cable Beach events too** — the booking flow now fires `notify_owner_activity(kind="cable_beach_<phase>", ...)` for created / paid / dayof so every admin phone with `*` or `cable_beach_*` in their subscriptions gets pinged. Taxi / tour / rental streams unchanged (no cross-leak).
- **Per-area Team SMS roster** — new `site_config.team_sms_recipients` collection with `{label, phone, areas: ["cable_beach","taxi","tour","car_rental","group","incident"], enabled, quiet_hours}`. Ground teams only receive events for their lane; `+12424341945` (Cable Beach beach team) auto-seeded on first boot.
- **New admin panel** — `TeamSmsCard` on `/admin` lets owners add any number of teams with: label · E.164 phone · area toggle chips · quiet-hours · enable/disable · delete. Posts the full roster in one call so there are no ordering bugs. Validates E.164 client-side.
- **Dispatch helper** — `routes/team_sms.send_team_sms(area, body)` iterates the roster, respects per-row quiet hours (22:00-04:00 Nassau), and returns a tiny summary dict for debug/regression. Called from the Cable Beach booking phase hook; same helper is reusable from taxi / tour / rental booking hooks when wired later.
- **Routing fix**: paths live under `/api/notifications/team-sms` (not `/api/admin/*`) to avoid being swallowed by the existing `PUT /admin/{kind}/{item_id}` catalog route whose `kind` regex rejects anything that isn't `tours|taxi_services|rentals`.


### Feb 2026 — Water Sports Add-ons + Professional Menu Redesign
- **Water sports section** on the Toes-in-the-Turquoise package: Parasailing $120 (8–10 min) · Snorkeling $100/person (1 hr 30 min) · Banana Boat $55 (3 miles) · Jet Ski 30/45/60 min at $140/$170/$220 · Jet Car 15/30/45/60 min at $170/$320/$470/$630. Parasail spectator add-on ($35) auto-reveals only when at least one parasail seat is in the cart. All items use +/- qty steppers capped at 20 server-side.
- **Backend** (`routes/cable_beach.py`): `water_sport_qty: dict[str,int]` + `parasail_spectators: int` added to quote + book requests; totals computed in `water_sport_lines`, surfaced on quote response, persisted on the booking under `cable_beach.water_sport_lines`. Admin PUT accepts `water_sports` + `parasail_spectator_price` for live reconfig without redeploy. Verified end-to-end — $845 total on a 2 parasail + 4 snorkel + 1 jet-ski-45 + 1 spectator cart.
- **Professional/modern UI rewrite** of the Cable Beach package page:
  - Replaced emoji picture thumbnails on side picker with **clean text-only pill chips** (name + `✓` or `+$5`)
  - Replaced emoji dietary badges on menu tiles with **small text codes** (`GF`, `DF`, `PE`, `NF`, `SF`) in muted stone palette; dietary filter row now uses the same codes
  - **Editorial Section component**: hairline gradient divider · uppercase gold micro-eyebrow · serif Playfair-style H2 (no more card chrome)
  - **Jump-link nav** turned from pill cluster into a magazine-ToC: serif labels, underline-on-hover, 2-digit padded counts, hairline mid-dots
  - **Chef's choice combo** card rebuilt as an editorial card with vertical gold accent rule + "You save" column divider
  - **Category section headers**: 2-digit numeric eyebrow (`01 Appetizers`, `02 Burgers`, …) with underline border and uppercase dish count
  - Water sports section rendered as a divided-list (not a grid of boxes) — reads like a signature-cocktails page


### Feb 2026 — Side Dish Thumbnails + server.py Split (Cable Beach)
- **Side pickers now visual**: each of the 6 sides renders as a round emoji thumbnail (🧀 🥔 🥬 🥦 🍌 🌽) on a 3-column grid with a check-badge when selected and a `+$5` corner tag when the pick exceeds the 2-free limit. Scans in under a second on mobile.
- **Admin-ready photo upgrade path**: `sides` schema now carries `glyph` + optional `image_url`; the admin update endpoint accepts both and the frontend prefers `image_url` (object-cover circle) over the glyph so real food photos can be swapped in later without a code change.
- **server.py split (P1)**: 685 lines of Cable Beach logic (defaults, hotel tariffs, quote, book, share-credit, weather, admin update) moved to **`/app/backend/routes/cable_beach.py`** (650 lines, self-contained). server.py: **7,363 → 6,679 lines**. Wiring follows the existing `configure(...) + include_router(...)` pattern (payments / auth / customer); `_credit_share_referrer_if_cable_beach` is re-exposed at module scope so `_apply_referral_conversion_if_paid` keeps picking it up via `globals().get`. Verified end-to-end: `/api/public/cable-beach-package` + `/api/cable-beach/weather` + `/api/cable-beach/hotels` + `/api/cable-beach/quote` all return 200; 3 sides on a jerk-chicken quote still bills $5 extra.


### Feb 2026 — Dinner Sides + Food Menu Jump-Link Nav
- **6 Bahamian sides** now attach to every dinner (jerk / BBQ / classic): Mac & Cheese · Bahamian Potato Salad · Steamed Cabbage · Broccoli · Plantain · Loose Corn. Policy: **2 free per dinner, $5 each extra** (`sides_included_per_dinner` + `extra_side_price` live in `cable_beach_pkg`, admin-overridable).
- **Server-side pricing**: `/api/cable-beach/quote` now accepts `side_selections: {dinner_id: [side_id, ...]}` and returns `sides_detail` + `sides_extra_count` + `sides_extra_total`; the booking doc persists the same under `cable_beach.sides_detail`. Sides on non-dinner items (burgers, appetizers, combos) are ignored safely.
- **Category field** added to every lunch item (`appetizer | burger | jerk | bbq | seafood_combo | dinner`) with an inference helper so historical DB rows auto-classify without a redeploy.
- **Sticky jump-link nav bar** on the food menu — "Hungry?" row of pills (Appetizers · Burgers · Jerk · BBQ · Seafood Combos · Dinners) with live item counts; one tap smooth-scrolls to each category heading. Mobile-first with horizontal swipe.
- **Inline side picker** appears below any selected dinner tile: 6 chips, running count `n/2`, extras flagged in orange with `+$5` so the guest sees the surcharge before tapping.
- Smoke-tested end-to-end: quote returns $10 for 2 extra sides on a jerk chicken + ignores extra sides on a shrimp burger.

## CHANGELOG

### Feb 2026 — Burgers & Sandwiches (× 5)
- **5 burger items** added to the Cable Beach food menu (defaults + live DB upsert): Hamburger **$30** · Shrimp Burger **$33** · Conch Burger **$33** · Lobster Burger **$33** · Chicken Burger **$25**. Food menu now 29 items.
- **Allergen tags** curated per burger — all are `peanut_free`; seafood burgers (shrimp/conch/lobster) add `pescatarian`; non-seafood burgers (hamburger/chicken) add `shellfish_free`. None are gluten-free (buns) or dairy-free (likely cheese).
- Verified live: 2 pax + Shrimp Burger $33 + Hamburger $30 quote returns correctly through the Cable Beach quote endpoint; all 5 tiles render with the right emoji badges and respect the dietary filters.

### Feb 2026 — Seafood Combo Plates (× 8)
- **8 new seafood combos** added to the Cable Beach food menu (defaults + live DB upsert):
  - `combo_lcs`  — Lobster · Conch · Shrimp Combo — **$65**
  - `combo_lcsf` — Lobster · Conch · Shrimp · Fish Combo — **$70**
  - `combo_scsl` — Salmon · Conch · Shrimp · Lobster Combo — **$70**
  - `combo_cs`   — Conch & Shrimp — **$70**
  - `combo_ls`   — Lobster & Shrimp — **$60**
  - `combo_gc`   — Grouper & Conch — **$60**
  - `combo_gl`   — Grouper & Lobster — **$35**
  - `combo_ws`   — Wings & Shrimp — **$50**
- Allergen tags curated per plate: all seafood plates are `pescatarian · dairy_free · peanut_free`; the chicken-wings-plus-shrimp plate drops the `pescatarian` tag so it's filtered out when a guest ticks "Pescatarian". None carry the `shellfish_free` tag (all contain lobster / shrimp / conch), so they correctly disappear when "Shellfish-free" is active. Total food menu now 24 items. Verified end-to-end: live quote (2 pax + $70 LCSF + $35 Grouper&Lobster = $228.98).

### Feb 2026 — Smart Allergen Prompt + Emoji-Icon Badge Pass
- **Emoji badges on every food tile** (`MenuTile` in `CableBeachDay.jsx`): the GF/P/DF/PF/SF letter codes were replaced with icon pills — 🌾❌ · 🐟 · 🥛❌ · 🥜❌ · 🦐❌ — each with a tooltip, pastel background, and brand-coloured text. Filter chips mirror the same glyph next to the full label so the visual language matches the menu grid. Scans ~3× faster on mobile.
- **Smart allergen prompt** (`AllergyPrompt` component): the moment a guest ticks "Shellfish-free" or "Peanut-free", a yellow-amber banner appears asking "Any {allergen} allergy in your party?" with a one-tap "Yes, flag it" button. Clicking turns the banner red and the button to "Allergy flagged ✓". Flagged allergens are passed to `/cable-beach/book` as an `allergies: ["shellfish","peanut"]` array; backend prepends "⚠️ ALLERGIES: Shellfish, Peanut." to the booking's `special_requests` so dispatch and the kitchen see it at the top of the booking record. Verified end-to-end: live quote $127.05, booking persists allergies + prefixed note.
- **Combo-badge email flag-order fix**: `combo_badge_sent` is now set BEFORE the send_email call so a transient SMTP hiccup in sandbox doesn't cause a double-send on retry.

### Feb 2026 — Allergen Deep-Dive + Combo Badge Email + Admin Combo Builder
- **Allergen tags expanded** — every item in `CABLE_BEACH_DEFAULTS["lunch_items"]` and the live DB now carries `peanut_free` and `shellfish_free` flags in addition to GF/P/DF. Jerk Shrimp / Jerk Lobster / Jerk Conch / Fritters correctly OMIT `shellfish_free` so the filter hides them. Public UI gained 2 new filter chips (Peanut-free, Shellfish-free) and per-tile badges in distinct colours (PF violet, SF pink). Verified: tapping Shellfish-free hides all shellfish-containing plates while keeping jerk chicken + bbq lineup visible.
- **Chef's combo badge email** (`_send_combo_badge_email_if_cable_beach` in `server.py`): fires on every paid Cable Beach booking that carries an applied combo. Branded gold-coral gradient template, savings callout, combo contents, booking ref, and a WhatsApp share deeplink pre-filled with the savings line. Idempotent via `combo_badge_sent` flag. Hooked at the top of `_apply_referral_conversion_if_paid` so it fires regardless of referral status.
- **Admin combo builder** (`ComboBuilder` in `CableBeachPackageCard.jsx`): new section at the bottom of the Cable Beach admin card listing all combos as editable rows (name, subtitle, discount, trash). Each row has a pill-grid of all `lunch_items` + `drink_items`; tap to toggle membership. "Add combo" + "Save combos" buttons. Backend `/admin/cable-beach-package` PUT extended to accept + validate a `combos` array (needs name, 2+ items, non-negative discount) and `CableBeachPkgUpdate` model gained the `combos` field. The admin menu-item cleaner also now preserves `tags` (previously stripped on save).

### Feb 2026 — Dietary Tags + Chef's Choice Combo
- **Dietary tags** on every food item in `CABLE_BEACH_DEFAULTS["lunch_items"]` + live DB: each item carries a `tags` array (`gluten_free`, `pescatarian`, `dairy_free`). Fritters are `pescatarian + dairy_free`; jerk/baked plates skew `gluten_free + dairy_free`; BBQ (soy-sauce base) kept conservative at `dairy_free` only; seafood dinners add `pescatarian`.
- **Public filter chips** (`CableBeachDay.jsx`): GF / Pescatarian / Dairy-free toggleable chips above the food grid; tiles filter in-place (require ALL selected tags), with a graceful empty-state message. Each `MenuTile` now shows tiny coloured badges (GF emerald / P sky-blue / DF amber) under the price.
- **Chef's Choice combo** (`CABLE_BEACH_DEFAULTS["combos"]` + `/cable-beach/quote?combo_id=…`): one-tap bundle card above the food menu auto-selects 8-pc Fritters + Jerk Chicken + Bahama Mama and knocks $5 off. Backend validates that every required item is present before applying — tampered combo_id with wrong items yields no discount (verified: `combo_applied: null`). Live summary line shows "Chef's combo · −$5". Click again to clear.
- End-to-end verified: quote with correct combo = $152.46 (base + 3 menu items − $5 + VAT + fee); wrong items with same combo_id correctly refuses the discount; GF filter hides BBQ Chicken and shows Jerk Chicken as expected.

### Feb 2026 — Toes in the Turquoise · Conch Fritters Appetizer
- **Bahamian Conch Fritters** added to the Cable Beach food menu as an optional appetizer in 3 sizes: 5 pc $10, 8 pc $15, 12 pc $18. Written both to `CABLE_BEACH_DEFAULTS["lunch_items"]` (fresh installs) and upserted into live `site_config.cable_beach_pkg.lunch_items`. Section headers updated to "Food menu (optional) — dinners include rice & 2 sides" (public) and "Food menu (fritters + dinners w/ rice & 2 sides)" (admin) to cleanly cover the mixed appetizer + dinner lineup. Live quote verified: 2 pax + 8-pc fritters + Jerk Lobster = $113.85.

### Feb 2026 — Toes in the Turquoise · Authoritative Dinner Menu
- **Dinner menu (rice + 2 sides)** — the generic starter lunch items (conch salad, wraps, kids plate) were replaced with the owner-supplied authoritative Jerk & BBQ dinner menu, 13 plates total: Jerk Chicken/Pork/Ribs $30, Jerk Salmon/Conch $35, Jerk Shrimp/Lobster $40, BBQ Chicken $25, BBQ Pork/Ribs $30, Baked Pork Chop $40, Snapper Dinner $40, Soamoo Dinner $35. Each dinner "includes rice & 2 sides" — surfaced in both the public section header and the admin menu label. "Oaked" was normalised to "Baked" (safe typo); "Soamoo" kept verbatim — both are editable in the admin card. Written both into `CABLE_BEACH_DEFAULTS` (fresh installs) and upserted into `site_config.cable_beach_pkg.lunch_items` (live DB) so the preview + production both pick it up immediately. Verified end-to-end: live quote with Jerk Lobster + Snapper Dinner + Bahama Mama = $198.66 (base $80 + food $92 + VAT $17.20 + fee $9.46).

### Feb 2026 — Flexible Gift Date + Hotel Live Weather + Suggested Note Picker
- **Gift card activation hook** (`_activate_gift_if_paid` in `server.py`, called from both Stripe webhook paths in `payments.py`): fills the long-missing activation step — on `checkout.session.completed` with `metadata.type == "gift_card"`, the card flips `pending → active` and either (a) sends the branded voucher immediately or (b) stores `scheduled_send_at` for later. Zero schema break (purchased cards gained `scheduled_send_at`, `delivered_at`, `activated_at`).
- **Branded voucher PDF** (`build_gift_voucher_pdf` in `pdf_utils.py`): new ReportLab layout with Rox logo, "Toes in the Turquoise · Cable Beach" kicker, oversized $ amount in Rox coral, monospace code card, buyer's note block, how-to-use lines, fine print. Rendered as 742 KB PDF (test), attached to the recipient email with a slick HTML body matching the beach-day branding.
- **Flexible delivery date** (`GiftCardPurchaseRequest.scheduled_send_at`): ISO datetime; stored on the gift doc; drain picks it up when due. Buyer gets a one-shot "your gift is queued for X" ack email if deferred. If `scheduled_send_at` is null → send immediately on activation.
- **Scheduled gift drain** (`_drain_scheduled_gifts` piggybacked on `send-checkout-nudges` cron, 10 min cadence): no new cron needed (we were at the 5/5 platform cap). Scans active gifts where `delivered_at IS NULL AND scheduled_send_at <= now`, fires email, marks delivered. Verified: pushed a gift's scheduled date to the past → drain delivered it immediately.
- **Live marine conditions** (`/api/cable-beach/weather` + `_classify_marine`): Open-Meteo marine + weather pulls (no API key, 15-min in-process TTL cache). Classifies into 4 bands: Glass calm 🪞 / Light chop 🌊 / Breezy & fun 🏄‍♂️ / Surf's up 🏄. Returns wave, wind, water temp, air temp, hex colour, tier label. Graceful degradation on API failure (returns neutral `stale: true`).
- **Weather badge** (`HotelAutocomplete`): badge above the hotel dropdown with wave/wind/water + per-row emoji so a cruise guest instantly sees "is today a lounger day or a jet-ski day?" before picking a hotel.
- **Suggested-note picker** (`GiftBeachDayModal`): 3 one-tap chips (🎂 Birthday / 🥂 Honeymoon / 🌴 Just because) that fill the voucher message in 30s. Beats blank-note conversion dramatically. Pre-written copy ships with the Toes-in-the-Turquoise voice.

### Feb 2026 — Hotel Autocomplete + Beach-Day Gift Voucher + Shared-Credit Email
- **Hotel autocomplete** (`HotelAutocomplete` in `CableBeachDay.jsx`): native `<select>` replaced with a typeahead combobox that fuzzy-matches on hotel/sub-brand name (type "atlan" → Paradise Island / Atlantis). Keyboard navigation (↑↓, Enter, Esc), click-outside closes, chevron rotates on open, empty-state suggests "Cable Beach" or "Paradise Island". Preserves `data-testid="cable-hotel-select"` for existing selectors.
- **Beach-day gift voucher** (`GiftBeachDayModal` in `CableBeachDay.jsx`): new "Gift this beach day" button opens a Toes-in-the-Turquoise-themed modal with Cable-Beach-appropriate preset amounts ($80/$160/$240/$320) + custom + a "covers ≈ N guests" hint. Reuses the existing `/api/gift-cards/purchase` → Stripe Checkout → webhook-triggered branded PDF voucher email pipeline. Buyer gets redirected to Stripe; recipient gets the PDF instantly on payment. Zero new backend needed.
- **Shared-credit email** (`_credit_share_referrer_if_cable_beach` in `server.py`): after the $10 credit lands on the sharer's `users.credit_balance`, we fire a branded SendGrid email with the new balance, a green WhatsApp-tone hero gradient, and a "Book your next day →" CTA back to `/tours/cable-beach-day`. Subject: "🌴 Your $10 Rox credit is here — a friend just booked". Verified: credit awarded $10, balance updated, email path reached (fire-and-forget, errors logged but never roll back credit).

### Feb 2026 — Hotel Pickup Map + Shared-Cart Capture + Lunch/Drinks + Share-Link Credit
- **Starter menu defaults** (`CABLE_BEACH_DEFAULTS`): 6 Bahamian lunch items (conch salad, cracked conch, grilled mahi, jerk chicken, veggie wrap, kids plate) and 7 drinks (Bahama Mama, Sky Juice, Goombay Smash, Kalik, Sands, water, soda) ship out of the box; `_cable_beach_cfg` falls back to these defaults when the admin hasn't saved any items yet (empty list in storage no longer blanks the page).
- **Hotel pickup map** (`HotelPickupMap` in `CableBeachDay.jsx`): zone-centroid `lat`/`lng` added to every row in `NASSAU_HOTEL_TARIFFS`, exposed via `/api/cable-beach/hotels`. Selecting a hotel renders an OpenStreetMap iframe (no API key) with a marker + "open in map" link so the guest can eyeball the pickup zone before confirming.
- **Shared-cart capture** (`POST /api/share/cable-beach/create` + `/click` + `share_tokens` collection): one durable token per sharer email (idempotent), click beacon fired on page load for `?r=<token>`. New Admin "Share-link conversions" panel inside `CableBeachPackageCard` tabulates sharer → clicks → bookings → conv-% → $ paid out. Totals strip across the top.
- **Guest details modal** (`GuestDetailsModal`): swapped the old "stash sessionStorage + redirect" to `/pay/cable-beach-day` (dead route) for a proper modal that collects name/email/phone/datetime/special-requests and POSTs `/api/cable-beach/book`. Server re-quotes to prevent price tampering, creates a real `bookings` doc with the Cable Beach package metadata, and returns `pay_url = /pay/{booking_id}` — flowing into the existing Stripe/PayPal checkout.
- **$10 share-link credit** (`_credit_share_referrer_if_cable_beach` → called from `_apply_referral_conversion_if_paid`): when a booking carrying `cable_beach_share_token` goes paid, we `$inc` the sharer's `users.credit_balance` by $10 (upsert stub user if they're not signed up yet), bump `share_tokens.bookings` + `credits_awarded_total`, and set `share_credit_awarded` on the booking so it's idempotent. Self-referrals are detected and skipped. End-to-end verified: 3 clicks → 1 booking → $10 landed on `sharer@example.com` → stats row showing in admin.
- **Share modal UX** (`ShareLinkModal`): sharer drops their email (cached in `localStorage.cable_sharer_email`), we mint a durable token, and open `navigator.share` on mobile / `wa.me` on desktop with a pre-filled message carrying pax, live total, transfer summary, and the trackable URL. "Share without earning credit" fallback kept for the lazy.

### Feb 2026 — Toes in the Turquoise · Rename + Home Feature + Share
- **Rename** (`CableBeachDay.jsx` + `Home.jsx`): the Cable Beach package is now branded "**Toes in the Turquoise**" everywhere guest-facing. H1 is "Toes in the Turquoise" with "A day at Cable Beach / Goodman's Bay, Nassau" as italic subtitle so Google still indexes the geo-keywords. Hero overlay says "Toes in the *Turquoise*." in oversized serif. JSON-LD `TouristTrip.name` + `Product.name` renamed; `alternateName` keeps the old phrasing. `<title>` leads with the brand name.
- **Home feature section** (`Home.jsx` `home-cable-beach-day`): new signature-tier card sits right after Dolphin Swim, using the Cable Beach hero as a full-bleed background, a "What's included" glass card on the right (chair + umbrella, kayaks, round-trip taxi, cruise option, lunch/drinks), two CTAs (`home-cable-beach-book` → `/tours/cable-beach-day`, `home-cable-beach-details`). Matches the Dolphin Swim visual grammar for consistency.
### Feb 2026 — Cable Beach Hero + Hotel Fare Auto-Fill + SEO
- **Hero image** (`/frontend/public/images/cable-beach-hero.jpg`): replaces the previous watermarked iStock placeholder with a license-clean Pexels aerial of Cable Beach / Baha Mar (chairs, kayaks/watersports, pier, turquoise). Right ~12% / top ~4% cropped for a tighter composition. Attribution kept in `cable-beach-hero.credits.md`.
- **3D-tilt HeroCard** (`CableBeachDay.jsx`): new mouse-tracked `perspective + rotateX/Y` card with inner-image counter-translate so the aerial feels like a tilt-to-look-around card. Respects `prefers-reduced-motion` and skips the effect on touch (`hover: none`).
- **Hotel fare auto-fill** (backend `NASSAU_HOTEL_TARIFFS` + `GET /cable-beach/hotels` + extended `/cable-beach/quote`): guest no longer types a fare; picks their hotel from a dropdown and we auto-fill the round-trip (one-way × 2) from the published zone tariff. Flat per taxi. 10 zones ship (Cable Beach / Meliã / Downtown / Paradise / Comfort PI / West Bay / Lyford / Montague / South Ocean). Unknown `hotel_id` → 400 so stale clients fail fast. Legacy `hotel_fare` kept as a soft fallback.
- **Package SEO** (`CableBeachDay.jsx` Seo props): richer `<title>` ("A Day at Cable Beach, Nassau · Chair, Umbrella & Transfer | Rox"), long-form `description`, `keywords`, canonical `/tours/cable-beach-day`, OG image = the new hero, and a 3-graph JSON-LD block (`TouristTrip` + `Product` with `Offer`/`priceSpecification` + `BreadcrumbList`). Price is pulled live from `cfg.base_price` so Google rich results stay in sync when the owner edits the base.

### Feb 2026 — Cable Beach Day Package
- **Backend** (`server.py`): new `site_config.cable_beach_pkg` with `base_price` ($40), `extra_seat_price` ($15), `cruise_oneway_price` ($10), `cruise_roundtrip_price` ($20), `lunch_items[]`, `drink_items[]`, and `active` toggle. Endpoints: `GET /public/cable-beach-package`, `PUT /admin/cable-beach-package`, `POST /cable-beach/quote` returning base + extras + transfer + menu + 10% VAT + 5% processing breakdown.
- **Public page** `/tours/cable-beach-day` (`CableBeachDay.jsx`): guest picks pax, extra seats, transfer kind (none / cruise one-way / cruise round-trip / hotel-fare input), lunch and drink items. Live quote updates on every change via `/cable-beach/quote`. Sticky summary with per-line breakdown + "Continue to checkout" that stashes the cart in sessionStorage.
- **Admin card** `CableBeachPackageCard.jsx` mounted on the dashboard: edit base/extra/cruise prices (blur-to-save), toggle active/paused, add/remove/rename lunch and drink menu items (with Save button per menu).



### Feb 2026 — Chat Search + Driver Typing Signal + Timeline Editor
- **Chat Message Search** (`routes/group_chat.py::admin_chat_search` + `AdminChatSearchCard.jsx`): `GET /admin/chat/search?q=` runs a case-insensitive regex across `group_chat_messages.body` across every booking, returning up to 50 newest-first results enriched with customer name + item name. Literal route declared before `/admin/chat/{booking_id}` so it isn't shadowed. Dashboard card renders highlighted matches; clicking a result jumps to the booking.
- **Dispatch Typing Signal in Driver Panel** (`routes/group_chat.py::driver_chat_view` + `DriverChatPanel.jsx`): driver chat response now carries `typing_dispatch_at`; panel polls every 10 s (was 20 s) and renders the same 3-dot pulsing bubble when the stamp is < 5 s old. Driver sees the thread come alive seconds before dispatch's message lands.
- **Wedding Timeline Editor** (`PUT /admin/bookings/{id}/timeline` + `DELETE` + `TimelineEditor.jsx`): admin can override the auto-generated 3-row itinerary that ships in the paid-in-full email. Saved `timeline: [{label, time, location, emoji}]` rows wins over the auto-generator; DELETE drops the override. Editor shows the auto preview when nothing's saved so dispatch can see what the guest WILL get before tweaking.



### Feb 2026 — Typing Indicator + Wedding Timeline + CC Fan-Out
- **Chat Typing Indicator** (`routes/group_chat.py::_mark_typing` + both chat UIs): `POST /admin/chat/{id}/typing` and `POST /chat/{id}/typing?t=TOKEN` stamp `typing_dispatch_at` / `typing_guest_at` on the booking. GETs echo both stamps back; UIs check if stamp < 5 s old and render a 3-dot pulsing "Planner is typing…" / "Dispatch is typing…" bubble. Client throttles pings to one per 3 s via a ref timer — no DDOS on Mongo.
- **Wedding Day Timeline** (`notifications.py::notify_paid_in_full`): group / 10+ pax round-trip bookings now get an auto-stitched 3-row itinerary (Driver arrives → Event/ceremony → Return pickup) in the paid-in-full email. Mid-point between pickup and return is the ceremony anchor; dispatch can edit before sending. Emoji + navy/orange styling matches the rest of the receipt.
- **CC Fan-Out** (notifications + `_fire_paid_in_full` + balance-reminder cron + admin resend): `notify_paid_in_full` and `notify_balance_capture_reminder` now accept `cc_emails=` and fan out branded copies (prefixed `[CC]`) to every consented secondary contact. Invoice PDF stays private to the paying guest — CC emails get just the HTML/text brief. `get_consented_cc_emails(booking_id)` is called from `_fire_paid_in_full`, the balance-reminder cron, and the admin resend endpoint — all three paths now loop in the planner's trusted circle automatically.



### Feb 2026 — 3DS Modal + Chat Read Receipts + CC List + Driver Quick-Reply
- **3-D Secure Pay Modal** (`ThreeDSecureModal.jsx` + `GET /api/stripe/public-key`): installed `@stripe/stripe-js` + `@stripe/react-stripe-js`. When Pay-with-Saved-Card returns `requires_action` the modal uses `stripe.confirmCardPayment(client_secret)` to run the 3-DS challenge in-app; on success it refreshes the bookings list. Backend only hands out `pk_test_*` / `pk_live_*` from `STRIPE_PUBLISHABLE_KEY` env — never the secret.
- **Chat Read Receipts** (`routes/group_chat.py::_mark_read` + badges in both chat UIs): admin GET stamps `last_read_dispatch_at`; guest GET stamps `last_read_guest_at`. Response payload carries both timestamps so each UI paints a "Sent" vs "Seen" badge on its own messages based on whether the other side has read anything newer. No per-message writes — single-doc update, cheap polling.
- **Group Lead Notifications** (`routes/secondary_contacts.py` + `SecondaryContactsPanel.jsx`): embedded `secondary_contacts: [{id, name, email, role, consent, consent_at}]` on bookings. Admin adds via BookingDetailModal; Rox sends an opt-in email with branded `/secondary-contacts/confirm?booking=&cid=&t=` HMAC link. Status badge shows "Pending" (amber) → "Opted in" (green) in the admin UI. `get_consented_cc_emails()` helper exposed for future CC fan-out from notifications. Max 10 contacts per booking, CAN-SPAM-compliant unsubscribe link in every email.
- **Driver Quick-Reply** (`routes/group_chat.py::driver_quick_reply` + `QuickReplyRow` in `DriverShare.jsx`): 3 canned templates ("5 min out", "At pickup", "Running late") fire a short SMS to `customer_phone` AND mirror into the chat thread with `author: driver` so dispatch sees what was acknowledged. Zero typing on the driver's phone. Unknown template → 400.



### Feb 2026 — Pay-with-Saved-Card + Chat Attachments + Deposit Calendar + Driver Chat
- **Pay with Saved Card** (`routes/customer.py::pay_with_wallet` + `PayWithWalletButton.jsx`): new `POST /api/my/bookings/{id}/pay-with-wallet` creates an off-session Stripe PaymentIntent against the saved customer + PaymentMethod. Charges `balance_due` on deposit flow, `total` on cold full-pay. On `succeeded` it re-uses `routes.payments._mark_paid` so the balance clears, paid-in-full receipt fires, and notifications stay in sync. `requires_action` (3-DS) surfaces to the UI. Button appears next to the booking row only when the user has saved cards.
- **Chat Attachments** (`routes/group_chat.py` upload endpoints + inline image rendering in both panels): new `POST /admin/chat/{id}/upload` and `POST /chat/{id}/upload?t=TOKEN` accept images ≤5 MB (JPEG/PNG/WebP/GIF/HEIC) via Emergent Object Storage. The `group_chat_messages` doc now carries an optional `image_url`. Admin + guest chat UIs both show a paperclip button, a tiny preview chip for the pending upload, and render received images inline (click to open full-size).
- **Calendar Sync for Deposit** (`notifications.py::notify_booking_confirmed`): the standard confirmation email (fires at deposit payment time + at full-pay) now always attaches a `.ics` with a 1-hour VALARM reminder — the pickup lands on the guest's calendar the day the booking is locked in, not just after the balance clears.
- **Driver Chat Visibility** (`routes/group_chat.py::driver_chat_view` + `DriverChatPanel.jsx`): new read-only `GET /api/driver/chat/{id}` endpoint auto-gates visibility — the dispatch ↔ planner thread opens 60 min before pickup OR when the booking is in-progress (`driver_assigned`/`en_route`/`arrived`). Shows a locked card with "opens 60 min before pickup" messaging outside that window. Driver cannot post. Mounted inside DriverShare below the status buttons.



### Feb 2026 — Calendar Sync + Group Chat Thread + Trip Wallet
- **Balance Calendar Sync** (`notifications.py::_build_booking_ics`): paid-in-full email now attaches a signed RFC-5545 `.ics` with a 1-hour VALARM reminder, plus side-by-side "📅 Google Calendar" + "🍎 Apple Calendar" buttons that drop the pickup time straight into the guest's calendar app. Google uses the deep-link `/calendar/render?action=TEMPLATE` schema; Apple opens the `.ics` natively.
- **Group Chat Thread** (`routes/group_chat.py` + `AdminChatPanel.jsx` + `GuestChat.jsx`): private thread per booking with 10 s polling. Admin side renders inside `BookingDetailModal` for group / wedding / 10+ pax / balance-due bookings (auto-gated). Guest side at `/booking/:id/chat?t=TOKEN` uses an HMAC token (same pattern as `/pay-balance`) so planners don't need a login. Owner SMS fires when planner posts; planner email fires when admin posts. New `group_chat_messages` collection, invalid tokens return 403.
- **Trip Wallet** (`routes/customer.py` wallet endpoints + `TripWalletCard.jsx`): authenticated customers save Stripe PaymentMethods via SetupIntent Checkout — raw PAN never touches our servers. Backend creates/reuses a Stripe Customer keyed on `user_id`, stores `{id, brand, last4, exp}` on the user doc, and detaches PaymentMethods on removal. Return handler in `MyBookings` auto-reconciles the setup session on `?wallet=added&session_id=...` so the new card shows without a webhook round-trip.



### Feb 2026 — Paid-in-Full Receipt + Admin Balance-Due Panel
- **Guest "Paid in Full" email** (`notifications.py::notify_paid_in_full`): branded navy hero + green "Paid in full ✓" badge, deposit vs balance breakdown, grand total, QR boarding pass, PDF invoice attached. Fires once per booking (idempotent via `paid_in_full_emailed_at`) when either (a) the balance Stripe webhook lands (closing deposit → balance → confirmation loop) or (b) a non-deposit booking pays in full upfront.
- **`routes/payments.py::_mark_paid`** rewritten: now resolves the originating `payment_transactions` row and branches on `pay_mode`. When `pay_mode="balance"`, it clears `balance_due=0`, stamps `balance_status=paid`/`balance_paid_at`, fires owner SMS + the new paid-in-full receipt, and skips the standard "booking confirmed" notify (that email was already sent at deposit time). For the normal path, it keeps the confirmed notify and additionally fires the paid-in-full receipt only when no balance remains.
- **Admin Balance-Due Panel** (`AdminBalanceDuePanel.jsx` + `GET /api/admin/balance-due` + `POST /api/admin/balance-due/{id}/resend-link`): dashboard card listing every booking with `balance_due>0` sorted by trip date, with countdown badges (red <2d, amber <7d, emerald ≥7d), outstanding amount, deposit-paid line, reminder status/count, and one-click "Resend balance link" button that fires SMS + Email through the same `notify_balance_capture_reminder` + HMAC pay URL the 48h cron uses. Auto-hides when empty.



### Feb 2026 — Admin auth hardening · localStorage → httpOnly cookie + CSRF
- **Why**: Code-review flag P1. Admin JWT lived in `localStorage` and shipped on every request as `Authorization: Bearer`. Any XSS in the admin bundle could siphon the token.
- **Backend** (`routes/auth.py`, `server.py`): `/auth/login` now **also** issues two cookies on success — `admin_session` (httpOnly, Secure, SameSite=Lax, 7 d) carrying the JWT and `admin_csrf` (readable by JS, Secure, same 7 d) carrying a 32-byte random token. New `/auth/admin-logout` clears both. `require_admin()` was rewritten to read the cookie first; on mutating methods (POST/PUT/PATCH/DELETE) it enforces the CSRF double-submit (`X-CSRF-Token` header must match the `admin_csrf` cookie via `hmac.compare_digest`). Legacy Bearer flow still works unchanged so no sessions break mid-deploy (CSRF skipped for Bearer since cross-origin JS can't forge Authorization).
- **Sub-router shims** (`routes/admin.py`, `routes/analytics.py`, `routes/seo.py`, `routes/gbp.py`): updated the `_admin_dep` / `_require_admin_placeholder` wrappers to forward `(request, authorization, x_csrf_token)` through to the shared `require_admin`.
- **Frontend** (`lib/api.js`): axios instance now has `withCredentials: true`; request interceptor auto-attaches `X-CSRF-Token` from the `admin_csrf` cookie on mutating methods. Added `isAdminAuthed()`, `clearAdminAuth()`, `adminLogout()` helpers so admin pages don't poke at storage directly. Legacy `localStorage.admin_token` is still read as a one-shot migration fallback.
- **Frontend pages migrated**: `AdminLogin`, `AdminDashboard`, `AdminManage`, `AdminGroups`, `DriverManifest`, `admin/PaymentsPanel`, `admin/WeeklyReportCard`, `admin/VisitorsPanel`, `admin/ContentPanel`. All stale `localStorage.getItem("admin_token")` guards, manual `Authorization: Bearer` headers, and the leaky `?token=` PDF query-param URL have been replaced with cookie-based patterns (`credentials: 'include'` on raw fetches, no header for axios calls).
- **Regression tests**: `/app/backend/tests/test_admin_cookie_auth.py` — 7 tests covering login cookie flags, cookie-only GET, CSRF-required POST, wrong-CSRF rejection, legacy Bearer compat, and logout cookie expiry. All pass.
- Verified end-to-end via curl: cookie-only GET → 200; POST w/o CSRF → 403; POST w/ CSRF → 200; POST w/ wrong CSRF → 403; Bearer legacy → 200; logout → expired `Set-Cookie`.

### Feb 2026 — Bug fix · Admin 405 noise + Catalog kind regex guard
- Admin dashboard occasionally showed `405 Method Not Allowed` on `/api/admin/dashboard/kpis` + `/api/admin/payments/summary`. Root cause: parameterized `/admin/{kind}/{item_id}` catch-all was matching these URLs (kind=dashboard, item_id=kpis) and returning 405 on wrong HTTP method.
- **Fix**: narrowed the catalog catch-all with a `Path(..., pattern="^(tours|taxi_services|rentals)$")` regex guard AND registered explicit `api_route` 404 handlers at the end of `admin.py` for `/admin/dashboard/{tail:path}` and `/admin/payments/{tail:path}` (registered last, so the real `/admin/payments/zelle-mark-paid` + `/admin/payments/{payment_id}/refund` still take priority). Unknown admin sub-paths now return a clean 404 instead of a noisy 405.
- Verified: `/api/admin/tours`, `/api/admin/taxi_services`, `/api/admin/rentals`, `/api/admin/payments`, `/api/admin/bookings`, `/api/admin/zelle-proofs/pending` all still 200. `/api/admin/dashboard/kpis` + `/api/admin/payments/summary` now 404.

### Feb 2026 — Payment Recovery (dunning) + Dispatcher Daily Digest
- **PaymentRecoveryCard** mounted on `/admin` — one-click dunning tool for bookings whose Stripe payment never actually settled on the owner's account (the sandbox-leftover case). Preview candidates by scope (**stripe_test** = only cs_test_ sessions marked paid, **unpaid** = every unpaid booking), optional admin note prepended to the email, Email + SMS toggles, outstanding-dollar rollup, nudge counter per row. Sends `/pay/{bookingId}` deep links that automatically route through the CURRENT STRIPE_API_KEY — so once the live key is in `.env`, every re-pay lands in the real Stripe account.
- Backend: `GET /api/admin/dunning/candidates?scope=…` + `POST /api/admin/dunning/send-payment-reminder`. Per-booking stamps `dunning_sent_at`, `dunning_count`, `dunning_last_scope` so the UI shows re-send history. SMS message is 1-segment aware.
- **Dispatcher Daily Digest** (`_dispatcher_digest_loop`, 5-min poll granularity, fires at 11:00 UTC = 6 AM Nassau EST): single SMS to admin + employee roster summarising today's airport pickups — one line per booking with scheduled Nassau time, flight number, current AviationStack status + delay badge, guest first name, and booking id. Idempotent per calendar day via `site_config.dispatcher_digest_last_date`. Auto-stamps as sent when no airport pickups so no spam. Verified via dry-run (`force=True`).

### Feb 2026 — Flight events timeline + live SMS drill booking
- **FlightEventsPanel** admin modal (opens from a ✈ `BA253` button next to any booking's service name when `flight_number` is set). Shows:
  - Current AviationStack snapshot: departure/arrival IATA, airport names, scheduled/estimated/actual times, delay minutes.
  - Last-checked timestamp.
  - Vertical event timeline of every `flight_events[]` fired (`departed`, `landed`, `dep_delay_30/60/90…`, `arr_delay_30/60/90…`) with icon + colour per event type.
  - Empty-state banner when the watch window hasn't opened yet.
- **Live SMS drill booking seeded**: `DRILL-A9064A` for Saturday Oct 3, 2026 at 6 PM UTC (2 PM Nassau), guest phone `+1 (347) 751-5251`, flight **BA253** (JFK → NAS daily British Airways). Flight-status loop will auto fan-out to admin + employee SMS roster on departure / 30-min+ delay / landed over the next 24 h. Script is idempotent — re-running updates the existing drill booking instead of creating duplicates.

### Feb 2026 — Flight status fan-out + Admin Zelle Proof Card
- **Flight-status day-of fan-out** (`_flight_status_loop` in `server.py`, polls every 20 min): for every airport-pickup booking with a `flight_number`, hits AviationStack and fans out SMS to **admin + employee roster** (via `send_owner_sms(kind="dispatch", force_priority=True)`) on three transitions:
  1. `departed` → "✈ BA253 departed JFK → NAS (guest, booking X, pickup 2:15 PM). ETA …"
  2. `landed` → "🛬 BA253 LANDED at NAS. Guest (booking X) — head to pickup."
  3. `delay ≥ 30 min` (buckets of 30 min so repeat delays re-fire once) — both departure + arrival sides.
  Watch window = pickup ± [6h back, 24h forward]. Idempotent per-event via `booking.flight_events[]`. Uses the existing AviationStack cache so no quota blowout.
- **New helper `_fetch_flight_full`** returns the full flight snapshot (airline, departure/arrival IATA, scheduled/estimated/actual times, delay minutes). Stored on `booking.flight_last_snapshot` for admin visibility.
- **Admin Zelle Proof Card** mounted on `/admin` (`ZelleProofCard.jsx`): shows every pending Zelle proof with inline thumbnail/lightbox, Approve (atomic flip to paid + fires guest confirmation + owner "payment received" SMS), and Reject (with preset reasons + guest SMS explaining why). Auto-hides when no proofs are pending.

### Feb 2026 — Post-service review follow-up + Dolphin Swim home showcase + PayPal Vault + Zelle proof + incidentals
- **Review follow-up loop** (`_review_followup_loop` in `server.py`, fires every 30 min): 24h after `completed_at` the guest gets a dedicated SMS + email asking for a Google review. Idempotent via `review_followup_sent_at`. Skips guests who already got the 5-star growth-loop prompt. 7-day retro-fill window.
- **Dolphin Swim showcase on home page** — gold-ribbon hero section above Packages with two CTAs: "Book with Rox · $265" (deep-link into booking modal) + "Official site" (direct link to `bluelagoonisland.com/experience/dolphin-swim/`). Includes a side panel listing the 5 inclusions. Same external link now also lives on the tour card itself.
- **PayPal Vault** backend added — `create_vault_setup_token`, `exchange_vault_setup_token`, `charge_vaulted` in `paypal_client.py`. New admin routes in `payments.py`: `POST /admin/bookings/{id}/paypal-vault/{create,finalize,charge}` + `GET .../status`. Mirrors the Stripe card-hold pattern — admin sends a PayPal link, guest approves, admin can later off-session charge for incidentals.
- **Zelle payment proof workflow** — public `POST /bookings/{id}/zelle-proof` lets a guest upload a screenshot of their transfer (stored via Emergent Object Storage). Admin reviews via `GET /admin/zelle-proofs/pending`, then `POST .../zelle-proof/approve` (atomic flip to paid + fires confirmation + owner "payment received" SMS) or `POST .../zelle-proof/reject` (texts guest why).
- **Incidental Zelle requests** — admin can text/email guest a Zelle payment request (`POST /admin/bookings/{id}/zelle-request`) with amount + reason + memo. History stored on `booking.zelle_requests[]`.
- **Stripe card-on-file endpoints** gracefully return 503 when `STRIPE_API_KEY=sk_test_emergent` (shared Emergent sandbox cannot be used via raw Stripe REST). Lights up automatically when the owner wires their own live `STRIPE_API_KEY` via Manage → Secrets.
- **⚠ CRITICAL note**: last 5 "paid" bookings in prod DB were all Zelle (manually marked). Current `STRIPE_API_KEY=sk_test_emergent` — Stripe payments cannot reach the owner's live Stripe account until the live key is pasted into Manage → Secrets. Bahamas (BS) is NOT eligible for Stripe claimable sandbox, so the US-LLC key is the only path.

### Feb 2026 — Dolphin Swim excursion + Admin Card-on-File / Zelle incidentals
- **New excursion live**: "Dolphin Swim — Blue Lagoon Island" at $265 (+ VAT + processing fee). Fields added: `age_requirement`, `includes` (6-item list). Tour cards + booking modal now render a "What's Included" box + age-req pill when a tour exposes these fields.
- **Admin Incidental Modal** (new `IncidentalModal.jsx`) opens from a per-row "Hold card / Zelle" button on `/admin`. Three tabs:
  1. **Stripe card hold** — creates a Stripe Checkout session in `mode=setup`, SMS + emails the guest a secure link. On return, backend polls the SetupIntent, extracts `payment_method` + `customer`, and surfaces "Visa •••• 4242" on the admin row. Guards: friendly 503 when `STRIPE_API_KEY` is the shared `sk_test_emergent` sandbox (raw REST needs a real/claimed key).
  2. **Zelle request** — admin enters amount + reason; backend texts & emails the guest with Zelle email/phone + memo = `{bookingId} · {reason}`. Audit trail stored on `booking.zelle_requests[]`.
  3. **Charge card** — off-session PaymentIntent charges the saved card for incidentals. Audit trail on `booking.card_hold.charges[]`.
- New backend module `/app/backend/card_hold.py` wraps the Stripe REST surface (setup checkout, retrieve session/intent/pm, charge saved card).
- New routes in `routes/payments.py`: `POST /admin/bookings/{id}/card-hold/{create,charge}`, `GET /admin/bookings/{id}/card-hold/status`, public `GET /card-hold/status/{session_id}`.
- New route in `routes/admin.py`: `POST /admin/bookings/{id}/zelle-request`.
- New frontend pages: `/card-hold/success` + `/card-hold/cancel` (polling Stripe setup confirmation).

### Feb 2026 — Day-of reminder now fans out to every owner phone + email
- `send_booking_reminder` upgraded: the single `driver_number` SMS was replaced by `send_owner_sms(kind="booking")`, so EVERY number in `ADMIN_SMS_NUMBER` gets the day-of manifest (currently +12424322587, +12424285524). Honours each recipient's subscription + quiet-hours + priority-override preferences.
- New `admin_email` section in the reminder report — the owner also gets a branded "Day-of reminder" HTML email with the full manifest (guest, phone, pickup, dropoff, pax) + a one-tap link to open the booking in admin.
- Guest SMS + guest email + per-booking idempotency (`reminder_sent_at`) unchanged — still fires once when the trip is in the next 24h via `_booking_reminder_loop()`.
- Verified live: all 4 channels (guest email, guest SMS, owner fan-out SMS, admin email) returned `sent: True` on the test booking.

### Feb 2026 — Post-payment invoice delivery
- **`notify_booking_confirmed` now attaches a "Download invoice (PDF) →" button** inside the confirmation email + the invoice link is appended to the SMS whenever `payment_status == "paid"`. The invoice section is suppressed for Zelle/pending-payment bookings so we never promise a receipt before the money lands.
- Links target the existing `GET /api/bookings/:id/receipt.pdf` endpoint (uses `pdf_utils.build_receipt_pdf`) — includes full line-item breakdown with VAT, processing fee, and deposit.
- Admin can resend any time via the existing `POST /api/admin/bookings/:id/resend-notification` endpoint (NotifyCell "resend" button).
- Verified: paid booking → confirmation email + SMS with invoice link both sent; pending booking → invoice section correctly suppressed; `/receipt.pdf` returns a valid `application/pdf` response.

### Feb 2026 — Owner SMS on EVERY booking + EVERY payment (already shipped)
- `notify_owner_booking_created` fans out to every number in `ADMIN_SMS_NUMBER` via `send_owner_sms(kind="booking")`.
- `notify_owner_payment_received` fans out via `send_owner_sms(kind="payment")`.
- `payment` is in the default `priority_kinds` list so these alerts break through quiet-hours automatically; `booking` is auto-promoted to priority when total ≥ `owner_sms_high_value_threshold` (default $500).

### Feb 2026 — Front-page slide rename
- Renamed hero slide **"Rose Island reefs." → "Pearl & Athol Island."** (id: `hero-rose-island` → `hero-pearl-athol-island`) — subtitle preserved.
- Renamed hero slide **"Junkanoo golden hour." → "Junkanoo Beach."** (id: `hero-junkanoo` → `hero-junkanoo-beach`) — subtitle preserved.
- Both updates applied live to the `home_slides` Mongo collection AND persisted in `seed_data.py` so fresh installs pick up the new copy.

### Feb 2026 — Pricing overhaul: VAT, processing, cancellation, airport drop-off
- **10% Bahamas VAT** on every order EXCEPT point-to-point taxi fares. Deposits + driver tips are exempt (deposit is a refundable hold, tip is a gratuity).
- **4.5% processing fee** on every order (applied to subtotal + VAT, before deposit/tip).
- **20% cancellation fee** on taxi, tour, and excursion bookings (was 15%). Rentals now handled separately — deposit is always released back; base fare refunded when ≥48h notice, otherwise forfeit fare but keep deposit.
- **$25 airport drop-off fee** on rentals — new `rental_airport_dropoff` field on `BookingCreate` + auto-detects when "airport" or "LPIA" is typed into dropoff_location.
- **$150 rental hold deposit** kept as-is (existing `RENTAL_DEPOSIT_USD`) — verified applied automatically on every rental booking.
- **Stripe = instant** (already was) — `StripeCheckout` charges the full booking total on session complete; no deposit-mode split.
- Frontend `BookingFlow` mirrors the backend line-for-line: separate VAT + processing line items, airport-drop-off checkbox for rentals, and the new taxable-subtotal separation from deposit/tip.
- Verified live: taxi ($40) → total $41.80 (no VAT, just processing); tour ($235) → total $270.79 (VAT $47 + processing $12.79); rental (3d @ $75 + airport) → total ≈ $410 including $150 deposit + $25 airport fee + VAT + processing.

### Feb 2026 — Reviews Growth Loop
- **After every 5★ in-app rating**, the guest gets a follow-up SMS + email inviting them to post the review on Google. Powered by new `notify_guest_google_review_prompt(booking, review_url)` in `notifications.py`.
- **URL source**: reads `site_config.google_reviews_url` (or `google_business_url`) with a default fallback to Rox's actual g.page short-link so it works out of the box.
- **Wired into `POST /api/bookings/{id}/rate`** — fires when `stars >= 5`, guarded by `google_review_prompt_sent_at` stamp on the booking so re-submits + rating bumps never re-DM.
- **Verified**: 4★ → no prompt fired; 5★ → SMS + email delivered to guest with Google review link; repeat 5★ → idempotent (timestamp unchanged, no duplicate DM).

### Feb 2026 — Authentic Google reviews everywhere
- **Deleted dead `REVIEWS_SEED`** array in `server.py` (fake "Jamie R.", "Marcia D." etc. with pravatar avatars) — was never referenced but sat as a maintenance trap.
- **Contact page `GoogleReviewsCard`** rewired: was rendering a hard-coded fake "4.9" rating + a fake "Fast pickup at LPIA" blockquote. Now fetches `/api/reviews`, displays the live-averaged rating, real reviewer names, and rotates through authentic reviews every 9s.
- **All review surfaces now source from one place**: `routes/catalog.py::list_reviews` → `db.reviews` populated hourly by `routes/cron.py::_sync_google_reviews_bg` from the Google Places API.
- Verified: 6 real reviews live (Shernel Alexander, Stacey Hall, Blaine Thomas, Constance L, howard murray, Tami Weis) with valid `google_review_id`s and `source: "google"`.

### Feb 2026 — Trip-complete guest ping (rating + tip top-up)
- **`notify_guest_trip_complete()`** — new SMS + email helper fires the moment the driver marks the ride `completed`. Body includes:
  - **1-tap rating link** (`/rate?id=X&t=SIGNED_HMAC`) — 5-star tap UI; 5★ pathway offers a Google Review handoff.
  - **Tip top-up link** — reuses the existing signed `/tip-topup` route so drivers keep 100%.
- **Wired into both status-change surfaces**:
  - `POST /api/driver/{id}/status` (mobile driver app) — first-completion guard on `trip_complete_notified_at`.
  - `PATCH /api/admin/bookings/{id}/status` (desktop admin) — same guard.
- **Public rating API** (both signed with HMAC of `BOOKING_LINK_SECRET`):
  - `GET /api/bookings/{id}/rating-info?t=` — returns booking summary + `already_rated` flag.
  - `POST /api/bookings/{id}/rate?t=` — stamps `customer_rating`, comment, and copies to `customer_ratings` collection for aggregation.
- **Owner activity SMS** on every rating so admins celebrate 5★ trips and jump on <4★ ones fast.
- Delivery report persisted to `booking.trip_complete_notification` for the admin notify-details drawer.
- Verified live: `picked_up` → `completed` transition sent SMS + email to guest phone/inbox; rating POST stamped the booking; owner got a `🌟 5★ for Reagan` ping.

### Feb 2026 — Guest pickup confirmation on QR scan
- **`notify_guest_picked_up(booking)`** — new SMS + email helper in `notifications.py`. Sends the guest a "You're on your way ✅" ping the moment the driver scans the QR at pickup.
- **Wired into `POST /api/bookings/{id}/driver-checkin`**: after the status flips to `picked_up`, we spawn the notification via `asyncio.to_thread` so a slow SMTP round-trip never holds up the driver's tap.
- **Idempotent by design** — the existing `if status in ("cancelled", "completed")` guard blocks re-scans from re-notifying. Verified: first scan sends SMS + email + persists `pickup_notification` + `pickup_notified_at`; second scan is a no-op with unchanged timestamps.
- Report stored on the booking (`pickup_notification`) so admins can inspect provider/error on the notify-details toggle.

### Feb 2026 — High-value booking auto-priority + guest QR boarding pass
- **High-Value Auto-Priority**: Bookings ≥ configurable USD threshold (default $500) auto-promote to priority — they break through quiet-hours regardless of the recipient's `booking` subscription. Admin editor at `Admin → Owner SMS → High-value auto-priority`. Endpoint: `PUT /api/admin/owner-sms/high-value-threshold`.
  - Verified: $95 booking during quiet hours → queued (0 sent); $525 booking → live-sent to both owners (`high_value_override: true`).
  - `💎 HIGH-VALUE $525` prefix on the owner SMS body so the notification stands out visually.
  - Setting threshold to 0 disables the override cleanly.
- **Guest QR Boarding Pass**: New `/booking/:id/pass` mobile-optimised page with the pickup QR the driver scans at pickup.
  - Fetches non-financial summary from new `GET /api/bookings/:id/public-summary`.
  - Renders as a shareable "boarding pass" card (Rox gold + navy).
  - "Save pass to Photos" (via html2canvas) + native Web Share fallback.
  - iOS/Android add-to-home-screen instructions inline.
  - QR link + `img` embed added to `notify_booking_confirmed` HTML email and confirmation SMS so guests see it the moment they book.
  - Apple/Google Wallet `.pkpass` generation deferred (needs Apple Developer + Google Wallet API creds).

### Feb 2026 — Priority override for revenue events
- **`payment` events always break through quiet-hours** — regardless of any recipient's `quiet_hours` preference. Configurable via `Admin → Owner SMS → Priority override` strip.
- Backend: `_is_priority_kind(kind)` short-circuits the quiet-hours queue. Priority list stored in `site_config.owner_sms_priority_kinds` (defaults to `["payment"]`; empty list auto-resets to `["payment"]` so revenue alerts can't be silenced by accident).
- New endpoint `PUT /api/admin/owner-sms/priority-kinds` + cache refresher.
- Frontend: red-bordered "Priority override" card pinned at the top of the Owner SMS tab with chip toggles per event kind.
- Verified live: booking during quiet-hours → queued; payment during quiet-hours → both owners live-sent (`priority_override: true`).

### Feb 2026 — Quiet hours + per-owner preferences
- **Per-Owner SMS Preferences**: New `owner_sms_recipients` array in `site_config`. Each entry: `{phone, label, subscriptions[], quiet_hours}`. Live editable at `Admin → Owner SMS` tab.
  - Subscriptions: `*` (all) or any subset of `booking / payment / contact_form / tip_topup / group_inquiry / gallery_submission / customer_signup / referral_conversion / activity`.
  - Cache refreshes every 60s from `site_config` — edits go live within one minute.
  - Env `ADMIN_SMS_NUMBER` acts as a safety fallback when the DB roster is empty.
- **SMS Quiet Hours (22:00-04:00 Nassau)**: Any SMS to a recipient with `quiet_hours=true` during the window is queued to `owner_sms_queue` instead of sent. New cron `POST /api/cron/flush-owner-sms-digest` fires hourly; internal worker gates on Nassau local time (04:30-05:30) with per-day idempotency so exactly one digest fires per morning.
- **Deliverability tail in the digest email**: The 5am digest email now shows a "last 7 days delivery health" line (email/SMS sent + failed + failure rate).
- **Admin manual controls**: `Flush digest now` button + queue-peek endpoint for smoke testing.

### Feb 2026 — Owner SMS fan-out (multi-recipient)
- **Two owner cellphones now ping on every event** — `ADMIN_SMS_NUMBER` is now comma-separated (`+12424322587,+12424285524`). New `send_owner_sms(body)` helper in `notifications.py` fans out to every recipient; returns a per-number delivery report.
- **All owner SMS paths refactored** to use the helper: `notify_owner_activity`, `notify_owner_booking_created`, `notify_owner_payment_received`, contact form, tip top-up, group inquiry, gallery submission, referral conversion, signup.
- **Verified live**: direct test sent to both numbers, both `sent: true`.

### Feb 2026 — Deliverability alerts + weekly report preview + full owner activity SMS
- **Owner Activity SMS (Feb 2026)** — Owner cellphone at `+12424322587` now pings on every meaningful site event:
  - New customer signup (auth.py register hook)
  - Referral conversion (server.py `_apply_referral_conversion_if_paid`)
  - Group inquiry (server.py `/group-inquiries`)
  - New guest photo submission (`routes/gallery.py`)
  - Contact form (already wired)
  - Tip top-up submitted (already wired)
  - New booking + payment received (already wired)
  All routed through `notifications.notify_owner_activity(kind, sms_body, ...)` — fire-and-forget, never blocks user response.
- **Weekly Report Preview** — `GET /api/admin/analytics/weekly-report/preview` returns the exact HTML that ships in the Monday email. Frontend "Preview email" button on `WeeklyReportCard` fetches with admin bearer and opens in a new tab via Blob URL.
- **Delivery Alert Thresholds** — Owner alert when SMS or email failure rate exceeds threshold (default 5%) in rolling 24h.
  - New endpoint `GET /api/admin/analytics/delivery-health?hours=24`
  - New endpoint `PUT /api/admin/analytics/delivery-health/threshold` (editable %)
  - New cron `POST /api/cron/check-delivery-alerts` — hourly, throttled to 1 alert per 6h per breach
  - Frontend "Armed / Over threshold" chip + inline threshold editor + "Test alert" button on WeeklyReportCard
- **Storage-backed Image List** — Mongo `uploaded_images` collection powers `/api/admin/images`.
- **Tip Bump SMS live-verified** — Twilio delivered to +12424322587.

### Cron schedule (`.emergent/crons.yml`)
- `sync-google-reviews` — hourly
- `send-tip-bump-sms` — every 5 min
- `send-weekly-report` — Monday 9am UTC
- `check-delivery-alerts` — hourly at :15

### Previous work carried over
- Reagan Itinerary Builder (14 stops, pick 7 for $235)
- Refer-a-Friend system with 10% discount + admin leaderboard
- Twilio SMS + SMTP email pipeline (booking, tip bump, return-leg, rental return, photo share)
- Google Reviews auto-sync (4+ stars, hourly) with Claude-drafted replies
- Emergent Object Storage migration for all uploads

---

## ROADMAP

### P0
- Confirm live SMS pipeline on production URL (Twilio verified; user should test one live signup).
- **Apple Login** — BLOCKED, needs user's Apple Developer account.

### P1
- Refresh hero slides (Atlantis, Rose Island, Junkanoo) with proprietary photos.
- SMS quiet-hours: suppress owner activity SMS between 10pm-7am Nassau time and batch into a morning digest (deferred — user opted for firehose).
- Admin filter on booking table: "failed deliverability last 24h".

### P2
- Referral card locator timeout in test suite.
- server.py refactor — continue splitting logic into `/app/backend/routes/`.

---

### Feb 2026 — Partial refund reason · Reschedule weekend-surcharge quote · New-admin-device alert
- **Partial refund reason** (`routes/admin.py refund_payment` + `resend_refund_email`): refund/resend endpoints now accept `{reason}` (≤240 chars). Reason is written to `payment_transactions.refund_reason`, pushed into each `refund_history[]` entry, and rendered as a gold-bordered call-out inside the guest's email receipt. Resend-refund-email also accepts an optional override reason so admins can clarify a prior send without re-issuing the refund.
- **PaymentsPanel refund modal**: added textarea with 240-char counter + placeholder examples. Resend-email prompts for an optional note before firing.
- **Guest-side reschedule price delta** (`server.py`): new `WEEKEND_SURCHARGE_USD=15` applied to taxi + tour bookings when the pickup lands on Sunday (Saturday remains the closed day). New `GET /api/bookings/{id}/reschedule-quote?new_pickup=ISO` returns `{old_total, new_total, delta, weekend_transition, message}` with no mutation — the Track-page dialog calls this live as the guest scrubs the date picker. `POST /guest-reschedule` applies the delta to `booking.total` and stamps the `reschedule_history[]` audit entry with `price_delta`, `weekend_transition`, `old_total`, `new_total`.
- **Track-page RescheduleDialog**: new modal (not previously present) with datetime-local picker, live-debounced price-quote preview (amber "surcharge" callout / green "savings" callout / neutral "no change"), email verification field, and dynamic button copy ("Pay $15 & reschedule" / "Reschedule (-$15)" / "Confirm reschedule").
- **New-admin-device alert** (`routes/auth.py _record_admin_session` + `notifications.notify_new_admin_device`): every admin login now compares the parsed device signature (Chrome on macOS, etc.) + city against the last 20 `admin_sessions` rows for that admin. First-ever login is suppressed; any subsequent login from an unseen device-and-city combo fires a priority owner SMS AND an email with device/IP/city/when and a direct link to the Sessions Monitor to revoke if it wasn't them.
- **JWT uniqueness fix** (`routes/auth.py make_admin_token`): added `jti` (random nonce) claim so two logins in the same second produce different JWTs — critical for the sessions-monitor revoke flow, which hashes the whole JWT.
- **Regression tests**: new `test_reschedule_quote.py` (6 tests: weekday↔Sunday deltas, zero-change weekday↔weekday, non-applicable rental, apply-delta-on-reschedule, wrong-email-blocked). Partial refund suite extended; all 30 pytest tests pass (27 + 1 skipped + 2 live-mode gated).

### Feb 2026 — Stripe live-mode diagnostic · Reschedule email · Trusted devices · Weekend surcharge toggle
- **Stripe live-mode card** (`admin/StripeLiveCheckCard.jsx` + `GET /admin/stripe-live-check`): dashboard card inspects the pod's `STRIPE_API_KEY` prefix + last `payment_transactions.session_id` prefix. Flags the three bad states loudly (sandbox proxy → red, test key → amber, missing webhook secret → amber) with actionable copy and a "Get live key" deep-link to the Stripe dashboard. Owner no longer has to guess whether the deployed VPS is actually using sk_live_.
- **Reschedule confirmation email** (`notifications.notify_reschedule_confirmation` + `server._notify_reschedule`): every guest reschedule now fires an email alongside the existing SMS. Includes was/now pickup, optional return-leg, embedded updated boarding-pass QR, "Open full boarding pass" CTA, and an itemised price-adjustment call-out (amber for surcharge added, green for removed) when the weekend surcharge shifted.
- **Trusted admin devices** (`routes/admin.py` + `admin/AdminSessionsCard.jsx`): new `admin_trusted_devices` collection keyed by `(sub, device_signature, city)`. Three endpoints: `GET /admin/trusted-devices`, `POST /admin/trusted-devices` (accepts either `session_prefix` to copy from the sessions row, or an explicit `device_signature`+`city`), `DELETE /admin/trusted-devices/{id}`. `_record_admin_session` skips the new-device alert when the device/city combo matches a trusted entry. UI: Trust button on every non-current session row, "Trusted" ribbon on matching sessions, and a trusted-device chip strip at the card footer with per-chip ✕ to untrust.
- **Weekend surcharge toggle** (`WEEKEND_SURCHARGE_USD` → `site_config.weekend_surcharge`): new `_weekend_surcharge_config()` reader + `GET/PUT /admin/weekend-surcharge` endpoints. Admin card has on/off toggle, USD amount input (0–500), and per-service-type pills (taxi/tour/excursion/rental). Changes land live for the next `GET /reschedule-quote` and `POST /guest-reschedule` call without a deploy.
- **Regression tests**: all 30 existing tests still green after the refactor (`test_reschedule_quote.py`, `test_partial_refund_and_resend.py`, `test_admin_sessions_monitor.py`, `test_live_payment_smoke.py`, `test_admin_cookie_auth.py`, `test_kill_switch_and_rebook.py`).

### Feb 2026 — Balance capture reminder · /groups/book SEO · BookingFlow resume hook
- **Balance Capture Reminder**:
  - New `POST /api/bookings/{id}/pay-balance?t=…` — HMAC-signed (`BOOKING_LINK_SECRET`) one-tap endpoint; spins up a Stripe Checkout session for the exact `balance_due` and inserts a `pay_mode: "balance"` row into `payment_transactions`. 403 on bad token, 409 when nothing is due.
  - New hourly cron `send-balance-reminders` (`.emergent/crons.yml`): finds bookings with `balance_due > 0`, `balance_reminded_at` unset, trip 47–49 h out, not cancelled/refunded. Fires `notify_balance_capture_reminder` once (SMS + branded navy/orange email with dark-mode CSS), stamps `balance_reminded_at`. Idempotent.
- **/groups/book SEO**:
  - Added to `routes/seo.py` sitemap (`priority: 0.9, changefreq: weekly`).
  - `<Helmet>` block adds canonical URL, SEO-friendly meta description, and a Product JSON-LD with `AggregateOffer` ($150–$4,000 priceRange), `aggregateRating` (4.9 / 287 reviews), and `LocalBusiness` seller. Google can now surface the page for "nassau group tour booking" queries with price range + stars.
- **BookingFlow Resume Hook**:
  - `BookingModal` useEffect reads `?resume=1&t=…&e=…` on mount, calls `GET /checkout/intent/{token}`, hydrates `customer_name/email/phone`, `booking_date`, `passengers`, jumps straight to step 2, and shows "Welcome back — your quote is still live" toast.
  - Query params stripped via `window.history.replaceState` so a refresh starts clean.
  - Silent fallback on 404/410 — guest lands on a fresh step 1 instead of a dead end.
- **VAT confirmed**: 10% VAT + 5% processing fee pipeline unchanged (`BAHAMAS_VAT_PCT = 0.10`, `PROCESSING_FEE_PCT = 0.05`).
- **`/groups/book`** (`frontend/src/pages/GroupsBook.jsx`): dedicated public page for 10–50 pax bookings. Pax slider snaps 10–50 with tick marks, service-type picker (tour/transfer/rental), base-per-head price input, trip date-time, and your-details block. Right-column navy quote panel updates live (300 ms debounce) showing: pax × base, group discount (green), weekend surcharge (gold), subtotal, VAT, processing, total, and a Deposit/Full toggle. "Due now / Due later" split renders beneath. Lead-time guard shows a red callout when `< min_lead_hours`; shows an amber "below threshold" callout when pax < min. CTA button copy mirrors the deposit amount ("Reserve for $239.95"). Over-50-pax guests are steered to the `/groups` custom-inquiry page.
- **`/resume-checkout?t=…&e=…`** (`frontend/src/pages/ResumeCheckout.jsx`): landing from the abandonment-nudge email. Pulls `GET /checkout/intent/{token}`, shows "Reopening your booking…" splash, then auto-forwards (`setTimeout 900ms`) to `/taxi`, `/tours`, or `/rentals` with `?resume=1&t=…&e=…&item=…` so the booking modal can rehydrate. Fallback card shows item + price + "Finish booking →" CTA when auto-forward fails. 410 Gone from the backend renders a friendly "24-h hold expired" state with a "start a fresh booking" button.
- **Admin `GroupPricingCard`** (`frontend/src/pages/admin/GroupPricingCard.jsx` + new `PUT /api/admin/group-pricing`): four inputs — min_pax (2–100), per_head_discount_pct (0–50), deposit_pct (10–100), min_lead_hours (1–720). Each saves on blur; `GET /public/group-pricing` reflects the change instantly for the next guest hitting `/groups/book`.
- **Routing**: added `/groups/book` and `/resume-checkout` to `App.js` behind `lazy()` for code splitting; `GroupPricingCard` mounted on `/admin` right after the Weekend Surcharge card.
- **Validation**: PUT rejects negative discounts (`422`), out-of-range leads (`422`), empty bodies (`400`); min_pax=12 propagates through `GET /public/group-pricing` instantly, verified via curl.
- **Group Booking Checkout** (`server.py`):
  - `GET /api/public/group-pricing` returns live `site_config.group_pricing` ({min_pax: 10, per_head_discount_pct: 15, deposit_pct: 25, min_lead_hours: 72} by default).
  - `POST /api/group-bookings/quote` returns a transparent breakdown — gross, per-head discount, weekend-surcharge honouring the admin toggle, 10% VAT, 5% processing, total, deposit, due_later, and a `lead_time_ok` guard.
  - `POST /api/group-bookings/checkout` creates a `GRP-xxxxx` booking (with `is_group_booking: true`, `group_pay_mode`, `balance_due`), opens a Stripe Checkout session for the deposit (or full), and pings the owner activity SMS.
- **Dark Mode Email** (`notify_booking_confirmed`):
  - Added `<meta color-scheme="light dark">` + `prefers-color-scheme: dark` block.
  - Beige canvas → `#0b0f16`, white card → `#1F2937`, muted text → `#CBD5E1 / #94A3B8`. Navy hero + gold accents + orange CTA kept as-is for contrast.
  - Applied via `rox-*` CSS class hooks so Gmail/Apple Mail dark mode render legibly.
- **Checkout Abandonment Nudge**:
  - `POST /api/checkout/intent` captures the quote on step-2 entry (idempotent on `email+item_id+booking_date`). Fire-and-forget from `BookingFlow.jsx` so it never blocks the UI.
  - `POST /api/cron/send-checkout-nudges` (new cron, every 10 min via `.emergent/crons.yml`): finds intents > 30 min old, < 24 h old, not already nudged, with no matching booking yet. Fires `notify_checkout_abandonment` — a branded navy-hero email with the frozen total and a 24-h-valid `/resume-checkout?t=…` link.
  - `GET /api/checkout/intent/{token}?email=…` serves the stored quote so the resume page can rehydrate the modal exactly where the guest left off. Returns 410 past the 24-h window.
- **Mobile-first checkout step 2** (`BookingFlow.jsx`): added `sm:` breakpoints throughout.
  - Trust strip tightened to `gap-2.5 px-3` on mobile, subtitle allowed to wrap.
  - Headline shrinks to `text-lg` on `<sm` with the step chip pinned via `whitespace-nowrap`.
  - Method cards get `pb-32 sm:pb-0` so they clear the fixed order-summary bar.
  - **Fixed sticky order summary on mobile**: `fixed inset-x-3 bottom-3 sm:static` with `env(safe-area-inset-bottom)` padding so iOS home-indicator doesn't eat the CTA. On `≥sm` it flows inline under the method cards (desktop unchanged).
  - CTA button copy auto-shortens on mobile ("Pay now" / "PayPal" / "Reserve") and the subtitle collapses to "VAT & fees included".
- **Real brand SVGs** (`components/PaymentBrands.jsx`): replaced the ASCII `BrandBadge` with crisp inline-SVG tiles for Visa (indigo italic wordmark), Mastercard (red/orange interlocking circles), Amex (blue tile), Discover (black wordmark + orange dot), Apple Pay (apple glyph + Pay), Google Pay (full chromatic wordmark). Each tile is a 22-px white chip with a thin border — looks sharp at any DPI and reads cleanly in guest screenshots.
- **Branded confirmation email** (`notify_booking_confirmed`): rebuilt to match the checkout palette.
  - Navy hero `linear-gradient(135deg,#0B3B5C,#132a4a)` with gold "ROX TAXI SERVICE & TOURS" eyebrow + large serif headline "You're booked, {first_name}."
  - Confirmation code chip in a gold-tinted panel.
  - White trip-details card with the pickup date pre-formatted ("Monday, Oct 6 · 2:00 PM") and the orange serif total.
  - Navy boarding-pass panel (QR + "Save to phone" gold pill) unchanged in function, re-themed in style.
  - **New orange CTA band** ("Track your booking live →") in the same `#E86A3C` as the checkout "Pay securely" button — tying the booking → inbox thread together visually.
  - Footer eyebrow + WhatsApp link in navy.
- **Removed sandbox leak** in `BookingFlow.jsx` step 2: the hard-coded "Card 4242 4242 4242 4242 works in test mode" line that was giving guests the "sandbox" impression even on a LIVE backend is gone. PayPal sandbox warning is now gated on an explicit `paypalCfg.show_sandbox_note` flag so it never fires accidentally.
- **Modern checkout screen**: step 2 redesigned top-to-bottom.
  - Emerald trust strip at the top ("Secure checkout — 256-bit SSL · Card details are tokenised by Stripe. We never see or store your card number.")
  - Payment-method cards: larger tap-area, animated radio-check, icon tiles that flip navy on selection, optional "Recommended" chip, and brand badges row on the Stripe card (VISA · MC · AMEX · DISC · PAY · GPAY).
  - Dark-navy order-summary panel pinned under the methods — grand total in serif, "Includes 10% VAT & 5% processing" subtitle, primary CTA with lock icon + animated spinner on submit, "Powered by Stripe" + SSL badges in the footer. "Edit details" replaces the old plain "← Back" link.
- **BrandBadge helper**: inline CSS-only brand badge component (no sprite/network cost) — reuse for future payment-method cards.
- **Trusted device nicknames** (`PATCH /admin/trusted-devices/{id}`): new endpoint renames a trusted device without an untrust+re-trust round-trip. UI: the trusted-device chip label is now a tappable button that opens a prompt pre-filled with the current label (max 60 chars). 404 on unknown id; same `sub` scope guard as the existing CRUD.
- **Public weekend-surcharge preview**: new `GET /api/public/weekend-surcharge` (no auth) returns `{enabled, amount_usd, service_types}` for the booking modal. `WeekendSurchargePreview` component in `BookingFlow.jsx` watches the pickup date; the moment it lands on a Sunday for an applicable service, a gold-bordered "+$15 Sunday surcharge" callout slides in under the date picker. Silent on non-Sunday / non-applicable services / when admin toggles the surcharge off. Config is cached in a module-level variable so repeated modal opens don't re-fetch.
- **Session geolocation**: `GET /admin/sessions` now resolves the stored IP through the existing `visitor_geo_cache` and surfaces `{location, city, country, ip}` fields. AdminSessionsCard renders "Nassau, Bahamas" (or similar) as the primary location line with the raw IP demoted to a mono sub-line underneath. Falls back cleanly to the IP when no geo entry exists yet.

## Key Data
- Admin login: `roxfam2509@gmail.com` / `admin123`
- Owner SMS: +12424322587
- Cron secret: `WEBHOOK_CRON_SECRET`

### Feb 2026 — Partial refunds + Resend refund email + Admin Sessions Monitor + Live-payment smoke
- **Partial refund in Payments panel** (`routes/admin.py refund_payment`): `POST /admin/payments/{payment_id}/refund` now accepts an optional `{amount: float}` body. When omitted, refunds the full remaining balance (same as before). When provided, validates `0 < amount ≤ total − already_refunded` and marks the ledger `partially_refunded` until the full total is reached (`refunded`). Each entry pushes into `booking.refund_history[]` with actor + provider + refund_id + ok/error so the audit trail remains intact. Email receipt via `notify_refund_issued` fires on every partial.
- **Resend refund email** (new `POST /admin/payments/{payment_id}/resend-refund-email`): one-click resend of the most-recent (preferring successful) refund entry's receipt via `notify_refund_issued`. Stamps `booking.refund_email_last_resent_at` + `refund_email_last_resent_by` for audit. 409 when no refund has been issued yet; 404 when payment id is unknown.
- **Payments panel UI** (`admin/PaymentsPanel.jsx`): new refund modal with amount input, 25%/50%/100% quick presets, remaining-balance line, and client-side cap guard. New "Resend email" button on every refunded/partially-refunded row with per-row busy spinner. New status badge for `partially_refunded` (indigo). Shows `−$X refunded` under the gross amount.
- **Admin Sessions Monitor** (`admin/AdminSessionsCard.jsx` + routes/admin.py): dashboard card listing every live admin JWT session (not expired AND not revoked) with device/UA, IP, issued-at, last-seen. The current tab is flagged with a "This session" ribbon and its Revoke button is hidden to prevent self-knockout. Per-row Revoke inserts the token hash into `admin_revoked_tokens` so `require_admin` 401s on the next call from that cookie.
- **Backend plumbing**:
  - New `admin_sessions` Mongo collection with unique index on `token_hash`, TTL on `expires_at`, and `sub` index. `/auth/login` upserts a row on every successful login; `require_admin` bumps `last_seen_at` + last_ip/last_ua on every authenticated request (fire-and-forget).
  - Session-list endpoint parses UA → "Chrome on macOS" style device label (same bucketing as the customer sessions tab) and flags `current` by comparing the request-cookie hash to the row's token_hash.
- **Live-payment smoke tests** (`backend/tests/test_live_payment_smoke.py`): sandbox-safe end-to-end check — admin login + checkout session creation + unknown-payment 404 path. One gated `test_live_mode_health_check` (requires `LIVE_SMOKE=1` env) creates a $1 checkout session on the VPS and asserts the returned `session_id` starts with `cs_live_` — proving the deployed `sk_live_…` key is wired. Never issues a real charge from the pod.
- **Regression tests**: new `test_partial_refund_and_resend.py` (4 tests, validation + success paths) and `test_admin_sessions_monitor.py` (5 tests, login-creates-row + list-current + revoke-other + length + 404 paths). 12 passed, 1 skipped.

### Feb 2026 — Stripe webhook `/api/webhooks/stripe` with official SDK
- **New endpoint** `POST /api/webhooks/stripe` in `routes/payments.py` using the official `stripe` Python SDK (v14.4.1). Reads the RAW request body via `await request.body()` BEFORE any JSON middleware so `stripe.Webhook.construct_event` can verify the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET`.
- **Fast 200**: provisioning is deferred to `FastAPI BackgroundTasks` so Stripe's 30 s timeout never hits a slow DB write. Response is `{"received": true}` the moment signature + idempotency check pass.
- **Idempotency**: new `stripe_webhook_events` Mongo collection with unique index on `event_id`. Duplicate event id → cheap `{"received": true, "idempotent_replay": true}` 200. Matches Stripe's at-least-once delivery guarantee.
- **Handled events**: `checkout.session.completed` → marks booking paid + provisions downstream notifications. Also `payment_intent.succeeded` (for direct card-on-file charges) and `charge.refunded` (mirrors Stripe-dashboard refunds back onto our ledger).
- **Env guard**: 503 if `STRIPE_WEBHOOK_SECRET` is missing (safer than 500); 400 on bad payload / signature mismatch so Stripe retries only on genuine transient errors.
- The old `/api/webhook/stripe` endpoint (emergentintegrations-based) is kept intact for backwards-compat; the new `/webhooks/stripe` path is the recommended one going forward.

### Feb 2026 — Refund fix + guest refund email
- **Bug fix**: `POST /admin/payments/{id}/refund` was crashing with `TypeError` because `_attempt_deposit_refund` requires `(booking, amount, reason)` but the admin endpoint was only passing `(booking, reason=...)`. Guest got "Refund failed" every click. Fixed by computing `refund_amount = total − already_refunded` and threading it through.
- **Guest refund email** (`notifications.notify_refund_issued`): new helper fires an email receipt the moment admin taps Refund — green "Refund sent" badge + 5-10 bday ETA on success, "Manual refund in 2 bday" wording when the provider API returns an error so there's no silence.
- **Booking state**: refunds now mirror onto the booking (`refunded_amount`, `refunded_at`, `payment_status`) and append to `refund_history[]` with the actor, provider, refund_id, status, and any provider error — gives the admin a full audit trail per booking.
- **Idempotency**: repeat Refund click on a fully-refunded tx now returns **409 "Nothing left to refund"** instead of silently double-refunding.


- **Admin session kill-switch** (`server.py require_admin`, `routes/auth.py admin_logout`): logout now hashes the JWT and inserts `{token_hash, expires_at}` into a new `admin_revoked_tokens` collection with a TTL index that auto-cleans at JWT expiry. Every admin request pays an ~0.5 ms Mongo lookup and 401s on a revoked hash — so even if an attacker already copied the httpOnly cookie, a Sign-Out invalidates the session server-side. `require_admin` was made `async` for the lookup.
- **Guest-driven rebook** (`POST /api/bookings/{id}/guest-reschedule`): new public endpoint that lets the guest shift pickup directly from the Track page. Verifies `customer_email` match, enforces 2 hr minimum lead-time + 90 day max horizon, 60 s rate-limit, resets `airport_reminder_sent_at` so the T-60 driver nudge re-fires on the new time. Appends to `reschedule_history[]`.
- **Rebook SMS fan-out** (`_notify_reschedule`): every rebook path — guest-side (new) and flight-delay one-tap (existing `/bookings/reschedule/{token}`) — now fires an owner-dispatcher SMS AND a guest confirmation SMS with old → new pickup times. Logged into `booking.notification_log[]` for audit.
- **Track page UX** (`frontend/src/pages/Track.jsx`): new `Reschedule` button alongside Cancel, opens a `RescheduleDialog` with datetime pickers for pickup (and optional return for round-trip bookings) plus email verification. Toast confirms both SMS channels fired.

### Feb 2026 — Admin booking actions + VAT/fee adjustments + invoice overhaul
- **Pricing policy update**: VAT now 10% on **every** fare (previously taxi was exempt); processing fee bumped from 4.5% → **5%**. `server.py BAHAMAS_VAT_PCT / PROCESSING_FEE_PCT`, mirrored in `BookingFlow.jsx` and `pdf_utils.py`.
- **Round-trip date + time**: `BookingRequest.return_date` added so round-trip pickups can land on a different calendar day. Frontend `Taxi.jsx` upgraded from a time-only input to a native `datetime-local` picker. Return-leg driver nudge cron + ICS calendar export both honour the new field with a same-day fallback.
- **QR on booking confirmation**: new `BoardingQrCard` component rendered on the Zelle + PayPal confirmation screens inside `BookingFlow.jsx`. Guests see their scannable QR + a one-tap "Open full boarding pass" link without hunting through email.
- **Invoice redesign**: `pdf_utils.build_receipt_pdf` now ships (a) a prominent navy "Call / WhatsApp: +1 (242) 432-2587" row, (b) a scannable **Code128 barcode** of the booking id with human-readable text, and (c) the existing QR → boarding pass. Fixed a latent bug where `qrcode.make_image` was receiving a `reportlab.HexColor` object and crashing silently to the fallback footer.
- **3 new admin actions on `BookingDetailModal`**:
  - `POST /admin/bookings/{id}/complete` — one-tap "mark complete" shortcut (idempotent, appends `admin_complete` entry to `status_history`, fires trip-complete guest ping exactly once).
  - `POST /admin/bookings/{id}/send-payment-email` — email a one-tap pay button + invoice PDF attachment to the guest. Supports optional `message` note. Rate-limited to 1 send per 60s per booking. Logs every send into `booking.payment_email_log[]`.
  - Existing `/reopen` wired visually alongside — guests, drivers, and admins now have one place to drive the booking lifecycle.
- End-to-end verified via curl + the pymupdf-rendered PDF images: full receipt flow, admin lifecycle actions, and double-submit CSRF still intact.


- **Split BookingFlow Modal** (`BookingModal.jsx`, 1264 lines) → `BookingSteps` + `BookingForm` + `BookingSummary` so future booking tweaks stop touching a single giant file.
- **Notifications Template Refactor** (`notifications.py`) → extract Jinja2 templates for `send_email`, `send_owner_sms`, `send_dispatcher_digest` so each top-level function drops <20 lines.
- **ChatWidget Rewrite** (`ChatWidget.jsx`, complexity 83) → split into `MessageList` + `MessageInput` + `useChatConnection`.
- **license_ai.py Refactor** → break into smaller helpers.
- **Array-index-as-key** fixes in dynamic admin lists (`VisitorsPanel`, `ReviewsPanel`).
