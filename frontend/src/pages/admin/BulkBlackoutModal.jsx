import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X, CalendarX, Loader2, Users } from "lucide-react";
import { api } from "../../lib/api";
import { Calendar } from "../../components/ui/calendar";

const iso = (d) => d.toISOString().slice(0, 10);
function enumerateRange(from, to) {
  if (!from) return [];
  const start = new Date(from);
  const end = to ? new Date(to) : new Date(from);
  const out = [];
  const cur = new Date(start);
  while (cur <= end) { out.push(iso(cur)); cur.setDate(cur.getDate() + 1); }
  return out;
}

// Bulk maintenance blackout for rentals — apply (or clear) a date range
// across many vehicles at once. Uses a 2-month range calendar so admins
// can knock out an entire holiday week in two clicks. Category filter
// still works for one-shot "everything in this class" selections, and a
// per-vehicle checkbox grid lets the admin narrow further (or hand-pick
// arbitrary cars) — vehicle_ids override the category on the backend.
export default function BulkBlackoutModal({ rentals, onClose, onDone }) {
  const categories = useMemo(
    () => Array.from(new Set(
      rentals.flatMap((r) => [r.category, r.body]).filter(Boolean)
    )).sort(),
    [rentals],
  );
  const [range, setRange] = useState(undefined);
  const [category, setCategory] = useState("");
  const [action, setAction] = useState("add");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickedIds, setPickedIds] = useState([]); // explicit per-vehicle override

  const categoryPreview = useMemo(
    () => rentals.filter((r) => !category || r.category === category || r.body === category),
    [rentals, category],
  );
  const targets = pickedIds.length > 0
    ? rentals.filter((r) => pickedIds.includes(r.id))
    : categoryPreview;

  const rangeDates = useMemo(
    () => enumerateRange(range?.from, range?.to),
    [range],
  );
  const rangeCount = rangeDates.length;

  const togglePicked = (id) =>
    setPickedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const selectAllVisible = () => setPickedIds(categoryPreview.map((r) => r.id));
  const clearPicked = () => setPickedIds([]);

  const apply = async () => {
    if (rangeCount === 0) return toast.error("Pick a date range first");
    if (targets.length === 0) return toast.error("No matching vehicles");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/rentals/bulk-blackout", {
        start_date: rangeDates[0],
        end_date: rangeDates[rangeDates.length - 1],
        category: pickedIds.length > 0 ? null : (category || null),
        rental_ids: pickedIds.length > 0 ? pickedIds : null,
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
      <div className="bg-white rounded-2xl w-full max-w-4xl p-6 shadow-[0_30px_80px_rgba(11,25,44,0.25)] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="serif text-2xl text-[#0B3B5C] flex items-center gap-2">
            <CalendarX className="w-5 h-5 text-[#B91C1C]" /> Bulk maintenance blackout
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-[#F1F5F9]" data-testid="bulk-blackout-close"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-[#64748B] mt-1">Drag a range on the calendar, pick which cars to touch, then block or clear in one shot — perfect for hurricane weeks, insurance renewals, fleet detailing.</p>

        <div className="mt-5 grid lg:grid-cols-5 gap-5">
          {/* Left: calendar range picker */}
          <div className="lg:col-span-3">
            <div className="text-[10px] uppercase tracking-widest text-[#0B3B5C] font-bold mb-2 flex items-center gap-1.5">
              <CalendarX className="w-3.5 h-3.5 text-[#D4A94A]" /> Date range
              <span className="text-[#94a3b8] font-semibold normal-case tracking-normal">
                — click start, then end
              </span>
            </div>
            <div className="rounded-lg bg-[#FBF7EF]/40 border border-[#E2E8F0] p-1 inline-block">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={2}
                className="text-[#0B3B5C]"
              />
            </div>
            <div className="mt-2 text-xs text-[#64748B]" data-testid="bulk-blackout-range-summary">
              {rangeCount === 0
                ? "No range selected."
                : (<><strong className="text-[#0B3B5C] mono">{rangeDates[0]} → {rangeDates[rangeCount - 1]}</strong> · <span className="font-semibold text-[#0B3B5C]">{rangeCount}</span> day{rangeCount === 1 ? "" : "s"}</>)}
            </div>
          </div>

          {/* Right: filters + preview */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">Category filter</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="bulk-blackout-category" className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm bg-white">
                <option value="">Every rental ({rentals.length})</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="text-[11px] text-[#94a3b8] mt-1" data-testid="bulk-blackout-preview">
                Category matches <strong className="text-[#0B3B5C]">{categoryPreview.length}</strong> vehicle{categoryPreview.length !== 1 ? "s" : ""}.
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold inline-flex items-center gap-1">
                  <Users className="w-3 h-3" /> Pick specific cars {pickedIds.length > 0 && <span className="normal-case text-[#0B3B5C]">({pickedIds.length})</span>}
                </label>
                <div className="text-[10px] flex items-center gap-2">
                  <button type="button" onClick={selectAllVisible} className="text-[#0B3B5C] hover:underline" data-testid="bulk-blackout-select-all">Select all</button>
                  {pickedIds.length > 0 && <button type="button" onClick={clearPicked} className="text-[#94a3b8] hover:text-[#B91C1C] hover:underline" data-testid="bulk-blackout-clear-picked">Clear</button>}
                </div>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-white max-h-40 overflow-y-auto" data-testid="bulk-blackout-vehicle-picker">
                {categoryPreview.length === 0 ? (
                  <div className="p-3 text-xs text-[#94a3b8]">No vehicles match this category.</div>
                ) : (
                  categoryPreview.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#F8FAFC] cursor-pointer border-b border-[#F1F5F9] last:border-b-0" data-testid={`bulk-blackout-vehicle-${r.id}`}>
                      <input
                        type="checkbox"
                        checked={pickedIds.includes(r.id)}
                        onChange={() => togglePicked(r.id)}
                        data-testid={`bulk-blackout-vehicle-checkbox-${r.id}`}
                      />
                      <span className="flex-1 truncate text-[#0B3B5C] font-semibold">{r.name}</span>
                      {r.body && <span className="text-[#94a3b8]">{r.body}</span>}
                    </label>
                  ))
                )}
              </div>
              <div className="text-[11px] text-[#94a3b8] mt-1">
                {pickedIds.length > 0 ? (
                  <>Will target <strong className="text-[#0B3B5C]">{pickedIds.length}</strong> hand-picked vehicle{pickedIds.length !== 1 ? "s" : ""}.</>
                ) : (
                  <>Will target every vehicle in the category filter above.</>
                )}
              </div>
            </div>

            <div>
              <label className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">Reason (audit note, optional)</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Hurricane Aug 14–20" data-testid="bulk-blackout-reason" className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" />
            </div>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="bulk-action" checked={action === "add"} onChange={() => setAction("add")} data-testid="bulk-blackout-action-add" /> Add
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="bulk-action" checked={action === "remove"} onChange={() => setAction("remove")} data-testid="bulk-blackout-action-remove" /> Remove
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#64748B]" data-testid="bulk-blackout-final-preview">
            {rangeCount === 0
              ? <span className="text-[#94a3b8]">Pick a range on the calendar to enable Apply.</span>
              : (
                <>
                  <strong className={action === "add" ? "text-[#B91C1C]" : "text-[#059669]"}>{action === "add" ? "Block" : "Clear"} {rangeCount} day{rangeCount === 1 ? "" : "s"}</strong>
                  {" "}across{" "}
                  <strong className="text-[#0B3B5C]">{targets.length}</strong> vehicle{targets.length === 1 ? "" : "s"}.
                </>
              )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm text-[#0B3B5C]" data-testid="bulk-blackout-cancel">Cancel</button>
            <button
              onClick={apply}
              disabled={busy || rangeCount === 0 || targets.length === 0}
              data-testid="bulk-blackout-apply"
              className={`rounded-full text-white text-sm font-semibold px-5 py-2 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${action === "add" ? "bg-[#B91C1C] hover:bg-[#991717]" : "bg-[#059669] hover:bg-[#047857]"}`}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarX className="w-4 h-4" />}
              {busy ? "Applying…" : action === "add" ? "Block range" : "Clear range"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
