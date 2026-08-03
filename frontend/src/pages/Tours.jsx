import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import BookingModal, { Field } from "./BookingFlow";
import Seo from "../components/Seo";
import { Clock, ArrowRight, ExternalLink, Car, ArrowUpDown, MapPin, Star, Users } from "lucide-react";
import { PromoPrice } from "../components/PromoPrice";

// Inject an ItemList of Product schemas per tour so Google can pull them
// into rich results ("Nassau tours" carousel) with price, rating and image.
// Kept inline (rather than a separate lib) because it's tour-specific.
function useToursJsonLd(tours) {
  useEffect(() => {
    if (!tours || tours.length === 0) return;
    const items = tours.filter((t) => t.active).map((t, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "Product",
        "name": t.name,
        "description": t.description || t.name,
        "image": t.image_url,
        "brand": { "@type": "Brand", "name": "Rox Taxi Service & Tours" },
        "offers": {
          "@type": "Offer",
          "priceCurrency": "USD",
          "price": String(t.price || 0),
          "availability": "https://schema.org/InStock",
          "url": t.external_booking_url || `https://roxtaxi.com/tours#${t.id}`,
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "187",
          "bestRating": "5",
        },
      },
    }));
    const schema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "Nassau Bahamas Tours & Excursions by Rox Taxi Service",
      "itemListElement": items,
    };
    const id = "tours-jsonld";
    document.getElementById(id)?.remove();
    const el = document.createElement("script");
    el.id = id;
    el.type = "application/ld+json";
    el.textContent = JSON.stringify(schema);
    document.head.appendChild(el);
    return () => { document.getElementById(id)?.remove(); };
  }, [tours]);
}

const SORTS = [
  { key: "featured", label: "Featured", cmp: (a, b) => (b.featured === true) - (a.featured === true) },
  { key: "price-asc", label: "Price ↑", cmp: (a, b) => a.price - b.price },
  { key: "price-desc", label: "Price ↓", cmp: (a, b) => b.price - a.price },
  { key: "duration", label: "Shortest first", cmp: (a, b) => (parseFloat(a.duration) || 99) - (parseFloat(b.duration) || 99) },
];

// The Attraction Discovery Hub — 4 curated micro-landing pages we own.
// Each card links to /tours/<slug>. `cheapest_taxi_route_id` is used to pull
// live pricing from GET /api/taxi-services so the "from $XX" chip stays fresh.
const HUB_ATTRACTIONS = [
  {
    slug: "ardastra",
    name: "Ardastra Gardens & Zoo",
    tagline: "Marching flamingoes + 5 acres of tropical gardens in downtown Nassau.",
    hero_image: "https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/ouo8o6m9_47-bmot-nassau-5fb1775b59eaf-1500x643.jpg",
    kicker: "The Bahamas' only zoo",
    cheapest_taxi_route_id: "downtown-ardastra",
  },
  {
    slug: "atlantis",
    name: "Atlantis Paradise Island",
    tagline: "141 acres of waterpark, aquarium, 11 pools and a casino — the icon.",
    hero_image: "https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/u2ec81xe_Atlantis%20%281%29.jpg",
    kicker: "Paradise Island · Icon",
    cheapest_taxi_route_id: "downtown-paradise",
  },
  {
    slug: "blue-lagoon",
    name: "Blue Lagoon Island",
    tagline: "Ferry-only 250-acre private island — dolphins, hammocks and turquoise coves.",
    hero_image: "https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/wfm658r1_bahamas-blue-lagoon-island-private-beach-paradise-aerial.jpg",
    kicker: "Ferry escape",
    cheapest_taxi_route_id: "downtown-paradise",
  },
  {
    slug: "baha-mar",
    name: "Baha Mar Resort",
    tagline: "$4.2B Cable Beach mega-resort — casino, Rosewood, Nicklaus golf, 40+ restaurants.",
    hero_image: "https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/ofd8ubks_Grand-Hyatt-Baha-Mar-P743-Hotel-Exterior.16x9.webp",
    kicker: "Cable Beach · Luxury",
    cheapest_taxi_route_id: "cablebeach-downtown",
  },
];

