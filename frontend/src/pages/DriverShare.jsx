import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, BACKEND_URL } from "../lib/api";
import {
  MapPin, Play, Pause, Signal, AlertTriangle, Check, BellRing,
  Navigation2, Flag, Ban, User, Phone, MessageCircle, Camera, X, Zap, HelpCircle,
} from "lucide-react";

// Driver mobile console — /driver/:booking_id
// Two responsibilities in one screen:
//   1) Live GPS sharing (same as before) so the guest's Track page has an
//      ETA marker.
//   2) One-tap status + arrival notification actions so the driver never
//      has to open the admin app on their phone just to say "I'm here."
//
// Auth: possession of `booking_id` acts as a capability token (same model
// as `/drivers/location`). The private link is only shared with the
// dispatched driver.
const STEPS = [
  { key: "en_route", label: "On my way",   Icon: Navigation2, tint: "#E86A3C" },
  { key: "arrived",  label: "I've arrived", Icon: BellRing,    tint: "#059669" },
  { key: "completed", label: "Trip done",  Icon: Flag,        tint: "#0B3B5C" },
  { key: "no_show",  label: "No-show",     Icon: Ban,         tint: "#DC2626" },
];

const STATUS_META = {
  confirmed:       { label: "Confirmed",  tint: "#0B3B5C" },
  driver_assigned: { label: "Assigned",   tint: "#D4A94A" },
  en_route:        { label: "En route",   tint: "#E86A3C" },
  arrived:         { label: "At pickup",  tint: "#059669" },
  completed:       { label: "Completed",  tint: "#64748B" },
  no_show:         { label: "No-show",    tint: "#DC2626" },
  cancelled:       { label: "Cancelled",  tint: "#DC2626" },
  pending_payment: { label: "Pending pay", tint: "#94a3b8" },
};

