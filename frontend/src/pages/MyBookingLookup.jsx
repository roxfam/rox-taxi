import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Search, Loader2, Mail, Phone, ArrowRight, CheckCircle2, Clock, AlertTriangle,
  Calendar, MapPin, DollarSign, FileText, Heart, Upload, Plane, User,
} from "lucide-react";
import { api } from "../lib/api";
import Seo from "../components/Seo";

/**
 * MyBookingLookup — public /my-booking page. Guest enters booking number +
 * email (or last-4 phone), we return a redacted summary + context-aware
 * action buttons: Pay / Upload Zelle proof / Add tip / Download invoice /
 * Track driver. Zero account needed — booking number IS the key.
 */
const STATUS_META = {
  pending:   { label: "Pending",     tone: "bg-[#F1F5F9] text-[#64748B]",       Icon: Clock },
  confirmed: { label: "Confirmed",   tone: "bg-[#0B3B5C]/10 text-[#0B3B5C]",    Icon: CheckCircle2 },
  picked_up: { label: "In Progress", tone: "bg-[#D4A94A]/20 text-[#B47F26]",    Icon: Plane },
  completed: { label: "Completed",   tone: "bg-[#059669]/15 text-[#047857]",    Icon: CheckCircle2 },
  cancelled: { label: "Cancelled",   tone: "bg-[#DC2626]/15 text-[#B91C1C]",    Icon: AlertTriangle },
  no_show:   { label: "No Show",     tone: "bg-[#E86A3C]/15 text-[#B04524]",    Icon: AlertTriangle },
};