export default function Tours() {
  const [tours, setTours] = useState([]);
  const [taxiById, setTaxiById] = useState({});
  const [selected, setSelected] = useState(null);
  const [params] = useSearchParams();
  const [sortKey, setSortKey] = useState("featured");

  useToursJsonLd(tours);

  useEffect(() => {
    api.get("/tours").then((r) => {
      setTours(r.data);
      const bookId = params.get("book");
      if (bookId) {
        const t = r.data.find((x) => x.id === bookId);
        if (t) setSelected(t);
      }
    }).catch(() => {});
    // Fetch taxi routes once so the Hub cards show live "from $XX" pricing.
    api.get("/taxi-services").then((r) => {
      const map = {};
      (r.data || []).forEach((s) => { map[s.id] = s; });
      setTaxiById(map);
    }).catch(() => {});
  }, [params]);

  // Sort client-side so the network trip stays a single /tours call. Featured
  // is the default because it lifts the highest-margin curated excursions.
  const sortedTours = useMemo(() => {
    const cmp = SORTS.find((s) => s.key === sortKey)?.cmp;
    return cmp ? [...tours].sort(cmp) : tours;
  }, [tours, sortKey]);

  return (
    <div data-testid="tours-page">
      <Seo
        title="Nassau Tours & Excursions Bahamas | Blue Lagoon, Atlantis, Jet Ski & ATV — Rox"
        description="Book Nassau Bahamas tours & excursions — Blue Lagoon Island beach day, Atlantis Aquaventure, Rose Island snorkeling, Cabbage Beach jet ski, ATV tours, Paradise Island day trips. Instant confirmation, hotel pickup included."
        canonical="https://roxtaxi.com/tours"
        keywords="Nassau tours, Bahamas excursions, Blue Lagoon Island tour, Atlantis Nassau day pass, Rose Island snorkeling, Cabbage Beach jet ski, ATV tours Nassau, Paradise Island tours, Nassau shore excursions, cruise excursions Bahamas, Junkanoo party bus, Baha Mar day pass, book Nassau tour online, travel to Nassau Bahamas, Nassau travel guide, Nassau attractions, Nassau things to do, one day in Nassau, Nassau itinerary, Nassau layover tour, cruise stopover Nassau, Nassau honeymoon activities, Nassau family activities, Bahamas vacation excursions, Nassau tourism, visit Nassau, plan trip to Nassau, Nassau day trip ideas"
        ogImage="https://roxtaxi.com/og-cover.jpg"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          "@id": "https://roxtaxi.com/tours#catalog",
          "name": "Nassau Bahamas Tours & Excursions Catalog",
          "url": "https://roxtaxi.com/tours",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "item": { "@type": "TouristTrip", "name": "Blue Lagoon Island Beach Day Tour", "url": "https://roxtaxi.com/tours/blue-lagoon", "touristType": "family, couples, cruisers", "offers": { "@type": "Offer", "price": "89", "priceCurrency": "USD" } } },
            { "@type": "ListItem", "position": 2, "item": { "@type": "TouristTrip", "name": "Atlantis Paradise Island Aquaventure Day Pass", "url": "https://roxtaxi.com/tours/atlantis", "touristType": "family, couples", "offers": { "@type": "Offer", "price": "195", "priceCurrency": "USD" } } },
            { "@type": "ListItem", "position": 3, "item": { "@type": "TouristTrip", "name": "Baha Mar Resort Day Pass", "url": "https://roxtaxi.com/tours/baha-mar", "touristType": "couples, families", "offers": { "@type": "Offer", "price": "150", "priceCurrency": "USD" } } },
            { "@type": "ListItem", "position": 4, "item": { "@type": "TouristTrip", "name": "Cabbage Beach Jet Ski Rental (1hr)", "touristType": "adventure travellers", "offers": { "@type": "Offer", "price": "120", "priceCurrency": "USD" } } },
            { "@type": "ListItem", "position": 5, "item": { "@type": "TouristTrip", "name": "ATV Off-Road Tour of Nassau (with Lunch)", "touristType": "adventure travellers", "offers": { "@type": "Offer", "price": "149", "priceCurrency": "USD" } } }
          ]
        }}
      />
      <section className="bg-gradient-to-br from-[#D4A94A] to-[#A88235] text-white py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 relative z-10">
          <span className="text-xs tracking-[0.3em] uppercase text-white/80">Bahamas Excursions</span>
          <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9] max-w-4xl">Discover Nassau, <em className="italic">one landmark at a time</em>.</h1>
          <p className="mt-6 text-white/85 max-w-xl leading-relaxed">
            Explore Nassau's must-see attractions — Ardastra, Atlantis, Blue Lagoon and Baha Mar — then pair with a curated
            excursion. Every taxi and tour is priced up-front by local operators.
            <span className="block mt-3 text-[11px] text-white/70 leading-snug" data-testid="processing-fee-disclosure">
              Prices include a 3% processing fee that covers card + PayPal fees.
            </span>
          </p>
        </div>
      </section>

      {/* Group discount hero — marketing angle for cruise groups, reunions, weddings.
          Sits between the amber hero and the destination hub so it's the first thing
          a 6+ pax visitor sees when they land on /tours. */}
      <section
        className="relative -mt-8 mx-4 sm:mx-6 lg:mx-10 rounded-[28px] overflow-hidden shadow-[0_30px_80px_-30px_rgba(11,25,44,0.55)] z-10"
        data-testid="groups-hero-banner"
      >
        <div
          className="relative bg-gradient-to-br from-[#0B192C] via-[#0B3B5C] to-[#0B192C] text-white px-6 sm:px-10 py-8 md:py-10"
        >
          {/* Gold sparkle background glow */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{ background: "radial-gradient(circle at 15% 30%, rgba(212,169,74,0.5), transparent 60%), radial-gradient(circle at 85% 70%, rgba(212,169,74,0.35), transparent 55%)" }}
          />
          <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#D4A94A]/20 border border-[#D4A94A]/40 px-3 py-1 text-[10px] tracking-[0.25em] uppercase font-bold text-[#F5D57B]">
                <Users className="w-3.5 h-3.5" /> Cruise Groups · Reunions · Weddings
              </div>
              <h2 className="serif text-3xl sm:text-4xl md:text-5xl leading-tight mt-3">
                Groups of 6+ <em className="italic text-[#F5D57B]">save 10%</em>
              </h2>
              <p className="text-white/80 mt-3 max-w-2xl text-sm sm:text-base leading-relaxed">
                Book any per-person Nassau tour with 6 or more paying passengers and we'll auto-apply a 10% group discount at checkout. Perfect for cruise-ship shore excursions, family reunions, bridal parties and corporate retreats. Kids under 3 always ride free.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:min-w-[250px]" data-testid="groups-hero-picker">
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/60 font-bold">
                How big is your group?
              </div>
              <div className="flex flex-wrap gap-2">
                {[6, 10, 20, 40].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      try { sessionStorage.setItem("rox_group_size", String(size)); } catch { /* ignore */ }
                      // Find the Nassau City Tour card (any per-person tour with $45 price + "City Tour" name)
                      // and click its Book button. Fallback: scroll to the tours grid.
                      const cards = Array.from(document.querySelectorAll("[data-testid='tour-card'], article, .tour-card"));
                      let target = null;
                      for (const el of cards) {
                        const txt = (el.textContent || "").toLowerCase();
                        if (txt.includes("nassau city tour") || txt.includes("city tour")) { target = el; break; }
                      }
                      if (!target) {
                        // fallback: use generic query
                        const all = Array.from(document.querySelectorAll("div, article"));
                        target = all.find((el) => {
                          const t = (el.textContent || "");
                          return t.startsWith("Nassau City Tour") && t.includes("$45");
                        });
                      }
                      if (target) {
                        target.scrollIntoView({ behavior: "smooth", block: "center" });
                        setTimeout(() => {
                          const btn = Array.from(target.querySelectorAll("button, a")).find((b) => b.textContent.trim().toLowerCase().startsWith("book"));
                          if (btn) btn.click();
                        }, 850);
                      }
                    }}
                    data-testid={`groups-hero-size-${size}`}
                    className="px-4 py-2 rounded-full bg-white/10 border border-white/30 hover:bg-[#D4A94A] hover:text-[#0B192C] hover:border-[#D4A94A] font-black text-sm tracking-wide transition-colors active:scale-95"
                  >
                    {size === 40 ? "40+" : size}
                  </button>
                ))}
              </div>
              <a
                href="https://wa.me/12424322587?text=Hi%20Rox%2C%20we%27re%20a%20group%20of%20"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="groups-hero-cta-whatsapp"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-xs tracking-wide px-5 py-2.5 transition-colors"
              >
                Or ask on WhatsApp
              </a>
              <Link
                to="/cruise-groups-nassau"
                data-testid="groups-hero-cta-guide"
                className="text-[11px] text-white/60 hover:text-[#D4A94A] underline underline-offset-4 self-center transition-colors"
              >
                Full cruise-group guide →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ATTRACTION DISCOVERY HUB */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-16 pb-8" data-testid="attractions-hub">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <span className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-bold">
              <Star className="w-3.5 h-3.5" /> Nassau's Must-See
            </span>
            <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-2 tracking-tight">
              Pick your <em className="italic font-black text-[#D4A94A]">destination</em>.
            </h2>
            <p className="text-[#64748B] mt-2 text-sm max-w-xl">
              Full guide + taxi routes + booking links to each attraction. Tap a card to see photos, hours, and fixed-fare pricing.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="attractions-hub-grid">
          {HUB_ATTRACTIONS.map((a) => {
            const route = taxiById[a.cheapest_taxi_route_id];
            const fromPrice = route?.price;
            return (
              <Link
                to={`/tours/${a.slug}`}
                key={a.slug}
                data-testid={`hub-card-${a.slug}`}
                className="group relative overflow-hidden rounded-3xl bg-white border border-[#E2E8F0] hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(212,169,74,0.20)] transition-all"
              >
                <div className="aspect-[4/5] overflow-hidden relative">
                  <img
                    src={a.hero_image}
                    alt={a.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    style={{ filter: "brightness(1.02) saturate(1.08)" }}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B192C] via-[#0B192C]/25 to-transparent" />
                  {fromPrice && (
                    <div className="absolute top-3 right-3 glass rounded-full px-3 py-1 text-xs font-semibold text-[#0B3B5C] flex items-center gap-1" data-testid={`hub-card-price-${a.slug}`}>
                      <Car className="w-3 h-3 text-[#D4A94A]" />
                      Taxi from ${fromPrice}
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-[#D4A94A] drop-shadow">
                      <MapPin className="w-3 h-3" /> {a.kicker}
                    </span>
                    <h3 className="serif text-2xl leading-tight mt-1" style={{ textShadow: "0 4px 20px rgba(0,0,0,0.55)" }}>
                      {a.name}
                    </h3>
                    <p className="text-xs text-white/80 mt-1.5 leading-relaxed line-clamp-2">{a.tagline}</p>
                    <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#D4A94A] group-hover:text-white transition-colors">
                      Explore attraction <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Add-on transfer banner — every excursion can be paired with Rox taxi pickup/dropoff. */}
      <div className="bg-[#0B3B5C] text-white" data-testid="tours-transfer-banner">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#D4A94A] text-[#0B192C] flex items-center justify-center">
              <Car className="w-4 h-4" />
            </div>
            <div className="text-sm">
              <span className="font-semibold">Add Rox taxi pickup &amp; dropoff to any excursion</span>
              <span className="text-white/70"> — hotel, LPIA, cruise port. Booked & tracked in one flow.</span>
            </div>
          </div>
          <a
            href="/taxi"
            data-testid="tours-transfer-cta"
            className="text-xs font-semibold text-[#D4A94A] hover:text-white underline decoration-dotted underline-offset-4"
          >
            See taxi rates →
          </a>
        </div>
      </div>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-14 pb-8">
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-bold">
            <Clock className="w-3.5 h-3.5" /> Curated Excursions
          </span>
          <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-2 tracking-tight">
            Full-day <em className="italic font-black text-[#D4A94A]">tours & adventures</em>.
          </h2>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-[#64748B]" data-testid="tours-count">
            <span className="font-semibold text-[#0B3B5C]">{sortedTours.length}</span> excursion{sortedTours.length === 1 ? "" : "s"}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white p-1 text-xs" data-testid="tours-sort">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#64748B] ml-2" />
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSortKey(s.key)}
                data-testid={`tours-sort-${s.key}`}
                className={`px-3 py-1.5 rounded-full font-semibold transition-colors ${sortKey === s.key ? "bg-[#0B3B5C] text-white" : "text-[#0B3B5C] hover:bg-[#F1F5F9]"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {sortedTours.map((t) => (
          <div key={t.id} className="group rounded-2xl overflow-hidden bg-white border border-[#E2E8F0] hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(212,169,74,0.15)] transition-transform" data-testid={`tour-card-${t.id}`}>
            <div className={`aspect-[4/3] overflow-hidden relative ${t.id === "junkanoo-party-bus" ? "bg-gradient-to-br from-[#0B3B5C] to-[#0B192C]" : ""}`}>
              <img src={t.image_url} alt={t.name} className={`w-full h-full ${t.id === "junkanoo-party-bus" ? "object-contain p-2 scale-125" : "object-cover"} group-hover:scale-105 transition-transform duration-500`} />
              <div className="absolute bottom-3 left-3 glass rounded-full px-3 py-1 text-xs text-[#0B3B5C] font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" /> {t.duration}
              </div>
            </div>
            <div className="p-6">
              <h3 className="serif text-2xl text-[#0B3B5C] leading-tight">{t.name}</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{t.description}</p>
              <div className="mt-6 flex items-center justify-between">
                <PromoPrice price={t.price} promo={t.promo} />
                <button
                  onClick={() => setSelected(t)}
                  data-testid={`tour-book-btn-${t.id}`}
                  className="btn-shine inline-flex items-center gap-1 rounded-full bg-[#0B3B5C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#132a4a] active:scale-95"
                >
                  Book <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              {t.external_booking_url && (
                <a
                  href={t.external_booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`tour-external-btn-${t.id}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0B3B5C]/70 hover:text-[#D4A94A] transition-colors group/ext"
                  title="Book directly on the official operator site"
                >
                  <span className="underline decoration-dotted underline-offset-4">Or book on official operator site</span>
                  <ExternalLink className="w-3 h-3 group-hover/ext:translate-x-0.5 transition-transform" />
                </a>
              )}
              <div
                className="mt-3 pt-3 border-t border-dashed border-[#E2E8F0] flex items-center gap-1.5 text-[11px] text-[#64748B]"
                data-testid={`tour-transfer-note-${t.id}`}
              >
                <Car className="w-3.5 h-3.5 text-[#D4A94A]" />
                <span>
                  <span className="font-semibold text-[#0B3B5C]">Add taxi pickup &amp; dropoff</span> — from $20 each way. Select at checkout.
                </span>
              </div>
            </div>
          </div>
        ))}
      </section>

      {selected && (
        <BookingModal
          item={selected}
          serviceType="tour"
          onClose={() => setSelected(null)}
          extraFields={(form, setForm) => (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Hotel / Pickup location" val={form.pickup_location} on={(e) => setForm({ ...form, pickup_location: e.target.value })} testid="tour-pickup" />
            </div>
          )}
        />
      )}
    </div>
  );
}
