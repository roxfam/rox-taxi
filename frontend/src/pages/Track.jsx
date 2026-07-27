import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, money, STATUS_STEPS, STATUS_INDEX } from "../lib/api";
import { Check, Search, MapPin, User, Calendar as CalIcon, Loader2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function Track() {
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get("id") || "");
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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
              </div>
            </div>

            <div className="mt-6 grid sm:grid-cols-3 gap-4 text-sm">
              <InfoRow icon={<User className="w-4 h-4" />} label="Guest" value={booking.customer_name} />
              <InfoRow icon={<CalIcon className="w-4 h-4" />} label="Date" value={new Date(booking.booking_date).toLocaleString()} />
              <InfoRow icon={<MapPin className="w-4 h-4" />} label="Service" value={booking.item_name} />
            </div>

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
              <div className="mt-8 rounded-xl bg-[#E86A3C]/10 border border-[#E86A3C]/20 p-4 text-sm text-[#7c3a20]">
                Payment is still pending. Complete payment to activate your booking.
              </div>
            )}

            {/* Cancellation section */}
            {booking.status !== "cancelled" && booking.status !== "completed" && (
              <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 flex flex-wrap items-center justify-between gap-4" data-testid="cancel-section">
                <div className="flex items-start gap-3 max-w-xl">
                  <AlertTriangle className="w-5 h-5 text-[#D4A94A] mt-0.5 shrink-0" />
                  <div className="text-sm text-[#334155] leading-relaxed">
                    <div className="font-semibold text-[#0B3B5C]">Cancellation policy</div>
                    <div className="text-[#64748B] mt-0.5">Cancel 48+ hours before service to receive a refund minus a <strong>15% cancellation fee</strong>. Within 48 hours = non-refundable.</div>
                  </div>
                </div>
                <button
                  onClick={cancelBooking}
                  disabled={cancelling}
                  data-testid="cancel-booking-btn"
                  className="rounded-full bg-white border border-[#E2E8F0] text-[#0B3B5C] px-4 py-2.5 text-sm font-semibold hover:border-red-500 hover:text-red-600 active:scale-95 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> {cancelling ? "Cancelling…" : "Cancel booking"}
                </button>
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
