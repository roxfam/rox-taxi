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
    <div className="bg-[#E86A3C] text-white text-xs sm:text-sm flex items-center" data-testid="welcome-offer-banner">
      <div className="flex-1 py-2 px-3 flex items-center justify-center gap-2 text-center">
        <Gift className="w-4 h-4 shrink-0" />
        <span className="font-semibold">Save 10% on your next ride</span>
        <Link to="/signup" className="underline font-bold hover:opacity-80 whitespace-nowrap" data-testid="welcome-offer-signup-link">Sign up</Link>
      </div>
      <button
        type="button"
        onClick={() => { localStorage.setItem(KEY, "1"); setHidden(true); }}
        className="px-3 opacity-80 hover:opacity-100"
        aria-label="Dismiss offer"
        data-testid="welcome-offer-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
