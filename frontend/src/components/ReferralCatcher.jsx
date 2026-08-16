import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Gift, X } from "lucide-react";

/**
 * ReferralCatcher — global listener that lives inside Layout.
 *
 * Behaviour:
 *  1. On every navigation, scan `?ref=<code>&from=<name>` in the URL.
 *  2. If found, persist to localStorage so the discount survives page
 *     reloads and modal-based booking flows.
 *  3. Show a small dismissible ribbon so the recipient knows the 10%
 *     off code is live. The ribbon stays until they book or dismiss.
 *
 * The ribbon is opt-out (X button sets `rox_ref_dismissed = <code>`) so
 * we don't nag on repeat visits with the same code, but a NEW code from
 * a different friend re-shows.
 */
const REF_KEY = "rox_referral";
const DISMISS_KEY = "rox_ref_dismissed";

export default function ReferralCatcher() {
  const { search, pathname } = useLocation();
  const [banner, setBanner] = useState(null);

  // Capture from URL on every navigation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(search);
    const code = params.get("ref");
    const from = params.get("from") || "a friend";
    if (code) {
      try {
        localStorage.setItem(REF_KEY, JSON.stringify({ code, from, captured_at: Date.now() }));
      } catch { /* private mode — ignore */ }
    }
  }, [search]);

  // Read persisted referral on mount + when path changes so the ribbon
  // can show on any page after landing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(REF_KEY);
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (!raw) { setBanner(null); return; }
      const data = JSON.parse(raw);
      if (!data?.code) { setBanner(null); return; }
      if (dismissed && dismissed === data.code) { setBanner(null); return; }
      setBanner(data);
    } catch {
      setBanner(null);
    }
  }, [pathname]);

  if (!banner) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] sm:max-w-md rounded-full bg-gradient-to-r from-[#059669] to-[#047857] text-white px-4 sm:px-5 py-2.5 shadow-[0_20px_50px_rgba(5,150,105,0.35)] flex items-center gap-3"
      data-testid="referral-welcome-banner"
    >
      <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
        <Gift className="w-4 h-4" />
      </div>
      <div className="min-w-0 text-xs sm:text-sm leading-tight">
        <div className="font-black truncate">
          {banner.from} sent you 10% off
        </div>
        <div className="text-white/80 text-[10px] sm:text-[11px] truncate">
          Code <span className="mono font-bold">{banner.code}</span> auto-applies at checkout
        </div>
      </div>
      <Link
        to="/taxi"
        className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white text-[#047857] px-3 py-1.5 text-[11px] font-black hover:bg-[#F5E1A4] whitespace-nowrap"
        data-testid="referral-welcome-book-cta"
      >
        Book now
      </Link>
      <button
        type="button"
        onClick={() => {
          try { localStorage.setItem(DISMISS_KEY, banner.code); } catch { /* ignore */ }
          setBanner(null);
        }}
        aria-label="Dismiss referral banner"
        data-testid="referral-welcome-dismiss"
        className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
