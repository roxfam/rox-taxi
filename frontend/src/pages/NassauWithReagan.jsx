import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Clock, MapPin, Users, Star, Shell, Camera, ShoppingBag, Utensils,
  Trophy, Sparkles, Palmtree, Info, Wallet, Waves, Landmark, Cake, Factory,
  Umbrella, Wine, MountainSnow, Building2, Check, RotateCcw, Calculator,
} from "lucide-react";
import ReaganRouteMap from "../components/ReaganRouteMap";

/**
 * NassauWithReagan — signature ~4 hour city loop built around our best
 * driver. Guests now build their OWN itinerary from a 14-stop catalogue:
 *   • Pick up to 7 stops for the flat $235 base rate
 *   • Each additional stop beyond 7 = +$45 and adds up to 30 min
 * Includes a live Family-of-4 Budget Card that estimates on-site spend
 * (Fish Fry meals, Ardastra tickets, etc.) driven by whatever the guest
 * has selected.
 */

// ── Stop catalogue ──────────────────────────────────────────────────
// `recommended: true` = pre-selected on first load (the classic 7-stop
// route). Everything else is opt-in. Ordered geographically:
// downtown → west sweep → east → Paradise Island.
// `family_of_4_addon` is what a family of four typically spends *at
// the stop* (meals / tickets / small purchases). Used only for the live
// Family Budget Card — actual purchases at each stop are optional and
// pay-as-you-go, never bundled into the flat tour rate.
const STOPS = [
  {
    id: "fincastle", icon: Shell, recommended: true, minutes: 30,
    title: "Fort Fincastle + Queen's Staircase",
    body: "We start at the top — 66 hand-carved limestone steps and a hilltop fort with the best downtown view. I'll tell you why the Queen never actually walked them (spoiler: the name came later).",
    family_of_4_addon: 0,
  },
  {
    id: "graycliff", icon: Factory, recommended: true, minutes: 20,
    title: "Graycliff Cigar & Chocolate Factory",
    body: "Working cigar-rolling floor above West Hill Street where you'll watch Cuban-trained torcedores hand-roll each stick, then across the courtyard to the Graycliff Chocolatier where the truffles are moulded in small batches. Both floors are free to walk through with Reagan.",
    included_note: "Factory walk-through free · included in the tour",
    paid_separately: {
      label: "Cigars & chocolates are pay-as-you-go",
      detail: "Single hand-rolled cigars from ~$10, sampler 5-packs ~$40, boxes $150+. Chocolate bars ~$8, filled truffle boxes ~$20–$45. Pay at the boutique counter — cash or card.",
    },
    family_of_4_addon: 0, // browse-only baseline; buying is optional
  },
  {
    id: "watlings", icon: Wine, recommended: false, minutes: 30,
    title: "John Watling's Distillery",
    body: "The oldest working rum distillery in Nassau, tucked inside the 1789 Buena Vista Estate. Free walk-through of the copper stills + a complimentary tasting shot at the bar. Sunset views over the city if we time it right.",
    included_note: "Tour + tasting shot free · included in the tour",
    paid_separately: {
      label: "Rum bottles + cocktails are optional",
      detail: "Cocktails at the estate bar ~$14. Signature Buena Vista rum bottles from ~$32; premium reserve labels $60+. Vacuum-boxed if you want to fly home with a few.",
    },
    family_of_4_addon: 0,
  },
  {
    id: "bay-street", icon: ShoppingBag, recommended: true, minutes: 30,
    title: "Bay Street strip",
    body: "Straw Market, colonial architecture, and the pastel row where every cruise-day photo happens. I know which shops give a real haggle vs the ones selling factory-made 'Bahamian' straw.",
    family_of_4_addon: 0,
  },
  {
    id: "junkanoo-beach", icon: Umbrella, recommended: false, minutes: 20,
    title: "Junkanoo Beach",
    body: "The walkable downtown beach — three-minute drive (or a proper five-minute stroll) from Bay Street. Loud reggae bars on the sand, cheap frozen drinks, and locals playing dominoes. Grab-and-go swim if you don't want to commit a full beach day.",
    included_note: "Free public beach · included when you opt in",
    family_of_4_addon: 0,
  },
  {
    id: "fish-fry", icon: Utensils, recommended: true, minutes: 45,
    title: "Arawak Cay Fish Fry",
    body: "Native seafood shacks on stilts over the water. Twin Brothers or Oh Andros — I'll rank them for you honestly. Conch fritters, cracked lobster, Kalik cold enough to hurt your teeth.",
    paid_separately: {
      label: "Food + drinks paid separately",
      detail: "Typical plates run $15–$35 per person at the shack. Cash preferred; most take card. Order at your own pace.",
    },
    family_of_4_addon: 100, // 4 plates × ~$25 avg
  },
  {
    id: "fort-charlotte", icon: Landmark, recommended: false, minutes: 30,
    title: "Fort Charlotte + cannon walk",
    body: "The biggest fort on New Providence — actually three interconnected forts built in 1789 by Lord Dunmore. Grounds are free to roam, cannon-firing demo runs weekdays around 11 AM, and the underground dungeon tour is a proper thrill for kids and history buffs alike.",
    included_note: "Grounds free to roam · included in the tour",
    paid_separately: {
      label: "Interior museum + dungeon tour is paid at the gate",
      detail: "Adults ~$5 · Children ~$2 · Under 4 free. The guided dungeon walk lasts ~25 min and is only ticketed on-site.",
    },
    family_of_4_addon: 14, // 2 adults × $5 + 2 kids × $2
  },
  {
    id: "ardastra", icon: Palmtree, recommended: true, minutes: 45,
    title: "Ardastra Gardens flamingos",
    body: "The marching flamingo show has run since 1957 and it still stops kids in their tracks. Best photo op on the island — we hit the 2 PM performance if timing works.",
    paid_separately: {
      label: "Admission paid separately",
      detail: "Adults $18 · Children (4–12) $9 · Under 4 free. Pay at the gate on the day. We help you time the 10:15 AM · 2:15 PM · 4:15 PM flamingo march.",
    },
    family_of_4_addon: 54, // 2 adults × $18 + 2 kids × $9
  },
  {
    id: "baha-mar", icon: Building2, recommended: false, minutes: 30,
    title: "Baha Mar resort walk-through",
    body: "Reagan drops you at Grand Hyatt's lobby door and walks you past the flamingo pond, art gallery corridor, and Cascades pool deck. Free to wander — no ticket needed. Great for a coffee break, casino peek, or an air-conditioned reset between beach stops.",
    included_note: "Public spaces free · included in the tour",
    family_of_4_addon: 0,
  },
  {
    id: "cable-beach", icon: Umbrella, recommended: false, minutes: 20,
    title: "Cable Beach",
    body: "Nassau's most photographed public beach — three miles of soft white sand fronting the Baha Mar strip. Barefoot walk, sunset selfie, or quick swim. Skip it and we head straight for the return leg.",
    included_note: "Free public beach · included when you opt in",
    family_of_4_addon: 0,
  },
  {
    id: "the-caves", icon: MountainSnow, recommended: false, minutes: 20,
    title: "The Caves (Blake Road)",
    body: "A pair of limestone sea caves on West Bay Street — carved by wave action over thousands of years, allegedly used by Lucayan Indians and later pirates. Free to explore, five-minute stop, phenomenal photos.",
    included_note: "Free landmark · included when you opt in",
    family_of_4_addon: 0,
  },
  {
    id: "rum-cake", icon: Cake, recommended: true, minutes: 20,
    title: "Bahamas Rum Cake Factory",
    body: "A quick walk through the working bakery at 602 East Bay Street where they've been small-batch baking and rum-curing cakes since 1978. Free samples at the counter across 12+ flavours. Every cake is vacuum-sealed and cleared for carry-on.",
    included_note: "Walk-in free · tasting samples included",
    paid_separately: {
      label: "Cakes to take home are pay-as-you-go",
      detail: "Singles from $7 (12+ flavours) · 4 oz six-pack samplers ~$37.75 · 20 oz two-pack bundles ~$39.58. Vacuum-sealed for the plane home. Cash or card at the counter.",
    },
    family_of_4_addon: 28, // 4 minis × $7
  },
  {
    id: "montagu", icon: Landmark, recommended: false, minutes: 20,
    title: "Fort Montagu + beach",
    body: "The oldest fort on New Providence (1741) — quieter than Fincastle, and the crescent beach next to it is where locals actually swim. Great for wading kids and a quick stretch of your legs.",
    included_note: "Beach + grounds free · included in the tour",
    paid_separately: {
      label: "Fort interior walk-through is paid at the gate",
      detail: "Adults $2 · Children $1 · Under 4 free. Optional — skip it and just enjoy the beach and cannon terrace for free.",
    },
    family_of_4_addon: 6, // 2 adults × $2 + 2 kids × $1
  },
  {
    id: "cabbage-beach", icon: Umbrella, recommended: false, minutes: 20,
    title: "Cabbage Beach (Paradise Island)",
    body: "The two-mile crescent of powder-white sand that hugs the north side of Paradise Island. Public access via the Riu path — 60 seconds from Atlantis if you're already stopped there. Loungers, jet-ski touts, and the best water clarity in Nassau.",
    included_note: "Free public beach · included when you opt in",
    family_of_4_addon: 0,
  },
  {
    id: "atlantis", icon: Waves, recommended: true, minutes: 30,
    title: "Atlantis self-tour (Paradise Island)",
    body: "Reagan drops you at the Coral Tower entrance and points you through the free public spaces — the Great Hall of Waters lobby, the grand staircase, Marina Village, and the beach boardwalk. Meet back at the van in 30 minutes with time to spare.",
    included_note: "Free lobby + public areas · included in the tour",
    paid_separately: {
      label: "Marine Habitat (aquarium) admission is separate",
      detail: "If you want to see the Ruins Lagoon, sharks and rays, day passes run $50+ per person at the guest-services desk — optional, book on-site.",
    },
    family_of_4_addon: 0, // aquarium is a separate opt-in add-on card below
  },
];

