import { useEffect, useState } from "react";
import { Ship } from "lucide-react";
import { api } from "../lib/api";

// Tap-to-pick chips: ships listed in port on the booking date (falls back to today).
export const CruiseShipPicker = ({ bookingDate, value, onPick }) => {
  const [ships, setShips] = useState([]);
  useEffect(() => {
    api.get("/cruise-ships?days=21").then((r) => setShips(r.data)).catch(() => {});
  }, []);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Nassau" });
  const day = (bookingDate || "").slice(0, 10) || today;
  const names = [...new Set(ships.filter((s) => s.date === day).map((s) => s.ship_name))];
  if (!names.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="cruise-ship-picker">
      <span className="text-[11px] text-[#64748B] inline-flex items-center gap-1"><Ship className="w-3 h-3 text-[#D4A94A]" /> In port {day === today ? "today" : "that day"}:</span>
      {names.map((n) => (
        <button key={n} type="button" onClick={() => onPick(n)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${value === n ? "bg-[#0B3B5C] text-white border-[#0B3B5C]" : "border-[#0B3B5C]/20 text-[#0B3B5C] hover:bg-[#FBF7EF]"}`}
          data-testid={`cruise-ship-chip-${n.replace(/\s+/g, "-").toLowerCase()}`}>
          {n}
        </button>
      ))}
    </div>
  );
};
