import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, ChevronDown } from "lucide-react";
import { api } from "../lib/api";

/**
 * Header city switcher — Nassau is the default active destination. Other
 * cities route to `/cities/{slug}` (Coming Soon splash with wait-list).
 * Choice persists in localStorage so returning guests keep their city.
 */
export default function CitySwitcher() {
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState([]);
  const [selected, setSelected] = useState(() => localStorage.getItem("rox_city") || "nassau");

  useEffect(() => {
    api.get("/cities").then((r) => setCities(r.data.cities || [])).catch(() => {});
  }, []);

  const current = cities.find((c) => c.slug === selected) || { name: "Nassau", slug: "nassau" };

  const pick = (c) => {
    localStorage.setItem("rox_city", c.slug);
    setSelected(c.slug);
    setOpen(false);
  };

  return (
    <div className="relative" data-testid="city-switcher">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] hover:border-[#D4A94A] bg-white px-3 py-1.5 text-xs font-semibold text-[#0B3B5C]"
        data-testid="city-switcher-toggle"
        title="Switch destination"
      >
        <MapPin className="w-3.5 h-3.5 text-[#D4A94A]" />
        <span className="hidden sm:inline">{current.name}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-[0_20px_60px_rgba(11,25,44,0.18)] border border-[#E2E8F0] p-2 z-50"
          data-testid="city-switcher-menu"
          onMouseLeave={() => setOpen(false)}
        >
          {cities.map((c) => {
            const isActive = selected === c.slug;
            const link = c.active ? "/" : `/cities/${c.slug}`;
            return (
              <Link
                key={c.slug}
                to={link}
                onClick={() => pick(c)}
                data-testid={`city-switcher-item-${c.slug}`}
                className={`flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-[#FBF7EF] ${isActive ? "bg-[#FBF7EF]" : ""}`}
              >
                <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${c.active ? "text-[#D4A94A]" : "text-[#94a3b8]"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#0B3B5C]">{c.name}</span>
                    {!c.active && (
                      <span className="text-[9px] font-bold tracking-widest uppercase bg-[#D4A94A]/10 text-[#A88235] rounded-full px-1.5 py-0.5">
                        Soon
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#64748B] leading-snug mt-0.5">{c.tagline}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
