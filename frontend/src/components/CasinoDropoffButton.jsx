import { useState } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";
import { api } from "../lib/api";

const fmt = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

// Driver taps this at the casino door; it starts the paid wait clock (guest gets a text 10 min before it ends).
export const CasinoDropoffButton = ({ bookingId, token, booking, onStarted }) => {
  const [busy, setBusy] = useState(false);
  if (!booking?.casino_wait) return null;
  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/bookings/${bookingId}/casino-dropoff`, { token });
      onStarted?.({ casino_wait_started_at: data.started_at, casino_wait_ends_at: data.ends_at });
      toast.success(`Wait started, pick up at ${fmt(data.ends_at)}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't start the wait");
    } finally {
      setBusy(false);
    }
  };
  if (booking.casino_wait_started_at) {
    return (
      <div className="mt-4 rounded-2xl bg-[#D4A94A]/10 border border-[#D4A94A]/40 p-4 text-center" data-testid="driver-casino-wait-running">
        <Timer className="w-6 h-6 text-[#D4A94A] mx-auto mb-1" />
        <div className="text-[#F5E1A4] font-semibold">Casino wait running</div>
        <div className="text-white/70 text-xs mt-1">Pick the guest up at {fmt(booking.casino_wait_ends_at)} (updates if they add time)</div>
      </div>
    );
  }
  return (
    <button type="button" onClick={start} disabled={busy}
      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#D4A94A] hover:bg-[#E5BC5A] text-[#0B192C] font-black py-3.5 disabled:opacity-60"
      data-testid="driver-casino-dropoff-btn">
      <Timer className="w-4 h-4" /> {busy ? "Starting…" : `Dropped at casino · start ${booking.casino_wait.minutes} min wait`}
    </button>
  );
};
