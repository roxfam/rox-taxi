import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, money } from "../lib/api";
import { Loader2, Printer, ArrowLeft } from "lucide-react";

/**
 * /receipt/:bookingId — print-friendly HTML receipt with @media print CSS.
 * Tourists file expense reports on this constantly.
 */
export default function PrintReceipt() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [cfg, setCfg] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [b, c] = await Promise.all([
          api.get(`/bookings/${bookingId.toUpperCase()}`),
          api.get("/site-config"),
        ]);
        setBooking(b.data); setCfg(c.data || {});
      } finally { setLoading(false); }
    })();
  }, [bookingId]);

  if (loading) return <div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#0B3B5C]" /></div>;
  if (!booking) return <div className="max-w-xl mx-auto px-6 py-24 text-center"><h1 className="serif text-3xl text-[#0B3B5C]">Receipt not found</h1></div>;

  const paid = booking.payment_status === "paid";
  const dt = new Date(booking.booking_date);
  const created = new Date(booking.created_at || Date.now());

  return (
    <div className="bg-[#F5F1E8] min-h-screen py-10 print:bg-white print:py-0" data-testid="print-receipt-page">
      {/* Toolbar — hidden on print */}
      <div className="max-w-3xl mx-auto px-6 mb-6 flex items-center justify-between print:hidden">
        <Link to={`/track?id=${booking.id}`} className="inline-flex items-center gap-1.5 text-sm text-[#0B3B5C] hover:text-[#D4A94A]"><ArrowLeft className="w-4 h-4" /> Back to booking</Link>
        <button
          type="button"
          onClick={() => window.print()}
          data-testid="print-receipt-btn"
          className="btn-shine inline-flex items-center gap-2 rounded-full bg-[#0B3B5C] hover:bg-[#0B192C] text-white px-5 py-2.5 text-sm font-semibold shadow-[0_10px_25px_rgba(11,25,44,0.25)]"
        >
          <Printer className="w-4 h-4" /> Print / Save PDF
        </button>
      </div>

      {/* Receipt */}
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_20px_60px_rgba(0,0,0,0.06)] p-10 print:shadow-none print:rounded-none print:border-0 print:p-8" data-testid="print-receipt-body">
        <div className="flex items-start justify-between gap-6 pb-6 border-b-2 border-[#0B3B5C]">
          <div className="flex items-start gap-4">
            <img
              src="/logo-gold.webp"
              alt="Rox Taxi Service & Tours"
              width={72} height={72}
              className="h-16 w-auto object-contain shrink-0"
              data-testid="print-receipt-logo"
            />
            <div>
              <div className="serif text-2xl text-[#0B3B5C] font-black">Rox Taxi Service <em className="italic text-[#D4A94A]">& Tours</em></div>
              <div className="text-xs text-[#64748B] mt-1 leading-snug">
                Nassau, New Providence · The Bahamas<br />
                {cfg.phone || "+1 (242) 432-2587"} · <a href="mailto:roxfam2509@gmail.com" className="text-[#0B3B5C]">roxfam2509@gmail.com</a>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-black">Official Receipt</div>
            <div className="mono text-2xl text-[#0B3B5C] font-black tracking-tight mt-1">{booking.id}</div>
            <div className={`mt-2 inline-block px-3 py-1 rounded-full text-[10px] tracking-widest uppercase font-black ${paid ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"}`}>{paid ? "Paid" : "Pending payment"}</div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mt-6 text-sm">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-black">Billed to</div>
            <div className="mt-1 text-[#0B3B5C] font-semibold">{booking.customer_name}</div>
            <div className="text-[#64748B] text-xs">{booking.customer_email}</div>
            <div className="text-[#64748B] text-xs">{booking.customer_phone}</div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-black">Service date</div>
            <div className="mt-1 text-[#0B3B5C] font-semibold">{dt.toLocaleString()}</div>
            <div className="text-[#64748B] text-xs">Booked {created.toLocaleDateString()}</div>
          </div>
        </div>

        <table className="w-full text-sm mt-8 border-collapse" data-testid="print-receipt-table">
          <thead>
            <tr className="border-b border-[#E2E8F0] text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black">
              <th className="text-left py-2">Item</th>
              <th className="text-right py-2">Amount</th>
            </tr>
          </thead>
          <tbody className="text-[#0B3B5C]">
            <tr className="border-b border-[#F1F5F9]"><td className="py-2.5">{booking.item_name}{booking.days > 1 && ` × ${booking.days} days`}</td><td className="py-2.5 text-right mono">{money(booking.price * (booking.service_type === "rental" ? (booking.days || 1) : 1))}</td></tr>
            {booking.round_trip && <tr className="border-b border-[#F1F5F9]"><td className="py-2.5">Return leg — same-day round trip</td><td className="py-2.5 text-right mono">{money(booking.price)}</td></tr>}
            {booking.round_trip_discount > 0 && <tr className="border-b border-[#F1F5F9] text-emerald-700"><td className="py-2.5">Round-trip discount (10%)</td><td className="py-2.5 text-right mono">−{money(booking.round_trip_discount)}</td></tr>}
            {booking.rental_discount > 0 && <tr className="border-b border-[#F1F5F9] text-emerald-700"><td className="py-2.5">Multi-day discount ({Math.round((booking.rental_discount_pct || 0) * 100)}%)</td><td className="py-2.5 text-right mono">−{money(booking.rental_discount)}</td></tr>}
            {booking.luggage_fee > 0 && <tr className="border-b border-[#F1F5F9]"><td className="py-2.5">Extra luggage ({booking.extra_luggage})</td><td className="py-2.5 text-right mono">{money(booking.luggage_fee)}</td></tr>}
            {booking.passenger_fee > 0 && <tr className="border-b border-[#F1F5F9]"><td className="py-2.5">Extra passenger fee</td><td className="py-2.5 text-right mono">{money(booking.passenger_fee)}</td></tr>}
            {booking.bridge_toll_fee > 0 && <tr className="border-b border-[#F1F5F9]"><td className="py-2.5">Paradise Island bridge toll</td><td className="py-2.5 text-right mono">{money(booking.bridge_toll_fee)}</td></tr>}
            {booking.deposit_amount > 0 && <tr className="border-b border-[#F1F5F9]"><td className="py-2.5">Refundable security deposit</td><td className="py-2.5 text-right mono">{money(booking.deposit_amount)}</td></tr>}
            {booking.additional_driver_fee > 0 && <tr className="border-b border-[#F1F5F9]"><td className="py-2.5">Additional drivers ({booking.additional_drivers})</td><td className="py-2.5 text-right mono">{money(booking.additional_driver_fee)}</td></tr>}
            {booking.tip_amount > 0 && <tr className="border-b border-[#F1F5F9]"><td className="py-2.5">Driver gratuity</td><td className="py-2.5 text-right mono">{money(booking.tip_amount)}</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#0B3B5C]">
              <td className="py-4 text-lg font-black text-[#0B3B5C]">Total {paid ? "paid" : "due"}</td>
              <td className="py-4 text-right mono text-2xl font-black text-[#E86A3C]">{money(booking.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-8 pt-6 border-t border-[#E2E8F0] text-[11px] text-[#64748B] leading-relaxed">
          <p><b>Payment method:</b> {booking.payment_method || "—"}{booking.payment_status ? ` · ${booking.payment_status}` : ""}</p>
          <p className="mt-2"><b>Cancellation policy:</b> 48+ hours notice = refund minus 15% fee. Within 48 hours = non-refundable.</p>
          <p className="mt-3 text-center serif italic text-[#94a3b8]">Thank you for riding with Rox Taxi Service &amp; Tours — see you on the island soon.</p>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .btn-shine, [data-testid="print-receipt-btn"], .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
