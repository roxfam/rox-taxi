import { useState } from "react";
import { toast } from "sonner";
import { X, CalendarX, Loader2 } from "lucide-react";
import { api } from "../../lib/api";

// Bulk maintenance blackout for rentals.
// Applies (or removes) a date range across every rental that matches an
// optional category filter. Used for annual insurance, hurricane closures,
// or fleet-wide detailing days.
export default function BulkBlackoutModal({ rentals, onClose, onDone }) {
  const categories = Array.from(new Set(
    rentals.flatMap((r) => [r.category, r.body]).filter(Boolean)
  )).sort();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [category, setCategory] = useState("");
  const [action, setAction] = useState("add");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const preview = rentals.filter((r) => !category || r.category === category || r.body === category);

  const apply = async () => {
    if (!start || !end) return toast.error("Pick a start and end date");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/rentals/bulk-blackout", {
        start_date: start,
        end_date: end,
        category: category || null,
        action,
        reason: reason || null,
      });
      const dayCount = (data.dates || []).length;
      toast.success(
        `${action === "add" ? "Blocked" : "Cleared"} ${dayCount} day${dayCount !== 1 ? "s" : ""} across ${data.affected}/${data.target_count} rentals`,
      );
      if (onDone) onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk update failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-4" data-testid="bulk-blackout-modal">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-[0_30px_80px_rgba(11,25,44,0.25)]">
        <div className="flex items-center justify-between">
          <h3 className="serif text-2xl text-[#0B3B5C] flex items-center gap-2">
            <CalendarX className="w-5 h-5 text-[#B91C1C]" /> Bulk maintenance blackout
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#F1F5F9]" data-testid="bulk-blackout-close"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-[#64748B] mt-1">Block (or unblock) a date range across many rentals at once — insurance days, hurricanes, fleet detailing.</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">Start date</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="bulk-blackout-start" className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">End date</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="bulk-blackout-end" className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">Category filter (optional)</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="bulk-blackout-category" className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm">
            <option value="">Every rental ({rentals.length})</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="text-[11px] text-[#94a3b8] mt-1" data-testid="bulk-blackout-preview">
            Will target <strong className="text-[#0B3B5C]">{preview.length}</strong> vehicle{preview.length !== 1 ? "s" : ""}.
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">Reason (audit note, optional)</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Annual insurance renewal" data-testid="bulk-blackout-reason" className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" name="bulk-action" checked={action === "add"} onChange={() => setAction("add")} data-testid="bulk-blackout-action-add" /> Add blackouts
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" name="bulk-action" checked={action === "remove"} onChange={() => setAction("remove")} data-testid="bulk-blackout-action-remove" /> Remove blackouts
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm text-[#0B3B5C]" data-testid="bulk-blackout-cancel">Cancel</button>
          <button
            onClick={apply}
            disabled={busy || !start || !end}
            data-testid="bulk-blackout-apply"
            className={`rounded-full text-white text-sm font-semibold px-5 py-2 inline-flex items-center gap-1.5 disabled:opacity-50 ${action === "add" ? "bg-[#B91C1C] hover:bg-[#991717]" : "bg-[#059669] hover:bg-[#047857]"}`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarX className="w-4 h-4" />}
            {busy ? "Applying…" : action === "add" ? "Block dates" : "Clear dates"}
          </button>
        </div>
      </div>
    </div>
  );
}
