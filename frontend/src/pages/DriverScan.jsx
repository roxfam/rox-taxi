import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { CheckCircle2, MapPin, Clock, User, Loader2, AlertTriangle, ArrowLeft } from "lucide-react";

/**
 * Driver-side scan-in page.
 *
 *   `/driver/scan?b={booking_id}&t={hmac_token}`
 *
 * The QR code baked into the guest's booking pass encodes this URL. When
 * the driver scans it (from any camera app), their phone opens this page
 * with the two query params. The driver sees a full booking summary and
 * can tweak pickup time / location before hitting "Confirm pickup" —
 * useful for cruise ports where the exact meeting spot shifts by berth.
 *
 * The token is HMAC-signed server-side so a bad actor can't just guess a
 * booking id and mark it picked up.
 */
export default function DriverScan() {
  const [sp] = useSearchParams();
  const bookingId = (sp.get("b") || "").toUpperCase();
  const token = sp.get("t") || "";

  const [booking, setBooking] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Editable dispatch fields — pre-filled from the booking, but drivers can
  // fix on the fly (e.g. "meeting at berth 3 instead of the main terminal").
  const [pickupTime, setPickupTime] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");

  useEffect(() => {
    if (!bookingId || !token) {
      setLoadErr("Invalid scan link — missing booking or token.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get(`/bookings/${bookingId}/scan-preview`, { params: { t: token } });
        setBooking(data);
        setPickupTime(data.booking_time || data.pickup_time || "");
        setPickupLocation(data.pickup_location || "");
      } catch (e) {
        setLoadErr(e?.response?.data?.detail || "Booking not found or token invalid.");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId, token]);

  const confirm = async () => {
    setSubmitting(true);
    // Best-effort GPS ping — asks the driver's browser for a one-shot
    // location. If denied, timed-out, or unsupported we still POST the
    // check-in without it so the driver isn't blocked.
    const getGps = () => new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
      );
    });
    const gps = await getGps();
    try {
      const { data } = await api.post(`/bookings/${bookingId}/driver-checkin`, {
        token,
        confirmed_pickup_time: pickupTime,
        confirmed_pickup_location: pickupLocation,
        driver_pickup_lat: gps?.lat ?? null,
        driver_pickup_lng: gps?.lng ?? null,
        driver_pickup_accuracy_m: gps?.accuracy ?? null,
      });
      setBooking((b) => ({ ...b, ...(data.booking || {}) }));
      setDone(true);
      toast.success(gps ? "Pickup confirmed with GPS · guest notified" : "Pickup confirmed · guest notified");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Confirmation failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B192C] text-white flex items-center justify-center px-6" data-testid="driver-scan-loading">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4A94A]" />
      </div>
    );
  }

  if (loadErr || !booking) {
    return (
      <div className="min-h-screen bg-[#0B192C] text-white flex items-center justify-center px-6" data-testid="driver-scan-error">
        <div className="max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-[#E86A3C] mx-auto mb-4" />
          <h1 className="serif text-2xl mb-2">Scan failed</h1>
          <p className="text-white/70 text-sm mb-6">{loadErr || "Please re-scan the guest's QR code from their booking pass."}</p>
          <Link to="/driver/manifest" className="inline-flex items-center gap-2 rounded-full bg-[#D4A94A] text-[#0B192C] px-5 py-2.5 text-sm font-semibold">
            <ArrowLeft className="w-4 h-4" /> Back to manifest
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B192C] text-white px-6 py-10" data-testid="driver-scan-page">
      <div className="max-w-lg mx-auto">
        <div className="text-[10px] tracking-[0.32em] uppercase text-[#D4A94A] font-black mb-2">Driver check-in</div>
        <h1 className="serif text-4xl leading-tight" data-testid="driver-scan-title">
          {done ? "Guest confirmed" : "Confirm this pickup"}
        </h1>
        <p className="text-white/60 text-sm mt-2">
          {done
            ? "The guest's status has been updated on Track. Safe drive."
            : "Verify the pickup details below and tap Confirm when you meet the guest."}
        </p>

        <div className="mt-8 rounded-3xl bg-white/5 border border-white/10 p-6" data-testid="driver-scan-summary">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/50">Booking</div>
              <div className="mono text-2xl text-[#D4A94A] mt-1" data-testid="driver-scan-booking-id">{booking.id}</div>
            </div>
            <span
              className={`text-[10px] tracking-widest uppercase font-black px-3 py-1.5 rounded-full ${
                done ? "bg-emerald-500/20 text-emerald-300" : "bg-[#D4A94A]/20 text-[#D4A94A]"
              }`}
              data-testid="driver-scan-status-pill"
            >
              {done ? "Picked up" : (booking.status || "pending")}
            </span>
          </div>

          <div className="mt-5 space-y-3 text-sm">
            <Row icon={<User className="w-4 h-4" />} label="Guest">
              <div>
                <div className="text-white font-semibold" data-testid="driver-scan-guest-name">{booking.customer_name}</div>
                {booking.customer_phone && (
                  <a href={`tel:${booking.customer_phone}`} className="text-[#D4A94A] font-mono text-xs">{booking.customer_phone}</a>
                )}
              </div>
            </Row>
            <Row icon={<MapPin className="w-4 h-4" />} label="Service">
              <div className="text-white/85">{booking.item_name}</div>
            </Row>
            <Row icon={<User className="w-4 h-4" />} label="Passengers">
              <div className="text-white/85">{booking.billed_passengers || booking.passengers || 1}</div>
            </Row>
          </div>

          <div className="mt-6 pt-5 border-t border-white/10 space-y-4">
            <label className="block">
              <span className="block text-[10px] tracking-[0.28em] uppercase text-white/50 mb-1.5">Confirm pickup time</span>
              <input
                type="time"
                value={pickupTime}
                disabled={done}
                onChange={(e) => setPickupTime(e.target.value)}
                data-testid="driver-scan-time-input"
                className="w-full rounded-xl bg-white/5 border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#D4A94A] focus:outline-none mono disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] tracking-[0.28em] uppercase text-white/50 mb-1.5">Confirm pickup location</span>
              <input
                type="text"
                value={pickupLocation}
                disabled={done}
                onChange={(e) => setPickupLocation(e.target.value)}
                data-testid="driver-scan-location-input"
                placeholder="Berth 3, gate B, hotel lobby…"
                className="w-full rounded-xl bg-white/5 border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#D4A94A] focus:outline-none disabled:opacity-60"
              />
              <span className="block text-[11px] text-white/40 mt-1.5">Edit if you're meeting the guest at a different spot from what's on the booking.</span>
            </label>
          </div>

          {!done && (
            <button
              type="button"
              onClick={confirm}
              disabled={submitting}
              data-testid="driver-scan-confirm-btn"
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#D4A94A] text-[#0B192C] px-6 py-3.5 text-sm font-black uppercase tracking-widest hover:bg-[#e0b856] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {submitting ? "Confirming…" : "Confirm pickup"}
            </button>
          )}

          {done && (
            <div className="mt-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-center" data-testid="driver-scan-done-banner">
              <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
              <div className="text-emerald-200 font-semibold">Pickup confirmed at {pickupTime || "—"}</div>
              <div className="text-emerald-300/70 text-xs mt-1">Guest was auto-notified. Track updated.</div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link to="/driver/manifest" className="text-white/50 text-xs hover:text-white/80 inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3 h-3" /> Back to today's manifest
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/5 border border-white/10 text-white/60">{icon}</span>
      <div className="flex-1">
        <div className="text-[10px] tracking-[0.28em] uppercase text-white/40">{label}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
