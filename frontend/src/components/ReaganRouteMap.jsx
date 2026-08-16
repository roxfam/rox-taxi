import { motion } from "framer-motion";

/**
 * ReaganRouteMap — stylised illustrative map of the 8-stop "Nassau with
 * Reagan" tour loop. NOT a real geographic map (that would need Google
 * Maps + a key restriction unlock) — it's a hand-drawn schematic that
 * matches the ROUGH layout of New Providence + Paradise Island so guests
 * get a feel for where each stop sits before booking.
 *
 * Colour code: green pins = included in the flat rate · gold pins = paid
 * separately on-site.
 */

// SVG viewBox 800×420. Coordinates are illustrative — chosen to keep the
// route legible, not GPS-accurate. Stops ordered as they appear on the tour.
const STOPS = [
  { n: 1, x: 300, y: 195, name: "Fort Fincastle",     cat: "included",  labelPos: "left" },
  { n: 2, x: 260, y: 220, name: "Graycliff",          cat: "paid",      labelPos: "left" },
  { n: 3, x: 355, y: 240, name: "Bay Street",         cat: "included",  labelPos: "bottom" },
  { n: 4, x: 205, y: 285, name: "Fish Fry",           cat: "paid",      labelPos: "bottom" },
  { n: 5, x: 165, y: 340, name: "Ardastra Gardens",   cat: "paid",      labelPos: "bottom" },
  { n: 6, x: 95,  y: 265, name: "Cable Beach",        cat: "optional",  labelPos: "left" },
  { n: 7, x: 415, y: 235, name: "Rum Cake Factory",   cat: "paid",      labelPos: "bottom" },
  { n: 8, x: 545, y: 265, name: "Fort Montagu",       cat: "included",  labelPos: "bottom" },
  { n: 9, x: 645, y: 130, name: "Atlantis",           cat: "included",  labelPos: "top" },
];

// Route line as an SVG path — hits every stop in tour order with gentle
// curves so it looks like a scenic drive: downtown → west sweep (with
// optional beach detour) → back east → Paradise Island via bridge.
const ROUTE_PATH = [
  "M 300 195",             // 1 Fort Fincastle
  "Q 280 205 260 220",     // → 2 Graycliff (short SW hop, downtown-west)
  "Q 300 235 355 240",     // → 3 Bay Street (east strip)
  "Q 275 265 205 285",     // → 4 Fish Fry (west swing)
  "Q 175 315 165 340",     // → 5 Ardastra (SW dip)
  "Q 120 315 95 265",      // → 6 Cable Beach (further west, NW to coast)
  "Q 260 260 415 235",     // → 7 Rum Cake Factory (big east swing back)
  "Q 490 250 545 265",     // → 8 Fort Montagu (further east)
  "Q 620 200 645 130",     // → 9 Atlantis (NE, over Paradise Bridge)
].join(" ");

const PIN_COLOR = {
  included: { fill: "#059669", ring: "#A7F3D0" },
  paid:     { fill: "#D4A94A", ring: "#F5E1A4" },
  // Optional stops render with a dashed outer ring so guests can tell
  // "opt-in" apart from mandatory route pins at a glance.
  optional: { fill: "#0B3B5C", ring: "#CBD5E1" },
};

