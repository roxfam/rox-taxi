import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Zap } from "lucide-react";
import { API, money } from "../lib/api";

/**
 * PayWithWalletButton — one-tap off-session Stripe charge against a
 * saved PaymentMethod from the user's Trip Wallet. If no cards are
 * saved yet, the button is suppressed (the "New card" link next to it
 * handles cold-start checkout). On `requires_action` from 3DS, we
 * surface a toast so the guest knows to confirm the card again.
 */
export default function PayWithWalletButton({ booking, onPaid }) {
  const [methods, setMethods] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API}/my/wallet`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMethods(d?.payment_methods || []))
      .catch(() => {});
  }, []);

  if (methods.length === 0) return null;

  const amount = booking.balance_due > 0 ? booking.balance_due : booking.total;

  const charge = async (pm) => {
    if (!window.confirm(`Charge ${pm.brand?.toUpperCase() || "card"} •••• ${pm.last4} for ${money(amount)}?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/my/bookings/${booking.id}/pay-with-wallet`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method_id: pm.id }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.detail || "Charge failed");
        return;
      }
      if (d.status === "paid") {
        toast.success(`Paid ${money(d.amount)} with ${d.card?.brand?.toUpperCase() || "card"} •••• ${d.card?.last4}`);
        onPaid?.();
      } else if (d.status === "requires_action") {
        toast.info("Your bank wants a 3-D Secure confirmation. We'll re-send a card link to your email.");
      } else {
        toast.info(`Payment ${d.status}. We'll notify you when it clears.`);
      }
      setOpen(false);
    } catch {
      toast.error("Could not reach the server.");
    } finally { setBusy(false); }
  };

  return (
    <div className="relative inline-block" data-testid={`pay-with-wallet-${booking.id}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white text-xs font-semibold px-3.5 py-2 disabled:opacity-50"
        data-testid={`pay-with-wallet-open-${booking.id}`}
      >
        <Zap className="w-3.5 h-3.5" /> {busy ? "Charging…" : "Pay with saved card"}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-30 min-w-[220px] bg-white border border-[#E2E8F0] rounded-xl shadow-xl p-1"
          data-testid={`pay-with-wallet-menu-${booking.id}`}
        >
          {methods.map((pm) => (
            <button
              key={pm.id}
              onClick={() => charge(pm)}
              disabled={busy}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#F8FAFC] rounded-lg text-[#0B3B5C] disabled:opacity-50"
              data-testid={`pay-with-wallet-pm-${pm.id}`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span className="font-bold uppercase text-xs">{pm.brand || "card"}</span>
              <span className="mono text-xs">•••• {pm.last4}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