const BASE_PRICE = 235;
const BASE_STOPS_LIMIT = 7;
const EXTRA_STOP_FEE = 45;
const EXTRA_STOP_MINUTES = 30;

// Family-Budget aquarium add-on — separate toggle since Atlantis itself
// is included but the Marine Habitat day-pass is the ONE stop where most
// families spend real money.
const ATLANTIS_AQUARIUM_ADDON_PER_PERSON = 50;
const FAMILY_SIZE = 4;

export default function NassauWithReagan() {
  useEffect(() => {
    document.title = "Nassau with Reagan · Build your own signature city loop · Rox Taxi";
  }, []);

  // Selection state — Map<stopId, boolean>. Recommended stops preselected.
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(STOPS.filter((s) => s.recommended).map((s) => s.id)),
  );
  const [includeAquarium, setIncludeAquarium] = useState(false);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const resetToRecommended = () => {
    setSelectedIds(new Set(STOPS.filter((s) => s.recommended).map((s) => s.id)));
    setIncludeAquarium(false);
  };

  // Derived totals — recomputed every render off `selectedIds`.
  const totals = useMemo(() => {
    const chosen = STOPS.filter((s) => selectedIds.has(s.id));
    const stopCount = chosen.length;
    const totalMinutes = chosen.reduce((sum, s) => {
      // Additional stops beyond the base 7 are capped at 30 min each.
      return sum + Math.min(s.minutes, EXTRA_STOP_MINUTES + 100);
    }, 0);
    const extraStops = Math.max(0, stopCount - BASE_STOPS_LIMIT);
    const totalPrice = BASE_PRICE + extraStops * EXTRA_STOP_FEE;
    const extraMinutes = extraStops * EXTRA_STOP_MINUTES; // absorbed into totalMinutes already
    const familyOnSite = chosen.reduce((sum, s) => sum + (s.family_of_4_addon || 0), 0)
      + (includeAquarium ? ATLANTIS_AQUARIUM_ADDON_PER_PERSON * FAMILY_SIZE : 0);
    const familyGrandTotal = totalPrice + familyOnSite;
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const durationLabel = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    return { stopCount, totalMinutes, extraStops, totalPrice, familyOnSite, familyGrandTotal, durationLabel, extraMinutes };
  }, [selectedIds, includeAquarium]);

  const selectedForList = useMemo(
    () => STOPS.map((s) => ({ ...s, selected: selectedIds.has(s.id) })),
    [selectedIds],
  );

  return (
    <div className="bg-[#FBF7EF]" data-testid="nassau-with-reagan-page">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-25 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1531208938214-9b34d7d21a7c?w=1920&h=1080&fit=crop&auto=format')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B192C]/95 via-[#0B3B5C]/90 to-[#0B192C]/95" />
        <div className="relative max-w-5xl mx-auto px-6 lg:px-10 pt-24 pb-20 lg:pt-32 lg:pb-28 text-white">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#D4A94A] to-[#c99738] text-white text-[10px] uppercase tracking-widest font-black px-3 py-1.5 shadow-[0_10px_25px_rgba(212,169,74,0.4)]">
              <Trophy className="w-3 h-3" /> Signature tour · with Reagan
            </div>
            <h1 className="serif text-6xl sm:text-7xl lg:text-8xl mt-6 leading-[0.95]">
              Nassau,<br />the way <span className="text-[#D4A94A]">Reagan</span> tells it.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/85 leading-relaxed">
              Build your own ~4-hour loop — pick up to 7 stops for a flat $235, each extra +$45. One driver who's spent a decade turning cruise-day guests into repeat customers and gets name-dropped in half our Google reviews.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/taxi?book=hourly-charter&driver=Reagan"
                data-testid="nassau-reagan-hero-cta"
                className="btn-shine inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-7 py-4 text-base font-bold hover:bg-[#d55a30] active:scale-95 shadow-[0_15px_35px_rgba(232,106,60,0.45)]"
              >
                Book Reagan for this tour <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/drivers/reagan"
                data-testid="nassau-reagan-hero-bio"
                className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/30 text-white px-5 py-4 text-sm font-bold hover:bg-white/20"
              >
                Read Reagan's bio →
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm">
              <Fact icon={Clock} label="~4 hours base" />
              <Fact icon={Users} label="Up to 4 guests" />
              <Fact icon={MapPin} label="Pickup: your hotel or cruise port" />
              <Fact icon={Star} label="5.0★ on Google" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Itinerary Builder */}
      <section className="max-w-5xl mx-auto px-6 lg:px-10 py-20">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">
          Build your route
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 mt-2">
          <h2 className="serif text-5xl lg:text-6xl text-[#0B3B5C] leading-tight">
            Pick your stops.
          </h2>
          <button
            type="button"
            onClick={resetToRecommended}
            data-testid="nassau-reagan-reset-btn"
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#E2E8F0] px-4 py-2 text-xs font-bold text-[#0B3B5C] hover:border-[#D4A94A]"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to recommended 7
          </button>
        </div>
        <p className="mt-4 text-[#334155] max-w-2xl leading-relaxed">
          <span className="font-bold text-[#0B3B5C]">7 stops for $235.</span> Add more — each extra stop is <span className="mono font-bold text-[#E86A3C]">+$45</span> and up to <span className="mono font-bold text-[#E86A3C]">30 minutes</span>. Reagan will sequence them into the most efficient loop on the day. Timings flex; the flavours don't.
        </p>

        <div className="mt-10 grid gap-6" data-testid="nassau-reagan-stops-list">
          {selectedForList.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              data-testid={`nassau-reagan-stop-${s.id}`}
              className={`grid md:grid-cols-[80px,1fr,auto] gap-6 md:items-center rounded-2xl border p-6 transition-all ${
                s.selected
                  ? "bg-white border-[#D4A94A] shadow-[0_15px_35px_rgba(212,169,74,0.15)]"
                  : "bg-[#F8FAFC] border-[#E2E8F0] opacity-70 hover:opacity-100"
              }`}
            >
              <div
                className={`w-16 h-16 rounded-2xl border flex items-center justify-center shrink-0 ${
                  s.selected ? "bg-gradient-to-br from-[#FBF7EF] to-white border-[#D4A94A]/30 text-[#D4A94A]" : "bg-white border-[#E2E8F0] text-[#94a3b8]"
                }`}
              >
                <s.icon className="w-7 h-7" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-black flex items-center gap-2 flex-wrap">
                  <span>{s.recommended ? "Recommended" : "Optional"}</span>
                  {s.selected && (
                    <span
                      data-testid={`nassau-reagan-stop-${s.id}-selected-chip`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#059669] text-white text-[9px] uppercase tracking-widest font-black px-2 py-0.5"
                    >
                      <Check className="w-2.5 h-2.5" /> In your loop
                    </span>
                  )}
                </div>
                <h3 className="serif text-2xl text-[#0B3B5C] mt-1 leading-tight">{s.title}</h3>
                <p className="text-sm text-[#334155] mt-2 leading-relaxed">{s.body}</p>
                {s.included_note && (
                  <div
                    data-testid={`nassau-reagan-stop-${s.id}-included`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#059669]/10 border border-[#059669]/30 px-3 py-1 text-[10px] uppercase tracking-widest font-black text-[#047857]"
                  >
                    <Sparkles className="w-3 h-3" /> {s.included_note}
                  </div>
                )}
                {s.paid_separately && (
                  <div
                    data-testid={`nassau-reagan-stop-${s.id}-paid-separately`}
                    className="mt-3 flex items-start gap-2.5 rounded-xl bg-[#FBF7EF] border border-[#D4A94A]/30 px-3 py-2.5"
                  >
                    <Wallet className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />
                    <div className="text-xs text-[#334155] leading-relaxed">
                      <span className="font-bold text-[#0B3B5C]">{s.paid_separately.label}.</span>{" "}
                      {s.paid_separately.detail}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="text-right">
                  <div className="mono font-bold text-2xl text-[#D4A94A]">~{s.minutes}m</div>
                  <div className="text-[10px] uppercase tracking-widest text-[#94a3b8]">on the ground</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  data-testid={`nassau-reagan-toggle-${s.id}`}
                  aria-pressed={s.selected}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                    s.selected
                      ? "bg-[#0B3B5C] text-white hover:bg-[#0a324f]"
                      : "bg-white border border-[#E2E8F0] text-[#0B3B5C] hover:border-[#D4A94A]"
                  }`}
                >
                  {s.selected ? <><Check className="w-3.5 h-3.5" /> Added</> : <>+ Add stop</>}
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Sticky-ish live summary bar. Sits at the bottom of the builder
            section so guests see totals as they toggle. */}
        <div
          className="mt-10 sticky bottom-4 z-20 rounded-3xl bg-gradient-to-br from-[#0B3B5C] to-[#0B192C] text-white px-6 sm:px-8 py-6 shadow-[0_20px_50px_rgba(11,59,92,0.35)]"
          data-testid="nassau-reagan-summary-bar"
        >
          <div className="grid sm:grid-cols-[1fr,1fr,auto] gap-6 items-center">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#F5E1A4] font-black">
                Your loop
              </div>
              <div className="mt-1 serif text-3xl leading-tight">
                {totals.stopCount} stop{totals.stopCount === 1 ? "" : "s"} · <span className="text-[#F5E1A4]">{totals.durationLabel}</span>
              </div>
              {totals.extraStops > 0 && (
                <div className="mt-1 text-xs text-white/70" data-testid="nassau-reagan-extras-note">
                  {totals.extraStops} extra stop{totals.extraStops === 1 ? "" : "s"} @ +${EXTRA_STOP_FEE} · adds ~{totals.extraMinutes} min
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#F5E1A4] font-black">
                Tour price
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="mono text-4xl font-black text-[#F5E1A4]" data-testid="nassau-reagan-total-price">
                  ${totals.totalPrice}
                </span>
                <span className="text-xs uppercase tracking-widest text-white/60">flat · up to 4 guests</span>
              </div>
              <div className="mt-1 text-[11px] text-white/60">
                +$30 per extra guest above 4 · +$45 per extra stop beyond 7
              </div>
            </div>
            <Link
              to={`/taxi?book=hourly-charter&driver=Reagan&stops=${totals.stopCount}&price=${totals.totalPrice}`}
              data-testid="nassau-reagan-summary-cta"
              className="btn-shine inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] text-white px-6 py-3.5 text-sm font-bold hover:bg-[#d55a30] active:scale-95 shadow-[0_15px_35px_rgba(232,106,60,0.5)] whitespace-nowrap"
            >
              Book ${totals.totalPrice} · {totals.stopCount} stops <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Illustrated route map */}
      <ReaganRouteMap />

      {/* Pricing + Family Budget Card + What's Included */}
      <section className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 grid lg:grid-cols-2 gap-10">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">
              Simple, honest pricing
            </div>
            <h2 className="serif text-5xl text-[#0B3B5C] mt-2 leading-tight">
              ${BASE_PRICE} flat.
            </h2>
            <div className="mt-4 space-y-3 text-[#334155] leading-relaxed">
              <p>
                Up to 4 hours of private driving, up to 4 guests, up to 7 stops. Not $99-per-person that tacks on to $600 for a family — one flat rate, one driver, one honest handshake.
              </p>
              <p>
                <span className="mono font-bold text-[#E86A3C]">+$30</span> for each extra guest above 4 (up to 6 total in an SUV).
                <br />
                <span className="mono font-bold text-[#E86A3C]">+$45</span> for each extra stop beyond 7 (up to 30 min each).
              </p>
            </div>

            {/* Family-Budget Card — live "what will this actually cost my
                family of 4?" estimator driven by the guest's selections. */}
            <div
              className="mt-6 rounded-2xl bg-gradient-to-br from-[#FBF7EF] to-white border border-[#D4A94A]/40 p-5"
              data-testid="nassau-reagan-family-budget-card"
            >
              <div className="flex items-center gap-2 text-[10px] tracking-[0.28em] uppercase text-[#D4A94A] font-black">
                <Calculator className="w-3 h-3" /> Family-of-4 budget · live estimate
              </div>
              <div className="mt-3 flex justify-between items-baseline">
                <span className="text-sm text-[#334155]">
                  Tour ({totals.stopCount} stops · {totals.durationLabel})
                </span>
                <span className="mono font-bold text-[#0B3B5C]" data-testid="family-budget-tour-line">
                  ${totals.totalPrice}
                </span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm border-t border-[#D4A94A]/20 pt-3">
                {STOPS.filter((s) => selectedIds.has(s.id) && (s.family_of_4_addon || 0) > 0).map((s) => (
                  <li key={s.id} className="flex justify-between items-baseline text-[#64748B]" data-testid={`family-budget-line-${s.id}`}>
                    <span>
                      <s.icon className="w-3.5 h-3.5 inline-block text-[#D4A94A] mr-1.5 -mt-0.5" />
                      {s.title.replace(" (Paradise Island)", "").split(" ").slice(0, 3).join(" ")} on-site
                    </span>
                    <span className="mono font-semibold">+${s.family_of_4_addon}</span>
                  </li>
                ))}
                {/* Atlantis aquarium is a separate opt-in — only shows when
                    Atlantis is selected AND the aquarium checkbox is on. */}
                {selectedIds.has("atlantis") && (
                  <li className="flex justify-between items-center gap-3 border-t border-[#D4A94A]/20 pt-2 mt-1" data-testid="family-budget-aquarium">
                    <label className="flex items-center gap-2 text-[#64748B] cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={includeAquarium}
                        onChange={(e) => setIncludeAquarium(e.target.checked)}
                        data-testid="family-budget-aquarium-toggle"
                        className="w-4 h-4 accent-[#D4A94A]"
                      />
                      <span>Atlantis Marine Habitat day-pass (4 × ${ATLANTIS_AQUARIUM_ADDON_PER_PERSON})</span>
                    </label>
                    <span className="mono font-semibold text-[#64748B]">
                      {includeAquarium ? `+$${ATLANTIS_AQUARIUM_ADDON_PER_PERSON * FAMILY_SIZE}` : "optional"}
                    </span>
                  </li>
                )}
              </ul>
              <div className="mt-4 flex justify-between items-baseline border-t border-[#D4A94A]/40 pt-3">
                <span className="text-sm font-black text-[#0B3B5C] uppercase tracking-widest">
                  Estimated total
                </span>
                <span className="mono text-2xl font-black text-[#E86A3C]" data-testid="family-budget-grand-total">
                  ${totals.familyGrandTotal}
                </span>
              </div>
              <p className="mt-3 text-[10px] text-[#94a3b8] leading-relaxed">
                Ballpark for a party of four adults + kids. Actual on-site spend flexes — you order what you order, buy what you like. Everything except the tour is pay-as-you-go.
              </p>
            </div>

            <Link
              to={`/taxi?book=hourly-charter&driver=Reagan&stops=${totals.stopCount}&price=${totals.totalPrice}`}
              data-testid="nassau-reagan-pricing-cta"
              className="btn-shine mt-8 inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-7 py-3.5 text-sm font-bold hover:bg-[#d55a30] active:scale-95 shadow-[0_15px_35px_rgba(232,106,60,0.4)]"
            >
              Book this tour · ${totals.totalPrice} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-[#FBF7EF] to-white border border-[#D4A94A]/30 p-8 shadow-[0_10px_30px_rgba(212,169,74,0.1)]">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.28em] uppercase text-[#D4A94A] font-black">
              <Sparkles className="w-3 h-3" /> What's included
            </div>
            <ul className="mt-4 space-y-3">
              {[
                "Reagan or another Rox-trained driver if he's booked out",
                "AC-cooled SUV or van (up to 6 pax total)",
                "Bottled water for everyone",
                "Hotel or cruise-port pickup + drop-off",
                "Live narration in Reagan's voice — history, food, honest opinions",
                "Camera-friendly stops (he'll take the group photo)",
                "Free reshuffle if a stop is closed (Ardastra flamingo timing, mostly)",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#334155]">
                  <Camera className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Voice quote */}
      <section className="max-w-4xl mx-auto px-6 lg:px-10 py-20 text-center">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">
          In Reagan's words
        </div>
        <blockquote className="mt-6 serif text-3xl lg:text-4xl text-[#0B3B5C] leading-tight italic">
          "I don't drive you through Nassau. I bring Nassau to you — the shortcuts,
          the story about my grandmother selling straw on Bay Street in the 60s,
          the fish-fry lady who knows my name. Come see it."
        </blockquote>
        <div className="mt-6 text-xs uppercase tracking-widest text-[#94a3b8]">— Reagan · Nassau driver, 10+ years</div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-br from-[#0B3B5C] to-[#0B192C] text-white py-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-10 text-center">
          <Trophy className="w-10 h-10 mx-auto text-[#D4A94A]" />
          <h3 className="serif text-5xl lg:text-6xl mt-4 leading-tight">
            Ready when you are.
          </h3>
          <p className="mt-4 text-white/75 max-w-lg mx-auto leading-relaxed">
            Cruise ships park at Prince George Wharf. Hotel guests get picked up at the lobby. Either way, we'll be there before your first sip of coffee.
          </p>
          <Link
            to={`/taxi?book=hourly-charter&driver=Reagan&stops=${totals.stopCount}&price=${totals.totalPrice}`}
            data-testid="nassau-reagan-footer-cta"
            className="btn-shine mt-10 inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-8 py-4 text-base font-bold hover:bg-[#d55a30] active:scale-95 shadow-[0_20px_45px_rgba(232,106,60,0.5)]"
          >
            Book Reagan for this tour · ${totals.totalPrice} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Fact({ icon: Icon, label }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-2 backdrop-blur-sm">
      <Icon className="w-4 h-4 text-[#D4A94A]" />
      <span>{label}</span>
    </div>
  );
}
