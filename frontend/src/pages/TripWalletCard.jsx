import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Plus, Trash2, Shield } from "lucide-react";
import { API } from "../lib/api";

/**
 * TripWalletCard — "Saved payment methods" for authenticated customers.
 *
 * - Lists saved Stripe PaymentMethod records (brand, last4, exp).
 * - "Add card" opens a Stripe-hosted SetupIntent Checkout in a new tab.
 * - "Remove" detaches the PaymentMethod from the Stripe Customer.
 *
 * No raw card data touches our servers — Stripe hosts the collection UI
 * and we only persist `payment_method_id` + display metadata.
 */
export default function TripWalletCard() {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/my/wallet`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setMethods(d.payment_methods || []);
      }
    } catch {
      /* silent */
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const addCard = async () => {
    setAdding(true);
    try {
      const r = await fetch(`${API}/my/wallet/setup-session`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin_url: window.location.origin }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(j.detail || "Could not open card setup.");
        return;
      }
      const d = await r.json();
      // Open Stripe Checkout in a new tab so returning here keeps state
      window.open(d.checkout_url, "_blank", "noopener");
      toast.info("Opened Stripe · complete the save, then refresh this list.");
    } catch {
      toast.error("Could not open card setup.");
    } finally { setAdding(false); }
  };

  const remove = async (pm) => {
    if (!window.confirm(`Remove ${pm.brand?.toUpperCase() || "card"} •••• ${pm.last4} from your wallet?`)) return;
    setBusy((b) => ({ ...b, [pm.id]: true }));
    try {
      const r = await fetch(`${API}/my/wallet/${pm.id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error("remove failed");
      toast.success("Card removed from wallet");
      load();
    } catch {
      toast.error("Could not remove that card. Try again.");
    } finally { setBusy((b) => ({ ...b, [pm.id]: false })); }
  };

  return (
    <div
      className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-5"
      data-testid="trip-wallet-card"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#0B3B5C]/8 text-[#0B3B5C] flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-[#0B3B5C]">Trip wallet</div>
            <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-600" />
              Saved cards for one-tap re-booking · processed by Stripe
            </div>
          </div>
        </div>
        <button
          onClick={addCard}
          disabled={adding}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#E86A3C] text-white text-xs font-semibold px-3.5 py-2 hover:bg-[#d55a30] disabled:opacity-50"
          data-testid="trip-wallet-add"
        >
          <Plus className="w-3.5 h-3.5" /> {adding ? "Opening…" : "Add card"}
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        {loading && methods.length === 0 ? (
          <div className="text-xs text-[#64748B] py-3">Loading…</div>
        ) : methods.length === 0 ? (
          <div className="text-xs text-[#94A3B8] py-3" data-testid="trip-wallet-empty">
            No saved cards yet. Tap "Add card" to securely save one for one-tap re-bookings.
          </div>
        ) : methods.map((pm) => (
          <div
            key={pm.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#FAF9F6] px-3.5 py-2.5"
            data-testid={`trip-wallet-row-${pm.id}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase text-[#0B3B5C] tracking-wider">{pm.brand || "card"}</span>
              <span className="mono text-sm text-[#0B3B5C]">•••• {pm.last4}</span>
              {pm.exp_month && pm.exp_year && (
                <span className="text-[11px] text-[#64748B]">exp {String(pm.exp_month).padStart(2, "0")}/{String(pm.exp_year).slice(-2)}</span>
              )}
            </div>
            <button
              onClick={() => remove(pm)}
              disabled={!!busy[pm.id]}
              className="inline-flex items-center gap-1 text-xs text-[#B91C1C] border border-[#FECACA] rounded-full px-3 py-1 bg-white hover:bg-[#FEF2F2] disabled:opacity-50"
              data-testid={`trip-wallet-remove-${pm.id}`}
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
