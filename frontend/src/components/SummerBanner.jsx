import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * SummerBanner — original orange promo strip, now with a scrolling marquee.
 * - Auto-hides after `endDate` (Aug 31 2026 by default).
 * - Remembers dismissal for 7 days in localStorage.
 * - Message row scrolls horizontally via the shared `.promo-marquee-track`
 *   keyframe in index.css (32s linear loop, pauses on hover, honours
 *   prefers-reduced-motion).
 * - "Book Now" CTA + dismiss (X) stay pinned on the right with a soft
 *   gradient fade so the scrolling text disappears cleanly behind them.
 */
const DISMISS_KEY = "rox_summer_banner_dismissed_until";
const END_DATE = new Date("2026-08-31T23:59:59-04:00");  // Nassau time

function daysUntil(endDate) {
  const ms = endDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
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

  // One "message unit" — duplicated twice inside the track so the -50%
  // marquee keyframe produces a perfectly seamless loop.
  const MessageUnit = ({ ariaHidden = false }) => (
    <span
      className="inline-flex items-center gap-3 px-6 shrink-0"
      aria-hidden={ariaHidden || undefined}
    >
      <span className="text-base md:text-lg select-none" aria-hidden>☀️</span>
      <span className="font-semibold text-[12px] md:text-sm whitespace-nowrap">
        Summer Special · Save 10% on every tour
      </span>
      <span className="text-[11px] md:text-xs text-white/90 whitespace-nowrap">
        Book by Aug 31 · code{" "}
        <span
          className="font-mono bg-white/20 px-1.5 py-0.5 rounded font-bold"
          data-testid={ariaHidden ? undefined : "summer-banner-code"}
        >
          SUMMER10
        </span>{" "}
        at checkout
        {daysLeft > 0 && daysLeft <= 60 && (
          <>
            {" · "}
            <span
              className="font-bold text-white bg-black/20 px-1.5 py-0.5 rounded"
              data-testid={ariaHidden ? undefined : "summer-banner-countdown"}
              aria-live={ariaHidden ? undefined : "polite"}
            >
              {daysLeft === 1 ? "Ends today" : `Ends in ${daysLeft}d`}
            </span>
          </>
        )}
      </span>
    </span>
  );

  return (
    <div
      data-testid="summer-banner"
      className="promo-marquee relative w-full overflow-hidden text-white shadow-md animate-in fade-in duration-500"
      style={{
        background: "linear-gradient(90deg, #E86A3C 0%, #F4A11C 50%, #E86A3C 100%)",
      }}
    >
      <div className="relative flex items-center py-1.5 md:py-2">
        {/* Scrolling message row */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="promo-marquee-track flex items-center whitespace-nowrap will-change-transform">
            <MessageUnit />
            <MessageUnit ariaHidden />
          </div>
        </div>

        {/* Pinned CTA + dismiss cluster with gradient fade behind it */}
        <div
          className="relative flex items-center gap-2 pl-6 pr-3 shrink-0"
          style={{
            background:
              "linear-gradient(to left, #E86A3C 40%, rgba(232,106,60,0.85) 70%, transparent 100%)",
          }}
        >
          <button
            onClick={goBook}
            data-testid="summer-banner-cta"
            className="whitespace-nowrap bg-white text-orange-700 font-bold text-[11px] md:text-xs px-3 md:px-3.5 py-1 rounded-full hover:bg-orange-50 transition-colors"
          >
            Book Now →
          </button>
          <button
            onClick={dismiss}
            data-testid="summer-banner-dismiss"
            aria-label="Dismiss banner"
            className="text-white/80 hover:text-white p-0.5 -mr-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
