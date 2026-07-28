import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DollarSign, History, TrendingDown, TrendingUp, Save, X, RotateCcw } from "lucide-react";
import { api, money } from "../../lib/api";

// Change-price modal with:
//   • Quick promo shortcuts (−10 / −15 / −20 / −25 / −30 %) that auto-fill the
//     reason string with "N% off promo" so the public page renders the
//     strike-through original price via the /rentals + /tours + /taxi-services
//     `promo` annotation the backend attaches when `reason` contains promo/sale.
//   • Reset-to-seed button (only shown for items with a stored `seed_price`).
//   • Full audit-trail table sorted newest-first.
export default function PriceHistoryModal({ kind, item, onClose, onSaved }) {
  const [history, setHistory] = useState(null);
  const [current, setCurrent] = useState(item.price);
  const [newPrice, setNewPrice] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const seedPrice = item.seed_price;

  const load = async () => {
    try {
      const { data } = await api.get(`/admin/${kind}/${item.id}/price-history`);
      setHistory(data.history || []);
      setCurrent(data.current_price);
    } catch { toast.error("Failed to load history"); setHistory([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [item.id]);

  const patchPrice = async (val, reasonText) => {
    setSaving(true);
    try {
      await api.patch(`/admin/${kind}/${item.id}/price`, { price: val, reason: reasonText });
      toast.success(`Price updated to ${money(val)}`);
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const save = async () => {
    const val = parseFloat(newPrice);
    if (!val || val <= 0) return toast.error("Enter a valid new price");
    if (Math.abs(val - parseFloat(current)) < 0.001) return toast.error("New price is the same as current");
    await patchPrice(val, reason);
  };

  const resetToSeed = async () => {
    if (seedPrice == null) return;
    if (!window.confirm(`Reset price to seed default of ${money(seedPrice)}?`)) return;
    await patchPrice(parseFloat(seedPrice), "Reset to seed default");
  };

  const applyPromo = (pct) => {
    const discounted = +(parseFloat(current) * (1 - pct / 100)).toFixed(2);
    setNewPrice(String(discounted));
    if (!reason || /^\d+% off promo$/.test(reason)) setReason(`${pct}% off promo`);
  };

  const delta = newPrice && !isNaN(parseFloat(newPrice)) ? parseFloat(newPrice) - parseFloat(current) : 0;
  const canReset = seedPrice != null && Math.abs(parseFloat(seedPrice) - parseFloat(current)) > 0.001;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" data-testid="price-history-modal">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="p-6 border-b border-[#E2E8F0] flex justify-between items-start gap-3">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#E86A3C]" />
              <h3 className="font-semibold text-[#0B3B5C]">Change price · {item.name}</h3>
            </div>
            <div className="mt-1 text-xs text-[#64748B] flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Current <span className="mono text-[#0B3B5C] font-semibold">{money(current)}</span></span>
              {seedPrice != null && (
                <span>Seed default <span className="mono text-[#0B3B5C]">{money(seedPrice)}</span></span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[#F1F5F9]" data-testid="price-history-close"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4 bg-[#FBF7EF]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-widest text-[#64748B] mb-1">New price (USD)</label>
              <input
                type="number"
                step="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                data-testid="price-history-new-price"
                placeholder={String(current)}
                className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm mono focus:border-[#D4A94A] focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              {newPrice && !isNaN(parseFloat(newPrice)) && (
                <div className={`inline-flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-md ${delta > 0 ? "text-[#059669] bg-[#059669]/10" : delta < 0 ? "text-[#E86A3C] bg-[#E86A3C]/10" : "text-[#64748B] bg-[#F1F5F9]"}`}>
                  {delta > 0 ? <TrendingUp className="w-4 h-4" /> : delta < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                  {delta > 0 ? "+" : ""}{money(delta)} ({((delta / current) * 100).toFixed(1)}%)
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center" data-testid="price-history-promos">
            <span className="text-[10px] uppercase tracking-widest text-[#64748B]">Promos:</span>
            {[10, 15, 20, 25, 30].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applyPromo(pct)}
                data-testid={`price-history-promo-${pct}`}
                className="text-xs px-2 py-1 rounded border border-[#E86A3C]/40 text-[#E86A3C] hover:bg-[#E86A3C] hover:text-white transition-colors"
              >
                −{pct}% off
              </button>
            ))}
            {canReset && (
              <button
                type="button"
                onClick={resetToSeed}
                disabled={saving}
                data-testid="price-history-reset-seed"
                className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-[#0B3B5C]/40 text-[#0B3B5C] hover:bg-[#0B3B5C] hover:text-white transition-colors disabled:opacity-60"
                title={`Reset to seed default ${money(seedPrice)}`}
              >
                <RotateCcw className="w-3 h-3" /> Reset to seed ({money(seedPrice)})
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-[#64748B] mb-1">Reason (recommended)</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="price-history-reason"
              placeholder="e.g. Peak-season adjustment, 20% off promo, price correction…"
              className="w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus:border-[#D4A94A] focus:outline-none"
            />
            <div className="mt-1 text-[10px] text-[#94a3b8]">
              Tip: reasons containing "promo", "sale" or "discount" trigger the strike-through original price on the public page.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-md border border-[#E2E8F0] bg-white px-4 py-2 text-sm">Cancel</button>
            <button
              onClick={save}
              disabled={saving || !newPrice}
              data-testid="price-history-save"
              className="rounded-md bg-[#0B3B5C] text-white px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60"
            >
              <Save className="w-4 h-4" /> Save new price
            </button>
          </div>
        </div>

        <div className="p-6 border-t border-[#E2E8F0]">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-[#0B3B5C]" />
            <h4 className="font-semibold text-[#0B3B5C] text-sm">Price history</h4>
            <span className="text-xs text-[#64748B]">{history?.length ? `${history.length} entr${history.length === 1 ? "y" : "ies"}` : ""}</span>
          </div>
          {history === null ? (
            <div className="text-center py-6 text-sm text-[#64748B]">Loading…</div>
          ) : history.length === 0 ? (
            <div className="text-center py-6 text-sm text-[#64748B]">No changes logged yet — the next price change will start the audit trail.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="price-history-table">
                <thead className="text-left text-[10px] uppercase tracking-widest text-[#64748B]">
                  <tr>
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Old</th>
                    <th className="py-2 pr-3">New</th>
                    <th className="py-2 pr-3">Δ</th>
                    <th className="py-2 pr-3">Reason</th>
                    <th className="py-2 pr-3">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {history.map((h, i) => {
                    const d = h.old_price != null ? (h.new_price - h.old_price) : null;
                    return (
                      <tr key={i} data-testid={`price-history-row-${i}`}>
                        <td className="py-2 pr-3 mono text-[#64748B]">{h.changed_at ? new Date(h.changed_at).toLocaleString() : "—"}</td>
                        <td className="py-2 pr-3 mono">{h.old_price != null ? money(h.old_price) : <span className="text-[#94a3b8]">—</span>}</td>
                        <td className="py-2 pr-3 mono text-[#0B3B5C] font-semibold">{money(h.new_price)}</td>
                        <td className={`py-2 pr-3 mono font-semibold ${d == null ? "text-[#94a3b8]" : d > 0 ? "text-[#059669]" : d < 0 ? "text-[#E86A3C]" : "text-[#64748B]"}`}>
                          {d == null ? "—" : `${d > 0 ? "+" : ""}${money(d)}`}
                        </td>
                        <td className="py-2 pr-3 text-[#0B192C]">{h.reason || <span className="text-[#94a3b8]">—</span>}</td>
                        <td className="py-2 pr-3 text-[#64748B]">{h.changed_by || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
