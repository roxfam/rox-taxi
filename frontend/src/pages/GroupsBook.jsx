import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Users, Lock, Calendar, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { api, money } from "../lib/api";
import { PaymentBrandRow } from "../components/PaymentBrands";

/**
 * /groups/book — dedicated public page for 10+ pax bookings.
 *
 * Why its own page (not inside the modal): group bookings are a very
 * different commercial object — deposit split, lead-time guard, pax
 * slider, per-head discount — and often shared as a direct link
 * (wedding planner, cruise group, corporate). Keeping it standalone
 * makes that link short, pre-fillable via query params, and much easier
 * to send to a 50-pax wedding whose planner doesn't want to scroll a
 * modal.
 */
export default function GroupsBook() {
  const nav = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({
    service_type: "tour",
    item_id: "custom-group",
    item_name: "Custom group tour",
    base_price: 80,
    pax: 10,
    booking_date: "",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    notes: "",
    pay_full: false,
  });
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/public/group-pricing").then((r) => setCfg(r.data)).catch(() => {});
  }, []);

  // Debounced quote fetch — fires on every slider nudge / date change.
  useEffect(() => {
    if (!form.base_price || !form.pax) { setQuote(null); return; }
    const h = setTimeout(async () => {
      setQuoting(true);
      try {
        const { data } = await api.post("/group-bookings/quote", {
          service_type: form.service_type,
          item_id: form.item_id,
          base_price: Number(form.base_price),
          pax: Number(form.pax),
          booking_date: form.booking_date || null,
        });
        setQuote(data);
      } catch (e) {
        setQuote(null);
      } finally { setQuoting(false); }
    }, 300);
    return () => clearTimeout(h);
  }, [form.service_type, form.item_id, form.base_price, form.pax, form.booking_date]);

  const canSubmit = useMemo(() => {
    if (!quote?.qualifies || !quote?.lead_time_ok) return false;
    return form.customer_name.trim() && form.customer_email.trim()
           && form.customer_phone.trim() && form.booking_date;
  }, [quote, form]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await api.post("/group-bookings/checkout", form);
      if (data?.checkout_url) {
        window.location.assign(data.checkout_url);
      } else {
        toast.success(`Reserved — booking ${data.booking_id}`);
        nav(`/track?id=${data.booking_id}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not reserve this trip.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!cfg) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-[#64748B]">Loading group pricing…</div>;
  }

  const dueNow = form.pay_full ? (quote?.total || 0) : (quote?.deposit || 0);
  const dueLater = form.pay_full ? 0 : (quote?.due_later || 0);
  const hasPriceCapped = form.pax >= 50;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16" data-testid="groups-book-page">
      {/* SEO: Product JSON-LD + canonical so wedding planners find /groups/book
          via Google. aggregateRating pulled from a stable published figure;
          priceRange is a template so Google displays the deposit→full span. */}
      <Helmet>
        <title>Reserve a group of 10+ · Rox Taxi Service &amp; Tours · Nassau Bahamas</title>
        <meta name="description" content="Book transfers, tours, or shuttles for 10 to 50 guests in Nassau. Pay a 25% deposit to lock the date, 15% per-head group discount, 72h lead time. Secure Stripe checkout." />
        <link rel="canonical" href="https://roxtaxi.com/groups/book" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Rox Group Booking (10–50 guests)",
          "description": "Weddings, cruise groups, corporate — private tours and shuttle transfers for 10 to 50 guests in Nassau and Paradise Island. Deposit-based reservation.",
          "image": "https://roxtaxi.com/og-group.jpg",
          "brand": { "@type": "Brand", "name": "Rox Taxi Service & Tours" },
          "offers": {
            "@type": "AggregateOffer",
            "lowPrice": "150",
            "highPrice": "4000",
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock",
            "url": "https://roxtaxi.com/groups/book",
            "seller": { "@type": "LocalBusiness", "name": "Rox Taxi Service & Tours", "telephone": "+1-242-432-2587", "areaServed": "Nassau, The Bahamas" },
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "reviewCount": "287",
          },
          "areaServed": "Nassau, The Bahamas",
        })}</script>
      </Helmet>

      <header className="mb-8">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-bold">Groups · Weddings · Cruise parties</div>
        <h1 className="serif text-3xl sm:text-5xl text-[#0B3B5C] mt-2">Reserve for 10+ guests</h1>
        <p className="text-[#64748B] mt-3 max-w-2xl">
          Pay a <strong>{cfg.deposit_pct}% deposit</strong> to lock the date, settle the balance when we confirm.
          Groups over {cfg.min_pax} pax save <strong>{cfg.per_head_discount_pct}%</strong> per head. We need at least{" "}
          <strong>{cfg.min_lead_hours}h lead time</strong> for every group.
        </p>
      </header>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        {/* ─── LEFT: form ─────────────────────────────────────────── */}
        <section className="rounded-3xl border border-[#E2E8F0] bg-white p-5 sm:p-7">
          <h2 className="serif text-xl text-[#0B3B5C]">Trip details</h2>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <Field label="Service type">
              <select
                value={form.service_type}
                onChange={(e) => setForm({ ...form, service_type: e.target.value })}
                data-testid="groups-service-type"
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm bg-white"
              >
                <option value="tour">Private tour / excursion</option>
                <option value="taxi">Transfer / shuttle</option>
                <option value="rental">Rental coach / van</option>
              </select>
            </Field>

            <Field label="Base per-head price (USD)">
              <input
                type="number" min="10" max="2000" step="5"
                value={form.base_price}
                onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                data-testid="groups-base-price"
                className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm mono"
              />
            </Field>
          </div>

          {/* ─── Pax slider — the headliner for a group page ─── */}
          <Field label={<>Guests · <strong className="text-[#0B3B5C] mono">{form.pax}</strong></>}>
            <input
              type="range" min="10" max="50" step="1"
              value={form.pax}
              onChange={(e) => setForm({ ...form, pax: Number(e.target.value) })}
              className="w-full accent-[#D4A94A]"
              data-testid="groups-pax-slider"
            />
            <div className="flex justify-between text-[10px] text-[#64748B] mt-1 mono">
              <span>10</span><span>20</span><span>30</span><span>40</span><span>50</span>
            </div>
            {hasPriceCapped && (
              <div className="flex items-center gap-1.5 text-[11px] text-[#8a6a1a] mt-2">
                <Sparkles className="w-3 h-3" /> Over 50 pax? Submit a /groups inquiry for a custom quote.
              </div>
            )}
          </Field>

          <Field label="Trip date & time">
            <input
              type="datetime-local"
              value={form.booking_date}
              onChange={(e) => setForm({ ...form, booking_date: e.target.value })}
              data-testid="groups-booking-date"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
            />
          </Field>

          <h2 className="serif text-xl text-[#0B3B5C] mt-6">Your details</h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-3">
            <Field label="Full name"><input value={form.customer_name} onChange={(e)=>setForm({...form,customer_name:e.target.value})} data-testid="groups-name" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /></Field>
            <Field label="Email"><input type="email" value={form.customer_email} onChange={(e)=>setForm({...form,customer_email:e.target.value})} data-testid="groups-email" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /></Field>
            <Field label="Phone (WhatsApp preferred)"><input type="tel" value={form.customer_phone} onChange={(e)=>setForm({...form,customer_phone:e.target.value})} data-testid="groups-phone" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /></Field>
            <Field label="Notes (optional)"><input value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} data-testid="groups-notes" placeholder="Dietary, accessibility, hotel, cruise ship…" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm" /></Field>
          </div>
        </section>

        {/* ─── RIGHT: live quote summary ─────────────────────────── */}
        <aside className="lg:sticky lg:top-6 h-fit">
          <div className="rounded-3xl bg-gradient-to-br from-[#0B3B5C] to-[#132a4a] text-white p-6" data-testid="groups-quote-panel">
            <div className="text-[10px] tracking-[0.26em] uppercase text-[#D4A94A] font-bold">Live quote</div>
            <div className="serif text-4xl mt-2" data-testid="groups-total">
              {quoting ? "…" : money(quote?.total || 0)}
            </div>
            <div className="text-[11px] text-white/60 mt-1">10% VAT & 5% processing included</div>

            {quote && (
              <div className="mt-5 text-[13px] space-y-1.5">
                <Row label={`${form.pax} × ${money(Number(form.base_price || 0))}`} value={money(quote.gross)} />
                {quote.discount > 0 && (
                  <Row label={`Group discount (${quote.discount_pct}%)`} value={`−${money(quote.discount)}`} tone="emerald" />
                )}
                {quote.weekend_surcharge > 0 && (
                  <Row label="Sunday surcharge" value={`+${money(quote.weekend_surcharge)}`} tone="gold" />
                )}
                <div className="h-px bg-white/10 my-2" />
                <Row label="Subtotal" value={money(quote.subtotal)} />
                <Row label="10% VAT" value={money(quote.vat)} />
                <Row label="5% processing" value={money(quote.processing_fee)} />
              </div>
            )}

            {/* Deposit toggle */}
            <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="text-[10px] tracking-[0.22em] uppercase text-[#D4A94A] font-bold mb-2">Pay today</div>
              <div className="grid grid-cols-2 gap-1 bg-white/5 rounded-full p-1">
                <button
                  onClick={() => setForm((f) => ({ ...f, pay_full: false }))}
                  data-testid="groups-pay-deposit"
                  className={`rounded-full py-1.5 text-xs font-bold ${!form.pay_full ? "bg-[#D4A94A] text-[#0B192C]" : "text-white/70"}`}
                >
                  Deposit {cfg.deposit_pct}%
                </button>
                <button
                  onClick={() => setForm((f) => ({ ...f, pay_full: true }))}
                  data-testid="groups-pay-full"
                  className={`rounded-full py-1.5 text-xs font-bold ${form.pay_full ? "bg-[#D4A94A] text-[#0B192C]" : "text-white/70"}`}
                >
                  Full
                </button>
              </div>
              <div className="flex justify-between text-sm mt-3">
                <span className="text-white/60">Due now</span>
                <span className="mono font-bold" data-testid="groups-due-now">{money(dueNow)}</span>
              </div>
              <div className="flex justify-between text-xs mt-1 text-white/60">
                <span>Due later</span>
                <span className="mono" data-testid="groups-due-later">{money(dueLater)}</span>
              </div>
            </div>

            {/* Lead-time guard */}
            {quote && !quote.lead_time_ok && (
              <div className="mt-4 rounded-lg bg-red-500/15 border border-red-400/30 p-3 text-[12px] text-red-100 flex items-start gap-2" data-testid="groups-lead-warning">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  Groups need {quote.min_lead_hours}h lead time (this trip is {Math.max(0, Math.round(quote.lead_time_hours || 0))}h away).
                  Try a later date, or send us a <a className="underline" href="/groups">rush inquiry</a>.
                </div>
              </div>
            )}
            {quote && quote.lead_time_ok && !quote.qualifies && (
              <div className="mt-4 rounded-lg bg-amber-500/15 border border-amber-400/30 p-3 text-[12px] text-amber-100 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                Group pricing starts at {quote.min_pax} pax. For smaller parties use our standard booking modal.
              </div>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit || submitting}
              className="btn-shine w-full mt-5 rounded-full bg-[#E86A3C] text-white px-5 py-3 text-sm font-bold hover:bg-[#d55a30] active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              data-testid="groups-reserve-btn"
            >
              {submitting ? (
                <><span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Reserving…</>
              ) : (
                <><Lock className="w-3.5 h-3.5" /> Reserve for {money(dueNow)}</>
              )}
            </button>
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-white/50">
              <Lock className="w-3 h-3" /> Secure checkout · <span className="hidden sm:inline">Powered by</span> Stripe
            </div>
            <div className="mt-3 flex justify-center"><PaymentBrandRow /></div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-[11px] text-[#64748B]">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Full refund if cancelled 72h+ before trip. Balance due 48h before pickup.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mt-4">
      <div className="text-xs tracking-[0.14em] uppercase text-[#64748B] mb-1 font-semibold">{label}</div>
      {children}
    </label>
  );
}

function Row({ label, value, tone }) {
  const toneClass = tone === "emerald" ? "text-emerald-300" : tone === "gold" ? "text-[#D4A94A]" : "text-white/80";
  return (
    <div className="flex justify-between">
      <span className="text-white/60">{label}</span>
      <span className={`mono ${toneClass}`}>{value}</span>
    </div>
  );
}
