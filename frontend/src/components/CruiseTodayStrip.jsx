import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ship, ArrowRight } from "lucide-react";
import { api } from "../lib/api";

// Home banner: shows only when ships are posted for today.
export const CruiseTodayStrip = () => {
  const [ships, setShips] = useState([]);
  useEffect(() => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Nassau" });
    api.get("/cruise-ships?days=1").then((r) => setShips(r.data.filter((s) => s.date === today))).catch(() => {});
  }, []);
  if (!ships.length) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-10" data-testid="home-cruise-today">
      <Link to="/cruise-schedule" className="group flex flex-wrap items-center gap-4 rounded-2xl bg-[#0B3B5C] text-white px-6 py-5 hover:bg-[#0d4670] transition-colors">
        <Ship className="w-6 h-6 text-[#D4A94A]" />
        <div className="flex-1 min-w-[200px]">
          <div className="text-[11px] uppercase tracking-[.2em] text-[#D4A94A] font-bold">Ships in port today</div>
          <div className="font-semibold mt-0.5">{ships.map((s) => s.ship_name).join(" · ")}</div>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-bold text-[#F5E1A4]">Shore trips <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
      </Link>
    </section>
  );
};
