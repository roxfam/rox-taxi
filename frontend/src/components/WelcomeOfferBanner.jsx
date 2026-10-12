import { useState } from "react";
import { Link } from "react-router-dom";
import { Gift, X } from "lucide-react";
import { useAuth } from "../lib/auth";

const KEY = "rox_welcome_banner_dismissed";

export default function WelcomeOfferBanner() {
  const { user, loading } = useAuth();
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === "1");
  if (loading || user || hidden) return null;
  return (
    <div className="bg-[#E86A3C] text-white text-xs sm:text-sm" data-testid="welcome-offer-banner">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3">
        <Gift className="w-4 h-4 shrink-0" />
        <span className="font-semibold">Special offer: save 10% on your next ride when you sign up — one-time offer.</span>
        <Link to="/signup" className="underline font-bold whitespace-nowrap hover:opacity-80" data-testid="welcome-offer-signup-link">Sign up</Link>
        <button
          type="button"
          onClick={() => { localStorage.setItem(KEY, "1"); setHidden(true); }}
          className="ml-1 opacity-80 hover:opacity-100"
          aria-label="Dismiss offer"
          data-testid="welcome-offer-dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
