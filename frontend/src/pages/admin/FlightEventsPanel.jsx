import { Plane, Clock, X, CheckCircle2, AlertTriangle, PlaneTakeoff, PlaneLanding } from "lucide-react";

/**
 * FlightEventsPanel — timeline modal showing every flight_events[]
 * fan-out that fired for an airport-pickup booking + the latest
 * AviationStack snapshot. One-tap-close dispatcher view.
 */
export default function FlightEventsPanel({ booking, onClose }) {
  const events = Array.isArray(booking?.flight_events) ? booking.flight_events : [];
  const snap = booking?.flight_last_snapshot || null;
  const dep = snap?.departure || {};
  const arr = snap?.arrival || {};
  const checkedAt = booking?.flight_last_checked_at;

  const prettyEvent = (tag) => {
    if (tag === "departed")   return { Icon: PlaneTakeoff, label: "Departed origin", tone: "text-[#0B3B5C]", bg: "bg-[#0B3B5C]/10" };
    if (tag === "landed")     return { Icon: PlaneLanding, label: "Landed at destination", tone: "text-[#059669]", bg: "bg-[#059669]/10" };
    if (tag.startsWith("dep_delay_")) return { Icon: AlertTriangle, label: `Departure delay +${tag.replace("dep_delay_", "")} min`, tone: "text-[#D4A94A]", bg: "bg-[#D4A94A]/10" };
    if (tag.startsWith("arr_delay_")) return { Icon: AlertTriangle, label: `Arrival delay +${tag.replace("arr_delay_", "")} min`, tone: "text-[#E86A3C]", bg: "bg-[#E86A3C]/10" };
    return { Icon: Plane, label: tag, tone: "text-[#64748B]", bg: "bg-[#F1F5F9]" };
  };

  const fmt = (iso) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch { return iso; }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B192C]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" data-testid="flight-events-modal">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="relative p-6 border-b border-[#E2E8F0] bg-gradient-to-r from-[#0B3B5C] to-[#132a4a] text-white">
          <button onClick={onClose} className="absolute top-5 right-5 w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center" data-testid="flight-events-close">
            <X className="w-5 h-5" />
          </button>
          <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">Flight tracker</div>
          <h2 className="serif text-2xl mt-1 flex items-center gap-2">
            <Plane className="w-5 h-5" />
            {booking.flight_number || "—"}
            {snap?.airline && <span className="text-sm font-normal text-white/70">· {snap.airline}</span>}
          </h2>
          <div className="text-xs text-white/70 mt-1">
            Booking <span className="mono">{booking.id}</span> · {booking.customer_name}
          </div>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {/* Current snapshot */}
          {snap ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4">
                <div className="text-[10px] tracking-[0.2em] uppercase text-[#64748B] font-black flex items-center gap-1">
                  <PlaneTakeoff className="w-3 h-3" /> Departure
                </div>
                <div className="serif text-lg text-[#0B3B5C] mt-1">{dep.iata || "—"}</div>
                <div className="text-xs text-[#64748B] mt-0.5 truncate" title={dep.airport}>{dep.airport || ""}</div>
                <div className="text-xs text-[#0B3B5C] mt-2 mono">{fmt(dep.actual || dep.estimated || dep.scheduled)}</div>
                {dep.delay_minutes ? (
                  <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase text-[#D4A94A]">
                    <AlertTriangle className="w-3 h-3" /> +{dep.delay_minutes} min
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4">
                <div className="text-[10px] tracking-[0.2em] uppercase text-[#64748B] font-black flex items-center gap-1">
                  <PlaneLanding className="w-3 h-3" /> Arrival
                </div>
                <div className="serif text-lg text-[#0B3B5C] mt-1">{arr.iata || "—"}</div>
                <div className="text-xs text-[#64748B] mt-0.5 truncate" title={arr.airport}>{arr.airport || ""}</div>
                <div className="text-xs text-[#0B3B5C] mt-2 mono">{fmt(arr.actual || arr.estimated || arr.scheduled)}</div>
                {arr.delay_minutes ? (
                  <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase text-[#E86A3C]">
                    <AlertTriangle className="w-3 h-3" /> +{arr.delay_minutes} min
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-[#F8FAFC] border border-dashed border-[#E2E8F0] p-6 text-center text-sm text-[#64748B]" data-testid="flight-no-snapshot">
              No AviationStack snapshot yet. The watcher pulls flight info on the day of the trip (within 24 h of pickup).
            </div>
          )}
          {snap?.status && (
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span>
                Status: <span className="inline-flex items-center gap-1 font-black uppercase text-[#0B3B5C]">
                  <CheckCircle2 className="w-3 h-3 text-[#059669]" /> {snap.status}
                </span>
              </span>
              <span>Last checked: {fmt(checkedAt)}</span>
            </div>
          )}

          {/* Event timeline */}
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-[#64748B] font-black mb-3">
              Fan-out events ({events.length})
            </div>
            {events.length === 0 ? (
              <div className="rounded-xl bg-[#F8FAFC] border border-dashed border-[#E2E8F0] p-6 text-center text-sm text-[#64748B]" data-testid="flight-events-empty">
                No SMS fan-outs have fired yet. Watch window = pickup ± [-6 h, +24 h].
              </div>
            ) : (
              <ul className="space-y-2" data-testid="flight-events-list">
                {events.map((tag, i) => {
                  const meta = prettyEvent(tag);
                  const Icon = meta.Icon;
                  return (
                    <li
                      key={`${tag}-${i}`}
                      className={`flex items-center gap-3 rounded-xl ${meta.bg} border border-[#E2E8F0] p-3`}
                      data-testid={`flight-event-${tag}`}
                    >
                      <div className={`w-8 h-8 rounded-full bg-white flex items-center justify-center ${meta.tone} shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-black ${meta.tone}`}>{meta.label}</div>
                        <div className="text-[10px] text-[#64748B] mono truncate">{tag}</div>
                      </div>
                      <Clock className="w-3.5 h-3.5 text-[#94a3b8]" />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