export default function MyBookingLookup() {
  const [bookingId, setBookingId] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(null);

  const submit = async (e) => {
    e?.preventDefault?.();
    const bid = bookingId.trim().toUpperCase();
    const c = contact.trim();
    if (bid.length < 4) return toast.error("Enter your booking number");
    if (c.length < 4) return toast.error("Enter the email or last-4 phone you booked with");
    setBusy(true);
    try {
      const { data } = await api.post("/bookings/guest-lookup", { booking_id: bid, contact: c });
      setBooking(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not find your booking");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setBooking(null);
    setBookingId("");
    setContact("");
  };

  return (
    <>
      <Seo
        title="Find my booking · Rox Taxi Nassau"
        description="Look up your Rox Taxi booking by number to re-pay, upload a Zelle proof, add a tip, or download your invoice."
      />
      <section className="min-h-[80vh] bg-gradient-to-br from-[#FAF9F6] via-white to-[#F8FAFC] py-14 sm:py-20 px-6">
        <div className="max-w-xl mx-auto">
          {!booking && (
            <LookupForm
              bookingId={bookingId} setBookingId={setBookingId}
              contact={contact} setContact={setContact}
              busy={busy} onSubmit={submit}
            />
          )}
          {booking && <BookingSummary booking={booking} onReset={reset} />}
        </div>
      </section>
    </>
  );
}

function LookupForm({ bookingId, setBookingId, contact, setContact, busy, onSubmit }) {
  return (
    <>
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#0B3B5C]/10 border border-[#0B3B5C]/20 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-[#0B3B5C]">
          <Search className="w-3 h-3" /> Find my booking
        </div>
        <h1 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-5 leading-tight">
          Everything about your <em className="italic text-[#D4A94A]">Rox</em> trip, in one place.
        </h1>
        <p className="text-[#64748B] mt-3 leading-relaxed max-w-md mx-auto">
          Enter your booking number and the email you booked with (or last-4 of your phone).
          Re-pay, upload a Zelle proof, add a tip, or download your invoice — no account needed.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="bg-white rounded-3xl border border-[#E2E8F0] shadow-sm p-6 sm:p-8 space-y-5"
        data-testid="booking-lookup-form"
      >
        <div>
          <label className="block text-[10px] uppercase tracking-[0.25em] text-[#64748B] font-black mb-2">Booking number</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
            <input
              type="text"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value.toUpperCase())}
              placeholder="e.g. A454A721"
              className="w-full rounded-xl border border-[#E2E8F0] py-3 pl-10 pr-3 text-sm mono uppercase tracking-wider focus:border-[#D4A94A] focus:ring-1 focus:ring-[#D4A94A] outline-none"
              autoComplete="off"
              autoCapitalize="characters"
              data-testid="booking-lookup-id"
            />
          </div>
          <div className="mt-1.5 text-[11px] text-[#94a3b8]">From your confirmation email or SMS.</div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.25em] text-[#64748B] font-black mb-2">
            Email <span className="text-[#94a3b8] font-normal normal-case tracking-normal">or last 4 of phone</span>
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[#94a3b8]">
              <Mail className="w-3.5 h-3.5" /><span>/</span><Phone className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="jane@email.com  or  1234"
              className="w-full rounded-xl border border-[#E2E8F0] py-3 pl-16 pr-3 text-sm focus:border-[#D4A94A] focus:ring-1 focus:ring-[#D4A94A] outline-none"
              autoComplete="email"
              data-testid="booking-lookup-contact"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="btn-shine w-full rounded-full bg-[#0B3B5C] text-white px-6 py-3.5 text-sm font-black uppercase tracking-wider hover:bg-[#132a4a] active:scale-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          data-testid="booking-lookup-submit"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          {busy ? "Looking up…" : "Find my booking"}
        </button>
      </form>
    </>
  );
}

function BookingSummary({ booking: b, onReset }) {
  const meta = STATUS_META[b.status] || STATUS_META.pending;
  const Icon = meta.Icon;
  const a = b.actions || {};
  const money = (v) => `$${Number(v || 0).toFixed(2)}`;
  const paid = b.payment_status === "paid";

  return (
    <div className="space-y-5" data-testid="booking-summary">
      <div className="text-center">
        <button onClick={onReset} className="text-xs text-[#64748B] hover:text-[#0B3B5C] font-semibold uppercase tracking-wider" data-testid="booking-lookup-reset">
          ← Look up a different booking
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-sm overflow-hidden">
        <header className="p-6 bg-gradient-to-r from-[#0B3B5C] to-[#132a4a] text-white">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">Booking</div>
          <div className="flex items-center justify-between gap-3 mt-1 flex-wrap">
            <h2 className="serif text-3xl mono tracking-wider" data-testid="summary-booking-id">{b.booking_id}</h2>
            <div className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${meta.tone}`} data-testid="summary-status">
              <Icon className="w-3.5 h-3.5" /> {meta.label}
            </div>
          </div>
          <div className="text-sm text-white/80 mt-2">{b.item_name}</div>
        </header>

        <div className="p-5 sm:p-6 space-y-4">
          <Row icon={User} label="Guest">{b.customer_name}</Row>
          {b.booking_date && (
            <Row icon={Calendar} label="When">{new Date(b.booking_date).toLocaleString()}</Row>
          )}
          {(b.pickup_location || b.dropoff_location) && (
            <Row icon={MapPin} label="Route">
              <div className="space-y-0.5">
                {b.pickup_location && <div>{b.pickup_location}</div>}
                {b.dropoff_location && <div className="text-[#64748B]">→ {b.dropoff_location}</div>}
              </div>
            </Row>
          )}
          {b.flight_number && (
            <Row icon={Plane} label="Flight">{b.flight_number}</Row>
          )}
          {b.driver_name && (
            <Row icon={User} label="Driver">{b.driver_name}</Row>
          )}
          <Row icon={DollarSign} label="Total">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono text-[#E86A3C] font-black text-lg">{money(b.total)}</span>
              <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                paid ? "bg-[#059669]/15 text-[#047857]" : "bg-[#DC2626]/15 text-[#B91C1C]"
              }`} data-testid="summary-payment-status">
                {b.payment_status}
              </span>
              {b.payment_method && <span className="text-[11px] text-[#64748B]">· {b.payment_method}</span>}
            </div>
          </Row>
          {b.tip_amount > 0 && (
            <Row icon={Heart} label="Tip">{money(b.tip_amount)} <span className="text-[11px] text-[#64748B]">to {b.driver_name || "your driver"}</span></Row>
          )}
          {b.zelle_proof_status && (
            <Row icon={CheckCircle2} label="Zelle proof">
              <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                b.zelle_proof_status === "approved" ? "bg-[#059669]/15 text-[#047857]" :
                b.zelle_proof_status === "rejected" ? "bg-[#DC2626]/15 text-[#B91C1C]" :
                "bg-[#D4A94A]/15 text-[#B47F26]"
              }`}>
                {b.zelle_proof_status}
              </span>
            </Row>
          )}
        </div>

        <div className="border-t border-[#E2E8F0] p-5 sm:p-6 bg-[#F8FAFC]">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#64748B] font-black mb-3">What next?</div>
          <div className="flex flex-wrap gap-2">
            {a.pay_url && (
              <a
                href={a.pay_url}
                className="btn-shine inline-flex items-center gap-1.5 rounded-full bg-[#E86A3C] text-white px-5 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-[#d55a30] active:scale-95"
                data-testid="action-pay"
              >
                <DollarSign className="w-3.5 h-3.5" /> Pay now · {money(b.total)}
              </a>
            )}
            {a.zelle_proof_url && (
              <a
                href={a.zelle_proof_url}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#0B3B5C] text-[#0B3B5C] bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-[#0B3B5C] hover:text-white active:scale-95"
                data-testid="action-zelle-proof"
              >
                <Upload className="w-3.5 h-3.5" /> Upload Zelle proof
              </a>
            )}
            {a.tip_url && (
              <a
                href={a.tip_url}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#D4A94A] text-[#B47F26] bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-[#D4A94A] hover:text-white active:scale-95"
                data-testid="action-tip"
              >
                <Heart className="w-3.5 h-3.5" /> Add a tip
              </a>
            )}
            {a.invoice_url && (
              <a
                href={a.invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] text-[#0B3B5C] bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-[#F1F5F9]"
                data-testid="action-invoice"
              >
                <FileText className="w-3.5 h-3.5" /> Download invoice
              </a>
            )}
            {a.track_url && (
              <Link
                to={`/track?booking=${b.booking_id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] text-[#0B3B5C] bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-[#F1F5F9]"
                data-testid="action-track"
              >
                <MapPin className="w-3.5 h-3.5" /> Track driver
              </Link>
            )}
          </div>
          {!a.pay_url && !a.tip_url && !a.invoice_url && !a.track_url && !a.zelle_proof_url && (
            <div className="text-xs text-[#64748B]">
              Nothing to do on your end — just show up and enjoy your trip.
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-[#64748B]">
        Something looks wrong? <a href="mailto:info@roxtaxibah.com" className="text-[#0B3B5C] font-semibold underline">Email us</a> — we'll fix it in minutes.
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 text-sm text-[#0B3B5C]">
      {Icon && <Icon className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />}
      <div className="text-[#64748B] text-xs min-w-[64px] uppercase tracking-widest font-black mt-0.5">{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
