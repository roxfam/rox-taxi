import { useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../lib/api";

// Gift-card code entry. With `bookingId` it applies immediately to that booking;
// otherwise it only validates and reports {code, balance} via onChange.
export function GiftCodeBox({ bookingId, applied, onChange, onApplied, dark = false }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    try {
      if (bookingId) {
        const { data } = await api.post(`/bookings/${bookingId}/apply-gift`, { code: c });
        toast.success(`Gift card applied: −${money(data.applied)}`);
        onApplied?.(data);
      } else {
        const { data } = await api.post("/gift-cards/redeem-check", { code: c });
        toast.success(`Gift card balance ${money(data.balance)} will be applied`);
        onChange?.({ code: data.code, balance: data.balance });
      }
      setCode("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gift card could not be applied");
    } finally {
      setBusy(false);
    }
  };
  const box = dark ? "bg-white/5 border-white/10 text-white" : "bg-[#FBF7EF] border-[#E2E8F0] text-[#0B3B5C]";
  const input = dark ? "bg-white/10 border-white/20 text-white placeholder:text-white/40" : "bg-white border-[#E2E8F0] text-[#0B3B5C]";
  return (
    <div className={`rounded-xl border p-3 ${box}`} data-testid="gift-code-box">
      <div className="flex items-center justify-between text-[10px] tracking-[0.22em] uppercase font-bold text-[#D4A94A] mb-2">
        <span className="inline-flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> Gift card</span>
        <Link to="/gift-cards" className="normal-case tracking-normal underline opacity-80 hover:opacity-100" data-testid="gift-code-buy-link">Buy a gift card</Link>
      </div>
      {applied ? (
        <div className="flex items-center justify-between text-sm" data-testid="gift-code-applied">
          <span className="mono font-semibold">{applied.code} · −{money(applied.amount ?? applied.balance)}</span>
          {onChange && (
            <button type="button" onClick={() => onChange(null)} aria-label="Remove gift card" data-testid="gift-code-remove" className="opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
            placeholder="RXT-XXXX-XXXX"
            className={`mono flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/40 ${input}`}
            data-testid="gift-code-input"
          />
          <button type="button" onClick={apply} disabled={busy || !code.trim()}
            className="rounded-lg bg-[#D4A94A] text-[#0B192C] px-4 py-2 text-xs font-bold hover:bg-[#e0b856] transition-colors disabled:opacity-50 inline-flex items-center gap-1"
            data-testid="gift-code-apply-btn">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Apply
          </button>
        </div>
      )}
    </div>
  );
}
