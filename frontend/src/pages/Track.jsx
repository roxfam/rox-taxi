import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, money, STATUS_STEPS, STATUS_INDEX } from "../lib/api";
import { Check, Search, MapPin, User, Calendar as CalIcon, Loader2, XCircle, AlertTriangle, Signal, CreditCard, CalendarPlus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

function DriverLiveBanner({ bookingId, status }) {
  // Poll driver location every 6 seconds while the trip is active. Hides itself
  // when the driver hasn't started sharing yet (`available:false`) or when the
  // last ping is more than 60 seconds stale.
  const [loc, setLoc] = useState(null);

  useEffect(() => {
    if (["completed", "cancelled"].includes(status)) return;
    let alive = true;
    const tick = async () => {
      try {
        const { data } = await api.get(`/bookings/${bookingId}/driver-location`);
        if (alive) setLoc(data);
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => { alive = false; clearInterval(id); };
  }, [bookingId, status]);

  if (!loc?.available || loc?.stale) return null;

  return (
    <div className="mt-6 rounded-2xl border border-[#059669]/30 bg-gradient-to-r from-[#059669]/5 to-white p-4 flex items-center gap-3" data-testid="driver-live-banner">
      <div className="w-10 h-10 rounded-xl bg-[#059669]/15 text-[#059669] flex items-center justify-center relative">
        <Signal className="w-5 h-5" />
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22c55e] ring-2 ring-white animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[#0B3B5C]">Your driver is sharing live location</div>
        <div className="text-xs text-[#64748B] font-mono truncate">
          {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)} · updated {Math.round(loc.age_seconds)}s ago
        </div>
      </div>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
        target="_blank"
        rel="noreferrer"
        data-testid="driver-live-map-link"
        className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white text-xs font-semibold px-3 py-2 transition-colors"
      >
        <MapPin className="w-3 h-3" /> Open in Maps
      </a>
    </div>
  );
}

export default function Track() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get("id") || "");
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const fetchBooking = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/bookings/${id.toUpperCase()}`);
      setBooking(data);
    } catch (e) {
      toast.error("Booking not found. Double-check your code.");
      setBooking(null);
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async () => {
    if (!booking) return;
    if (!window.confirm("Cancel this booking?\n\nCancellations 48+ hours before service = refund minus 15% fee.\nCancellations within 48 hours = non-refundable.")) return;
    setCancelling(true);
    try {
      const { data } = await api.post(`/bookings/${booking.id}/cancel`);
      toast.success(data.message || "Cancelled");
      await fetchBooking(booking.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (params.get("id")) fetchBooking(params.get("id"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!booking) return;
    const t = setInterval(() => fetchBooking(booking.id), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id]);

  const submit = (e) => {
    e.preventDefault();
    setParams({ id: code });
    fetchBooking(code);
  };

  const activeIdx = booking ? Math.max(STATUS_INDEX(booking.status), 0) : -1;

  return (
    <div data-testid="track-page" className="min-h-[80vh]">
      <section className="bg-[#0B192C] text-white py-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-10">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Booking Tracker</span>
          <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9]">Where's my <em className="italic text-[#F5E1A4]">ride</em>?</h1>
          <p className="mt-5 text-white/70 max-w-lg">Enter your confirmation code (e.g. <span className="mono">A1B2C3D4</span>) to see live booking status.</p>

          <form onSubmit={submit} className="mt-8 flex gap-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ENTER BOOKING CODE"
              className="mono flex-1 rounded-full bg-white text-[#0B3B5C] px-6 py-4 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-[#D4A94A]"
              data-testid="track-code-input"
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-shine rounded-full bg-[#E86A3C] text-white px-6 py-4 text-sm font-semibold hover:bg-[#d55a30] active:scale-95 disabled:opacity-60 flex items-center gap-2"
              data-testid="track-submit-btn"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Track
            </button>
          </form>
        </div>
      </section>

      {booking && (
        <section className="max-w-4xl mx-auto px-6 lg:px-10 -mt-14 pb-24" data-testid="track-details">
          <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-[#E2E8F0] p-8">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Confirmation</div>
                <div className="mono text-3xl text-[#0B3B5C] mt-1">{booking.id}</div>
              </div>
              <div className="text-right">
                <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Total</div>
                <div className="mono text-2xl text-[#E86A3C] font-semibold">{money(booking.total)}</div>
                <div className="text-xs text-[#64748B] mt-1">Payment: <span className={booking.payment_status === "paid" ? "text-[#D4A94A] font-semibold" : "text-[#E86A3C]"}>{booking.payment_status}</span></div>
                <a
                  href={`${process.env.REACT_APP_BACKEND_URL}/api/bookings/${booking.id}/receipt.pdf`}
                  target="_blank" rel="noreferrer"
                  data-testid="track-receipt-btn"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[#D4A94A] font-semibold hover:underline"
                >
                  Download receipt PDF →
                </a>
                <Link
                  to={`/receipt/${booking.id}`}
                  data-testid="track-print-receipt-btn"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-[#0B3B5C] font-semibold hover:underline ml-3"
                >
                  Print receipt →
                </Link>
              </div>
            </div>

            <div className="mt-6 grid sm:grid-cols-3 gap-4 text-sm">
              <InfoRow icon={<User className="w-4 h-4" />} label="Guest" value={booking.customer_name} />
              <InfoRow icon={<CalIcon className="w-4 h-4" />} label="Date" value={new Date(booking.booking_date).toLocaleString()} />
              <InfoRow icon={<MapPin className="w-4 h-4" />} label="Service" value={booking.item_name} />
            </div>

            {/* Driver check-in QR — guest shows this to the driver on arrival.
                Driver scans with their camera → opens /driver/scan with an
                HMAC-signed token that lets them mark the booking picked up
                and confirm the exact pickup time + location. */}
            {booking.status !== "cancelled" && booking.status !== "completed" && (
              <div className="mt-6 rounded-2xl border border-[#D4A94A]/40 bg-gradient-to-br from-[#FBF7EF] to-white p-5 flex items-center gap-5" data-testid="track-driver-qr-card">
                <img
                  src={`${process.env.REACT_APP_BACKEND_URL}/api/bookings/${booking.id}/qr.png`}
                  alt={`Driver scan QR for booking ${booking.id}`}
                  className="w-28 h-28 rounded-xl bg-white p-2 border border-[#EFE7D5] shrink-0"
                  data-testid="track-driver-qr-img"
                />
                <div>
                  <div className="text-[10px] tracking-[0.28em] uppercase text-[#D4A94A] font-black">Show driver on arrival</div>
                  <div className="text-sm text-[#0B3B5C] font-semibold mt-1 leading-tight">Instant check-in</div>
                  <div className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
                    Your driver scans this QR to verify you're the right guest and confirm the pickup — no typing your booking code.
                  </div>
                </div>
              </div>
            )}

            <DriverLiveBanner bookingId={booking.id} status={booking.status} />

            {/* Stepper */}
            <div className="mt-10">
              <div className="hidden sm:flex items-start relative">
                {STATUS_STEPS.map((s, i) => {
                  const done = i <= activeIdx;
                  return (
                    <div key={s.key} className="flex-1 flex flex-col items-center relative" data-testid={`status-step-${s.key}`}>
                      {i < STATUS_STEPS.length - 1 && (
                        <div className={`absolute top-5 left-1/2 w-full h-0.5 ${i < activeIdx ? "bg-[#D4A94A]" : "bg-[#E2E8F0]"}`}></div>
                      )}
                      <div className={`w-10 h-10 rounded-full z-10 flex items-center justify-center ${done ? "bg-[#D4A94A] text-white" : "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]"}`}>
                        {done ? <Check className="w-4 h-4" /> : <span className="text-xs">{i + 1}</span>}
                      </div>
                      <div className={`mt-3 text-xs text-center ${done ? "text-[#0B3B5C] font-semibold" : "text-[#64748B]"}`}>{s.label}</div>
                    </div>
                  );
                })}
              </div>
              {/* Mobile vertical */}
              <div className="sm:hidden flex flex-col gap-4">
                {STATUS_STEPS.map((s, i) => {
                  const done = i <= activeIdx;
                  return (
                    <div key={s.key} className="flex items-center gap-4" data-testid={`status-step-m-${s.key}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${done ? "bg-[#D4A94A] text-white" : "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]"}`}>
                        {done ? <Check className="w-3.5 h-3.5" /> : <span className="text-xs">{i + 1}</span>}
                      </div>
                      <div className={`text-sm ${done ? "text-[#0B3B5C] font-semibold" : "text-[#64748B]"}`}>{s.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {booking.status === "pending_payment" && (
              <div className="mt-8 rounded-xl bg-[#E86A3C]/10 border border-[#E86A3C]/20 p-4 flex flex-wrap items-center justify-between gap-3" data-testid="pending-payment-banner">
                <div className="text-sm text-[#7c3a20]">
                  Payment is still pending. Complete payment to activate your booking.
                </div>
                <Link
                  to={`/pay/${booking.id}`}
                  data-testid="pending-payment-cta"
                  className="btn-shine rounded-full bg-[#E86A3C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#d55a30] inline-flex items-center gap-2"
                >
                  <CreditCard className="w-4 h-4" /> Complete payment →
                </Link>
              </div>
            )}

            {booking.payment_status !== "paid" && !["cancelled","pending_payment","completed"].includes(booking.status) && (
              <div className="mt-6" data-testid="unpaid-banner">
                <Link
                  to={`/pay/${booking.id}`}
                  data-testid="unpaid-cta"
                  className="inline-flex items-center gap-2 rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white px-5 py-2.5 text-sm font-semibold"
                >
                  <CreditCard className="w-4 h-4" /> Pay {money(booking.total)} now
                </Link>
              </div>
            )}

            {/* Cancellation section */}
            {booking.status !== "cancelled" && booking.status !== "completed" && (
              <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 flex flex-wrap items-center justify-between gap-4" data-testid="cancel-section">
                <div className="flex items-start gap-3 max-w-xl">
                  <AlertTriangle className="w-5 h-5 text-[#D4A94A] mt-0.5 shrink-0" />
                  <div className="text-sm text-[#334155] leading-relaxed">
                    <div className="font-semibold text-[#0B3B5C]">Need to change your plans?</div>
                    <div className="text-[#64748B] mt-0.5">Reschedule for free up to 2 hours before pickup. Full cancel: 48+ hr notice = refund minus <strong>15%</strong>; within 48 hr = non-refundable.</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRescheduleOpen(true)}
                    data-testid="reschedule-booking-btn"
                    className="rounded-full bg-[#0B3B5C] border border-[#0B3B5C] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#132a4a] active:scale-95 inline-flex items-center gap-2"
                  >
                    <CalendarPlus className="w-4 h-4" /> Reschedule
                  </button>
                  <button
                    onClick={cancelBooking}
                    disabled={cancelling}
                    data-testid="cancel-booking-btn"
                    className="rounded-full bg-white border border-[#E2E8F0] text-[#0B3B5C] px-4 py-2.5 text-sm font-semibold hover:border-red-500 hover:text-red-600 active:scale-95 disabled:opacity-60 inline-flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" /> {cancelling ? "Cancelling…" : "Cancel"}
                  </button>
                </div>
              </div>
            )}

            {booking.status === "cancelled" && booking.cancellation && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5" data-testid="cancelled-info">
                <div className="font-semibold text-red-800">Booking cancelled</div>
                <div className="mt-1 text-sm text-red-700 space-y-1">
                  <div>Notice given: <span className="mono">{booking.cancellation.hours_notice}h</span></div>
                  <div>Cancellation fee: <span className="mono">{money(booking.cancellation.fee)}</span> ({Math.round((booking.cancellation.fee_pct||0.15)*100)}%)</div>
                  <div>Refund estimate: <span className="mono font-semibold">{money(booking.cancellation.refund_estimate)}</span></div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {booking && rescheduleOpen && (
        <RescheduleDialog
          booking={booking}
          onClose={() => setRescheduleOpen(false)}
          onDone={() => { setRescheduleOpen(false); fetchBooking(booking.id); }}
        />
      )}
    </div>
  );
}


function RescheduleDialog({ booking, onClose, onDone }) {
  // Pre-fill with the current booking's pickup, truncated to the shape
  // `datetime-local` wants (YYYY-MM-DDTHH:MM, no seconds / tz suffix).
  const toLocalInput = (iso) => {
    try {
      const d = new Date(iso);
      const tzOffsetMs = d.getTimezoneOffset() * 60_000;
      return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
    } catch { return ""; }
  };
  const [newPickup, setNewPickup] = useState(toLocalInput(booking.booking_date));
  const [email, setEmail] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Live-quote the price impact as the guest scrubs the date. Debounced
  // so a slow typist doesn't fire 10 requests per second.
  useEffect(() => {
    if (!newPickup) { setQuote(null); return; }
    let alive = true;
    setQuoting(true);
    const handle = setTimeout(async () => {
      try {
        const iso = new Date(newPickup).toISOString();
        const { data } = await api.get(
          `/bookings/${booking.id}/reschedule-quote`,
          { params: { new_pickup: iso } },
        );
        if (alive) setQuote(data);
      } catch (e) {
        if (alive) setQuote(null);
      } finally {
        if (alive) setQuoting(false);
      }
    }, 350);
    return () => { alive = false; clearTimeout(handle); };
  }, [newPickup, booking.id]);

  const submit = async () => {
    if (!email.trim()) {
      toast.error("Please enter the email on your booking to confirm.");
      return;
    }
    if (!newPickup) {
      toast.error("Pick a new pickup date and time.");
      return;
    }
    setSubmitting(true);
    try {
      const iso = new Date(newPickup).toISOString();
      const { data } = await api.post(
        `/bookings/${booking.id}/guest-reschedule`,
        { new_pickup: iso, email: email.trim() },
      );
      if (data.price_delta > 0) {
        toast.success(`Rescheduled — your new total is ${money(data.new_total)}.`);
      } else if (data.price_delta < 0) {
        toast.success(`Rescheduled — ${money(Math.abs(data.price_delta))} refunded off your total.`);
      } else {
        toast.success("Rescheduled — a confirmation SMS is on the way.");
      }
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reschedule failed");
    } finally {
      setSubmitting(false);
    }
  };

  const deltaPositive = (quote?.delta || 0) > 0.001;
  const deltaNegative = (quote?.delta || 0) < -0.001;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="reschedule-dialog">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.24em] uppercase text-[#D4A94A] font-bold">Reschedule</div>
            <h3 className="serif text-2xl text-[#0B3B5C] mt-1">Pick a new time</h3>
            <div className="text-xs text-[#64748B] mt-1">Booking <span className="mono">{booking.id}</span></div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F1F5F9]" data-testid="reschedule-close">
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>

        <label className="block text-xs font-bold text-[#0B3B5C] mt-5 mb-1">New pickup</label>
        <input
          type="datetime-local"
          value={newPickup}
          onChange={(e) => setNewPickup(e.target.value)}
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B5C]/20"
          data-testid="reschedule-new-pickup"
        />

        {/* Live price delta surfaces the weekend-surcharge the moment the
            picker crosses weekday→Sunday (or vice versa). */}
        {quote && (
          <div
            className={`mt-3 rounded-lg border p-3 text-sm ${
              deltaPositive ? "bg-amber-50 border-amber-200 text-amber-900"
              : deltaNegative ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-[#F8FAFC] border-[#E2E8F0] text-[#64748B]"
            }`}
            data-testid="reschedule-quote"
          >
            <div className="font-semibold" data-testid="reschedule-quote-message">{quote.message}</div>
            {(deltaPositive || deltaNegative) && (
              <div className="flex items-center justify-between mt-1.5 text-xs">
                <span>Current {money(quote.old_total)}</span>
                <span className="mono font-bold">
                  → {money(quote.new_total)}
                  <span className="ml-1 opacity-80">({deltaPositive ? "+" : ""}{money(quote.delta)})</span>
                </span>
              </div>
            )}
          </div>
        )}
        {quoting && !quote && (
          <div className="mt-3 text-xs text-[#64748B]">Checking price…</div>
        )}

        <label className="block text-xs font-bold text-[#0B3B5C] mt-4 mb-1">Email on your booking</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B5C]/20"
          data-testid="reschedule-email"
        />

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-[#E2E8F0] py-2.5 text-sm font-semibold text-[#0B3B5C] hover:bg-[#F1F5F9]"
            data-testid="reschedule-cancel"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !newPickup || !email}
            className="flex-1 rounded-full bg-[#0B3B5C] text-white py-2.5 text-sm font-bold hover:bg-[#132a4a] disabled:opacity-50"
            data-testid="reschedule-submit"
          >
            {submitting ? "Rescheduling…" : (
              deltaPositive ? `Pay ${money(quote.delta)} & reschedule`
              : deltaNegative ? `Reschedule (-${money(Math.abs(quote.delta))})`
              : "Confirm reschedule"
            )}
          </button>
        </div>
        <p className="text-[11px] text-[#64748B] mt-3 text-center">
          Reschedules fire an SMS to both you and dispatch. Up to 2 hr before pickup.
        </p>
      </div>
    </div>
  );
}


function InfoRow({ icon, label, value }) {
  return (
    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-4">
      <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-[#64748B]">{icon} {label}</div>
      <div className="mt-1.5 text-[#0B3B5C] font-medium leading-snug">{value}</div>
    </div>
  );
}
