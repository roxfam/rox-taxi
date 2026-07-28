import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { api, money } from "../lib/api";
import { Loader2, CreditCard, Copy, ExternalLink, ShieldCheck, XCircle, CheckCircle2, MapPin } from "lucide-react";
import { toast } from "sonner";

// Shareable "Complete Payment" page — one URL per booking that a customer
// (or the admin, via text/email) can bounce to at any time and finish
// payment via Stripe, PayPal, or Zelle. Any of the three routes below the
// booking is dependency-free from BookingFlow so we can also send this
// link to walk-ins who booked over the phone.
export default function Pay() {
  const { bookingId: paramId } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const bookingId = (paramId || params.get("id") || "").toUpperCase();

  const [booking, setBooking] = useState(null);
  const [cfg, setCfg] = useState({});
  const [loading, setLoading] = useState(true);
  const [payingWith, setPayingWith] = useState(null); // "stripe" | "paypal" | "zelle"
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!bookingId) { setLoading(false); return; }
    (async () => {
      try {
        const [b, c] = await Promise.all([
          api.get(`/bookings/${bookingId}`),
          api.get("/site-config"),
        ]);
        if (!alive) return;
        setBooking(b.data);
        setCfg(c.data || {});
      } catch (e) {
        if (alive) setError("Booking not found. Double-check your code.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [bookingId]);

  // Poll for status change after a payment redirect so the "Paid" state
  // lights up automatically without the customer having to refresh.
  useEffect(() => {
    if (!booking || booking.payment_status === "paid" || booking.status === "cancelled") return;
    const t = setInterval(async () => {
      try {
        const { data } = await api.get(`/bookings/${booking.id}`);
        setBooking(data);
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(t);
  }, [booking?.id]);

  // ── Empty / lookup state ─────────────────────────────────────────────
  if (!bookingId) {
    return <PayLookup onLookup={(id) => nav(`/pay/${id}`)} />;
  }
  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center" data-testid="pay-loading">
        <Loader2 className="w-8 h-8 animate-spin text-[#0B3B5C]" />
      </div>
    );
  }
  if (error || !booking) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center" data-testid="pay-error">
        <XCircle className="w-14 h-14 text-[#E86A3C] mx-auto" />
        <h1 className="serif text-4xl text-[#0B3B5C] mt-4">Booking not found</h1>
        <p className="mt-3 text-[#64748B]">{error || "We couldn't locate that booking."}</p>
        <Link to="/pay" className="mt-6 inline-block rounded-full bg-[#0B3B5C] text-white px-6 py-3 text-sm font-semibold" data-testid="pay-error-retry">Try another code</Link>
      </div>
    );
  }

  const paid = booking.payment_status === "paid";
  const cancelled = booking.status === "cancelled";
  const total = Number(booking.total || 0);
  const paypalUrl = (cfg.paypal_me_url || "https://www.paypal.com/paypalme/roxtaxiservice") + `/${total.toFixed(2)}`;

  const payStripe = async () => {
    setPayingWith("stripe");
    try {
      const { data } = await api.post("/payments/checkout", {
        booking_id: booking.id,
        origin_url: window.location.origin,
      });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start Stripe checkout");
      setPayingWith(null);
    }
  };

  const shareUrl = `${window.location.origin}/pay/${booking.id}`;
  const copyShare = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Payment link copied"); }
    catch { toast.error("Copy failed — long-press to copy manually"); }
  };
  const copy = async (v, label = "Copied") => {
    try { await navigator.clipboard.writeText(v); toast.success(label); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <div className="min-h-[80vh] bg-[#F7F5EF]" data-testid="pay-page">
      {/* Header */}
      <section className="bg-[#0B192C] text-white py-16 lg:py-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-10">
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Secure Payment</div>
          <h1 className="serif text-5xl lg:text-6xl mt-3 leading-[0.95]">
            {paid ? "Paid ·" : cancelled ? "Cancelled ·" : "Complete your"}{" "}
            <em className="italic text-[#F5E1A4]">booking.</em>
          </h1>
          <p className="mt-4 text-white/70 max-w-lg text-sm">
            Booking <code className="mono bg-white/10 px-2 py-0.5 rounded">{booking.id}</code>
            {" · "}<span className="text-white">{booking.item_name}</span>
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 lg:px-10 -mt-10 pb-20">
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* ─── Payment options ─────────────────────────────────────── */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-[0_20px_60px_rgba(0,0,0,0.06)] p-6 lg:p-8" data-testid="pay-methods">
            {paid ? (
              <PaidPanel booking={booking} />
            ) : cancelled ? (
              <CancelledPanel booking={booking} />
            ) : (
              <>
                <h2 className="serif text-2xl text-[#0B3B5C]">Choose how to pay</h2>
                <p className="mt-2 text-sm text-[#64748B]">All methods clear instantly and unlock your booking status the moment payment lands.</p>

                {/* Stripe */}
                <button
                  onClick={payStripe}
                  disabled={!!payingWith}
                  data-testid="pay-stripe-btn"
                  className="mt-6 w-full flex items-center gap-4 rounded-2xl border border-[#E2E8F0] hover:border-[#635BFF] p-5 text-left transition-all group hover:shadow-[0_10px_30px_rgba(99,91,255,0.15)] disabled:opacity-60"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#635BFF]/10 text-[#635BFF] flex items-center justify-center shrink-0">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#0B3B5C]">Card via Stripe</div>
                    <div className="text-xs text-[#64748B]">Visa, Mastercard, Amex, Apple Pay, Google Pay · Instant</div>
                  </div>
                  <div className="mono text-lg text-[#0B3B5C] font-black shrink-0">{money(total)}</div>
                  {payingWith === "stripe" && <Loader2 className="w-5 h-5 animate-spin text-[#635BFF]" />}
                </button>

                {/* PayPal */}
                <a
                  href={paypalUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setPayingWith("paypal")}
                  data-testid="pay-paypal-btn"
                  className="mt-4 w-full flex items-center gap-4 rounded-2xl border border-[#E2E8F0] hover:border-[#003087] p-5 text-left transition-all group hover:shadow-[0_10px_30px_rgba(0,48,135,0.18)]"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#003087]/10 text-[#003087] flex items-center justify-center shrink-0 font-black text-xl">P</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#0B3B5C]">PayPal</div>
                    <div className="text-xs text-[#64748B]">Opens paypal.me — add "Booking {booking.id}" in the note.</div>
                  </div>
                  <div className="mono text-lg text-[#0B3B5C] font-black shrink-0">{money(total)}</div>
                  <ExternalLink className="w-4 h-4 text-[#94a3b8]" />
                </a>

                {/* Zelle */}
                <div className="mt-4 rounded-2xl border border-[#E2E8F0] p-5" data-testid="pay-zelle-block">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#6D1ED4]/10 text-[#6D1ED4] flex items-center justify-center shrink-0 font-black text-xl">Z</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[#0B3B5C]">Zelle transfer</div>
                      <div className="text-xs text-[#64748B]">No fees. Add memo <code className="mono bg-[#F1F5F9] px-1 rounded">{booking.id}</code>.</div>
                    </div>
                    <div className="mono text-lg text-[#0B3B5C] font-black shrink-0">{money(total)}</div>
                  </div>
                  <ul className="mt-4 grid sm:grid-cols-2 gap-2 text-sm">
                    <li className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
                      <span className="text-[#64748B] text-xs">Email</span>
                      <button onClick={() => copy(cfg.zelle_email, "Zelle email copied")} className="mono text-[#0B3B5C] font-semibold inline-flex items-center gap-1" data-testid="pay-zelle-email">
                        {cfg.zelle_email || "—"} <Copy className="w-3 h-3" />
                      </button>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
                      <span className="text-[#64748B] text-xs">Phone</span>
                      <button onClick={() => copy(cfg.zelle_phone, "Zelle phone copied")} className="mono text-[#0B3B5C] font-semibold inline-flex items-center gap-1" data-testid="pay-zelle-phone">
                        {cfg.zelle_phone || "—"} <Copy className="w-3 h-3" />
                      </button>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
                      <span className="text-[#64748B] text-xs">Amount</span>
                      <span className="mono text-[#E86A3C] font-black">{money(total)}</span>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
                      <span className="text-[#64748B] text-xs">Memo</span>
                      <button onClick={() => copy(booking.id, "Memo copied")} className="mono text-[#0B3B5C] font-semibold inline-flex items-center gap-1" data-testid="pay-zelle-memo">
                        {booking.id} <Copy className="w-3 h-3" />
                      </button>
                    </li>
                  </ul>
                </div>

                <div className="mt-6 flex items-center gap-2 text-xs text-[#64748B]">
                  <ShieldCheck className="w-4 h-4 text-[#D4A94A]" />
                  All card payments are processed by Stripe. We never see your card details.
                </div>
              </>
            )}
          </div>

          {/* ─── Summary sidebar ─────────────────────────────────────── */}
          <aside className="rounded-3xl border border-[#E2E8F0] bg-white p-6 lg:p-7 h-fit" data-testid="pay-summary">
            <div className="text-xs tracking-[0.28em] uppercase text-[#64748B]">Summary</div>
            <div className="mt-4 text-[#0B3B5C] font-semibold leading-snug">{booking.item_name}</div>
            <div className="mt-1 text-xs text-[#64748B] capitalize">{booking.service_type}</div>

            <div className="mt-5 space-y-2 text-sm">
              <Row k="Guest" v={booking.customer_name} />
              <Row k="Date" v={new Date(booking.booking_date).toLocaleString()} />
              <Row k="Passengers" v={booking.passengers} />
              {booking.service_type === "rental" && <Row k="Days" v={booking.days} />}
            </div>

            <div className="mt-5 border-t border-[#E2E8F0] pt-4 flex items-baseline justify-between">
              <span className="text-xs tracking-[0.28em] uppercase text-[#64748B]">Total</span>
              <span className="mono text-2xl text-[#E86A3C] font-black tracking-tight">{money(total)}</span>
            </div>

            <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
              paid ? "bg-[#D4A94A]/15 text-[#8a6b1f]" :
              cancelled ? "bg-red-100 text-red-700" :
              "bg-[#E86A3C]/10 text-[#7c3a20]"
            }`}>
              {paid ? "Paid" : cancelled ? "Cancelled" : "Pending payment"}
            </div>

            <div className="mt-6 space-y-2 text-sm">
              <Link to={`/track?id=${booking.id}`} className="flex items-center gap-2 text-[#0B3B5C] hover:underline" data-testid="pay-track-link">
                <MapPin className="w-4 h-4" /> Track this booking →
              </Link>
              <button onClick={copyShare} className="flex items-center gap-2 text-[#0B3B5C] hover:underline" data-testid="pay-copy-share">
                <Copy className="w-4 h-4" /> Copy payment link
              </button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-[#64748B]">{k}</span>
      <span className="text-[#0B3B5C] font-medium text-right truncate">{v ?? "—"}</span>
    </div>
  );
}

function PaidPanel({ booking }) {
  return (
    <div className="text-center py-6" data-testid="pay-paid-panel">
      <div className="mx-auto w-20 h-20 rounded-full bg-[#D4A94A]/15 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-[#D4A94A]" />
      </div>
      <h2 className="serif text-4xl text-[#0B3B5C] mt-6">Payment received</h2>
      <p className="mt-3 text-[#64748B]">Your booking <code className="mono text-[#0B3B5C]">{booking.id}</code> is confirmed. A receipt has been emailed to <span className="font-semibold text-[#0B3B5C]">{booking.customer_email}</span>.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={`/track?id=${booking.id}`} data-testid="pay-paid-track" className="rounded-full bg-[#0B3B5C] text-white px-6 py-3 text-sm font-semibold hover:bg-[#132a4a]">
          Track booking →
        </Link>
        <a
          href={`${process.env.REACT_APP_BACKEND_URL}/api/bookings/${booking.id}/receipt.pdf`}
          target="_blank" rel="noreferrer"
          data-testid="pay-paid-receipt"
          className="rounded-full bg-[#D4A94A] text-[#0B192C] px-6 py-3 text-sm font-semibold hover:bg-[#e0b856] shadow-[0_10px_25px_rgba(212,169,74,0.4)]"
        >
          Download receipt PDF
        </a>
      </div>
    </div>
  );
}

function CancelledPanel({ booking }) {
  return (
    <div className="text-center py-6" data-testid="pay-cancelled-panel">
      <XCircle className="mx-auto w-14 h-14 text-red-500" />
      <h2 className="serif text-4xl text-[#0B3B5C] mt-4">Booking cancelled</h2>
      <p className="mt-3 text-[#64748B]">This booking has been cancelled and is no longer collecting payment.</p>
      {booking.cancellation && (
        <p className="mt-2 text-sm text-[#64748B]">Refund estimate: <span className="mono font-semibold">${(booking.cancellation.refund_estimate || 0).toFixed(2)}</span></p>
      )}
    </div>
  );
}

function PayLookup({ onLookup }) {
  const [code, setCode] = useState("");
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6" data-testid="pay-lookup">
      <div className="max-w-lg w-full text-center">
        <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Complete Payment</div>
        <h1 className="serif text-5xl text-[#0B3B5C] mt-3 leading-[0.95]">Enter your <em className="italic">booking code</em></h1>
        <p className="mt-4 text-[#64748B]">Grab it from your confirmation email or SMS. Looks like <span className="mono">A1B2C3D4</span>.</p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (code.trim()) onLookup(code.trim().toUpperCase()); }}
          className="mt-8 flex gap-3"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="A1B2C3D4"
            className="mono flex-1 rounded-full border border-[#E2E8F0] bg-white text-[#0B3B5C] px-6 py-4 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-[#D4A94A]"
            data-testid="pay-lookup-input"
          />
          <button
            type="submit"
            data-testid="pay-lookup-submit"
            className="btn-shine rounded-full bg-[#E86A3C] text-white px-6 py-4 text-sm font-semibold hover:bg-[#d55a30]"
          >
            Continue →
          </button>
        </form>
      </div>
    </div>
  );
}
