import { useEffect, useMemo, useState } from "react";
import { api, money } from "../lib/api";
import BookingModal, { Field } from "./BookingFlow";
import { Car, ArrowRight, Plane, Anchor, ShoppingBag, Utensils, Palmtree, MapPin, Ship, Hotel } from "lucide-react";

/**
 * Popular Nassau destinations. Each entry is mapped to the taxi service that
 * best fits the route so tapping a destination pre-fills the booking modal
 * with the right service AND the dropoff location.
 */
const NASSAU_DESTINATIONS = [
  { name: "Atlantis Paradise Island",         area: "Paradise Island",          match: "atlantis",            Icon: Hotel },
  { name: "Baha Mar Resort",                  area: "Cable Beach",              match: "baha mar",            Icon: Hotel },
  { name: "Downtown Nassau / Bay Street",     area: "Nassau",                   match: "downtown",            Icon: ShoppingBag },
  { name: "LPIA — Nassau Airport",            area: "Airport transfer",         match: "lpia",                Icon: Plane },
  { name: "Cable Beach",                      area: "West Nassau",              match: "cable beach",         Icon: Palmtree },
  { name: "Cruise Port / Prince George Wharf", area: "Downtown",                match: "cruise",              Icon: Ship },
  { name: "Fish Fry — Arawak Cay",            area: "Nassau",                   match: "fish fry",            Icon: Utensils },
  { name: "Paradise Island Beach",            area: "Paradise Island",          match: "paradise island",     Icon: Palmtree },
  { name: "British Colonial Hilton",          area: "Downtown Nassau",          match: "downtown",            Icon: Hotel },
  { name: "Junkanoo Beach",                   area: "West Bay Street",          match: "cable beach",         Icon: Palmtree },
  { name: "Sandy Toes / Rose Island",         area: "Boat departure · Marina",  match: "hourly",              Icon: Anchor },
  { name: "Custom stop — pick anywhere",      area: "Hourly charter",           match: "hourly",              Icon: MapPin },
];

function pickServiceFor(destName, services) {
  if (!services?.length) return null;
  const q = (destName || "").toLowerCase();
  // 1) direct substring match against service name/description
  const direct = services.find((s) =>
    (s.name || "").toLowerCase().includes(q) ||
    (s.description || "").toLowerCase().includes(q),
  );
  if (direct) return direct;
  // 2) fall back to any "hourly" service
  const hourly = services.find((s) => (s.name || "").toLowerCase().includes("hourly"));
  if (hourly) return hourly;
  return services[0];
}

