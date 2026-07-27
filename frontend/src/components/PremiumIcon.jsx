import { motion } from "framer-motion";

/**
 * Premium icon "coin" — a layered, animated icon container used across the site
 * for a cohesive, elegant look. Combines a gradient face, glow ring, inner
 * highlight and subtle noise for depth.
 *
 * Usage:
 *   <PremiumIcon Icon={Car} tone="gold" size="md" />
 */

const TONES = {
  gold:   { from: "#F5E1A4", to: "#A88235", ring: "212,169,74",  glyph: "#FFFFFF" },
  orange: { from: "#F5A78B", to: "#B84920", ring: "232,106,60",  glyph: "#FFFFFF" },
  navy:   { from: "#3A6B94", to: "#0B192C", ring: "11,59,92",    glyph: "#FFFFFF" },
  teal:   { from: "#7FC7C3", to: "#0F6E6E", ring: "15,110,110",  glyph: "#FFFFFF" },
  sand:   { from: "#F8E9C8", to: "#C4A16B", ring: "196,161,107", glyph: "#0B192C" },
  slate:  { from: "#CBD5E1", to: "#475569", ring: "71,85,105",   glyph: "#FFFFFF" },
};

const SIZES = {
  sm: { box: "w-10 h-10 rounded-xl",  glyph: "w-4 h-4",  ring: "w-14 h-14 -inset-2" },
  md: { box: "w-14 h-14 rounded-2xl", glyph: "w-6 h-6",  ring: "w-20 h-20 -inset-3" },
  lg: { box: "w-20 h-20 rounded-[22px]", glyph: "w-8 h-8", ring: "w-28 h-28 -inset-4" },
  xl: { box: "w-24 h-24 rounded-[26px]", glyph: "w-10 h-10", ring: "w-32 h-32 -inset-4" },
};

export function PremiumIcon({
  Icon,
  tone = "gold",
  size = "md",
  className = "",
  spin = false,
  float = false,
  "data-testid": testid,
}) {
  const t = TONES[tone] || TONES.gold;
  const s = SIZES[size] || SIZES.md;

  return (
    <motion.span
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      whileHover={{ scale: 1.08, rotate: spin ? 8 : 0 }}
      animate={float ? { y: [0, -3, 0] } : undefined}
      transition={float ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
      data-testid={testid}
    >
      {/* soft outer glow ring */}
      <span
        className={`absolute ${s.ring} rounded-full opacity-40 blur-xl pointer-events-none`}
        style={{ background: `radial-gradient(circle, rgba(${t.ring},0.55), transparent 70%)` }}
      />
      {/* faceted gradient face */}
      <span
        className={`relative ${s.box} flex items-center justify-center shadow-[0_10px_28px_rgba(11,25,44,0.18)] overflow-hidden`}
        style={{
          background: `linear-gradient(140deg, ${t.from} 0%, ${t.to} 100%)`,
        }}
      >
        {/* inner top highlight */}
        <span
          className="absolute inset-x-0 top-0 h-1/2 opacity-45 pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.55), transparent)" }}
        />
        {/* subtle grain */}
        <span
          className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' seed='4'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")",
          }}
        />
        {/* icon */}
        <Icon className={`relative ${s.glyph}`} style={{ color: t.glyph, filter: "drop-shadow(0 2px 4px rgba(11,25,44,0.35))" }} strokeWidth={1.8} />
        {/* subtle inner ring */}
        <span
          className="absolute inset-[1px] rounded-[inherit] pointer-events-none"
          style={{
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.28), inset 0 -8px 20px rgba(0,0,0,0.15)",
          }}
        />
      </span>
    </motion.span>
  );
}

export default PremiumIcon;
