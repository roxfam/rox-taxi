import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { api, money } from "../lib/api";

// Sitewide dismissable banner — auto-shows whenever an active promo exists.
// Renders NOTHING when the /api/promotions feed is empty, so the admin
// toggle acts as the on/off switch. Dismiss state lives in sessionStorage
// (per-tab) so guests re-see the banner on their next visit.
const DISMISS_KEY = "rox-promo-banner-dismissed";

export default function PromoBanner() {
  const [promo, setPromo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) {
      setDismissed(true);
    }
    api.get("/promotions")
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) setPromo(data[0]);
      })
      .catch(() => {});
  }, []);

  if (!promo || dismissed) return null;

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

  return (
    <div
      className="relative bg-gradient-to-r from-[#D4A94A] via-[#c69938] to-[#A88235] text-[#0B192C] shadow-[0_2px_20px_rgba(212,169,74,0.35)]"
      data-testid="promo-banner"
      role="region"
      aria-label="Site-wide promotion"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-2.5 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span className="font-black uppercase tracking-widest text-xs sm:text-sm" data-testid="promo-banner-label">
            {label}
          </span>
          <span className="hidden sm:inline text-[#0B192C]/85 truncate">
            {promo.description || `${promo.label} — on ${scope}`}
          </span>
          {endsBadge && (
            <span className="hidden md:inline-flex items-center gap-1 rounded-full bg-[#0B192C]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
              {endsBadge}
            </span>
          )}
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
