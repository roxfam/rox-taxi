import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import BookingModal, { Field } from "./BookingFlow";
import Seo from "../components/Seo";
import { Users, ArrowRight, CalendarX, Info, ArrowUpDown } from "lucide-react";
import { PromoPrice } from "../components/PromoPrice";

// Sort options mirror the /tours page so the shopper's mental model carries
// across catalog pages. Price ↑ is the newly-requested default entry point
// for budget-conscious renters comparing cars.
const SORTS = [
  { key: "default",    label: "Default",    cmp: null },
  { key: "price-asc",  label: "Price ↑",    cmp: (a, b) => a.price - b.price },
  { key: "price-desc", label: "Price ↓",    cmp: (a, b) => b.price - a.price },
  { key: "seats",      label: "Most seats", cmp: (a, b) => (b.seats || 0) - (a.seats || 0) },
];

export default function CarRental() {
  const [rentals, setRentals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [availability, setAvailability] = useState({});
  const [sortKey, setSortKey] = useState("default");

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/rentals");
      setRentals(data);
      // fetch all availabilities in parallel
      const results = await Promise.all(
        data.map((r) => api.get(`/rentals/${r.id}/availability`).then((x) => [r.id, x.data.blackouts]).catch(() => [r.id, []])),
      );
      setAvailability(Object.fromEntries(results));
    })();
  }, []);

  // Client-side sort keeps the network trip to a single /rentals call.
  const sortedRentals = useMemo(() => {
    const cmp = SORTS.find((s) => s.key === sortKey)?.cmp;
    return cmp ? [...rentals].sort(cmp) : rentals;
  }, [rentals, sortKey]);

  return (
    <div data-testid="rentals-page">
      <Seo
        title="Nassau Car Rentals Bahamas | Free Airport & Hotel Delivery — Rox Taxi & Tours"
        description="Rent a car in Nassau Bahamas — economy to luxury, free LPIA airport & hotel delivery, unlimited mileage, full insurance. Compact from $65/day. $150 refundable deposit, 25+ drivers only. Book online with Credit Card, PayPal or Zelle."
        canonical="https://roxtaxi.com/rentals"
        keywords="Nassau car rental, Bahamas car rental, car rental Nassau airport, LPIA car rental, Nassau van rental, cheap car rental Nassau, Paradise Island car rental, Cable Beach car rental, Baha Mar car rental, rent a car Bahamas, Bahamas rental car deposit, unlimited mileage Nassau, book car rental Nassau online, Rox car rental"
        ogImage="https://roxtaxi.com/og-cover.jpg"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "AutoRental",
          "@id": "https://roxtaxi.com/rentals#service",
          "name": "Rox Bahamas Car Rentals — Nassau, LPIA Airport, Cable Beach, Baha Mar, Paradise Island",
          "url": "https://roxtaxi.com/rentals",
          "provider": { "@id": "https://roxtaxi.com/#business" },
          "areaServed": [
            { "@type": "City", "name": "Nassau" },
            { "@type": "AdministrativeArea", "name": "New Providence, Bahamas" }
          ],
          "priceRange": "$65-$185/day",
          "currenciesAccepted": "USD",
          "paymentAccepted": "Credit Card, PayPal, Zelle",
          "offers": { "@type": "AggregateOffer", "lowPrice": "65", "highPrice": "185", "priceCurrency": "USD" },
          "termsOfService": "https://roxtaxi.com/rentals",
          "audience": { "@type": "Audience", "audienceType": "Cruise passengers, resort guests, honeymooners, families 25+" }
        }}
      />
      <section className="relative py-24 bg-[#FBF7EF]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid md:grid-cols-12 gap-8 items-end">
          <div className="md:col-span-7">
            <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Drive the islands</span>
            <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9] text-[#0B3B5C]">Rent a car in <em className="italic text-[#D4A94A]">Nassau</em>.</h1>
          </div>
          <div className="md:col-span-5 text-[#64748B] leading-relaxed">
            Pay online with credit card, PayPal or Zelle. Unlimited mileage, full insurance available, and free
            delivery to Nassau airport (LPIA) or your hotel. Live blackout dates shown per car.
            <div className="mt-4 inline-flex items-start gap-2 rounded-2xl border border-[#D4A94A]/30 bg-[#D4A94A]/10 px-4 py-3 text-xs text-[#0B3B5C]" data-testid="rental-deposit-banner">
              <Info className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">$150 refundable security deposit</span> is added automatically at checkout, and released back once your vehicle is returned undamaged with a full tank.
              </span>
            </div>
            <div className="mt-3 inline-flex items-start gap-2 rounded-2xl border border-[#0B3B5C]/25 bg-[#0B3B5C]/[0.06] px-4 py-3 text-xs text-[#0B3B5C]" data-testid="rental-age-policy">
              <Info className="w-4 h-4 text-[#0B3B5C] shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">Driver must be 25 years or older.</span> Valid driver's licence required at pickup. This applies to every vehicle in our fleet.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-4 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-[#64748B]" data-testid="rentals-count">
            <span className="font-semibold text-[#0B3B5C]">{sortedRentals.length}</span> vehicle{sortedRentals.length === 1 ? "" : "s"}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white p-1 text-xs" data-testid="rentals-sort">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#64748B] ml-2" />
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSortKey(s.key)}
                data-testid={`rentals-sort-${s.key}`}
                className={`px-3 py-1.5 rounded-full font-semibold transition-colors ${sortKey === s.key ? "bg-[#0B3B5C] text-white" : "text-[#0B3B5C] hover:bg-[#F1F5F9]"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {sortedRentals.map((r) => (
          <div key={r.id} className="group rounded-2xl overflow-hidden bg-white border border-[#E2E8F0] hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(212,169,74,0.15)] transition-transform flex flex-col" data-testid={`rental-card-${r.id}`}>
            <div className={`aspect-[16/10] overflow-hidden relative ${r.category === "mini-van" ? "bg-white" : "bg-[#0B192C]"}`}>
              <img
                src={r.image_url}
                alt={r.name}
                className={`w-full h-full opacity-95 group-hover:scale-105 transition-transform duration-500 ${
                  r.category === "mini-van" ? "object-contain p-3" : "object-cover"
                }`}
              />
              <div className="absolute top-3 left-3 glass rounded-full px-3 py-1 text-xs text-[#0B3B5C] font-semibold uppercase tracking-widest">
                {r.body || r.category}
              </div>
              {r.year && (
                <div className="absolute top-3 right-3 mono text-xs bg-[#0B192C]/70 backdrop-blur text-white rounded-full px-2 py-1">
                  {r.year}
                </div>
              )}
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="serif text-2xl text-[#0B3B5C] leading-tight">{r.name}</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{r.description}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
                <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {r.seats} seats</span>
                {r.color && <span>· {r.color}</span>}
                {r.make && <span>· {r.make}</span>}
              </div>

              <BlackoutList blackouts={availability[r.id] || []} />

              <div className="mt-6 flex items-center justify-between">
                <div>
                  <PromoPrice price={r.price} promo={r.promo} />
                  <span className="text-sm text-[#64748B]"> / day</span>
                </div>
                <button
                  onClick={() => setSelected(r)}
                  data-testid={`rental-book-btn-${r.id}`}
                  className="btn-shine inline-flex items-center gap-1 rounded-full bg-[#E86A3C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#d55a30] active:scale-95"
                >
                  Reserve <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {selected && (
        <BookingModal
          item={selected}
          serviceType="rental"
          defaultDays={2}
          onClose={() => setSelected(null)}
          extraFields={(form, setForm) => (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Delivery location" val={form.pickup_location} on={(e) => setForm({ ...form, pickup_location: e.target.value })} testid="rental-pickup" />
                <div>
                  <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">Number of days *</label>
                  <input
                    type="number"
                    min={2}
                    step={1}
                    value={form.days}
                    onChange={(e) => setForm({ ...form, days: Math.max(2, parseInt(e.target.value || "2")) })}
                    className="w-full rounded-full border border-[#E2E8F0] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A94A]"
                    data-testid="rental-days"
                  />
                </div>
              </div>
              <div className="text-xs text-[#64748B] flex items-center gap-1.5" data-testid="rental-min-days-note">
                <Info className="w-3.5 h-3.5 text-[#D4A94A]" />
                <span><strong className="text-[#0B3B5C]">2-day minimum</strong> on all car rentals.</span>
              </div>
              <div className="text-xs text-[#64748B] flex items-center gap-1.5" data-testid="rental-age-note">
                <Info className="w-3.5 h-3.5 text-[#0B3B5C]" />
                <span><strong className="text-[#0B3B5C]">Driver must be 25+.</strong> Valid licence required at pickup.</span>
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}

function BlackoutList({ blackouts }) {
  const upcoming = (blackouts || [])
    .filter((b) => new Date(b.end) >= new Date())
    .slice(0, 3);

  return (
    <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3" data-testid="rental-blackouts">
      <div className="flex items-center gap-1.5 text-xs tracking-[0.2em] uppercase text-[#0B3B5C] font-bold">
        <CalendarX className="w-3.5 h-3.5" /> Blackout dates
      </div>
      {upcoming.length === 0 ? (
        <div className="mt-1.5 text-sm font-bold text-[#D4A94A] flex items-center gap-1">
          <Info className="w-3.5 h-3.5" /> Available now — no upcoming bookings
        </div>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {upcoming.map((b) => (
            <li key={b.booking_id} className="text-sm mono font-bold text-[#0B3B5C]">
              {fmt(b.start)} → {fmt(b.end)} <span className="text-[#0B3B5C]/70 font-semibold">({b.days}d)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmt(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
