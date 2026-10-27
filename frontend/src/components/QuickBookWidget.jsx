import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Car, ShipWheel, MapPinned, ArrowRight, Check, Shuffle } from "lucide-react";
import { api } from "../lib/api";

const SHOW = 4;
const ROTATE_MS = 10000;
const $ = (n) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;

// Per-visit seed: every new session sees a different mix; stable while they browse.
const sessionSeed = () => {
  try {
    let s = sessionStorage.getItem("qb_seed");
    if (!s) { s = String(Math.floor(Math.random() * 1e9)); sessionStorage.setItem("qb_seed", s); }
    return Number(s);
  } catch { return Math.floor(Math.random() * 1e9); }
};
const shuffled = (arr, seed) => {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Live catalog → highlight lines for each tab.
const useLiveHighlights = () => {
  const [live, setLive] = useState({});
  useEffect(() => {
    const seed = sessionSeed();
    const ok = (x) => x.active !== false && Number(x.price) > 0;
    Promise.allSettled([api.get("/taxi-services"), api.get("/tours"), api.get("/rentals")]).then(([t, tr, r]) => {
      const taxi = (t.value?.data || []).filter((x) => ok(x) && /→|↔/.test(x.name)).map((x) => ({ line: `${x.name} ${$(x.price)}`, price: x.price }));
      const tours = (tr.value?.data || []).filter(ok).map((x) => ({ line: `${x.name} · ${$(x.price)} pp`, price: x.price }));
      const rentals = (r.value?.data || []).filter(ok).map((x) => ({ line: `${x.name} · ${$(x.price)}/day`, price: x.price }));
      setLive({ taxi: shuffled(taxi, seed), tours: shuffled(tours, seed + 7), rentals: shuffled(rentals, seed + 13) });
    });
  }, []);
  return live;
};

// Modern tabbed booking widget for the home hero.
// Segmented control with an animated pill background (framer-motion layoutId)
// swaps between Taxi / Tours / Rentals. Each panel shows a themed hero image
// swap, three key highlights, price range and a CTA. Kept in one file so the
// Home page stays lean.
const TABS = [
  {
    key: "taxi",
    label: "Taxi",
    Icon: Car,
    accent: "#D4A94A",        // gold
    accentSoft: "rgba(212,169,74,0.14)",
    href: "/taxi",
    kicker: "Airport & Cruise-Port Transfers",
    title: "Fixed-fare rides across Nassau.",
    pitch: "Official Bahamian tariff. Meet & greet at LPIA, Paradise Island bridge toll included, live GPS tracking on every ride.",
    price: "from $20",
    priceNote: "per taxi · up to 2 pax",
    highlights: [
      "LPIA → Cable Beach $35",
      "Downtown → LPIA $40",
      "LPIA → Atlantis / Paradise Island $45",
      "Cruise port → Paradise Island $20",
    ],
    cta: "Reserve a taxi",
  },
  {
    key: "tours",
    label: "Tours",
    Icon: ShipWheel,
    accent: "#E86A3C",        // orange
    accentSoft: "rgba(232,106,60,0.14)",
    href: "/tours",
    kicker: "Bahamas Excursions",
    title: "Snorkel, sail, ATV & jet-ski adventures.",
    pitch: "Book official operator experiences — Blue Lagoon, Rose Island, Dolphin Encounters, Atlantis Aquaventure, jet skis and ATV tours — with hotel & cruise-port pickup.",
    price: "from $89",
    priceNote: "per person",
    highlights: [
      "Blue Lagoon Beach Day, Dolphin Encounters",
      "Cabbage Beach Jet Ski · Nassau ATV",
      "Cruise-port pickup on every tour",
    ],
    cta: "Browse all tours",
  },
  {
    key: "rentals",
    label: "Car Rentals",
    Icon: MapPinned,
    accent: "#0F766E",        // rich emerald teal
    accentSoft: "rgba(15,118,110,0.14)",
    href: "/rentals",
    kicker: "Easy Drive Car Rentals",
    title: "Compact to Luxury Vehicle — delivered to you.",
    pitch: "Modern fleet delivered free to LPIA airport, cruise port, Cable Beach, Baha Mar or Paradise Island. Full insurance, roadside cover and unlimited miles.",
    price: "from $65",
    priceNote: "per day · 2-day min",
    highlights: [
      "Chevy Trax SUV $115 · Silverado Pickup $169",
      "Chrysler Town & Country Mini-Van $120",
      "Free delivery + 24/7 roadside assist",
    ],
    cta: "See the fleet",
  },
];

export default function QuickBookWidget() {
  const [activeKey, setActiveKey] = useState("taxi");
  const active = TABS.find((t) => t.key === activeKey);
  const live = useLiveHighlights();
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const pool = live[activeKey] || [];
  useEffect(() => { setPage(0); }, [activeKey]);
  useEffect(() => {
    if (paused || pool.length <= SHOW) return undefined;
    const id = setInterval(() => setPage((p) => p + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, pool.length]);
  const highlights = useMemo(() => {
    if (!pool.length) return active.highlights;
    const start = (page * SHOW) % pool.length;
    return Array.from({ length: Math.min(SHOW, pool.length) }, (_, i) => pool[(start + i) % pool.length].line);
  }, [pool, page, active]);
  const fromPrice = pool.length ? `from ${$(Math.min(...pool.map((x) => Number(x.price))))}` : active.price;

  return (
    <div
      className="rounded-[28px] overflow-hidden shadow-[0_30px_80px_rgba(11,25,44,0.28)] border border-white/50 backdrop-blur-xl relative"
      style={{
        background: "linear-gradient(155deg, rgba(255,255,255,0.98) 0%, rgba(251,247,239,0.96) 100%)",
      }}
      data-testid="quickbook-widget"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* subtle top accent bar */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, transparent, ${active.accent}, transparent)` }} />

      <div className="p-7 lg:p-8">
        {/* Kicker */}
        <div className="flex items-center gap-3 mb-5">
          <span className="w-8 h-[1px]" style={{ background: active.accent }} />
          <span className="text-[10px] tracking-[0.35em] uppercase font-black" style={{ color: active.accent }}>Reserve</span>
        </div>

        {/* Segmented tab control */}
        <div className="relative flex rounded-full bg-[#F1F5F9]/80 p-1.5 mb-6 border border-white/40" data-testid="quickbook-tabs" role="tablist">
          {TABS.map((t) => {
            const on = t.key === activeKey;
            const Icon = t.Icon;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActiveKey(t.key)}
                data-testid={`quickbook-tab-${t.key}`}
                className={`relative flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-xs font-black tracking-wide uppercase transition-colors duration-200 z-10 ${on ? "text-white" : "text-[#0B3B5C]/70 hover:text-[#0B3B5C]"}`}
              >
                {on && (
                  <motion.span
                    layoutId="quickbook-pill"
                    className="absolute inset-0 rounded-full shadow-[0_10px_25px_rgba(0,0,0,0.15)]"
                    style={{ background: `linear-gradient(135deg, ${active.accent}, ${shade(active.accent, -12)})` }}
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28 }}
            className="relative"
            data-testid={`quickbook-panel-${active.key}`}
          >
            <div className="text-[10px] tracking-[0.3em] uppercase font-bold" style={{ color: active.accent }}>{active.kicker}</div>
            <h3 className="serif text-3xl sm:text-[34px] text-[#0B3B5C] font-bold leading-[1.05] tracking-tight mt-2">
              {active.title.split(" ").slice(0, -1).join(" ")}{" "}
              <em className="italic" style={{ color: active.accent }}>{active.title.split(" ").slice(-1)}</em>
            </h3>
            <p className="text-[13px] text-[#64748B] leading-relaxed mt-3 max-w-md">{active.pitch}</p>

            <AnimatePresence mode="wait">
            <motion.ul key={`${activeKey}-${page}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.3 }}
              className="mt-5 space-y-2 min-h-[112px]" data-testid={`quickbook-highlights-${active.key}`}>
              {highlights.map((h) => (
                <li key={h} className="flex items-start gap-2.5 text-sm text-[#0B3B5C]">
                  <span className="mt-1 w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: active.accentSoft, color: active.accent }}>
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                  </span>
                  <span className="leading-snug">{h}</span>
                </li>
              ))}
            </motion.ul>
            </AnimatePresence>
            {pool.length > SHOW && (
              <button type="button" onClick={() => setPage((p) => p + 1)} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider hover:opacity-80 transition-opacity" style={{ color: active.accent }} data-testid={`quickbook-more-${active.key}`}>
                <Shuffle className="w-3 h-3" /> Show more options
              </button>
            )}

            <div className="mt-7 flex items-center justify-between gap-3 pt-5 border-t border-[#E2E8F0]/60">
              <div>
                <div
                  className="mono text-3xl font-black tracking-tight bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(232,106,60,0.35)]"
                  style={{ backgroundImage: "linear-gradient(135deg,#E86A3C 0%,#F59E0B 55%,#D4A94A 100%)" }}
                  data-testid={`quickbook-price-${active.key}`}
                >
                  {fromPrice}
                </div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-[#64748B] mt-1 font-semibold">{active.priceNote}</div>
              </div>
              <Link
                to={active.href}
                data-testid={`quickbook-cta-${active.key}`}
                className="group inline-flex items-center gap-2 rounded-full text-white px-6 py-3 text-sm font-black tracking-wide shadow-[0_12px_30px_rgba(0,0,0,0.18)] hover:scale-[1.03] active:scale-95 transition-transform"
                style={{ background: `linear-gradient(135deg, ${active.accent}, ${shade(active.accent, -15)})` }}
              >
                {active.cta}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// Cheap hex darken helper (percent < 0 to darken).
function shade(hex, pct) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * pct);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `rgb(${r}, ${g}, ${b})`;
}
