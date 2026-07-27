import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CreditCard, Wallet, CheckCircle2, Copy, X } from "lucide-react";
import { api, money } from "../lib/api";

/**
 * BookingModal — used by Taxi, Tours and Rentals pages.
 * Props:
 *  - item: { id, name, price, image_url }
 *  - serviceType: "taxi" | "tour" | "rental"
 *  - extraFields: (formState, setFormState) => JSX (pickup/dropoff for taxi, days for rental etc)
 *  - defaultDays?: number
 *  - onClose: () => void
 */
export default function BookingModal({ item, serviceType, extraFields, defaultDays = 1, onClose }) {
  const nav = useNavigate();
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    booking_date: "",
    pickup_location: "",
    dropoff_location: "",
    passengers: 1,
    days: defaultDays,
    extra_luggage: 0,
    notes: "",
  });
  const LUGGAGE_FEE = 3;
  const PASSENGER_FEE = 5;
  const PASSENGER_THRESHOLD = 3;
  const [payMethod, setPayMethod] = useState("stripe");
  const [step, setStep] = useState(1); // 1=details, 2=payment, 3=zelle-confirmation
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(null);
  const [siteCfg, setSiteCfg] = useState({ zelle_email: "payments@roxtaxi.com", zelle_phone: "+1-242-000-0000" });

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const base = (item?.price || 0) * (serviceType === "rental" ? Number(form.days || 1) : 1);
  const luggageFee = serviceType === "taxi" ? Number(form.extra_luggage || 0) * LUGGAGE_FEE : 0;
  const passengerFee = serviceType === "taxi" && Number(form.passengers || 0) >= PASSENGER_THRESHOLD ? PASSENGER_FEE : 0;
  const total = base + luggageFee + passengerFee;

  const submit = async () => {
    if (!form.customer_name || !form.customer_email || !form.customer_phone || !form.booking_date) {
      toast.error("Please fill in your name, email, phone and date.");
      return;
    }
    if (!form.passengers || Number(form.passengers) < 1) {
      toast.error("Please enter the number of passengers.");
      return;
    }
    setLoading(true);
    try {
      const cfg = await api.get("/site-config").then((r) => r.data).catch(() => siteCfg);
      setSiteCfg(cfg);

      const payload = {
        service_type: serviceType,
        item_id: item.id,
        item_name: item.name,
        price: item.price,
        customer_name: form.customer_name,
        customer_email: form.customer_email,
        customer_phone: form.customer_phone,
        booking_date: form.booking_date,
        pickup_location: form.pickup_location || null,
        dropoff_location: form.dropoff_location || null,
        passengers: Number(form.passengers) || 1,
        days: Number(form.days) || 1,
        extra_luggage: Number(form.extra_luggage) || 0,
        notes: form.notes || null,
        payment_method: payMethod,
      };
      const { data: b } = await api.post("/bookings", payload);
      setBooking(b);

      if (payMethod === "stripe") {
        const { data: c } = await api.post("/payments/checkout", {
          booking_id: b.id,
          origin_url: window.location.origin,
        });
        window.location.href = c.checkout_url;
      } else {
        setStep(3);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Booking failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0B192C]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" data-testid="booking-modal">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="relative p-6 sm:p-8 border-b border-[#E2E8F0]">
          <button onClick={onClose} className="absolute top-5 right-5 w-9 h-9 rounded-full hover:bg-[#F1F5F9] flex items-center justify-center" data-testid="booking-modal-close">
            <X className="w-5 h-5 text-[#1A365D]" />
          </button>
          <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Booking</div>
          <h2 className="serif text-2xl sm:text-3xl text-[#1A365D] mt-1">{item.name}</h2>
          <div className="mt-2 mono text-[#FF7F50] font-semibold">{money(item.price)}{serviceType === "rental" ? " / day" : ""}</div>
        </div>

        <div className="overflow-y-auto p-6 sm:p-8 space-y-5">
          {step === 1 && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Full name *" val={form.customer_name} on={setF("customer_name")} testid="booking-name" />
                <Field label="Email *" type="email" val={form.customer_email} on={setF("customer_email")} testid="booking-email" />
                <Field label="Phone *" val={form.customer_phone} on={setF("customer_phone")} testid="booking-phone" />
                <Field label={serviceType === "rental" ? "Pickup date *" : "Date & time *"} type={serviceType === "rental" ? "date" : "datetime-local"} val={form.booking_date} on={setF("booking_date")} testid="booking-date" />
                <div className="sm:col-span-2">
                  <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">Passengers *</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setForm({ ...form, passengers: Math.max(1, Number(form.passengers) - 1) })} className="w-10 h-10 rounded-full border border-[#E2E8F0] text-lg hover:border-[#1A365D] active:scale-95" data-testid="pax-minus">−</button>
                    <input type="number" min={1} max={20} required value={form.passengers} onChange={(e) => setForm({ ...form, passengers: Math.max(1, Math.min(20, parseInt(e.target.value || "1"))) })} className="w-20 text-center rounded-xl border border-[#E2E8F0] py-2.5 text-sm mono" data-testid="booking-passengers" />
                    <button type="button" onClick={() => setForm({ ...form, passengers: Math.min(20, Number(form.passengers) + 1) })} className="w-10 h-10 rounded-full border border-[#E2E8F0] text-lg hover:border-[#1A365D] active:scale-95" data-testid="pax-plus">+</button>
                    {serviceType === "taxi" && Number(form.passengers) >= PASSENGER_THRESHOLD && (
                      <span className="text-xs text-[#FF7F50] font-semibold" data-testid="pax-fee-note">+ ${PASSENGER_FEE} group fee ({PASSENGER_THRESHOLD}+ pax)</span>
                    )}
                  </div>
                </div>
              </div>
              {extraFields && extraFields(form, setForm)}

              {serviceType === "taxi" && (
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4" data-testid="luggage-section">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[#1A365D]">Extra luggage</div>
                      <div className="text-xs text-[#64748B] mt-0.5">First checked bag + 1 carry-on <span className="text-[#00B4D8] font-semibold">free</span>. Additional bags <span className="mono font-semibold text-[#FF7F50]">${LUGGAGE_FEE}</span> each.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, extra_luggage: Math.max(0, Number(form.extra_luggage) - 1) })}
                        className="w-9 h-9 rounded-full border border-[#E2E8F0] text-lg hover:border-[#1A365D] active:scale-95"
                        data-testid="luggage-minus"
                      >−</button>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={form.extra_luggage}
                        onChange={(e) => setForm({ ...form, extra_luggage: Math.max(0, Math.min(10, parseInt(e.target.value || "0"))) })}
                        className="w-14 text-center rounded-lg border border-[#E2E8F0] py-2 text-sm mono"
                        data-testid="luggage-count"
                      />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, extra_luggage: Math.min(10, Number(form.extra_luggage) + 1) })}
                        className="w-9 h-9 rounded-full border border-[#E2E8F0] text-lg hover:border-[#1A365D] active:scale-95"
                        data-testid="luggage-plus"
                      >+</button>
                    </div>
                  </div>
                  {Number(form.extra_luggage) > 0 && (
                    <div className="mt-3 text-xs text-[#64748B] flex justify-between border-t border-[#E2E8F0] pt-2">
                      <span>{form.extra_luggage} extra bag(s) × ${LUGGAGE_FEE}</span>
                      <span className="mono font-semibold text-[#FF7F50]">+${(Number(form.extra_luggage) * LUGGAGE_FEE).toFixed(2)}</span>
                    </div>
                  )}
                  {passengerFee > 0 && (
                    <div className="mt-2 text-xs text-[#64748B] flex justify-between">
                      <span>Group fee ({form.passengers} passengers)</span>
                      <span className="mono font-semibold text-[#FF7F50]">+${passengerFee.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={setF("notes")}
                  rows={2}
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm focus:border-[#00B4D8] focus:outline-none focus:ring-2 focus:ring-[#00B4D8]/20"
                  placeholder="Flight number, hotel, special requests…"
                  data-testid="booking-notes"
                />
              </div>

              <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
                <div>
                  <div className="text-xs text-[#64748B]">Total</div>
                  <div className="serif text-2xl text-[#1A365D]">{money(total)}</div>
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="btn-shine rounded-full bg-[#1A365D] text-white px-6 py-3 text-sm font-semibold hover:bg-[#132a4a] active:scale-95"
                  data-testid="booking-continue-payment-btn"
                >
                  Continue to Payment
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h3 className="serif text-xl text-[#1A365D]">Choose a payment method</h3>
              <div className="grid gap-3">
                <PayCard
                  active={payMethod === "stripe"}
                  onClick={() => setPayMethod("stripe")}
                  icon={<CreditCard className="w-5 h-5" />}
                  title="Credit Card & PayPal"
                  desc="Securely processed via Stripe. Card 4242 4242 4242 4242 works in test mode."
                  testid="pay-method-stripe"
                />
                <PayCard
                  active={payMethod === "zelle"}
                  onClick={() => setPayMethod("zelle")}
                  icon={<Wallet className="w-5 h-5" />}
                  title="Zelle Transfer"
                  desc="Send payment via Zelle; we'll confirm your booking within minutes."
                  testid="pay-method-zelle"
                />
              </div>

              <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
                <button onClick={() => setStep(1)} className="text-sm text-[#64748B] hover:text-[#1A365D]" data-testid="booking-back-btn">
                  ← Back
                </button>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-[#64748B]">Total</div>
                    <div className="serif text-2xl text-[#1A365D]">{money(total)}</div>
                  </div>
                  <button
                    onClick={submit}
                    disabled={loading}
                    className="btn-shine rounded-full bg-[#FF7F50] text-white px-6 py-3 text-sm font-semibold hover:bg-[#ff6a34] active:scale-95 disabled:opacity-60"
                    data-testid="booking-submit-payment-btn"
                  >
                    {loading ? "Processing..." : payMethod === "stripe" ? "Pay with Stripe" : "Reserve & See Zelle Info"}
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 3 && booking && (
            <div data-testid="zelle-instructions">
              <div className="flex items-center gap-2 text-[#00B4D8]">
                <CheckCircle2 className="w-6 h-6" />
                <span className="font-semibold">Booking reserved!</span>
              </div>
              <p className="text-sm text-[#64748B] mt-2">Your confirmation code:</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="mono text-2xl bg-[#F1F5F9] px-4 py-2 rounded-lg text-[#1A365D]" data-testid="zelle-booking-code">{booking.id}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(booking.id); toast.success("Copied"); }}
                  className="p-2 rounded-lg hover:bg-[#F1F5F9]"
                  data-testid="zelle-copy-code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-[#E2E8F0] p-5">
                <h4 className="serif text-lg text-[#1A365D]">Send Zelle payment to:</h4>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><span className="text-[#64748B]">Email:</span> <span className="mono text-[#1A365D]" data-testid="zelle-email">{siteCfg.zelle_email}</span></li>
                  <li><span className="text-[#64748B]">Phone:</span> <span className="mono text-[#1A365D]" data-testid="zelle-phone">{siteCfg.zelle_phone}</span></li>
                  <li><span className="text-[#64748B]">Amount:</span> <span className="mono text-[#FF7F50] font-semibold">{money(total)}</span></li>
                  <li><span className="text-[#64748B]">Memo:</span> <span className="mono text-[#1A365D]">Booking {booking.id}</span></li>
                </ul>
                <p className="text-xs text-[#64748B] mt-4 leading-relaxed">
                  Include your booking code in the Zelle memo so we can match your payment. Once received, we'll
                  update your booking status. You can track progress on the Track page anytime.
                </p>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <button onClick={onClose} className="rounded-full border border-[#E2E8F0] px-5 py-2.5 text-sm" data-testid="zelle-close-btn">Close</button>
                <button
                  onClick={() => nav(`/track?id=${booking.id}`)}
                  className="btn-shine rounded-full bg-[#1A365D] text-white px-6 py-2.5 text-sm font-semibold"
                  data-testid="zelle-track-btn"
                >
                  Track Booking
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, val, on, type = "text", testid }) {
  return (
    <div>
      <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">{label}</label>
      <input
        type={type}
        value={val}
        onChange={on}
        data-testid={testid}
        className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm focus:border-[#00B4D8] focus:outline-none focus:ring-2 focus:ring-[#00B4D8]/20"
      />
    </div>
  );
}

function PayCard({ active, onClick, icon, title, desc, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`text-left rounded-2xl border p-5 flex gap-4 items-start transition-colors ${
        active ? "border-[#00B4D8] bg-[#00B4D8]/5" : "border-[#E2E8F0] bg-white hover:border-[#1A365D]/40"
      }`}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${active ? "bg-[#00B4D8] text-white" : "bg-[#F1F5F9] text-[#1A365D]"}`}>
        {icon}
      </div>
      <div>
        <div className="font-semibold text-[#1A365D]">{title}</div>
        <p className="text-sm text-[#64748B] mt-0.5 leading-snug">{desc}</p>
      </div>
    </button>
  );
}

export { Field };
