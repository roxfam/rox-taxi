import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { MapPin, Play, Pause, Signal, AlertTriangle, Check } from "lucide-react";

/**
 * Driver-facing page — /driver/:booking_id.
 * The driver hits Start; browser geolocation.watchPosition streams pings
 * every ~5s to POST /api/drivers/location which the customer's Track page reads.
 */
export default function DriverShare() {
  const { booking_id } = useParams();
  const [sharing, setSharing] = useState(false);
  const [lastPing, setLastPing] = useState(null);
  const [error, setError] = useState("");
  const [pingCount, setPingCount] = useState(0);
  const watchIdRef = useRef(null);

  const start = () => {
    if (!("geolocation" in navigator)) {
      setError("Your browser can't share location. Use Safari or Chrome on a phone.");
      return;
    }
    setError("");
    setSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          const payload = {
            booking_id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
            heading: pos.coords.heading,
            speed_mps: pos.coords.speed,
          };
          await api.post("/drivers/location", payload);
          setLastPing({ ...payload, at: new Date().toISOString() });
          setPingCount((n) => n + 1);
          setError("");
        } catch (e) {
          setError(e?.response?.data?.detail || "Ping failed — retrying…");
        }
      },
      (err) => {
        setError(`Location denied: ${err.message}. Grant location to this page.`);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  };

  const stop = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setSharing(false);
  };

  useEffect(() => () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); }, []);

  return (
    <div className="min-h-screen bg-[#0B192C] text-white flex flex-col items-center justify-center p-6" data-testid="driver-share-page">
      <div className="w-full max-w-md rounded-3xl bg-white/5 border border-white/10 p-8 backdrop-blur">
        <div className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A]">
          <Signal className="w-3 h-3" /> Rox driver
        </div>
        <h1 className="serif text-4xl mt-2">Trip <em className="italic text-[#F5E1A4]">{booking_id}</em></h1>
        <p className="text-white/60 mt-2 text-sm">
          Tap Start to share your live location with this rider. Your phone will keep the tab open —
          keep the screen on. Hit Stop when you arrive.
        </p>

        {!sharing ? (
          <button
            onClick={start}
            data-testid="driver-share-start"
            className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] py-4 text-lg font-semibold active:scale-95 transition-transform"
          >
            <Play className="w-5 h-5" /> Start sharing
          </button>
        ) : (
          <button
            onClick={stop}
            data-testid="driver-share-stop"
            className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#0B192C] hover:bg-white/90 py-4 text-lg font-semibold active:scale-95 transition-transform"
          >
            <Pause className="w-5 h-5" /> Stop sharing
          </button>
        )}

        {sharing && (
          <div className="mt-6 space-y-2" data-testid="driver-share-status">
            <div className="flex items-center gap-2 text-sm text-[#D4A94A]">
              <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" /> Live
              <span className="text-white/60">— {pingCount} ping{pingCount === 1 ? "" : "s"} sent</span>
            </div>
            {lastPing && (
              <div className="text-xs text-white/60 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {lastPing.lat.toFixed(5)}, {lastPing.lng.toFixed(5)}
                {lastPing.accuracy_m && ` · ±${Math.round(lastPing.accuracy_m)}m`}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 text-xs text-[#E86A3C]" data-testid="driver-share-error">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {pingCount > 0 && !sharing && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[#22c55e]">
            <Check className="w-4 h-4" /> Sharing stopped. Rider saw {pingCount} update{pingCount === 1 ? "" : "s"}.
          </div>
        )}
      </div>
    </div>
  );
}
