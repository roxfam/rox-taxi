import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Clock, MapPin, Users, Star, Shell, Camera, ShoppingBag, Utensils, Trophy, Sparkles, Palmtree, Info, Wallet, Waves, Landmark, Cake, Factory } from "lucide-react";
import ReaganRouteMap from "../components/ReaganRouteMap";

/**
 * NassauWithReagan — signature 4-hour city tour built around our best
 * driver. Written in Reagan's voice, single scroll, hard CTA that deep-
 * links into /taxi?book=hourly-charter&driver=Reagan so the booking
 * modal pops with the hourly charter + "Request Reagan" pre-checked.
 * SEO-defensible landing (nobody else has a "Nassau with Reagan" tour).
 */

const STOPS = [
  {
    icon: Shell,
    title: "Fort Fincastle + Queen's Staircase",
    body:
      "We start at the top — 66 hand-carved limestone steps and a hilltop fort with the best downtown view. I'll tell you why the Queen never actually walked them (spoiler: the name came later).",
    minutes: 30,
  },
  {
    icon: ShoppingBag,
    title: "Bay Street strip",
    body:
      "Straw Market, colonial architecture, and the pastel row where every cruise-day photo happens. I know which shops give a real haggle vs the ones selling factory-made 'Bahamian' straw.",
    minutes: 30,
  },
  {
    icon: Factory,
    title: "Graycliff Cigar & Chocolate Factory",
    body:
      "Working cigar-rolling floor above West Hill Street where you'll watch Cuban-trained torcedores hand-roll each stick, then across the courtyard to the Graycliff Chocolatier where the truffles are moulded in small batches. Both floors are free to walk through with Reagan.",
    minutes: 20,
    included_note: "Factory walk-through free · included in the tour",
    paid_separately: {
      label: "Cigars & chocolates are pay-as-you-go",
      detail: "Single hand-rolled cigars from ~$10, sampler 5-packs ~$40, boxes $150+. Chocolate bars ~$8, filled truffle boxes ~$20–$45. Pay at the boutique counter — cash or card.",
    },
  },
  {
    icon: Cake,
    title: "Bahamas Rum Cake Factory",
    body:
      "A quick walk through the working bakery at 602 East Bay Street where they've been small-batch baking and rum-curing cakes since 1978. Free samples at the counter across a dozen flavours — Original, Pineapple, Chocolate, Key Lime, Kentucky Bourbon, Irish Cream and more. Every cake is vacuum-sealed and cleared for carry-on.",
    minutes: 20,
    included_note: "Walk-in free · tasting samples included",
    paid_separately: {
      label: "Cakes to take home are pay-as-you-go",
      detail: "Singles from $7 (12+ flavours) · 4 oz six-pack samplers ~$37.75 · 20 oz two-pack bundles ~$39.58. Vacuum-sealed for the plane home — no refrigeration needed. Cash or card at the counter.",
    },
  },
  {
    icon: Utensils,
    title: "Arawak Cay Fish Fry",
    body:
      "Native seafood shacks on stilts over the water. Twin Brothers or Oh Andros — I'll rank them for you honestly. Conch fritters, cracked lobster, Kalik cold enough to hurt your teeth.",
    minutes: 45,
    paid_separately: {
      label: "Food + drinks paid separately",
      detail: "Typical plates run $15–$35 per person at the shack. Cash preferred; most take card. Order at your own pace.",
    },
  },
  {
    icon: Palmtree,
    title: "Ardastra Gardens flamingos",
    body:
      "The marching flamingo show has run since 1957 and it still stops kids in their tracks. Best photo op on the island — we hit the 2 PM performance if timing works.",
    minutes: 45,
    paid_separately: {
      label: "Admission paid separately",
      detail: "Adults $18 · Children (4–12) $9 · Under 4 free. Pay at the gate on the day. We help you time the 10:15 AM · 2:15 PM · 4:15 PM flamingo march.",
    },
  },
  {
    icon: Landmark,
    title: "Fort Montagu + beach",
    body:
      "The oldest fort on New Providence (1741) — quieter than Fincastle, and the crescent beach next to it is where locals actually swim. Great for wading kids and a quick stretch of your legs.",
    minutes: 20,
    included_note: "Free to visit · included in the tour",
  },
  {
    icon: Waves,
    title: "Atlantis self-tour (Paradise Island)",
    body:
      "Reagan drops you at the Coral Tower entrance and points you through the free public spaces — the Great Hall of Waters lobby, the grand staircase, Marina Village, and the beach boardwalk. Meet back at the van in 30 minutes with time to spare.",
    minutes: 30,
    included_note: "Free lobby + public areas · included in the tour",
    paid_separately: {
      label: "Marine Habitat (aquarium) admission is separate",
      detail: "If you want to see the Ruins Lagoon, sharks and rays, day passes run $50+ per person at the guest-services desk — optional, book on-site.",
    },
  },
];