export default function ReaganRouteMap() {
  return (
    <section
      className="max-w-5xl mx-auto px-6 lg:px-10 pb-20"
      data-testid="reagan-route-map"
    >
      <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">
        The route, at a glance
      </div>
      <h2 className="serif text-4xl lg:text-5xl text-[#0B3B5C] mt-2 leading-tight">
        Downtown → west → east → back.
      </h2>
      <p className="mt-3 text-[#334155] max-w-2xl leading-relaxed">
        A rough map of how the day flows — start downtown, sweep west to the Fish Fry, dip south to the flamingos (with an optional Cable Beach detour), then loop back east to Fort Montagu and over the Paradise Bridge to Atlantis.
      </p>

      <div className="mt-8 rounded-3xl bg-gradient-to-br from-[#FBF7EF] via-white to-[#FBF7EF] border border-[#D4A94A]/30 p-4 sm:p-6 shadow-[0_20px_45px_rgba(212,169,74,0.08)]">
        <svg
          viewBox="0 0 800 420"
          className="w-full h-auto"
          role="img"
          aria-label="Illustrative map of the 8-stop Nassau with Reagan tour route"
          data-testid="reagan-route-map-svg"
        >
          <defs>
            {/* Water — soft turquoise gradient for the ocean around the islands */}
            <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#DBEAFE" />
              <stop offset="100%" stopColor="#BFDBFE" />
            </linearGradient>
            {/* Land — warm cream to match brand */}
            <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FEF3C7" />
              <stop offset="100%" stopColor="#FDE68A" />
            </linearGradient>
          </defs>

          {/* Ocean backdrop */}
          <rect width="800" height="420" fill="url(#water)" rx="18" />

          {/* Faint wave marks */}
          {[60, 100, 380, 400].map((y, i) => (
            <path
              key={i}
              d={`M 20 ${y} q 20 -6 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0`}
              stroke="#93C5FD"
              strokeWidth="1"
              fill="none"
              opacity="0.55"
            />
          ))}

          {/* New Providence coastline — big oval-ish island filling most
              of the map with a bite taken out of the top for the harbour */}
          <path
            d="M 40 200
               Q 100 130 220 130
               Q 320 110 400 145
               Q 460 108 540 130
               Q 640 115 720 175
               Q 760 220 740 300
               Q 700 380 560 395
               Q 400 415 240 395
               Q 100 380 60 320
               Q 30 260 40 200 Z"
            fill="url(#land)"
            stroke="#F59E0B"
            strokeWidth="1.5"
            opacity="0.9"
          />

          {/* Paradise Island — small island above, connected by a bridge */}
          <path
            d="M 560 60
               Q 620 40 700 55
               Q 730 75 720 105
               Q 680 125 600 115
               Q 555 105 550 85
               Q 545 70 560 60 Z"
            fill="url(#land)"
            stroke="#F59E0B"
            strokeWidth="1.5"
            opacity="0.9"
          />

          {/* Bridge — thin gold line spanning the harbour between the islands */}
          <line x1="605" y1="120" x2="605" y2="145" stroke="#0B3B5C" strokeWidth="2" strokeDasharray="3 2" />
          <text x="612" y="138" fontSize="9" fill="#0B3B5C" fontWeight="700">Paradise Bridge</text>

          {/* Compass rose — top-right corner, decorative only */}
          <g transform="translate(725 40)">
            <circle r="18" fill="white" stroke="#D4A94A" strokeWidth="1.5" />
            <polygon points="0,-14 4,0 0,14 -4,0" fill="#0B3B5C" />
            <text x="0" y="-22" fontSize="9" fontWeight="900" fill="#0B3B5C" textAnchor="middle">N</text>
          </g>

          {/* Route line — animated dashed path that traces the tour order */}
          <motion.path
            d={ROUTE_PATH}
            fill="none"
            stroke="#E86A3C"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="8 6"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 0.9 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 2.4, ease: "easeInOut" }}
          />

          {/* Numbered pins + labels — pins render on top of the route line.
              Optional stops get a dashed outer ring for at-a-glance opt-in
              hierarchy vs the mandatory route pins. */}
          {STOPS.map((s, i) => {
            const c = PIN_COLOR[s.cat];
            const isOptional = s.cat === "optional";
            let lx = s.x;
            let ly = s.y;
            let anchor = "middle";
            if (s.labelPos === "top")    { ly = s.y - 20; }
            if (s.labelPos === "bottom") { ly = s.y + 30; }
            if (s.labelPos === "left")   { lx = s.x - 18; ly = s.y + 4; anchor = "end"; }
            if (s.labelPos === "right")  { lx = s.x + 18; ly = s.y + 4; anchor = "start"; }
            return (
              <motion.g
                key={s.n}
                initial={{ opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: 0.4 + i * 0.15 }}
                data-testid={`reagan-route-pin-${s.n}`}
              >
                {/* Halo ring — dashed for optional stops */}
                <circle
                  cx={s.x}
                  cy={s.y}
                  r="14"
                  fill={c.ring}
                  opacity={isOptional ? 0.9 : 0.75}
                  stroke={isOptional ? "#0B3B5C" : "none"}
                  strokeWidth={isOptional ? 1.2 : 0}
                  strokeDasharray={isOptional ? "3 2" : ""}
                />
                {/* Main pin */}
                <circle cx={s.x} cy={s.y} r="10" fill={c.fill} stroke="white" strokeWidth="2.5" />
                <text
                  x={s.x}
                  y={s.y + 3.5}
                  fontSize="11"
                  fontWeight="900"
                  fill="white"
                  textAnchor="middle"
                >
                  {s.n}
                </text>
                {/* Stop label */}
                <text
                  x={lx}
                  y={ly}
                  fontSize="11"
                  fontWeight="800"
                  fill="#0B3B5C"
                  textAnchor={anchor}
                  style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3, strokeLinejoin: "round" }}
                >
                  {s.name}
                </text>
              </motion.g>
            );
          })}
        </svg>

        {/* Legend below the map */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs" data-testid="reagan-route-map-legend">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-[#059669] border-2 border-white ring-1 ring-[#059669]/30" />
            <span className="text-[#334155]">
              <span className="font-bold text-[#0B3B5C]">Included</span> in the $225 flat
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-[#D4A94A] border-2 border-white ring-1 ring-[#D4A94A]/30" />
            <span className="text-[#334155]">
              <span className="font-bold text-[#0B3B5C]">Optional / paid</span> on-site
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full bg-[#0B3B5C] border-2 border-white"
              style={{ boxShadow: "0 0 0 1px #0B3B5C", borderStyle: "dashed" }}
            />
            <span className="text-[#334155]">
              <span className="font-bold text-[#0B3B5C]">Cable Beach</span> — opt in on the day
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-5 h-[3px] bg-[#E86A3C] rounded-full" style={{ backgroundImage: "repeating-linear-gradient(90deg, #E86A3C 0 6px, transparent 6px 10px)" }} />
            <span className="text-[#334155]">Route order (1 → 9)</span>
          </div>
        </div>

        <div className="mt-3 text-center text-[10px] tracking-widest uppercase text-[#94a3b8]">
          Not to scale · illustrative loop
        </div>
      </div>
    </section>
  );
}
