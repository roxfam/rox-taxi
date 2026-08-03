# Summer Vacation Banner — roxtaxi.com

Homepage promo banner concepts for the summer season. Pick one, or A/B test.

## Offer options (pick what fits your margins)

| Offer | Best for | Notes |
|---|---|---|
| **10% off tours** with code `SUMMER10` | High-margin day tours | Easy to implement, easy to remove |
| **Free bottled water + hotel drop-off** | Airport transfers | Zero cost to you, high perceived value |
| **4th passenger rides free** | Group / family bookings | Encourages upgrades to bigger vehicles |
| **Book 2 tours, save $25** | Multi-day cruisers | Bundle drives cart size |
| **Kids under 12 ride free** | Family cruisers | Emotional, memorable |

## Copy variants (headline + subhead + CTA)

### A — Punchy discount

- **Headline:** Summer Special · Save 10% on Every Tour
- **Subhead:** Book by Aug 31 · Use code SUMMER10 at checkout
- **CTA:** Book a Tour →

### B — Family angle

- **Headline:** Kids Ride Free This Summer
- **Subhead:** All ages under 12 · June through Labor Day · Airport, Atlantis, and Blue Lagoon
- **CTA:** Book Your Family Ride →

### C — Cruise-week angle

- **Headline:** Beat the Cruise-Day Rush
- **Subhead:** Pre-book your Nassau taxi, tour, or rental — locked-in fares, driver at the dock
- **CTA:** Reserve Now →

### D — Bundle angle

- **Headline:** Book 2 Tours, Save $25 Instantly
- **Subhead:** Applied at checkout · Blue Lagoon + Atlantis, LPIA round trip + full-day tour, more
- **CTA:** See Bundles →

## Design recommendations

- **Placement:** Just below the hero image, above the "Book" cards. Full-width strip.
- **Height:** 64-80px on desktop, 100-120px on mobile (with the CTA underneath text).
- **Colors:** Bright sunset gradient (coral → gold) — signals summer, high contrast against the mostly-blue hero.
- **Animation:** Subtle 400ms fade-in on page load. No auto-scrolling text (kills conversions).
- **Countdown:** Add "Ends Aug 31" as small text — urgency lifts click-through 15-25%.
- **Dismissible:** Small × on the right, save dismissal in `localStorage` for 7 days.

## Implementation — the app already supports this

The `promotions` collection + `annotate_promo` helper are already wired up.
You can create the promo via the admin panel today:

1. Admin → Manage → **Promotions** tab
2. Click **New Promotion**
3. Fill in: code `SUMMER10`, discount type `percent`, value `10`, valid_from/valid_until dates
4. Save — the promo appears in booking flows automatically

If you want a **visual banner strip** (not just checkout code), tell me and
I'll add a `<SummerBanner />` React component that:
- Shows across every page
- Pulls headline/subhead/CTA from a new admin-editable field in `site_config`
- Is dismissible with 7-day cookie
- Renders under 15KB (no perf hit)

## Quick launch checklist

- [ ] Pick one offer + one copy variant above
- [ ] Create the promo code in Admin → Promotions
- [ ] Update Facebook + Instagram bio: "Summer Special: 10% off with SUMMER10"
- [ ] Send the SMS/WhatsApp blast to existing customers
- [ ] Consider running the matching Facebook ad from FACEBOOK_AD_LAUNCH.md
