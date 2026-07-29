import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Calendar, Shield, CreditCard, Loader2 } from "lucide-react";
import { api, money } from "../lib/api";

/**
 * Guest-facing rental extension.
 * - Choose additional days (1–30)
 * - Backend quotes cost (extra_days × daily, tier discount applied)
 * - Original security deposit stays held — NO new deposit charged
 * - Payment through Stripe Checkout (reuses existing flow)
 */
export default function ExtendRentalModal({ booking, onClose, onSuccess }) {
  const [days, setDays] = useState(1);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setErr(""); setQuote(null);
      try {
        const { data } = await api.post(`/my/bookings/${booking.id}/extend/quote`, { additional_days: days });
        if (alive) setQuote(data);
      } catch (e) {
        if (alive) setErr(e?.response?.data?.detail || "Couldn't fetch quote");
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [days, booking.id]);

  const pay = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/my/bookings/${booking.id}/extend/checkout`, {
        additional_days: days,
        origin_url: window.location.origin,
      });
      if (!data.checkout_url) throw new Error("No checkout URL");
      window.location.href = data.checkout_url;
    } catch (e) {
      setBusy(false);
      toast.error(e?.response?.data?.detail || "Extension checkout failed");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-4" data-testid="extend-rental-modal">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-[0_30px_80px_rgba(11,25,44,0.25)]">
        <div className="flex items-center justify-between">
          <h3 className="serif text-2xl text-[#0B3B5C]">Extend your rental</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#F1F5F9]" data-testid="extend-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="mt-1 text-xs text-[#64748B]">
          <strong className="text-[#0B3B5C]">{booking.item_name}</strong> · confirmation <span className="mono">{booking.id}</span>
        </div>

        <div className="mt-5">
          <label className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-[#D4A94A]" /> Additional days
          </label>
          <input
            type="number" min={1} max={30} value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(30, parseInt(e.target.value || "1", 10))))}
            data-testid="extend-days-input"
            className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#D4A94A] focus:outline-none"
          />
        </div>

        {err ? (
          <div className="mt-4 text-sm text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3 py-2" data-testid="extend-error">{err}</div>
        ) : quote ? (
          <div className="mt-5 rounded-xl border border-[#EFE7D5] bg-[#FBF7EF] p-4 text-sm" data-testid="extend-quote">
            <Row label="Daily rate" value={money(quote.daily_price)} />
            <Row label={`${quote.additional_days} extra day${quote.additional_days>1?"s":""}`} value={money(quote.extra_gross)} />
            {quote.extra_discount > 0 && (
              <Row label={`Multi-day tier discount (${Math.round(quote.new_discount_pct*100)}%)`} value={`− ${money(quote.extra_discount)}`} tone="ok" />
            )}
            <hr className="my-2 border-[#EFE7D5]" />
            <Row label="You pay now" value={money(quote.extra_cost)} bold />
            <div className="text-[11px] text-[#64748B] mt-2 flex items-start gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#059669] mt-0.5" />
              {quote.deposit_note}
            </div>
            <div className="text-[11px] text-[#64748B] mt-1">
              New return date: <strong className="text-[#0B3B5C]">{quote.new_return_date}</strong>
            </div>
          </div>
        ) : (
          <div className="mt-5 text-xs text-[#94a3b8]">Fetching quote…</div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm text-[#0B3B5C]" data-testid="extend-cancel">Cancel</button>
          <button
            onClick={pay}
            disabled={!quote || busy || !!err}
            data-testid="extend-pay-btn"
            className="rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white text-sm font-semibold px-5 py-2 inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {busy ? "Redirecting…" : `Pay ${quote ? money(quote.extra_cost) : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone, bold }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={`${bold ? "text-[#0B3B5C] font-semibold" : "text-[#64748B]"}`}>{label}</span>
      <span className={`mono ${bold ? "text-[#E86A3C] font-bold text-base" : tone === "ok" ? "text-[#059669]" : "text-[#0B3B5C]"}`}>{value}</span>
    </div>
  );
}
