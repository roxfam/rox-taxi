import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Timer } from "lucide-react";
import { api } from "../lib/api";

const fmt = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const pad = (n) => String(n).padStart(2, "0");

const DriverCountdown = ({ bookingId, token, endsAt: initialEnd }) => {
  const [endsAt, setEndsAt] = useState(initialEnd);
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const { data } = await api.get(`/bookings/${bookingId}/casino-wait/driver`, { params: { token } });
        setEndsAt((prev) => {
          if (data.ends_at && data.ends_at !== prev) {
            setFlash(true);
            setTimeout(() => setFlash(false), 4000);
            toast.success(`Guest added time, new pickup ${fmt(data.ends_at)}`);
          }
          return data.ends_at || prev;
        });
      } catch {
        /* keep last known time */
      }
    }, 30000);
    return () => clearInterval(poll);
  }, [bookingId, token]);
  const left = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  const over = left === 0;
  const soon = !over && left <= 600;
  const tone = over ? "border-red-500/60 bg-red-500/10" : soon ? "border-orange-400/60 bg-orange-400/10" : "border-[#D4A94A]/40 bg-[#D4A94A]/10";
  const label = over ? "Wait is over, head back now" : soon ? "Head back to the casino" : "Casino wait running";
  return (
    <div className={`mt-4 rounded-2xl border p-4 text-center transition-colors ${tone} ${flash ? "ring-2 ring-emerald-400" : ""}`} data-testid="driver-casino-wait-running">
      <Timer className={`w-6 h-6 mx-auto mb-1 ${over ? "text-red-400" : soon ? "text-orange-300" : "text-[#D4A94A]"}`} />
      <div className="text-[#F5E1A4] font-semibold" data-testid="driver-casino-wait-status">{label}</div>
      <div className="font-mono font-black text-4xl text-white tracking-wider my-2 tabular-nums" data-testid="driver-casino-countdown">
        {pad(Math.floor(left / 3600))}:{pad(Math.floor((left % 3600) / 60))}:{pad(left % 60)}
      </div>
      <div className="text-white/70 text-xs" data-testid="driver-casino-pickup-time">Pick the guest up at {fmt(endsAt)} · updates if they add time</div>
    </div>
  );
};

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
    return <DriverCountdown bookingId={bookingId} token={token} endsAt={booking.casino_wait_ends_at} />;
  }
  return (
    <button type="button" onClick={start} disabled={busy}
      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#D4A94A] hover:bg-[#E5BC5A] text-[#0B192C] font-black py-3.5 disabled:opacity-60"
      data-testid="driver-casino-dropoff-btn">
      <Timer className="w-4 h-4" /> {busy ? "Starting…" : `Dropped at casino · start ${booking.casino_wait.minutes} min wait`}
    </button>
  );
};
