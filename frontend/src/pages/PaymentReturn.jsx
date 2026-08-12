import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../lib/api";
import { trackPurchase } from "../lib/fbpixel";
import TourUpsellCard from "../components/TourUpsellCard";

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState({ payment_status: "pending" });
  const [booking, setBooking] = useState(null);
  const attempts = useRef(0);
  const purchaseFired = useRef(false);

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
          // Meta Pixel — Stripe payment succeeded. Guarded so React
          // Strict-Mode double-mounts + repeated polls only fire once.
          if (!purchaseFired.current && b && !cancelled) {
            purchaseFired.current = true;
            trackPurchase({
              value: Number(b.total || 0),
              currency: "USD",
              contentName: b.item_name,
              contentCategory: b.service_type,
              orderId: b.id,
            });
          }
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
  const shareUrl = booking ? `${window.location.origin}/pay/${booking.id}` : "";
  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Payment link copied"); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <div data-testid="payment-success-page" className="max-w-2xl mx-auto px-6 lg:px-10 py-16 text-center">
      <img
        src="/logo-gold.webp"
        alt="Rox Taxi Service & Tours"
        width={120} height={120}
        className="mx-auto h-24 w-auto object-contain mb-4 drop-shadow-[0_6px_20px_rgba(212,169,74,0.35)]"
        data-testid="payment-success-logo"
      />
      <div className="mx-auto w-20 h-20 rounded-full bg-[#D4A94A]/10 flex items-center justify-center mb-8">
        {paid ? <CheckCircle2 className="w-10 h-10 text-[#D4A94A]" /> : <Loader2 className="w-10 h-10 text-[#D4A94A] animate-spin" />}
      </div>
      <h1 className="serif text-5xl text-[#0B3B5C]">{paid ? "You're all set!" : "Confirming payment…"}</h1>
      <p className="mt-4 text-[#64748B] leading-relaxed">
        {paid ? "Your booking is confirmed. We've emailed your receipt and your driver will be assigned shortly." : "Hang tight — we're confirming your payment with Stripe."}
      </p>
      {booking && (
        <div className="mt-10 rounded-3xl border border-[#E2E8F0] bg-white p-8 text-left" data-testid="payment-success-summary">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Booking code</div>
              <div className="mono text-3xl text-[#0B3B5C] mt-1">{booking.id}</div>
            </div>
            <div className="text-right">
              <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Total paid</div>
              <div className="mono text-2xl text-[#E86A3C] font-black tracking-tight">{money(booking.total)}</div>
            </div>
          </div>

          {/* QR code — cruise passengers flash this at the driver */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-6 rounded-2xl bg-[#FBF7EF] border border-[#EFE7D5] p-6" data-testid="payment-success-qr-block">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(`${window.location.origin}/track?id=${booking.id}`)}`}
              alt={`QR code for booking ${booking.id}`}
              width={160} height={160}
              className="w-40 h-40 rounded-xl bg-white p-2 border border-[#E2E8F0] shrink-0"
              data-testid="payment-success-qr-img"
            />
            <div className="text-center sm:text-left">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">Show at pickup</div>
              <div className="serif text-xl text-[#0B3B5C] mt-1">Scan to confirm your ride</div>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">Flash this at your driver. It opens your live booking + status page.</p>
            </div>
          </div>

          <div className="mt-6 text-sm text-[#64748B]">
            <span className="text-[#0B3B5C] font-semibold">{booking.item_name}</span> · {new Date(booking.booking_date).toLocaleString()}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={`/track?id=${booking.id}`}
              data-testid="payment-success-track-btn"
              className="inline-flex btn-shine rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white px-6 py-3 text-sm font-semibold"
            >
              Track your booking →
            </Link>
            <Link
              to={`/receipt/${booking.id}`}
              data-testid="payment-success-print-receipt"
              className="inline-flex rounded-full bg-[#D4A94A] text-[#0B192C] px-6 py-3 text-sm font-semibold hover:bg-[#e0b856] shadow-[0_10px_25px_rgba(212,169,74,0.4)]"
            >
              Print receipt
            </Link>
            <a
              href={`${process.env.REACT_APP_BACKEND_URL}/api/bookings/${booking.id}/receipt.pdf`}
              target="_blank" rel="noreferrer"
              data-testid="payment-success-receipt-btn"
              className="inline-flex rounded-full border border-[#E2E8F0] text-[#0B3B5C] px-6 py-3 text-sm font-semibold hover:border-[#0B3B5C]"
            >
              Download PDF
            </a>
            <a
              href={`${process.env.REACT_APP_BACKEND_URL}/api/bookings/${booking.id}/calendar.ics`}
              target="_blank" rel="noreferrer"
              data-testid="payment-success-add-to-calendar"
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#D4A94A] bg-white text-[#0B3B5C] px-6 py-3 text-sm font-semibold hover:bg-[#FBF7EF] shadow-[0_6px_18px_rgba(212,169,74,0.18)]"
              title="Adds the pickup (and return leg, if round-trip) to Apple / Google Calendar with driver phone, pickup address, and map link — auto-reminds 30 min before"
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-[#D4A94A] to-[#b88a2d] text-white text-[10px] font-black">📅</span>
              Add to Wallet / Calendar
            </a>
            <button
              onClick={copyShare}
              data-testid="payment-success-share-btn"
              className="inline-flex rounded-full border border-[#E2E8F0] text-[#0B3B5C] px-6 py-3 text-sm font-semibold hover:border-[#0B3B5C]"
            >
              Copy payment link
            </button>
          </div>
        </div>
      )}

      {/* Tour upsell — only shown for successful taxi/rental bookings */}
      {booking && booking.service_type !== "tour" && <TourUpsellCard booking={booking} />}
    </div>
  );
}

export function PaymentCancel() {
  const [params] = useSearchParams();
  const bookingId = params.get("booking_id");
  return (
    <div data-testid="payment-cancel-page" className="max-w-2xl mx-auto px-6 lg:px-10 py-24 text-center">
      <div className="mx-auto w-20 h-20 rounded-full bg-[#E86A3C]/10 flex items-center justify-center mb-8">
        <XCircle className="w-10 h-10 text-[#E86A3C]" />
      </div>
      <h1 className="serif text-5xl text-[#0B3B5C]">Payment cancelled</h1>
      <p className="mt-4 text-[#64748B]">Your booking wasn't charged. Feel free to try again or switch to Zelle.</p>
      {bookingId && (
        <p className="mt-4 text-sm text-[#64748B]">Booking reference: <span className="mono text-[#0B3B5C]">{bookingId}</span></p>
      )}
      <div className="mt-8 flex justify-center gap-3">
        <Link to="/taxi" className="rounded-full border border-[#E2E8F0] px-5 py-2.5 text-sm">Back to services</Link>
        {bookingId && <Link to={`/track?id=${bookingId}`} className="rounded-full bg-[#0B3B5C] text-white px-5 py-2.5 text-sm">Track booking</Link>}
      </div>
    </div>
  );
}
