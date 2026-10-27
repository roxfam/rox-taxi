import { useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../lib/api";

const PCTS = [0, 10, 15, 20];

// Optional driver tip on the pay page; updates the booking total before checkout.
export const TipPicker = ({ booking, onChange }) => {
  const tip = Number(booking.tip_amount || 0);
  const base = Number(booking.total || 0) - tip;
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = async (amount) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/bookings/${booking.id}/tip`, { tip_amount: Math.max(0, Math.round(amount * 100) / 100) });
      onChange(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't update the tip");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4" data-testid="pay-tip-picker">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#0B3B5C]"><Heart className="w-4 h-4 text-emerald-600" /> Add a tip for your driver <span className="text-xs font-normal text-[#64748B]">· 100% goes to them</span></div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {PCTS.map((p) => {
          const amt = Math.round(base * p) / 100;
          const on = Math.abs(tip - amt) < 0.01 && !(p === 0 && tip > 0);
          return (
            <button key={p} type="button" disabled={busy} onClick={() => apply(amt)}
              className={`rounded-xl border py-2 text-xs font-bold transition-colors ${on ? "bg-[#0B3B5C] text-white border-[#0B3B5C]" : "bg-white text-[#0B3B5C] border-[#E2E8F0] hover:border-[#0B3B5C]"}`}
              data-testid={`pay-tip-${p}`}>
              {p === 0 ? "No tip" : `${p}%`}{p > 0 && <div className="font-mono font-normal opacity-80">{money(amt)}</div>}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input type="number" min="0" step="1" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom $"
          className="flex-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm" data-testid="pay-tip-custom" />
        <button type="button" disabled={busy || custom === ""} onClick={() => apply(Number(custom))}
          className="rounded-xl bg-[#0B3B5C] text-white text-xs font-bold px-4 disabled:opacity-50" data-testid="pay-tip-custom-apply">Add</button>
      </div>
      {tip > 0 && <div className="mt-2 text-xs text-emerald-700" data-testid="pay-tip-current">Tip {money(tip)} added · new total {money(booking.total)}</div>}
    </div>
  );
};
