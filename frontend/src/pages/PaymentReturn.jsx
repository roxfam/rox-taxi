import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { api, money } from "../lib/api";

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState({ payment_status: "pending" });
  const [booking, setBooking] = useState(null);
  const attempts = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (!sessionId) return;
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        if (cancelled) return;
        setStatus(data);
        if (data.payment_status === "paid") {
          const { data: b } = await api.get(`/bookings/${data.booking_id}`);
          if (!cancelled) setBooking(b);
          return;
        }
        if (attempts.current++ < 20) setTimeout(poll, 2000);
      } catch (e) {
        if (attempts.current++ < 20) setTimeout(poll, 2000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [sessionId]);

  const paid = status.payment_status === "paid";

  return (
    <div data-testid="payment-success-page" className="max-w-2xl mx-auto px-6 lg:px-10 py-24 text-center">
      <div className="mx-auto w-20 h-20 rounded-full bg-[#00B4D8]/10 flex items-center justify-center mb-8">
        {paid ? <CheckCircle2 className="w-10 h-10 text-[#00B4D8]" /> : <Loader2 className="w-10 h-10 text-[#00B4D8] animate-spin" />}
      </div>
      <h1 className="serif text-5xl text-[#1A365D]">{paid ? "You're all set!" : "Confirming payment…"}</h1>
      <p className="mt-4 text-[#64748B] leading-relaxed">
        {paid ? "Your booking is confirmed. We've saved your details and your driver will be assigned shortly." : "Hang tight — we're confirming your payment with Stripe."}
      </p>
      {booking && (
        <div className="mt-10 rounded-3xl border border-[#E2E8F0] bg-white p-8 text-left" data-testid="payment-success-summary">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Booking code</div>
              <div className="mono text-3xl text-[#1A365D] mt-1">{booking.id}</div>
            </div>
            <div className="text-right">
              <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Total paid</div>
              <div className="mono text-2xl text-[#FF7F50] font-semibold">{money(booking.total)}</div>
            </div>
          </div>
          <div className="mt-6 text-sm text-[#64748B]">
            <span className="text-[#1A365D] font-semibold">{booking.item_name}</span> · {new Date(booking.booking_date).toLocaleString()}
          </div>
          <Link
            to={`/track?id=${booking.id}`}
            data-testid="payment-success-track-btn"
            className="mt-8 inline-flex btn-shine rounded-full bg-[#1A365D] text-white px-6 py-3 text-sm font-semibold"
          >
            Track your booking →
          </Link>
        </div>
      )}
    </div>
  );
}

export function PaymentCancel() {
  const [params] = useSearchParams();
  const bookingId = params.get("booking_id");
  return (
    <div data-testid="payment-cancel-page" className="max-w-2xl mx-auto px-6 lg:px-10 py-24 text-center">
      <div className="mx-auto w-20 h-20 rounded-full bg-[#FF7F50]/10 flex items-center justify-center mb-8">
        <XCircle className="w-10 h-10 text-[#FF7F50]" />
      </div>
      <h1 className="serif text-5xl text-[#1A365D]">Payment cancelled</h1>
      <p className="mt-4 text-[#64748B]">Your booking wasn't charged. Feel free to try again or switch to Zelle.</p>
      {bookingId && (
        <p className="mt-4 text-sm text-[#64748B]">Booking reference: <span className="mono text-[#1A365D]">{bookingId}</span></p>
      )}
      <div className="mt-8 flex justify-center gap-3">
        <Link to="/taxi" className="rounded-full border border-[#E2E8F0] px-5 py-2.5 text-sm">Back to services</Link>
        {bookingId && <Link to={`/track?id=${bookingId}`} className="rounded-full bg-[#1A365D] text-white px-5 py-2.5 text-sm">Track booking</Link>}
      </div>
    </div>
  );
}
