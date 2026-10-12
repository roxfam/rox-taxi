import { BadgePercent } from "lucide-react";
import { useAuth } from "../lib/auth";

export const activeDiscount = (user) => {
  const d = user?.welcome_discount;
  if (!d || d.status !== "available") return null;
  if (d.expires_at && new Date(d.expires_at) <= new Date()) return null;
  return d;
};

export function DiscountBadge({ variant = "account" }) {
  const { user } = useAuth();
  const d = activeDiscount(user);
  if (!d) return null;
  const pct = d.pct || 10;
  const until = d.expires_at ? ` · valid until ${new Date(d.expires_at).toLocaleDateString()}` : "";
  if (variant === "checkout") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-[#ECFDF5] border border-[#059669]/30 px-3 py-2 text-xs text-[#065F46]" data-testid="checkout-discount-badge">
        <BadgePercent className="w-4 h-4 shrink-0 text-[#059669]" />
        <span><b>{pct}% off is waiting!</b> It comes off automatically when you confirm this booking.</span>
      </div>
    );
  }
  return (
    <div className="mt-6 relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#059669] to-[#0E7490] text-white p-5 flex items-center gap-4" data-testid="account-discount-badge">
      <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center shrink-0 animate-pulse">
        <BadgePercent className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <div className="serif text-xl">{pct}% off is waiting for you</div>
        <div className="text-xs text-white/80 mt-0.5">
          {d.source === "return_visit" ? "Our thank-you for your last visit." : "Your welcome gift for joining."} Applied automatically on your next booking{until}.
        </div>
      </div>
    </div>
  );
}
