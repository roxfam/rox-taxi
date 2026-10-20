import { Check, Lock, ShieldCheck, BadgeCheck } from "lucide-react";

const STEPS = ["Trip details", "Payment", "Confirmed"];

// Branded checkout progress bar (current = 0..2).
export const CheckoutSteps = ({ current = 1 }) => (
  <ol className="flex items-center gap-2 sm:gap-3 mt-6" data-testid="checkout-steps">
    {STEPS.map((s, i) => {
      const done = i < current;
      const on = i === current;
      return (
        <li key={s} className="flex items-center gap-2 sm:gap-3">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-colors ${done ? "bg-[#D4A94A] text-[#0B192C]" : on ? "bg-white text-[#0B192C]" : "bg-white/10 text-white/50"}`}>
            {done ? <Check className="w-4 h-4" /> : i + 1}
          </span>
          <span className={`text-xs sm:text-sm ${on ? "text-white font-semibold" : done ? "text-[#F5E1A4]" : "text-white/50"}`}>{s}</span>
          {i < STEPS.length - 1 && <span className="w-6 sm:w-12 h-px bg-white/20" />}
        </li>
      );
    })}
  </ol>
);

// Trust row shown under the payment methods.
export const TrustBadges = () => (
  <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid="checkout-trust">
    {[
      { Icon: Lock, t: "256-bit SSL encryption" },
      { Icon: ShieldCheck, t: "We never see your card" },
      { Icon: BadgeCheck, t: "Licensed Nassau operator" },
    ].map(({ Icon, t }) => (
      <div key={t} className="flex items-center gap-2 rounded-xl bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#334155]">
        <Icon className="w-4 h-4 text-[#D4A94A] shrink-0" /> {t}
      </div>
    ))}
  </div>
);
