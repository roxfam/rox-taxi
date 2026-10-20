import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Timer, UserCheck, BellRing } from "lucide-react";
import { api } from "../lib/api";

const fmt = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const pad = (n) => String(n).padStart(2, "0");

let audioCtx;
const unlockAudio = () => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = audioCtx || new AC();
  if (audioCtx.state === "suspended") audioCtx.resume();
};

// Three short beeps + vibration pattern for the 10-minute warning.
const alertDriver = () => {
  try {
    unlockAudio();
    [0, 0.35, 0.7].forEach((t) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.4, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.25);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.25);
    });
  } catch {
    /* audio blocked */
  }
  navigator.vibrate?.([400, 150, 400, 150, 400]);
};

const PickedUpButton = ({ bookingId, token, onDone }) => {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!window.confirm("Guest is in the car? This stops the wait clock.")) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/bookings/${bookingId}/casino-pickup`, { token });
      onDone(data);
      toast.success(`Picked up · total wait ${data.waited_minutes} min`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't stop the wait");
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={go} disabled={busy}
      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-[#0B192C] font-black py-3 disabled:opacity-60"
      data-testid="driver-casino-pickup-btn">
      <UserCheck className="w-4 h-4" /> {busy ? "Stopping…" : "Guest picked up"}
    </button>
  );
};

const useEndsAtPolling = (bookingId, token, initialEnd) => {
  const [endsAt, setEndsAt] = useState(initialEnd);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const { data } = await api.get(`/bookings/${bookingId}/casino-wait/driver`, { params: { token } });
        if (data.ends_at) {
          setEndsAt((prev) => {
            if (data.ends_at !== prev) {
              setFlash(true);
              setTimeout(() => setFlash(false), 4000);
              toast.success(`Guest added time, new pickup ${fmt(data.ends_at)}`);
            }
            return data.ends_at;
          });
        }
      } catch {
        /* keep last known time */
      }
    }, 30000);
    return () => clearInterval(poll);
  }, [bookingId, token]);
  return [endsAt, flash];
};

const DriverCountdown = ({ bookingId, token, endsAt: initialEnd, onPickedUp }) => {
  const [endsAt, flash] = useEndsAtPolling(bookingId, token, initialEnd);
  const [now, setNow] = useState(Date.now());
  const alertedFor = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("pointerdown", unlockAudio);
    return () => { clearInterval(t); document.removeEventListener("pointerdown", unlockAudio); };
  }, []);
  const left = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  useEffect(() => {
    if (left > 0 && left <= 600 && alertedFor.current !== endsAt) {
      alertedFor.current = endsAt;
      alertDriver();
      toast.warning("10 minutes left, head back to the casino");
    }
  }, [left, endsAt]);
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
      <div className="text-white/50 text-[11px] mt-1 inline-flex items-center gap-1"><BellRing className="w-3 h-3" /> Phone beeps and vibrates at 10 min left</div>
      <PickedUpButton bookingId={bookingId} token={token} onDone={onPickedUp} />
    </div>
  );
};

// Driver taps this at the casino door; it starts the paid wait clock (guest gets a text 10 min before it ends).
export const CasinoDropoffButton = ({ bookingId, token, booking, onStarted }) => {
  const [busy, setBusy] = useState(false);
  if (!booking?.casino_wait) return null;
  const start = async () => {
    unlockAudio();
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
  if (booking.casino_wait_picked_up_at) {
    const m = booking.casino_waited_minutes || 0;
    return (
      <div className="mt-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/40 p-4 text-center" data-testid="driver-casino-wait-done">
        <UserCheck className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
        <div className="text-emerald-200 font-semibold">Guest picked up</div>
        <div className="text-white/70 text-xs mt-1" data-testid="driver-casino-waited">Total wait {Math.floor(m / 60)}h {m % 60}m · owner has been texted</div>
      </div>
    );
  }
  if (booking.casino_wait_started_at) {
    return (
      <DriverCountdown bookingId={bookingId} token={token} endsAt={booking.casino_wait_ends_at}
        onPickedUp={(d) => onStarted?.({ casino_wait_picked_up_at: d.picked_up_at, casino_waited_minutes: d.waited_minutes })} />
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