export default function Taxi() {
  const [services, setServices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [prefill, setPrefill] = useState({ dropoff: "", pickup: "" });

  useEffect(() => {
    api.get("/taxi-services").then((r) => setServices(r.data)).catch(() => {});
  }, []);

  const bookDestination = (dest) => {
    // find a service whose name/description contains the match keyword
    const svc = pickServiceFor(dest.match, services) || services[0];
    if (!svc) return;
    setPrefill({ dropoff: dest.name, pickup: "" });
    setSelected(svc);
  };

  const bookService = (svc) => {
    setPrefill({ dropoff: "", pickup: "" });
    setSelected(svc);
  };

  const grouped = useMemo(() => NASSAU_DESTINATIONS, []);

  return (
    <div data-testid="taxi-page">
      <section className="bg-[#0B3B5C] text-white py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid md:grid-cols-2 gap-10 items-end">
          <div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Airport &amp; City Rides</span>
            <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9]">Bahamas <em className="italic text-[#F5E1A4]">taxi</em>, done right.</h1>
          </div>
          <p className="text-white/80 leading-relaxed max-w-md md:justify-self-end">
            Fixed, transparent pricing for airport transfers, hotel pickups, and hourly charters — driven by
            licensed local operators who know every road.
          </p>
        </div>
      </section>

      {/* Popular Nassau destinations — quick booking picker */}
      <section
        className="max-w-7xl mx-auto px-6 lg:px-10 pt-20"
        data-testid="taxi-destinations-section"
      >
        <div className="flex items-end justify-between gap-6 mb-8 flex-wrap">
          <div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Where to?</span>
            <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-3 leading-[0.95]">
              Popular <em className="italic text-[#D4A94A]">Nassau</em> destinations.
            </h2>
            <p className="text-sm text-[#64748B] mt-3 max-w-xl leading-relaxed">
              Tap a destination and we'll pre-fill your route with the right flat-rate service.
              Prefer a custom stop? Choose the hourly charter below.
            </p>
          </div>
          <a
            href="#taxi-services"
            className="text-xs tracking-[0.25em] uppercase text-[#0B3B5C]/70 hover:text-[#D4A94A] flex items-center gap-1.5"
            data-testid="taxi-jump-services"
          >
            Or browse all services <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="taxi-destinations-grid">
          {grouped.map((d, i) => {
            const svc = pickServiceFor(d.match, services);
            return (
              <button
                key={d.name}
                type="button"
                onClick={() => bookDestination(d)}
                disabled={!svc}
                data-testid={`taxi-destination-${d.match.replace(/\s+/g, "-")}`}
                className="group text-left rounded-2xl border border-[#EFE7D5] bg-white/80 backdrop-blur-sm hover:border-[#D4A94A] hover:bg-white hover:-translate-y-1 transition-all duration-300 hover:shadow-[0_18px_40px_rgba(212,169,74,0.18)] p-5 flex items-start gap-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 relative overflow-hidden"
                style={{ animationDelay: `${0.03 * i}s` }}
              >
                <span className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#D4A94A]/10 group-hover:scale-125 transition-transform duration-500" />
                <span className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4A94A] to-[#A88235] text-white flex items-center justify-center shrink-0 shadow-[0_10px_25px_rgba(212,169,74,0.35)] group-hover:rotate-6 transition-transform duration-300">
                  <d.Icon className="w-5 h-5" />
                </span>
                <span className="relative flex-1 min-w-0">
                  <span className="block serif text-lg text-[#0B3B5C] leading-tight truncate">{d.name}</span>
                  <span className="block text-[11px] tracking-[0.15em] uppercase text-[#94a3b8] mt-1">{d.area}</span>
                  {svc && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs text-[#0B3B5C]/70 group-hover:text-[#E86A3C] transition-colors">
                      <span className="mono font-semibold text-[#E86A3C]">{money(svc.price)}</span>
                      <span className="text-[#94a3b8]">·</span>
                      <span className="truncate">{svc.name}</span>
                    </span>
                  )}
                </span>
                <ArrowRight className="relative w-4 h-4 text-[#0B3B5C]/40 group-hover:text-[#E86A3C] group-hover:translate-x-1 transition-all mt-2" />
              </button>
            );
          })}
        </div>
      </section>

      <section
        id="taxi-services"
        className="max-w-7xl mx-auto px-6 lg:px-10 py-24 grid md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <div className="md:col-span-2 lg:col-span-3 flex items-end justify-between mb-2">
          <div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">All flat-rate services</span>
            <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-3 leading-[0.95]">
              Fixed <em className="italic text-[#D4A94A]">Nassau</em> taxi rates.
            </h2>
          </div>
        </div>
        {services.map((s) => (
          <div key={s.id} className="rounded-2xl border border-[#E2E8F0] bg-white p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(212,169,74,0.12)] transition-transform" data-testid={`taxi-service-${s.id}`}>
            <div className="w-12 h-12 rounded-xl bg-[#D4A94A]/10 flex items-center justify-center text-[#D4A94A]">
              <Car className="w-5 h-5" />
            </div>
            <h3 className="serif text-2xl text-[#0B3B5C] mt-4 leading-tight">{s.name}</h3>
            <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{s.description}</p>
            <div className="mt-5 flex items-center justify-between">
              <span className="mono text-lg text-[#E86A3C] font-semibold">{money(s.price)}</span>
              <button
                onClick={() => bookService(s)}
                data-testid={`taxi-book-btn-${s.id}`}
                className="btn-shine inline-flex items-center gap-1 rounded-full bg-[#E86A3C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#d55a30] active:scale-95"
              >
                Book <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </section>

      {selected && (
        <BookingModal
          item={selected}
          serviceType="taxi"
          initialDropoff={prefill.dropoff}
          initialPickup={prefill.pickup}
          onClose={() => { setSelected(null); setPrefill({ dropoff: "", pickup: "" }); }}
          extraFields={(form, setForm) => (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Pickup location" val={form.pickup_location} on={(e) => setForm({ ...form, pickup_location: e.target.value })} testid="taxi-pickup" />
              <Field label="Dropoff location" val={form.dropoff_location} on={(e) => setForm({ ...form, dropoff_location: e.target.value })} testid="taxi-dropoff" />
            </div>
          )}
        />
      )}
    </div>
  );
}
