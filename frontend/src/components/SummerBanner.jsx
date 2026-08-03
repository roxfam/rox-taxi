import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * SummerBanner — dismissible full-width promo strip shown site-wide (except /admin).
 * - Auto-hides after `endDate` (Aug 31 2026 by default)
 * - Remembers dismissal for 7 days in localStorage
 * - Fades in 400ms after mount so it doesn't punch the hero above the fold
 * - <15KB, no dependencies beyond lucide-react (already in package.json)
 */
const DISMISS_KEY = "rox_summer_banner_dismissed_until";
const END_DATE = new Date("2026-08-31T23:59:59-04:00");   // Nassau time

function daysUntil(endDate) {
  const ms = endDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export default function SummerBanner() {
  const [visible, setVisible] = useState(false);
  const [daysLeft, setDaysLeft] = useState(() => daysUntil(END_DATE));

  useEffect(() => {
    // Hide on admin pages
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) return;
    // Hide if past end date
    if (new Date() > END_DATE) return;
    // Hide if dismissed within the last 7 days
    const dismissedUntil = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    if (Date.now() < dismissedUntil) return;

    // Delay 400ms so the hero renders first
    const t = setTimeout(() => setVisible(true), 400);
    // Re-compute days-left every hour so a browser left open overnight ticks down
    const tick = setInterval(() => setDaysLeft(daysUntil(END_DATE)), 60 * 60 * 1000);
    return () => { clearTimeout(t); clearInterval(tick); };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setVisible(false);
  }

  function goBook() {
    // Copy code, then send them to the tours page
    try { navigator.clipboard?.writeText("SUMMER10"); } catch {}
    window.location.href = "/tours";
  }

  if (!visible) return null;

  return (
    <div
      data-testid="summer-banner"
      className="w-full text-white shadow-md animate-in fade-in duration-500"
      style={{
        background: "linear-gradient(90deg, #E86A3C 0%, #F4A11C 50%, #E86A3C 100%)",
      }}
    >
      <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 py-2.5 md:py-3">
        <span className="text-lg md:text-xl select-none" aria-hidden>☀️</span>
        <div className="flex-1 flex flex-col md:flex-row md:items-baseline md:gap-3">
          <span className="font-semibold text-sm md:text-base">
            Summer Special · Save 10% on every tour
          </span>
          <span className="text-xs md:text-sm text-white/90">
            Book by Aug 31 · code{" "}
            <span
              className="font-mono bg-white/20 px-1.5 py-0.5 rounded font-bold"
              data-testid="summer-banner-code"
            >
              SUMMER10
            </span>{" "}
            at checkout
            {daysLeft > 0 && daysLeft <= 60 && (
              <>
                {" · "}
                <span
                  className="font-bold text-white bg-black/20 px-1.5 py-0.5 rounded animate-pulse"
                  data-testid="summer-banner-countdown"
                  aria-live="polite"
                >
                  {daysLeft === 1 ? "Ends today" : `Ends in ${daysLeft}d`}
                </span>
              </>
            )}
          </span>
        </div>
        <button
          onClick={goBook}
          data-testid="summer-banner-cta"
          className="whitespace-nowrap bg-white text-orange-700 font-bold text-xs md:text-sm px-3 md:px-4 py-1.5 rounded-full hover:bg-orange-50 transition-colors"
        >
          Book Now →
        </button>
        <button
          onClick={dismiss}
          data-testid="summer-banner-dismiss"
          aria-label="Dismiss banner"
          className="text-white/80 hover:text-white p-1 -mr-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