export default function NassauWithReagan() {
  useEffect(() => {
    document.title = "Nassau with Reagan · Signature 8-stop city tour · Rox Taxi";
  }, []);

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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#D4A94A] to-[#c99738] text-white text-[10px] uppercase tracking-widest font-black px-3 py-1.5 shadow-[0_10px_25px_rgba(212,169,74,0.4)]">
              <Trophy className="w-3 h-3" /> Signature tour · with Reagan
            </div>
            <h1 className="serif text-6xl sm:text-7xl lg:text-8xl mt-6 leading-[0.95]">
              Nassau,<br />the way <span className="text-[#D4A94A]">Reagan</span> tells it.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/85 leading-relaxed">
              About four hours. Eight stops. One driver who's spent a decade turning cruise-day guests into repeat customers — and gets his name dropped in half the Google reviews we get.
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
              <Fact icon={Clock} label="~4 hours" />
              <Fact icon={Users} label="Up to 4 guests" />
              <Fact icon={MapPin} label="Pickup: your hotel or cruise port" />
              <Fact icon={Star} label="5.0★ on Google" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Itinerary */}
      <section className="max-w-5xl mx-auto px-6 lg:px-10 py-20">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">
          The route
        </div>
        <h2 className="serif text-5xl lg:text-6xl text-[#0B3B5C] mt-2 leading-tight">
          Eight stops. Zero tourist traps.
        </h2>
        <p className="mt-4 text-[#334155] max-w-2xl leading-relaxed">
          Reagan builds this route around whichever of you shows up — kids, foodies, first-timers, repeat cruisers. Timings flex; the flavours don't.
        </p>

        <div className="mt-12 space-y-6">
          {STOPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              data-testid={`nassau-reagan-stop-${i}`}
              className="grid md:grid-cols-[80px,1fr,auto] gap-6 md:items-center rounded-2xl bg-white border border-[#EFE7D5] p-6 shadow-[0_10px_25px_rgba(212,169,74,0.06)] hover:shadow-[0_15px_35px_rgba(212,169,74,0.12)] transition-shadow"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FBF7EF] to-white border border-[#D4A94A]/30 flex items-center justify-center text-[#D4A94A] shrink-0">
                <s.icon className="w-7 h-7" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-black">
                  Stop {i + 1}
                </div>
                <h3 className="serif text-2xl text-[#0B3B5C] mt-1 leading-tight">{s.title}</h3>
                <p className="text-sm text-[#334155] mt-2 leading-relaxed">{s.body}</p>
                {s.included_note && (
                  <div
                    data-testid={`nassau-reagan-stop-${i}-included`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#059669]/10 border border-[#059669]/30 px-3 py-1 text-[10px] uppercase tracking-widest font-black text-[#047857]"
                  >
                    <Sparkles className="w-3 h-3" /> {s.included_note}
                  </div>
                )}
                {s.paid_separately && (
                  <div
                    data-testid={`nassau-reagan-stop-${i}-paid-separately`}
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
              <div className="text-right">
                <div className="mono font-bold text-2xl text-[#D4A94A]">~{s.minutes}m</div>
                <div className="text-[10px] uppercase tracking-widest text-[#94a3b8]">on the ground</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Illustrated route map — hand-drawn schematic showing the 8-stop
          loop so guests can visualise the day before booking. */}
      <ReaganRouteMap />

      {/* Pricing + What's Included */}
      <section className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 grid lg:grid-cols-2 gap-10">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">
              Simple, honest pricing
            </div>
            <h2 className="serif text-5xl text-[#0B3B5C] mt-2 leading-tight">
              $225 flat.
            </h2>
            <div className="mt-4 space-y-3 text-[#334155] leading-relaxed">
              <p>
                About four hours of private driving, up to 4 guests. Not $99-per-person that tacks on to $600 for a family — one flat rate, one driver, one honest handshake.
              </p>
              <p>
                <span className="mono font-bold text-[#E86A3C]">+$30</span> for each extra guest above 4 (up to 6 total in an SUV).
              </p>
            </div>

            {/* Paid-separately callout — Fish Fry meals + Ardastra admission
                + optional Atlantis aquarium are not bundled into the $225 flat
                so families can opt in per head. Fort Montagu + the Atlantis
                self-walk + the Rum Cake Factory tasting are always included.
                Keeps the flat rate honest. */}
            <div
              className="mt-6 rounded-2xl bg-[#FBF7EF] border border-[#D4A94A]/40 p-5"
              data-testid="nassau-reagan-paid-separately-callout"
            >
              <div className="flex items-center gap-2 text-[10px] tracking-[0.28em] uppercase text-[#D4A94A] font-black">
                <Info className="w-3 h-3" /> Paid separately (per person)
              </div>
              <ul className="mt-3 space-y-2.5 text-sm text-[#334155]">
                <li className="flex items-start gap-2.5">
                  <Factory className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />
                  <span>
                    <span className="font-bold text-[#0B3B5C]">Graycliff cigars & chocolates</span>{" "}
                    — factory walk-through is free. Single cigars from{" "}
                    <span className="mono font-bold text-[#E86A3C]">$10</span>, chocolate bars from{" "}
                    <span className="mono font-bold text-[#E86A3C]">$8</span>. Buy only what you want.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Utensils className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />
                  <span>
                    <span className="font-bold text-[#0B3B5C]">Fish Fry meals & drinks</span>{" "}
                    — order what you want at the shack. Plates run{" "}
                    <span className="mono font-bold text-[#E86A3C]">$15–$35</span> per person.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Palmtree className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />
                  <span>
                    <span className="font-bold text-[#0B3B5C]">Ardastra Gardens admission</span>{" "}
                    — <span className="mono font-bold text-[#E86A3C]">$18</span> adults ·{" "}
                    <span className="mono font-bold text-[#E86A3C]">$9</span> children (4–12) ·{" "}
                    under 4 free. Pay at the gate.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Waves className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />
                  <span>
                    <span className="font-bold text-[#0B3B5C]">Atlantis Marine Habitat (optional)</span>{" "}
                    — the Atlantis self-walk is <em>included</em>. Only the aquarium
                    day-pass costs extra (<span className="mono font-bold text-[#E86A3C]">$50+</span> pp at the on-site guest-services desk).
                  </span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-[#64748B] leading-relaxed">
                Skip any stop and Reagan swaps in a beach photo op or a straw-market run — no
                penalty, no repricing. Fort Montagu + the Atlantis self-walk are always free.
              </p>
            </div>

            <Link
              to="/taxi?book=hourly-charter&driver=Reagan"
              data-testid="nassau-reagan-pricing-cta"
              className="btn-shine mt-8 inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-7 py-3.5 text-sm font-bold hover:bg-[#d55a30] active:scale-95 shadow-[0_15px_35px_rgba(232,106,60,0.4)]"
            >
              Book this tour <ArrowRight className="w-4 h-4" />
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
            to="/taxi?book=hourly-charter&driver=Reagan"
            data-testid="nassau-reagan-footer-cta"
            className="btn-shine mt-10 inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-8 py-4 text-base font-bold hover:bg-[#d55a30] active:scale-95 shadow-[0_20px_45px_rgba(232,106,60,0.5)]"
          >
            Book Reagan for this tour <ArrowRight className="w-4 h-4" />
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
