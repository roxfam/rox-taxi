import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { api, money } from "../lib/api";

// Sitewide dismissable banner — auto-shows whenever an active promo exists.
// Renders NOTHING when the /api/promotions feed is empty, so the admin
// toggle acts as the on/off switch. The content strip animates as a
// continuous horizontal marquee for visibility. Dismiss state lives in
// sessionStorage (per-tab) so guests re-see the banner on their next visit.
const DISMISS_KEY = "rox-promo-banner-dismissed";

export default function PromoBanner() {
  const [promo, setPromo] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  // One-time-per-user enforcement — the moment the backend sees this
  // visitor has redeemed ANY promo (matched by IP or user_id), we hide
  // the banner permanently for them. Keeps the strip honest instead of
  // teasing a discount they can't use again.
  const [hasRedeemed, setHasRedeemed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) {
      setDismissed(true);
    }
    api.get("/promotions")
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) setPromo(data[0]);
      })
      .catch(() => {});
    api.get("/promo/status")
      .then(({ data }) => { if (data?.has_redeemed) setHasRedeemed(true); })
      .catch(() => {});
  }, []);

  if (!promo || dismissed || hasRedeemed) return null;

  const label = promo.discount_type === "percent"
    ? `${promo.discount_value}% OFF`
    : `${money(promo.discount_value)} OFF`;

  const scope = (promo.applies_to || []).includes("all")
    ? "everything"
    : (promo.applies_to || []).join(" · ");

  const endsBadge = (() => {
    if (!promo.ends_at) return null;
    try {
      const d = new Date(promo.ends_at);
      const days = Math.max(0, Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24)));
      if (days <= 0) return null;
      return days <= 1 ? "Ends today" : `Ends in ${days} days`;
    } catch { return null; }
  })();

  // Build a single logical message unit, then repeat it in the marquee so
  // the strip visually never runs out of content while scrolling.
  const message = promo.description || `${promo.label} — on ${scope}`;
  const unit = (
    <span className="inline-flex items-center gap-3 shrink-0 whitespace-nowrap">
      <Sparkles className="w-4 h-4" />
      <span className="font-black uppercase tracking-widest text-xs sm:text-sm">{label}</span>
      <span className="text-[#0B192C]/85">{message}</span>
      {endsBadge && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#0B192C]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
          {endsBadge}
        </span>
      )}
      <span className="text-[#0B192C]/40" aria-hidden>·</span>
    </span>
  );

  return (
    <div
      className="relative bg-gradient-to-r from-[#D4A94A] via-[#c69938] to-[#A88235] text-[#0B192C] shadow-[0_2px_20px_rgba(212,169,74,0.35)] overflow-hidden"
      data-testid="promo-banner"
      role="region"
      aria-label="Site-wide promotion"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-3 pl-6 lg:pl-10 pr-2">
        {/* Continuous scrolling marquee. Duplicated twice so the tail of the
            first copy meets the head of the second seamlessly. Respects
            prefers-reduced-motion (see global CSS override below). */}
        <div className="promo-marquee flex-1 overflow-hidden py-2.5" data-testid="promo-banner-marquee">
          <div className="promo-marquee-track inline-flex items-center gap-6 text-sm">
            <span data-testid="promo-banner-label" className="sr-only">{label}</span>
            {unit}{unit}{unit}{unit}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/taxi"
            className="inline-flex items-center gap-1 rounded-full bg-[#0B192C] hover:bg-black text-white text-xs font-bold px-3 py-1.5 active:scale-95"
            data-testid="promo-banner-cta"
          >
            Book now <ArrowRight className="w-3 h-3" />
          </Link>
          <button
            onClick={() => {
              try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
              setDismissed(true);
            }}
            className="w-6 h-6 rounded-full hover:bg-[#0B192C]/15 flex items-center justify-center"
            aria-label="Dismiss promotion banner"
            data-testid="promo-banner-dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
