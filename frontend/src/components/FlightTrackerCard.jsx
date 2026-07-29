import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Plane, Loader2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

/**
 * Airport flight tracker — customer types their flight number, we hit
 * AviationStack via /api/flight/{flightNumber} and show live status +
 * recommended pickup time.
 *
 * Props:
 *   value          → current form.flight_number
 *   onChange(v)    → setter for flight_number
 *   pickupDate     → current form.booking_date (ISO string) — if the API
 *                    returns a recommended_pickup we may suggest bumping it
 *   onSuggestPickup(iso) → callback when user accepts the suggested time
 */
export default function FlightTrackerCard({ value, onChange, pickupDate, onSuggestPickup }) {
  const [flight, setFlight] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error | not_found
  const [error, setError] = useState("");

  // Debounced lookup as the user types
  useEffect(() => {
    if (!value || value.trim().length < 3) {
      setFlight(null); setStatus("idle"); return;
    }
    const t = setTimeout(async () => {
      setStatus("loading"); setError("");
      try {
        const { data } = await api.get(`/flight/${encodeURIComponent(value.trim())}`);
        if (!data.found) { setStatus("not_found"); setFlight(null); return; }
        setFlight(data); setStatus("ok");
      } catch (e) {
        setStatus("error");
        setError(e?.response?.data?.detail || "Couldn't check flight status right now.");
      }
    }, 750);
    return () => clearTimeout(t);
  }, [value]);

  const fmt = (iso) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
    catch { return iso; }
  };

  const arrDelay = flight?.arrival?.delay_minutes;
  const statusColor = flight?.status === "landed" ? "emerald"
    : flight?.status === "active" ? "sky"
    : flight?.status === "cancelled" ? "red"
    : arrDelay > 15 ? "amber" : "emerald";

  const rec = flight?.recommended_pickup;
  const currentIso = pickupDate ? new Date(pickupDate).toISOString() : null;
  const recDiffers = rec && currentIso &&
    Math.abs(new Date(rec).getTime() - new Date(currentIso).getTime()) > 5 * 60 * 1000;

  return (
    <div className="rounded-2xl border border-[#EFE7D5] bg-white p-4 sm:p-5" data-testid="flight-tracker-card">
      <label className="block">
        <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black flex items-center gap-2 mb-2">
          <Plane className="w-3.5 h-3.5 text-[#0B3B5C]" /> Flight number (optional)
        </span>
        <div className="relative">
          <input
            type="text"
            value={value || ""}
            onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s+/g, ""))}
            placeholder="e.g. AA123, BA251, JBU617"
            maxLength={10}
            data-testid="flight-number-input"
            className="w-full rounded-xl border border-[#EFE7D5] bg-white px-4 py-3 pr-11 text-sm font-mono uppercase tracking-widest text-[#0B3B5C] focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20"
          />
          {status === "loading" && (
            <Loader2 className="w-4 h-4 text-[#D4A94A] animate-spin absolute right-4 top-1/2 -translate-y-1/2" />
          )}
          {status === "ok" && (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-4 top-1/2 -translate-y-1/2" />
          )}
        </div>
        <span className="text-[11px] text-[#94a3b8] mt-1.5 block">We'll auto-adjust pickup if your flight is delayed.</span>
      </label>

      {status === "not_found" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800" data-testid="flight-not-found">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Flight <b className="font-mono">{value}</b> not found. Double-check the IATA code (e.g. AA123 not AAL123).</span>
        </div>
      )}

      {status === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800" data-testid="flight-error">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {status === "ok" && flight && (
        <div className="mt-4 space-y-3" data-testid="flight-info">
          <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-widest text-${statusColor}-700`}>
            <span className={`inline-block w-2 h-2 rounded-full bg-${statusColor}-500 ${flight.status === "active" ? "animate-pulse" : ""}`} />
            {flight.status || "scheduled"}
            {arrDelay != null && arrDelay > 0 && <span className="text-amber-700 ml-1">· {arrDelay} min late</span>}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-[#FBF7EF] border border-[#EFE7D5] p-3">
              <div className="text-[9px] tracking-[0.28em] uppercase text-[#64748B] font-black">From</div>
              <div className="mono text-lg text-[#0B3B5C] font-black mt-0.5" data-testid="flight-departure-iata">{flight.departure.airport_iata || "—"}</div>
              <div className="text-[11px] text-[#64748B] truncate">{flight.departure.airport || ""}</div>
              <div className="text-[11px] text-[#64748B] mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {fmt(flight.departure.actual || flight.departure.scheduled)}</div>
            </div>
            <div className="rounded-xl bg-[#D4A94A]/8 border border-[#D4A94A]/30 p-3" style={{ backgroundColor: "rgba(212,169,74,0.08)" }}>
              <div className="text-[9px] tracking-[0.28em] uppercase text-[#8a6b1f] font-black">Arriving Nassau</div>
              <div className="mono text-lg text-[#0B3B5C] font-black mt-0.5" data-testid="flight-arrival-iata">{flight.arrival.airport_iata || "—"}</div>
              <div className="text-[11px] text-[#64748B]">Airline: {flight.airline || "—"}</div>
              <div className="text-[11px] text-[#0B3B5C] font-semibold mt-1 flex items-center gap-1" data-testid="flight-arrival-time"><Clock className="w-3 h-3" /> {fmt(flight.arrival.actual || flight.arrival.estimated || flight.arrival.scheduled)}</div>
            </div>
          </div>

          {rec && recDiffers && (
            <button
              type="button"
              onClick={() => onSuggestPickup?.(rec)}
              data-testid="flight-adjust-pickup-btn"
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-colors"
            >
              <Clock className="w-3.5 h-3.5" /> Adjust pickup to {fmt(rec)}
            </button>
          )}
          {rec && !recDiffers && (
            <div className="text-[11px] text-emerald-700 flex items-center gap-1.5" data-testid="flight-pickup-aligned">
              <CheckCircle2 className="w-3.5 h-3.5" /> Your pickup time already matches this flight's arrival + 25 min buffer.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
