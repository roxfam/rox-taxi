import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";
import { CheckCircle2, Users, Phone, MapPin, AlertTriangle, Loader2, Umbrella, Utensils, Waves, Clock } from "lucide-react";

/**
 * Beach-attendant scan page — mobile-optimised.
 *
 *   `/attendant/scan?b={booking_id}&t={hmac_token}`
 *
 * The QR embedded in the guest's confirmation email encodes this URL. The
 * attendant opens it with any camera app, sees the full order (lunch,
 * drinks, water sports, allergies, transfer) and taps "Mark Arrived" to
 * flip the booking status and fire the welcome SMS back to the guest.
 */
export default function AttendantScan() {
  const [sp] = useSearchParams();
  const bookingId = (sp.get("b") || "").toUpperCase();
  const token = sp.get("t") || "";

  const [booking, setBooking] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attendantName, setAttendantName] = useState("");

  useEffect(() => {
    if (!bookingId || !token) {
      setLoadErr("Invalid scan link — missing booking or token.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await api.get(`/cable-beach/${bookingId}/attendant-view`, { params: { t: token } });
        setBooking(data);
      } catch (e) {
        setLoadErr(e?.response?.data?.detail || "Booking not found or token invalid.");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId, token]);

  const markArrived = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post(`/cable-beach/${bookingId}/attendant-arrived`, {
        token,
        attendant_name: attendantName.trim() || null,
      });
      setBooking((prev) => ({ ...prev, status: "arrived", arrived_at: data.arrived_at }));
      toast.success(data.already ? "Already marked arrived" : "Guest marked arrived — welcome SMS sent");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not mark arrived");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B3B5C] flex items-center justify-center p-6 text-white" data-testid="attendant-loading">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading booking…
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="min-h-screen bg-[#0B3B5C] flex items-center justify-center p-6 text-center" data-testid="attendant-error">
        <div className="max-w-sm text-white">
          <AlertTriangle className="w-12 h-12 mx-auto text-[#D4A94A]" />
          <h1 className="font-[Georgia] text-2xl mt-4">Scan not valid</h1>
          <p className="text-white/70 text-sm mt-2">{loadErr}</p>
        </div>
      </div>
    );
  }

  const arrived = booking?.status === "arrived" || booking?.arrived_at;
  const hasAllergies = (booking?.allergies || []).length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B3B5C] via-[#082941] to-[#0B3B5C] p-4 sm:p-8" data-testid="attendant-scan-page">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-2 text-[11px] tracking-[.28em] uppercase text-[#D4A94A] font-bold">
            <Umbrella className="w-4 h-4" /> Cable Beach · Attendant
          </div>
          <h1 className="font-[Georgia] text-3xl text-white mt-1">Guest check-in</h1>
        </div>

        {/* Allergy banner — show FIRST so staff never miss it */}
        {hasAllergies && (
          <div className="bg-red-600 text-white rounded-xl p-4 mb-4 shadow-lg" data-testid="attendant-allergy-banner">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-black uppercase tracking-wider text-[11px]">⚠️ Allergies — alert kitchen</div>
                <div className="text-sm font-bold mt-1">
                  {booking.allergies.map((a) => a.replace("_", " ")).join(" · ")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Guest card */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mb-4" data-testid="attendant-guest-card">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="font-[Georgia] text-2xl text-[#0B3B5C]" data-testid="attendant-guest-name">
              {booking.customer_name || "Guest"}
            </h2>
            <span className={`text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded-full ${
              arrived ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`} data-testid="attendant-status-badge">
              {arrived ? "Arrived" : "Expected"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5 text-[#0B3B5C]">
              <Users className="w-4 h-4 text-[#D4A94A]" />
              <span className="font-bold">{booking.pax}</span> <span className="text-[#64748B]">pax</span>
              {booking.extra_seats ? (
                <span className="text-xs text-[#64748B] ml-1">+{booking.extra_seats} seats</span>
              ) : null}
            </div>
            {booking.customer_phone && (
              <a href={`tel:${booking.customer_phone}`} className="flex items-center gap-1.5 text-[#0B3B5C] hover:text-[#D4A94A]" data-testid="attendant-guest-phone">
                <Phone className="w-4 h-4 text-[#D4A94A]" />
                <span className="font-mono text-xs">{booking.customer_phone}</span>
              </a>
            )}
          </div>
          <div className="mt-3 border-t border-[#F1F5F9] pt-3 flex items-start gap-1.5 text-xs text-[#64748B]">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#D4A94A]" />
            <span data-testid="attendant-transfer">{booking.transfer_label}</span>
          </div>
          <div className="mt-1 text-[11px] font-mono text-[#94A3B8]">Ref {booking.id}</div>
        </div>

        {/* Order */}
        {(booking.menu_lines || []).length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-xl mb-4" data-testid="attendant-food-card">
            <div className="flex items-center gap-2 mb-3">
              <Utensils className="w-4 h-4 text-[#E86A3C]" />
              <h3 className="text-[11px] tracking-[.28em] uppercase font-black text-[#0B3B5C]">Food & drink</h3>
            </div>
            <ul className="space-y-1.5 text-sm text-[#0B3B5C]">
              {booking.menu_lines.map((ln, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-b border-[#F1F5F9] pb-1.5 last:border-0" data-testid={`attendant-menu-${i}`}>
                  <span>{ln.label || ln.name || ""}</span>
                  {ln.qty > 1 && <span className="text-xs text-[#64748B]">× {ln.qty}</span>}
                </li>
              ))}
            </ul>
            {(booking.sides_detail || []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#F1F5F9]">
                <div className="text-[10px] tracking-widest uppercase font-black text-[#D4A94A] mb-1.5">Sides</div>
                <div className="flex flex-wrap gap-1.5">
                  {booking.sides_detail.map((s, i) => (
                    <span key={i} className="text-xs bg-[#FBF7EF] border border-[#F1F5F9] rounded-full px-2.5 py-1 text-[#0B3B5C]">
                      {s.label || s.name || s.id}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {booking.combo_applied && (
              <div className="mt-3 pt-3 border-t border-[#F1F5F9] text-xs text-[#059669] font-bold" data-testid="attendant-combo">
                ⭐ Combo applied · {booking.combo_applied.name || booking.combo_applied.id}
              </div>
            )}
          </div>
        )}

        {/* Water sports */}
        {(booking.water_sport_lines || []).length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-xl mb-4" data-testid="attendant-watersports-card">
            <div className="flex items-center gap-2 mb-3">
              <Waves className="w-4 h-4 text-[#0EA5E9]" />
              <h3 className="text-[11px] tracking-[.28em] uppercase font-black text-[#0B3B5C]">Water sports</h3>
            </div>
            <ul className="space-y-1.5 text-sm text-[#0B3B5C]">
              {booking.water_sport_lines.map((ln, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-b border-[#F1F5F9] pb-1.5 last:border-0" data-testid={`attendant-ws-${i}`}>
                  <span>{ln.label || ln.name}</span>
                  {ln.qty > 1 && <span className="text-xs text-[#64748B]">× {ln.qty}</span>}
                </li>
              ))}
              {booking.parasail_spectators > 0 && (
                <li className="text-xs text-[#64748B] italic">+{booking.parasail_spectators} parasail spectator(s)</li>
              )}
            </ul>
          </div>
        )}

        {/* Special requests */}
        {booking.special_requests && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4" data-testid="attendant-notes">
            <div className="text-[10px] tracking-widest uppercase font-black text-amber-800 mb-1">Guest notes</div>
            <div className="text-sm text-[#0B3B5C] whitespace-pre-wrap">{booking.special_requests}</div>
          </div>
        )}

        {/* Mark Arrived CTA */}
        <div className="bg-white rounded-2xl p-5 shadow-xl mt-5">
          {arrived ? (
            <div className="text-center py-2" data-testid="attendant-already-arrived">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
              <div className="font-[Georgia] text-xl text-[#0B3B5C] mt-2">Checked in</div>
              {booking.arrived_at && (
                <div className="flex items-center justify-center gap-1.5 text-xs text-[#64748B] mt-1">
                  <Clock className="w-3 h-3" />
                  {new Date(booking.arrived_at).toLocaleString()}
                </div>
              )}
            </div>
          ) : (
            <>
              <label className="block text-[10px] tracking-widest uppercase font-black text-[#64748B] mb-1">
                Attendant name (optional)
              </label>
              <input
                value={attendantName}
                onChange={(e) => setAttendantName(e.target.value)}
                placeholder="e.g. Marco"
                className="w-full text-sm border border-[#E2E8F0] rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-[#D4A94A]"
                data-testid="attendant-name-input"
              />
              <button
                onClick={markArrived}
                disabled={submitting}
                className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                data-testid="attendant-mark-arrived-btn"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                {submitting ? "Confirming…" : "Mark arrived — send welcome SMS"}
              </button>
              <p className="text-[10px] text-[#94A3B8] text-center mt-2">
                Guest receives a confirmation SMS + email instantly.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
