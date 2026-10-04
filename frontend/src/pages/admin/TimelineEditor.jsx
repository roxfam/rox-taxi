import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, MapPin, RotateCcw, Save } from "lucide-react";
import { api } from "../../lib/api";

/**
 * TimelineEditor — admin inline editor for the wedding-day itinerary
 * baked into the paid-in-full receipt.
 *
 * - Pulls the booking's custom `timeline[]` if set (admin override).
 * - Otherwise shows the auto-generated 3-row preview so the dispatcher
 *   can see what the guest WILL get, then edit before the balance lands.
 * - Save PUTs to `/admin/bookings/{id}/timeline`; Reset DELETEs so the
 *   auto-generator runs again on the next paid-in-full fire.
 */
const AUTO = (booking) => {
  try {
    const pickup = new Date(booking.booking_date);
    const rt = (booking.return_time || "").trim();
    if (!booking.round_trip || !rt) return null;
    let returnDt;
    if (rt.includes("T")) returnDt = new Date(rt);
    else {
      const [hh, mm = "00"] = rt.split(":");
      const base = booking.return_date ? new Date(booking.return_date) : pickup;
      returnDt = new Date(base);
      returnDt.setHours(Number(hh), Number(mm.split(":")[0]), 0, 0);
    }
    const mid = new Date((pickup.getTime() + returnDt.getTime()) / 2);
    const fmt = (d) => d.toTimeString().slice(0, 5);
    return [
      { label: "Driver arrives", time: fmt(pickup), location: booking.pickup_location || "Pickup", emoji: "🚕" },
      { label: "Event / ceremony", time: fmt(mid), location: booking.dropoff_location || "Venue", emoji: "💍" },
      { label: "Return pickup", time: fmt(returnDt), location: booking.dropoff_location || "Venue", emoji: "🏁" },
    ];
  } catch { return null; }
};

export default function TimelineEditor({ booking, onChanged }) {
  const auto = AUTO(booking);
  const [rows, setRows] = useState(booking.timeline || auto || []);
  const [isCustom, setIsCustom] = useState(!!booking.timeline);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(booking.timeline || AUTO(booking) || []);
    setIsCustom(!!booking.timeline);
  }, [booking]);

  if (!rows.length) return null;

  const update = (i, k, v) => setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/admin/bookings/${booking.id}/timeline`, { timeline: rows });
      toast.success("Timeline saved — it'll ship with the paid-in-full receipt.");
      setIsCustom(true);
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setBusy(false); }
  };

  const reset = async () => {
    if (!window.confirm("Reset to auto-generated timeline? Any admin edits will be discarded.")) return;
    setBusy(true);
    try {
      await api.delete(`/admin/bookings/${booking.id}/timeline`);
      const next = AUTO(booking) || [];
      setRows(next);
      setIsCustom(false);
      toast.success("Reverted — auto timeline will be used.");
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reset failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden" data-testid="timeline-editor">
      <header className="p-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#E86A3C]/10 flex items-center justify-center text-[#E86A3C]">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#0B3B5C]">Wedding-day timeline</div>
            <div className="text-[11px] text-[#64748B]">
              {isCustom ? "Custom · ships with the paid-in-full receipt" : "Auto · reflects the current round-trip math"}
            </div>
          </div>
        </div>
        {isCustom && (
          <button
            onClick={reset}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] text-[#64748B] text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
            data-testid="timeline-reset"
          >
            <RotateCcw className="w-3 h-3" /> Reset to auto
          </button>
        )}
      </header>

      <div className="p-4 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[36px_1fr_90px_1.3fr] gap-2 items-center" data-testid={`timeline-row-${i}`}>
            <input
              value={r.emoji || ""}
              onChange={(e) => update(i, "emoji", e.target.value.slice(0, 2))}
              className="text-xl text-center bg-[#FAF9F6] border border-[#E2E8F0] rounded-lg py-1.5 focus:outline-none focus:border-[#D4A94A]"
              placeholder="🚕"
              data-testid={`timeline-emoji-${i}`}
            />
            <input
              value={r.label}
              onChange={(e) => update(i, "label", e.target.value.slice(0, 60))}
              className="text-sm bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4A94A] font-semibold text-[#0B3B5C]"
              placeholder="Driver arrives"
              data-testid={`timeline-label-${i}`}
            />
            <input
              value={r.time}
              onChange={(e) => update(i, "time", e.target.value.slice(0, 10))}
              placeholder="14:30"
              className="text-xs bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4A94A] font-mono text-[#0B3B5C]"
              data-testid={`timeline-time-${i}`}
            />
            <div className="relative">
              <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#64748B]" />
              <input
                value={r.location || ""}
                onChange={(e) => update(i, "location", e.target.value.slice(0, 80))}
                placeholder="Venue"
                className="w-full pl-6 pr-2 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#D4A94A] text-[#64748B]"
                data-testid={`timeline-location-${i}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-[#E2E8F0] bg-[#FAF9F6] flex justify-end">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full bg-[#E86A3C] text-white px-4 py-1.5 text-xs font-black uppercase tracking-wider hover:bg-[#d55a30] active:scale-95 disabled:opacity-50"
          data-testid="timeline-save"
        >
          <Save className="w-3 h-3" /> {busy ? "Saving…" : "Save timeline"}
        </button>
      </div>
    </div>
  );
}
