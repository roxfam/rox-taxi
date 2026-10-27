import { useState } from "react";
import { Link } from "react-router-dom";
import { Gift, X } from "lucide-react";
import { useAuth } from "../lib/auth";

const KEY = "rox_welcome_banner_dismissed";

const Message = ({ hidden }) => (
  <span className="inline-flex items-center gap-3 px-8 whitespace-nowrap" aria-hidden={hidden || undefined}>
    <Gift className="w-4 h-4 shrink-0" />
    <span className="font-semibold">Special offer: save 10% on your next ride when you sign up — limited-time offer.</span>
    <Link to="/signup" tabIndex={hidden ? -1 : undefined} className="underline font-bold hover:opacity-80" data-testid={hidden ? undefined : "welcome-offer-signup-link"}>Sign up</Link>
  </span>
);

export default function WelcomeOfferBanner() {
  const { user, loading } = useAuth();
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === "1");
  if (loading || user || hidden) return null;
  return (
    <div className="bg-[#E86A3C] text-white text-xs sm:text-sm flex items-center" data-testid="welcome-offer-banner">
      <div className="promo-marquee flex-1 overflow-hidden py-2">
        <div className="promo-marquee-track welcome-marquee-slow inline-flex">
          <Message /><Message hidden /><Message hidden /><Message hidden />
        </div>
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
