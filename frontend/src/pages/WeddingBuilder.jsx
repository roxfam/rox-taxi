import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Car, ShipWheel, MapPinned, ChevronLeft, ChevronRight, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../lib/api";

const STEPS = [
  { key: "basics", label: "Basics" },
  { key: "transport", label: "Transport" },
  { key: "tours", label: "Excursions" },
  { key: "rentals", label: "Rentals" },
  { key: "review", label: "Review" },
];

const CEREMONY_ADDON = { key: "ceremony", label: "Ceremony-day concierge (10hr)", price: 550 };
const REHEARSAL_ADDON = { key: "rehearsal", label: "Rehearsal-dinner transport", price: 220 };
const AFTERPARTY_ADDON = { key: "afterparty", label: "After-party late-night shuttle", price: 300 };
const ADDONS = [CEREMONY_ADDON, REHEARSAL_ADDON, AFTERPARTY_ADDON];

export default function WeddingBuilder() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [taxi, setTaxi] = useState([]);
  const [tours, setTours] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [pkg, setPkg] = useState({
    guest_count: 25,
    event_date: "",
    transport: {},  // { taxiServiceId: count }
    tourItems: {},  // { tourId: guest_count }
    rentalItems: {}, // { rentalId: days }
    addons: [],
  });
  const [contact, setContact] = useState({ customer_name: "", customer_email: "", customer_phone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/taxi-services"), api.get("/tours"), api.get("/rentals")]).then(([t, r, e]) => {
      setTaxi(t.data); setTours(r.data); setRentals(e.data);
    });
  }, []);

  const setTransport = (id, delta) => setPkg((p) => ({ ...p, transport: { ...p.transport, [id]: Math.max(0, (p.transport[id] || 0) + delta) } }));
  const toggleTour = (id) => setPkg((p) => {
    const next = { ...p.tourItems };
    if (next[id]) delete next[id]; else next[id] = p.guest_count;
    return { ...p, tourItems: next };
  });
  const setTourGuests = (id, n) => setPkg((p) => ({ ...p, tourItems: { ...p.tourItems, [id]: Math.max(1, n) } }));
  const setRentalDays = (id, days) => setPkg((p) => {
    const next = { ...p.rentalItems };
    if (days <= 0) delete next[id]; else next[id] = days;
    return { ...p, rentalItems: next };
  });
  const toggleAddon = (k) => setPkg((p) => ({ ...p, addons: p.addons.includes(k) ? p.addons.filter((x) => x !== k) : [...p.addons, k] }));

  const estimate = useMemo(() => {
    const lines = [];
    Object.entries(pkg.transport).forEach(([id, count]) => {
      if (!count) return;
      const s = taxi.find((x) => x.id === id); if (!s) return;
      lines.push({ label: `${s.name} × ${count}`, amount: s.price * count });
    });
    Object.entries(pkg.tourItems).forEach(([id, guests]) => {
      const t = tours.find((x) => x.id === id); if (!t) return;
      lines.push({ label: `${t.name} × ${guests} guest(s)`, amount: t.price * guests });
    });
    Object.entries(pkg.rentalItems).forEach(([id, days]) => {
      const r = rentals.find((x) => x.id === id); if (!r) return;
      lines.push({ label: `${r.name} × ${days} day(s)`, amount: r.price * days });
    });
    pkg.addons.forEach((k) => {
      const a = ADDONS.find((x) => x.key === k); if (!a) return;
      lines.push({ label: a.label, amount: a.price });
    });
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    // Volume discount: 10% for 8+ guests, 15% for 25+, 20% for 50+
    let disc = 0;
    if (pkg.guest_count >= 50) disc = 0.20;
    else if (pkg.guest_count >= 25) disc = 0.15;
    else if (pkg.guest_count >= 8) disc = 0.10;
    const discount = subtotal * disc;
    const total = subtotal - discount;
    return { lines, subtotal, disc, discount, total };
  }, [pkg, taxi, tours, rentals]);

  const canNext = () => {
    if (step === 0) return pkg.guest_count >= 2 && pkg.event_date;
    return true;
  };

  const submit = async () => {
    if (!contact.customer_name || !contact.customer_email || !contact.customer_phone) {
      toast.error("Please fill in your name, email and phone.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/group-inquiries", {
        event_type: "wedding",
        event_date: pkg.event_date,
        guest_count: pkg.guest_count,
        needs: [
          ...(Object.keys(pkg.transport).length ? ["taxi"] : []),
          ...(Object.keys(pkg.tourItems).length ? ["tours"] : []),
          ...(Object.keys(pkg.rentalItems).length ? ["rentals"] : []),
        ],
        budget_range: null,
        customer_name: contact.customer_name,
        customer_email: contact.customer_email,
        customer_phone: contact.customer_phone,
        notes: contact.notes + "\n\n[Wedding Builder estimate: $" + estimate.total.toFixed(2) + "]",
        package: pkg,
        estimated_total: Number(estimate.total.toFixed(2)),
      });
      setSubmitted(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Something went wrong.");
    } finally { setSaving(false); }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="wedding-builder-success">
        <div className="w-16 h-16 rounded-full bg-[#D4A94A]/15 text-[#D4A94A] mx-auto flex items-center justify-center"><Check className="w-8 h-8" /></div>
        <h1 className="serif text-5xl sm:text-6xl text-[#0B3B5C] mt-6 leading-[0.9]">Package sent for <em className="italic text-[#D4A94A]">approval</em>.</h1>
        <p className="text-[#64748B] mt-4 max-w-md mx-auto">Reference <span className="mono font-semibold text-[#0B3B5C]" data-testid="wedding-inquiry-id">{submitted.id}</span> · Estimated <span className="mono font-semibold text-[#E86A3C]">{money(submitted.estimated_total)}</span>. Our concierge will confirm final pricing within 2 hours.</p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <a
            href={`${(process.env.REACT_APP_BACKEND_URL || "")}/api/wedding-package/${submitted.id}/quote.pdf`}
            target="_blank" rel="noreferrer"
            data-testid="wedding-download-pdf"
            className="rounded-full bg-[#D4A94A] text-[#0B192C] px-6 py-3 text-sm font-semibold hover:bg-[#e0b856] active:scale-95 shadow-[0_10px_25px_rgba(212,169,74,0.4)]"
          >
            Download PDF quote
          </a>
          <button onClick={() => nav("/")} className="rounded-full bg-[#0B3B5C] text-white px-6 py-3 text-sm font-semibold">Back to home</button>
          <a href={`https://wa.me/12420000000?text=Following%20up%20on%20wedding%20package%20${submitted.id}`} target="_blank" rel="noreferrer" className="rounded-full bg-[#25D366] text-white px-6 py-3 text-sm font-semibold">WhatsApp us</a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FBF7EF]" data-testid="wedding-builder-page">
      <section className="bg-[#0B3B5C] text-white py-20">
        <div className="max-w-6xl mx-auto px-6 lg:px-10">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Wedding Package Builder</span>
          <h1 className="serif text-5xl sm:text-6xl mt-3 leading-[0.9]">Design your <em className="italic text-[#F5E1A4]">dream day</em>.</h1>
          <p className="mt-4 text-white/70 max-w-xl">Pick your transport, add excursions, add rental cars — we'll cost it live as you go.</p>
        </div>
      </section>

      {/* Stepper */}
      <div className="max-w-5xl mx-auto px-6 lg:px-10 -mt-8 relative z-10">
        <div className="bg-white rounded-2xl border border-[#EFE7D5] shadow-[0_20px_40px_rgba(11,59,92,0.08)] p-4">
          <div className="flex items-center justify-between gap-2" data-testid="wb-stepper">
            {STEPS.map((s, i) => (
              <button key={s.key} onClick={() => setStep(i)} className={`flex-1 text-xs px-3 py-2 rounded-full transition-colors ${step === i ? "bg-[#0B3B5C] text-white" : "text-[#64748B] hover:bg-[#F1F5F9]"}`} data-testid={`wb-step-${s.key}`}>
                <span className="mono mr-1">{i + 1}</span> {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-10 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }} className="bg-white rounded-2xl border border-[#EFE7D5] p-6 sm:p-8">
              {step === 0 && (
                <div className="space-y-5" data-testid="wb-basics">
                  <h2 className="serif text-3xl text-[#0B3B5C]">Wedding basics</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">Wedding date *</label>
                      <input type="date" value={pkg.event_date} onChange={(e) => setPkg({ ...pkg, event_date: e.target.value })} className="w-full rounded-xl border border-[#EFE7D5] px-4 py-3 text-sm" data-testid="wb-date" />
                    </div>
                    <div>
                      <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">Guest count *</label>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setPkg({ ...pkg, guest_count: Math.max(2, pkg.guest_count - 5) })} className="w-11 h-11 rounded-full border border-[#EFE7D5]" data-testid="wb-guests-minus">−</button>
                        <input type="number" min={2} max={500} value={pkg.guest_count} onChange={(e) => setPkg({ ...pkg, guest_count: Math.max(2, Math.min(500, parseInt(e.target.value || "2"))) })} className="w-24 text-center rounded-xl border border-[#EFE7D5] py-2.5 mono text-lg" data-testid="wb-guests" />
                        <button onClick={() => setPkg({ ...pkg, guest_count: Math.min(500, pkg.guest_count + 5) })} className="w-11 h-11 rounded-full border border-[#EFE7D5]" data-testid="wb-guests-plus">+</button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl bg-[#D4A94A]/10 border border-[#D4A94A]/30 p-4 text-sm text-[#5c4813] flex items-start gap-2" data-testid="wb-discount-hint">
                    <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>Volume discount unlocks: <strong>10%</strong> at 8+ guests · <strong>15%</strong> at 25+ · <strong>20%</strong> at 50+</div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5" data-testid="wb-transport">
                  <h2 className="serif text-3xl text-[#0B3B5C]">Transport</h2>
                  <p className="text-sm text-[#64748B]">How many of each type do you need on the day?</p>
                  {taxi.map((s) => {
                    const count = pkg.transport[s.id] || 0;
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-4 rounded-xl border border-[#EFE7D5] p-4" data-testid={`wb-taxi-${s.id}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/15 text-[#D4A94A] flex items-center justify-center"><Car className="w-5 h-5" /></div>
                          <div>
                            <div className="text-sm font-semibold text-[#0B3B5C]">{s.name}</div>
                            <div className="text-xs text-[#64748B] mono">{money(s.price)} each</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setTransport(s.id, -1)} className="w-9 h-9 rounded-full border border-[#EFE7D5]">−</button>
                          <span className="w-8 text-center mono" data-testid={`wb-taxi-count-${s.id}`}>{count}</span>
                          <button onClick={() => setTransport(s.id, +1)} className="w-9 h-9 rounded-full border border-[#EFE7D5]">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5" data-testid="wb-tours">
                  <h2 className="serif text-3xl text-[#0B3B5C]">Excursions</h2>
                  <p className="text-sm text-[#64748B]">Optional — rehearsal-day tours, out-of-towner activities, etc.</p>
                  {tours.map((t) => {
                    const active = !!pkg.tourItems[t.id];
                    const guests = pkg.tourItems[t.id] || pkg.guest_count;
                    return (
                      <div key={t.id} className={`rounded-xl border p-4 transition-colors ${active ? "border-[#D4A94A] bg-[#D4A94A]/5" : "border-[#EFE7D5]"}`} data-testid={`wb-tour-${t.id}`}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#00AF87]/15 text-[#00AF87] flex items-center justify-center"><ShipWheel className="w-5 h-5" /></div>
                            <div>
                              <div className="text-sm font-semibold text-[#0B3B5C]">{t.name}</div>
                              <div className="text-xs text-[#64748B] mono">{money(t.price)} / person</div>
                            </div>
                          </div>
                          <button onClick={() => toggleTour(t.id)} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${active ? "bg-[#0B3B5C] text-white" : "border border-[#EFE7D5] text-[#0B3B5C]"}`} data-testid={`wb-tour-toggle-${t.id}`}>
                            {active ? "Added" : "Add"}
                          </button>
                        </div>
                        {active && (
                          <div className="mt-3 flex items-center gap-2 text-xs text-[#64748B]">
                            Guests attending:
                            <input type="number" min={1} max={pkg.guest_count} value={guests} onChange={(e) => setTourGuests(t.id, Math.min(pkg.guest_count, Math.max(1, parseInt(e.target.value || "1"))))} className="w-20 rounded-lg border border-[#EFE7D5] px-2 py-1 mono" data-testid={`wb-tour-guests-${t.id}`} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5" data-testid="wb-rentals">
                  <h2 className="serif text-3xl text-[#0B3B5C]">Car rentals</h2>
                  <p className="text-sm text-[#64748B]">Optional — great for parents, VIPs, or the couple's honeymoon car.</p>
                  {rentals.map((r) => {
                    const days = pkg.rentalItems[r.id] || 0;
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl border border-[#EFE7D5] p-4" data-testid={`wb-rental-${r.id}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#E86A3C]/15 text-[#E86A3C] flex items-center justify-center"><MapPinned className="w-5 h-5" /></div>
                          <div>
                            <div className="text-sm font-semibold text-[#0B3B5C]">{r.name}</div>
                            <div className="text-xs text-[#64748B] mono">{money(r.price)} / day</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#64748B]">days</span>
                          <input type="number" min={0} max={30} value={days} onChange={(e) => setRentalDays(r.id, Math.max(0, Math.min(30, parseInt(e.target.value || "0"))))} className="w-16 text-center rounded-lg border border-[#EFE7D5] py-1.5 mono" data-testid={`wb-rental-days-${r.id}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5" data-testid="wb-review">
                  <h2 className="serif text-3xl text-[#0B3B5C]">Add-ons & your details</h2>
                  <div className="grid gap-2">
                    {ADDONS.map((a) => {
                      const active = pkg.addons.includes(a.key);
                      return (
                        <button key={a.key} onClick={() => toggleAddon(a.key)} data-testid={`wb-addon-${a.key}`} className={`flex items-center justify-between rounded-xl border p-3 text-left transition-colors ${active ? "border-[#D4A94A] bg-[#D4A94A]/5" : "border-[#EFE7D5]"}`}>
                          <div className="flex items-center gap-2 text-sm text-[#0B3B5C]">
                            <span className={`w-5 h-5 rounded border-2 flex items-center justify-center ${active ? "bg-[#D4A94A] border-[#D4A94A]" : "border-[#EFE7D5]"}`}>{active && <Check className="w-3 h-3 text-white" />}</span>
                            {a.label}
                          </div>
                          <div className="mono text-sm text-[#E86A3C] font-semibold">+{money(a.price)}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-[#EFE7D5]">
                    <Field label="Full name *" val={contact.customer_name} on={(v) => setContact({ ...contact, customer_name: v })} testid="wb-name" />
                    <Field label="Email *" type="email" val={contact.customer_email} on={(v) => setContact({ ...contact, customer_email: v })} testid="wb-email" />
                    <Field label="Phone / WhatsApp *" val={contact.customer_phone} on={(v) => setContact({ ...contact, customer_phone: v })} testid="wb-phone" />
                    <Field label="Notes (venues, timing)" val={contact.notes} on={(v) => setContact({ ...contact, notes: v })} textarea testid="wb-notes" />
                  </div>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between border-t border-[#EFE7D5] pt-5">
                <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="rounded-full border border-[#EFE7D5] px-5 py-2 text-sm text-[#0B3B5C] disabled:opacity-40 flex items-center gap-1" data-testid="wb-back">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                {step < STEPS.length - 1 ? (
                  <button onClick={() => canNext() && setStep(step + 1)} disabled={!canNext()} className="rounded-full bg-[#0B3B5C] text-white px-6 py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center gap-1" data-testid="wb-next">
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={submit} disabled={saving} data-testid="wb-submit" className="rounded-full bg-[#E86A3C] text-white px-7 py-3 text-sm font-semibold hover:bg-[#d55a30] disabled:opacity-60 shadow-[0_10px_25px_rgba(232,106,60,0.35)]">
                    {saving ? "Sending…" : "Send my package"}
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Live estimate */}
        <aside className="bg-white rounded-2xl border border-[#EFE7D5] p-6 h-fit sticky top-24" data-testid="wb-estimate">
          <div className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-[#64748B] font-semibold"><Heart className="w-3 h-3 text-[#E86A3C]" /> Live estimate</div>
          <div className="mt-4 space-y-2 text-sm max-h-72 overflow-auto">
            {estimate.lines.length === 0 && <div className="text-[#94a3b8]">Start adding items to see your estimate.</div>}
            {estimate.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="text-[#334155]">{l.label}</span>
                <span className="mono text-[#0B3B5C]">{money(l.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-[#EFE7D5] space-y-1 text-sm">
            <div className="flex justify-between text-[#64748B]"><span>Subtotal</span><span className="mono">{money(estimate.subtotal)}</span></div>
            {estimate.disc > 0 && (
              <div className="flex justify-between text-[#D4A94A]"><span>Group discount ({Math.round(estimate.disc*100)}%)</span><span className="mono">−{money(estimate.discount)}</span></div>
            )}
            <div className="flex justify-between pt-2 border-t border-[#EFE7D5] items-baseline">
              <span className="serif text-lg text-[#0B3B5C]">Estimate</span>
              <span className="mono text-2xl text-[#E86A3C] font-semibold" data-testid="wb-total">{money(estimate.total)}</span>
            </div>
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-3">Final quote confirmed by our concierge within 2 hours. No charge until you approve.</p>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, val, on, type = "text", textarea, testid }) {
  const cls = "w-full rounded-xl border border-[#EFE7D5] px-4 py-3 text-sm";
  return (
    <div>
      <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">{label}</label>
      {textarea ? (
        <textarea rows={3} value={val} onChange={(e) => on(e.target.value)} data-testid={testid} className={cls} />
      ) : (
        <input type={type} value={val} onChange={(e) => on(e.target.value)} data-testid={testid} className={cls} />
      )}
    </div>
  );
}
