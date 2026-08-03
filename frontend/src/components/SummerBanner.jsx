import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";

/**
 * SummerBanner — thin, fancy, scrolling summer-promo strip shown site-wide
 * (except /admin).
 *
 * Design:
 *  - Ultra-thin (h ≈ 32px) so it never fights the hero above the fold.
 *  - Deep navy base with a slow animated gold shimmer overlay.
 *  - The message row scrolls horizontally (marquee) using the existing
 *    `.promo-marquee-track` keyframe in index.css (32s linear loop,
 *    pauses on hover, respects prefers-reduced-motion).
 *  - "Book Now" CTA + dismiss (X) stay pinned to the right with a soft
 *    gradient fade so the scrolling text disappears cleanly behind them.
 *
 * Behaviour:
 *  - Auto-hides after `END_DATE` (Aug 31 2026, Nassau time)
 *  - Remembers dismissal for 7 days in localStorage
 *  - Days-remaining pill in the marquee ticks down hourly
 */
const DISMISS_KEY = "rox_summer_banner_dismissed_until";
const END_DATE = new Date("2026-08-31T23:59:59-04:00");

function daysUntil(endDate) {
  const ms = endDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// Marquee content items — kept short + varied so the scroll feels alive.
// Duplicated inline below to guarantee a seamless -50% loop.
function messageItems(daysLeft) {
  const countdown =
    daysLeft === 0 ? "Ends today" : daysLeft === 1 ? "Ends in 1 day" : `Ends in ${daysLeft} days`;
  return [
    { icon: "☀️", text: "Summer Special · Save 10% on every tour" },
    { icon: "🐚", text: "Use code SUMMER10 at checkout", codePill: "SUMMER10" },
    { icon: "⏳", text: countdown, urgent: true },
    { icon: "🏝️", text: "Free cancellation up to 24 hours" },
    { icon: "🚕", text: "Cruise-port pickups, kids under 3 ride free" },
    { icon: "⭐", text: "4.9 average from 2,400+ Bahamas guests" },
    { icon: "🌊", text: "Blue Lagoon · Atlantis · Rose Island reefs" },
  ];
}

export default function SummerBanner() {
  const [visible, setVisible] = useState(false);
  const [daysLeft, setDaysLeft] = useState(() => daysUntil(END_DATE));

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) return;
    if (new Date() > END_DATE) return;
    const dismissedUntil = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    if (Date.now() < dismissedUntil) return;
    const t = setTimeout(() => setVisible(true), 400);
    const tick = setInterval(() => setDaysLeft(daysUntil(END_DATE)), 60 * 60 * 1000);
    return () => { clearTimeout(t); clearInterval(tick); };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setVisible(false);
  }

  function goBook() {
    try { navigator.clipboard?.writeText("SUMMER10"); } catch {}
    window.location.href = "/tours";
  }

  if (!visible) return null;

  const items = messageItems(daysLeft);
  // We render the item list twice back-to-back — the marquee keyframe scrolls
  // the flex row by -50%, so pass #2 slides in exactly as pass #1 leaves.
  const looped = [...items, ...items];

  return (
    <div
      data-testid="summer-banner"
      className="promo-marquee relative w-full overflow-hidden text-white animate-in fade-in duration-500"
      role="region"
      aria-label="Summer promotion"
      style={{
        background:
          "linear-gradient(90deg, #0B192C 0%, #0B3B5C 50%, #0B192C 100%)",
        boxShadow: "0 1px 0 rgba(212,169,74,0.35) inset, 0 -1px 0 rgba(212,169,74,0.35) inset",
      }}
    >
      {/* Animated gold shimmer overlay — a soft diagonal sheen that drifts
          across the strip on a 6s loop. Adds fancy without noise. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, transparent 30%, rgba(212,169,74,0.18) 45%, rgba(255,255,255,0.14) 50%, rgba(212,169,74,0.18) 55%, transparent 70%)",
          backgroundSize: "220% 100%",
          animation: "shimmer-sheen 6s linear infinite",
        }}
      />
      <style
        // Local keyframe — piggybacks on existing promo-scroll but adds our
        // own diagonal-sheen loop for the fancy sparkle effect.
        dangerouslySetInnerHTML={{
          __html:
            "@keyframes shimmer-sheen{0%{background-position:200% 0}100%{background-position:-200% 0}}",
        }}
      />

      <div className="relative flex items-center h-8 sm:h-9">
        {/* Scrolling marquee — pauses on hover (from .promo-marquee CSS) */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="promo-marquee-track flex items-center gap-0 whitespace-nowrap will-change-transform">
            {looped.map((it, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 px-5 text-[12px] sm:text-[13px] font-medium tracking-wide"
              >
                <span className="text-[13px] sm:text-[14px] select-none" aria-hidden>
                  {it.icon}
                </span>
                <span className={it.urgent ? "text-[#FBE9B1] font-semibold" : "text-white/95"}>
                  {it.text}
                </span>
                {it.codePill && (
                  <span
                    className="font-mono font-bold text-[11px] sm:text-[12px] tracking-wider text-[#0B192C] bg-gradient-to-b from-[#F5D57B] to-[#D4A94A] px-2 py-[1px] rounded-full shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_2px_6px_rgba(212,169,74,0.35)]"
                    data-testid={i === 1 ? "summer-banner-code" : undefined}
                  >
                    {it.codePill}
                  </span>
                )}
                {/* Sparkle divider between items */}
                <Sparkles
                  className="w-3 h-3 ml-3 text-[#D4A94A]/70 shrink-0"
                  aria-hidden
                />
              </span>
            ))}
          </div>
        </div>

        {/* Pinned CTA + dismiss cluster — sits above the marquee with a soft
            navy→transparent gradient fade so text scrolls out cleanly behind it. */}
        <div className="relative flex items-center gap-1.5 pr-2 sm:pr-3 pl-6 shrink-0"
          style={{
            background:
              "linear-gradient(to left, #0B192C 40%, rgba(11,25,44,0.9) 70%, transparent 100%)",
          }}
        >
          <span
            className="hidden md:inline text-[10px] uppercase tracking-[0.18em] font-bold text-[#D4A94A]"
            data-testid="summer-banner-countdown"
            aria-live="polite"
          >
            {daysLeft === 0 ? "Ends today" : `${daysLeft}d left`}
          </span>
          <button
            onClick={goBook}
            data-testid="summer-banner-cta"
            className="whitespace-nowrap inline-flex items-center gap-1 text-[11px] sm:text-[12px] font-bold tracking-wide text-[#0B192C] bg-gradient-to-b from-[#F5D57B] to-[#D4A94A] hover:from-[#F8DE8E] hover:to-[#E5BC5A] active:scale-95 transition-all px-3 py-[5px] rounded-full shadow-[0_2px_8px_rgba(212,169,74,0.4)]"
          >
            Book Now
            <span aria-hidden>→</span>
          </button>
          <button
            onClick={dismiss}
            data-testid="summer-banner-dismiss"
            aria-label="Dismiss summer promotion"
            className="text-white/60 hover:text-white p-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
