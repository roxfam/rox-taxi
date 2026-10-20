import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Palmtree, ArrowRight, MapPin } from "lucide-react";
import { api, money } from "../lib/api";

const ROUTES = [
  { id: "port-love-beach", from: "Downtown / Cruise Port" },
  { id: "paradise-love-beach", from: "Paradise Island" },
];

// Home "beach pick" spotlight for Love Beach with live taxi fares.
export const LoveBeachPick = () => {
  const [fares, setFares] = useState({});
  useEffect(() => {
    api.get("/taxi-services").then(({ data }) => {
      const m = {};
      (data || []).forEach((s) => { if (ROUTES.some((r) => r.id === s.id)) m[s.id] = s; });
      setFares(m);
    }).catch(() => {});
  }, []);
  const routes = ROUTES.filter((r) => fares[r.id]);
  if (routes.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-10 py-10" data-testid="home-love-beach">
      <div className="grid md:grid-cols-[1.2fr_1fr] rounded-3xl overflow-hidden bg-white border border-[#EFE7D5] shadow-[0_14px_40px_rgba(11,25,44,0.08)]">
        <div className="relative min-h-[240px] md:min-h-[340px]">
          <img src="/images/love-beach.jpg" alt="Quiet white-sand beach with turquoise water in western Nassau" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur text-[#0B3B5C] text-[10px] font-black tracking-[0.2em] uppercase px-3 py-1.5">
            <Palmtree className="w-3.5 h-3.5 text-[#D4A94A]" /> Beach pick
          </span>
        </div>
        <div className="p-7 sm:p-9 flex flex-col justify-center">
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> West Nassau</div>
          <h2 className="serif text-4xl text-[#0B3B5C] mt-2">Love Beach</h2>
          <p className="text-[#64748B] mt-3 leading-relaxed text-sm sm:text-base">
            Soft white sand and calm, clear water about 25 minutes past Cable Beach, with fewer crowds and great snorkelling just offshore.
          </p>
          <div className="mt-6 space-y-2.5">
            {routes.map((r) => (
              <Link key={r.id} to={`/taxi?book=${r.id}`} data-testid={`home-love-beach-book-${r.id}`}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-[#E2E8F0] hover:border-[#D4A94A] px-4 py-3 transition-colors">
                <div className="min-w-0">
                  <div className="text-xs text-[#64748B]">From {r.from}</div>
                  <div className="font-semibold text-[#0B3B5C]" data-testid={`home-love-beach-fare-${r.id}`}>
                    {money(fares[r.id].price)}{fares[r.id].pricing_mode === "per_person" ? " per person" : ""}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#E86A3C]">Book taxi <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></span>
              </Link>
            ))}
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-3">No VAT on taxi fares · round-trip option saves 10% at checkout.</p>
        </div>
      </div>
    </section>
  );
};