export default function DriverShare() {
  const { booking_id } = useParams();
  const [booking, setBooking] = useState(null);
  const [loadingBooking, setLoadingBooking] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [lastPing, setLastPing] = useState(null);
  const [error, setError] = useState("");
  const [pingCount, setPingCount] = useState(0);
  const [advancing, setAdvancing] = useState("");
  const [notifying, setNotifying] = useState(false);
  const [note, setNote] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const watchIdRef = useRef(null);
  const photoInputRef = useRef(null);

  const loadBooking = async () => {
    try {
      const { data } = await api.get(`/driver/${booking_id}`);
      setBooking(data);
    } catch (e) {
      setError(e?.response?.data?.detail || "Couldn't load booking. Double-check the link.");
    } finally {
      setLoadingBooking(false);
    }
  };

  useEffect(() => { loadBooking(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [booking_id]);

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
          const { data } = await api.post("/drivers/location", payload);
          setLastPing({ ...payload, at: new Date().toISOString() });
          setPingCount((n) => n + 1);
          setError("");
          // Backend just fired the "~5 min away" auto-ping — surface a
          // one-shot toast so the driver knows the guest was warned.
          if (data?.eta_auto_ping) {
            toast.success("Guest auto-pinged: ~5 minutes away ✓");
            loadBooking();
          }
        } catch (e) {
          setError(e?.response?.data?.detail || "Ping failed — retrying…");
        }
      },
      (err) => setError(`Location denied: ${err.message}. Grant location to this page.`),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  };

  const stop = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setSharing(false);
  };

  useEffect(() => () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); }, []);

  const advance = async (nextStatus) => {
    if (!booking) return;
    setAdvancing(nextStatus);
    try {
      const { data } = await api.post(`/driver/${booking_id}/status`, {
        status: nextStatus,
        note: note.trim() || undefined,
      });
      setBooking((b) => ({ ...b, status: nextStatus, driver_note: note.trim() || b?.driver_note }));
      if (nextStatus === "arrived") {
        const emailOk = data?.notification?.email?.sent;
        const smsOk = data?.notification?.sms?.sent;
        if (emailOk || smsOk) {
          toast.success(`Guest notified — ${[emailOk && "email", smsOk && "SMS"].filter(Boolean).join(" + ")} sent ✓`);
        } else {
          toast.warning("Status updated — but no phone/email on file to notify guest.");
        }
      } else {
        toast.success(`Status → ${STATUS_META[nextStatus]?.label || nextStatus}`);
      }
      setNote("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    } finally {
      setAdvancing("");
    }
  };

  const resendArrival = async () => {
    setNotifying(true);
    try {
      const { data } = await api.post(`/driver/${booking_id}/notify-arrival`, {
        status: "arrived", // required by shared model but ignored here
        note: note.trim() || undefined,
      });
      const emailOk = data?.notification?.email?.sent;
      const smsOk = data?.notification?.sms?.sent;
      if (emailOk || smsOk) {
        toast.success(`Guest re-notified — ${[emailOk && "email", smsOk && "SMS"].filter(Boolean).join(" + ")}`);
      } else {
        toast.warning("Sent — but no phone/email on file for this guest.");
      }
      setNote("");
      loadBooking();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Notify failed");
    } finally {
      setNotifying(false);
    }
  };

  const uploadHandoffPhoto = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/driver/${booking_id}/handoff-photo`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBooking((b) => ({ ...b, handoff_photos: data.photos }));
      toast.success("Pickup photo saved to the booking ✓");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Photo upload failed");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const deleteHandoffPhoto = async (url) => {
    try {
      await api.delete(`/driver/${booking_id}/handoff-photo`, { params: { url } });
      setBooking((b) => ({
        ...b,
        handoff_photos: (b?.handoff_photos || []).filter((p) => p.url !== url),
      }));
      toast.success("Photo removed");
      setPreviewPhoto(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${BACKEND_URL}${u}`);

  const meta = STATUS_META[booking?.status] || STATUS_META.confirmed;
  const isClosed = booking && ["completed", "cancelled", "no_show"].includes(booking.status);
  const phone = (booking?.customer_phone || "").replace(/[^+\d]/g, "");

  return (
    <div className="min-h-screen bg-[#0B192C] text-white flex flex-col items-center p-4 pb-24" data-testid="driver-share-page">
      <div className="w-full max-w-md mt-6 flex items-center justify-between text-xs">
        <a href="/driver/manifest" className="text-white/50 hover:text-white">← Manifest</a>
        <a href="/driver/help" className="inline-flex items-center gap-1 text-[#D4A94A] hover:text-[#E5BC5A] font-bold" data-testid="driver-share-help-link">
          <HelpCircle className="w-3.5 h-3.5" /> How to use this
        </a>
      </div>
      <div className="w-full max-w-md mt-3 rounded-3xl bg-white/5 border border-white/10 p-6 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.32em] uppercase text-[#D4A94A] font-black">
            <Signal className="w-3 h-3" /> Rox driver
          </div>
          {booking && (
            <span
              className="text-[10px] uppercase tracking-widest font-black rounded-full px-2.5 py-1"
              style={{ color: meta.tint, background: `${meta.tint}22` }}
              data-testid="driver-share-status-pill"
            >
              {meta.label}
            </span>
          )}
        </div>

        <h1 className="serif text-3xl mt-2">
          Trip <em className="italic text-[#F5E1A4]">{booking_id}</em>
        </h1>

        {loadingBooking ? (
          <p className="text-white/50 mt-3 text-sm">Loading booking…</p>
        ) : booking ? (
          <div className="mt-3 space-y-2 text-sm text-white/80" data-testid="driver-share-booking">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#D4A94A] shrink-0" />
              <span className="font-semibold">{booking.customer_name || "Guest"}</span>
              {booking.passengers && <span className="text-white/50">· {booking.passengers} pax</span>}
            </div>
            {booking.pickup_location && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-white">{booking.pickup_location}</div>
                  {booking.dropoff_location && (
                    <div className="text-white/50 text-xs mt-0.5">→ {booking.dropoff_location}</div>
                  )}
                </div>
              </div>
            )}
            {booking.driver_arrival_notified_at && (
              <div className="text-[11px] text-[#059669] flex items-center gap-1">
                <Check className="w-3 h-3" /> Guest already pinged at {new Date(booking.driver_arrival_notified_at).toLocaleTimeString()}
              </div>
            )}
            {booking.eta_auto_ping_sent_at && !booking.driver_arrival_notified_at && (
              <div className="text-[11px] text-[#E86A3C] flex items-center gap-1" data-testid="driver-share-eta-auto-fired">
                <Zap className="w-3 h-3" /> ~5-min ETA auto-ping sent at {new Date(booking.eta_auto_ping_sent_at).toLocaleTimeString()}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[#E86A3C] mt-3 text-sm">Booking not found for this link.</p>
        )}
      </div>

      {/* Quick contact row */}
      {booking && phone && !isClosed && (
        <div className="w-full max-w-md mt-3 grid grid-cols-2 gap-2" data-testid="driver-share-contact-row">
          <a
            href={`tel:${phone}`}
            className="rounded-2xl bg-[#059669] text-white text-sm font-bold py-3 flex items-center justify-center gap-1.5 active:scale-95"
            data-testid="driver-share-call"
          >
            <Phone className="w-4 h-4" /> Call guest
          </a>
          <a
            href={`https://wa.me/${phone.replace(/[^\d]/g, "")}`}
            target="_blank" rel="noreferrer"
            className="rounded-2xl bg-[#25D366] text-white text-sm font-bold py-3 flex items-center justify-center gap-1.5 active:scale-95"
            data-testid="driver-share-wa"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        </div>
      )}

      {/* Status actions — the whole point of this feature */}
      {booking && !isClosed && (
        <div className="w-full max-w-md mt-3 rounded-3xl bg-white/5 border border-white/10 p-5 backdrop-blur" data-testid="driver-share-actions">
          <div className="text-[10px] tracking-[0.32em] uppercase text-white/60 font-black mb-3">
            Update the guest
          </div>

          {/* Optional short note attached to the next action + guest ping */}
          <label className="block mb-3">
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Note to guest (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 120))}
              placeholder="e.g. Black SUV at front entrance"
              maxLength={120}
              data-testid="driver-share-note"
              className="mt-1 w-full rounded-full bg-white/10 border border-white/15 text-white placeholder-white/40 text-sm px-4 py-2.5 focus:outline-none focus:border-[#D4A94A]"
            />
          </label>

          <div className="grid grid-cols-2 gap-2" data-testid="driver-share-step-grid">
            {STEPS.map((s) => {
              const active = advancing === s.key;
              const Ico = s.Icon;
              const isArrival = s.key === "arrived";
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => advance(s.key)}
                  disabled={!!advancing}
                  data-testid={`driver-share-step-${s.key}`}
                  className="rounded-2xl text-white text-sm font-bold py-3.5 px-3 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 transition-all"
                  style={{ background: s.tint, boxShadow: isArrival ? "0 10px 30px rgba(5,150,105,0.35)" : "none" }}
                >
                  <Ico className="w-4 h-4" />
                  {active ? "…" : s.label}
                </button>
              );
            })}
          </div>

          {/* Re-send arrival notification (for the "guest missed it" case) */}
          {booking.status === "arrived" && (
            <button
              type="button"
              onClick={resendArrival}
              disabled={notifying}
              data-testid="driver-share-resend-arrival"
              className="mt-3 w-full rounded-2xl bg-[#D4A94A]/15 border border-[#D4A94A]/40 text-[#D4A94A] text-sm font-bold py-3 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <BellRing className="w-4 h-4" /> {notifying ? "Re-sending…" : "Re-send \"I've arrived\" ping"}
            </button>
          )}

          <div className="mt-3 text-[10px] text-white/40 leading-relaxed text-center">
            Tapping "I've arrived" auto-sends an SMS + email to the guest.
          </div>
        </div>
      )}

      {/* Photo handoff proof — camera capture on mobile, receipts for no-show
          disputes and rental delivery-condition claims. */}
      {booking && !isClosed && (
        <div className="w-full max-w-md mt-3 rounded-3xl bg-white/5 border border-white/10 p-5 backdrop-blur" data-testid="driver-share-photos">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] tracking-[0.32em] uppercase text-white/60 font-black">
              Handoff proof photos
            </div>
            <span className="text-[10px] text-white/50 font-bold">
              {(booking.handoff_photos || []).length}
            </span>
          </div>

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            data-testid="driver-share-photo-input"
            onChange={(e) => uploadHandoffPhoto(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            data-testid="driver-share-photo-capture"
            className="w-full rounded-2xl bg-[#D4A94A] text-[#0B192C] text-sm font-bold py-3 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
          >
            <Camera className="w-4 h-4" />
            {uploadingPhoto ? "Uploading…" : "Snap pickup photo"}
          </button>

          {(booking.handoff_photos || []).length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2" data-testid="driver-share-photo-grid">
              {(booking.handoff_photos || []).map((p) => (
                <button
                  key={p.url}
                  type="button"
                  onClick={() => setPreviewPhoto(p)}
                  data-testid={`driver-share-photo-thumb-${p.url.split("_").pop()}`}
                  className="aspect-square rounded-xl overflow-hidden ring-1 ring-white/20 hover:ring-[#D4A94A] transition-all active:scale-95"
                >
                  <img src={resolveUrl(p.url)} alt="Handoff proof" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 text-[10px] text-white/40 leading-relaxed text-center">
            Snap a photo of the guest, luggage, or vehicle at pickup — saved to this booking as receipt.
          </div>
        </div>
      )}

      {/* Lightbox / delete confirm for a single handoff photo */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
          data-testid="driver-share-photo-preview"
        >
          <div className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <img src={resolveUrl(previewPhoto.url)} alt="Handoff proof" className="w-full rounded-2xl" />
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-white/60 text-xs">
                {new Date(previewPhoto.uploaded_at).toLocaleString()}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => deleteHandoffPhoto(previewPhoto.url)}
                  data-testid="driver-share-photo-delete"
                  className="rounded-full bg-[#DC2626] text-white text-xs font-bold px-3 py-2"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="rounded-full bg-white text-[#0B192C] text-xs font-bold px-3 py-2 inline-flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GPS live-share block — unchanged core, restyled to match new layout */}
      {!isClosed && (
        <div className="w-full max-w-md mt-3 rounded-3xl bg-white/5 border border-white/10 p-5 backdrop-blur" data-testid="driver-share-gps">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.32em] uppercase text-white/60 font-black">Live location</div>
              <div className="text-sm text-white/70 mt-1">
                Streams your GPS to the rider's Track page. Keep the screen on.
              </div>
            </div>
          </div>

          {!sharing ? (
            <button
              onClick={start}
              data-testid="driver-share-start"
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] py-3.5 text-base font-bold active:scale-95"
            >
              <Play className="w-5 h-5" /> Start GPS sharing
            </button>
          ) : (
            <button
              onClick={stop}
              data-testid="driver-share-stop"
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#0B192C] py-3.5 text-base font-bold active:scale-95"
            >
              <Pause className="w-5 h-5" /> Stop sharing
            </button>
          )}

          {sharing && (
            <div className="mt-4 space-y-2" data-testid="driver-share-status">
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
              <div className="text-[10px] text-white/40 leading-relaxed pt-1">
                <Zap className="w-3 h-3 inline text-[#E86A3C] mr-0.5" /> Guest auto-pings when you're within 800m (~5 min) of pickup.
              </div>
            </div>
          )}

          {pingCount > 0 && !sharing && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#22c55e]">
              <Check className="w-4 h-4" /> Sharing stopped. Rider saw {pingCount} update{pingCount === 1 ? "" : "s"}.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="w-full max-w-md mt-3 flex items-start gap-2 text-xs text-[#E86A3C] rounded-2xl bg-[#E86A3C]/10 border border-[#E86A3C]/30 p-3" data-testid="driver-share-error">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {isClosed && (
        <div className="w-full max-w-md mt-3 rounded-2xl bg-white/5 border border-white/10 p-5 text-center text-sm text-white/70" data-testid="driver-share-closed">
          This trip is <span className="font-bold text-white">{meta.label.toLowerCase()}</span> — driver actions are locked.
        </div>
      )}
    </div>
  );
}
