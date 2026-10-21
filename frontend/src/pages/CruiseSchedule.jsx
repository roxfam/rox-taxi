import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ship, Clock, Anchor, ArrowRight } from "lucide-react";
import Seo from "../components/Seo";
import { api } from "../lib/api";
import { BundleDeals } from "../components/BundleDeals";

const t12 = (hhmm) => {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Nassau" });

const TRIPS = [
  { to: "/tours", label: "Island tour" },
  { to: "/tours/blue-lagoon", label: "Blue Lagoon" },
  { to: "/taxi", label: "Beach taxi" },
];

const ShipCard = ({ s, today }) => (
  <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:p-6 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(11,59,92,0.10)] transition-[transform,box-shadow]" data-testid={`cruise-ship-${s.id}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[11px] uppercase tracking-[.2em] text-[#D4A94A] font-bold">{s.cruise_line || "Cruise ship"}</div>
        <div className="serif text-2xl text-[#0B3B5C] mt-1">{s.ship_name}</div>
        {s.berth && <div className="text-xs text-[#64748B] mt-1 inline-flex items-center gap-1"><Anchor className="w-3 h-3" /> {s.berth}</div>}
      </div>
      {today && <span className="rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2.5 py-1">In port today</span>}
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
      {[["Arrives", s.arrive], ["All aboard", s.all_aboard], ["Departs", s.depart]].map(([l, v]) => (
        <div key={l} className={`rounded-xl p-2.5 ${l === "All aboard" ? "bg-[#0B3B5C] text-white" : "bg-[#FBF7EF] text-[#0B3B5C]"}`}>
          <div className={`text-[10px] uppercase tracking-wider ${l === "All aboard" ? "text-white/70" : "text-[#64748B]"}`}>{l}</div>
          <div className="font-mono font-bold text-sm mt-0.5">{t12(v)}</div>
        </div>
      ))}
    </div>
    <div className="mt-4 text-xs text-[#64748B] inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[#D4A94A]" /> We get you back to the ship at least 60 min before all aboard.</div>
    <div className="mt-4 flex flex-wrap gap-2">
      {TRIPS.map((t) => (
        <Link key={t.to} to={t.to} className="inline-flex items-center gap-1 rounded-full border border-[#0B3B5C]/15 px-3.5 py-1.5 text-xs font-semibold text-[#0B3B5C] hover:bg-[#0B3B5C] hover:text-white transition-colors" data-testid={`cruise-trip-${s.id}-${t.label.replace(/\s/g, "-").toLowerCase()}`}>
          {t.label} <ArrowRight className="w-3 h-3" />
        </Link>
      ))}
    </div>
  </div>
);

export default function CruiseSchedule() {
  const [ships, setShips] = useState(null);
  useEffect(() => {
    api.get("/cruise-ships?days=21").then((r) => setShips(r.data)).catch(() => setShips([]));
  }, []);
  const today = todayIso();
  const byDay = (ships || []).reduce((acc, s) => ({ ...acc, [s.date]: [...(acc[s.date] || []), s] }), {});
  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-14" data-testid="cruise-schedule-page">
      <Seo title="Nassau Cruise Ship Schedule & Shore Trips | Rox Taxi & Tours" description="See which cruise ships are in Nassau port and book a shore excursion or taxi that gets you back before all aboard." />
      <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-2"><Ship className="w-4 h-4" /> Prince George Wharf · Nassau</div>
      <h1 className="serif text-4xl sm:text-5xl lg:text-6xl text-[#0B3B5C] mt-3 max-w-3xl">Ships in port &amp; shore trips</h1>
      <p className="mt-4 text-[#64748B] max-w-2xl text-sm sm:text-base">Find your ship, check your all-aboard time and pick a tour or taxi. Every shore trip is timed to get you back to the pier early.</p>
      {ships === null && <div className="mt-12 text-[#64748B]" data-testid="cruise-schedule-loading">Loading schedule…</div>}
      {ships && ships.length === 0 && (
        <div className="mt-12 rounded-2xl bg-[#FBF7EF] border border-[#E2E8F0] p-8 text-[#64748B]" data-testid="cruise-schedule-empty">
          No ships posted yet. Message us on WhatsApp with your ship name and date and we'll plan your day.
        </div>
      )}
      {Object.entries(byDay).map(([d, list]) => (
        <section key={d} className="mt-12" data-testid={`cruise-day-${d}`}>
          <h2 className="text-base md:text-lg font-bold text-[#0B3B5C] mb-4">{d === today ? "Today" : dayLabel(d)} <span className="text-[#94a3b8] font-normal">· {list.length} ship{list.length > 1 ? "s" : ""}</span></h2>
          <div className="grid md:grid-cols-2 gap-5">{list.map((s) => <ShipCard key={s.id} s={s} today={d === today} />)}</div>
        </section>
      ))}
      <BundleDeals className="mt-20" />
    </div>
  );
}
