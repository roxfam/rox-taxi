import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Heart, Sparkles, Loader2, Search, Mail, Phone, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import Seo from "../components/Seo";

/**
 * TipLookup — public landing at `/tip`. Guest enters their booking
 * number + the email they booked with (or the last 4 of their phone).
 * Backend verifies and returns a signed tip link → we redirect them
 * straight into the existing `/tip-topup?id=X&t=Y` flow.
 */
export default function TipLookup() {
  const navigate = useNavigate();
  const [bookingId, setBookingId] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastDriver, setLastDriver] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const bid = bookingId.trim().toUpperCase();
    const c = contact.trim();
    if (bid.length < 4) return toast.error("Enter your booking number");
    if (c.length < 4) return toast.error("Enter your email or last-4 phone");
    setBusy(true);
    try {
      const { data } = await api.post("/bookings/tip-lookup", {
        booking_id: bid, contact: c,
      });
      setLastDriver(data.driver_name || null);
      toast.success("Found it — opening tip page…");
      // Delay briefly so the toast is seen
      setTimeout(() => navigate(`/tip-topup?id=${data.booking_id}&t=${data.token}`), 600);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not look up booking");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Seo
        title="Tip your driver · Rox Taxi Nassau"
        description="Look up your Rox Taxi booking by number to leave your driver an extra gratuity."
      />
      <section className="min-h-[80vh] bg-gradient-to-br from-[#FAF9F6] via-white to-[#F8FAFC] py-16 sm:py-24 px-6">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#D4A94A]/15 border border-[#D4A94A]/30 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-[#B47F26]">
              <Heart className="w-3 h-3" /> Say thanks
            </div>
            <h1 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-5 leading-tight">
              Tip your <em className="italic text-[#D4A94A]">Rox</em> driver.
            </h1>
            <p className="text-[#64748B] mt-3 leading-relaxed max-w-md mx-auto">
              Lost the SMS link? Just enter your booking number and we'll take you to the tip page.
              Drivers keep <strong>100%</strong> of every dollar.
            </p>
          </div>

          <form
            onSubmit={submit}
            className="bg-white rounded-3xl border border-[#E2E8F0] shadow-sm p-6 sm:p-8 space-y-5"
            data-testid="tip-lookup-form"
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
                  data-testid="tip-lookup-booking-id"
                />
              </div>
              <div className="mt-1.5 text-[11px] text-[#94a3b8]">
                You'll find this in your confirmation email or SMS.
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.25em] text-[#64748B] font-black mb-2">
                Email <span className="text-[#94a3b8] font-normal normal-case tracking-normal">or last 4 of phone</span>
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[#94a3b8]">
                  <Mail className="w-3.5 h-3.5" /><span className="text-[#94a3b8]">/</span><Phone className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="jane@email.com  or  1234"
                  className="w-full rounded-xl border border-[#E2E8F0] py-3 pl-16 pr-3 text-sm focus:border-[#D4A94A] focus:ring-1 focus:ring-[#D4A94A] outline-none"
                  autoComplete="email"
                  data-testid="tip-lookup-contact"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-shine w-full rounded-full bg-[#0B3B5C] text-white px-6 py-3.5 text-sm font-black uppercase tracking-wider hover:bg-[#132a4a] active:scale-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              data-testid="tip-lookup-submit"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {busy ? "Finding your booking…" : "Open my tip page"}
            </button>

            {lastDriver && (
              <div className="rounded-xl bg-[#D4A94A]/10 border border-[#D4A94A]/30 p-3 flex items-center gap-2 text-xs text-[#B47F26]" data-testid="tip-lookup-driver-hint">
                <Sparkles className="w-3.5 h-3.5" />
                Driver was <strong>{lastDriver}</strong>.
              </div>
            )}
          </form>

          <div className="mt-6 text-center text-xs text-[#64748B]">
            Can't find your booking number? <a href="mailto:info@roxtaxibah.com" className="text-[#0B3B5C] font-semibold underline">Email us</a> — we'll help.
          </div>
        </div>
      </section>
    </>
  );
}
