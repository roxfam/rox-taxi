import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, Users, Briefcase, Ship, GlassWater, Sparkles, Check, ArrowRight, Ticket } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../lib/api";

const EVENT_TYPES = [
  { key: "wedding", label: "Wedding", icon: Heart, tint: "#E86A3C" },
  { key: "family_reunion", label: "Family Reunion", icon: Users, tint: "#D4A94A" },
  { key: "corporate", label: "Corporate / Retreat", icon: Briefcase, tint: "#0B3B5C" },
  { key: "cruise_group", label: "Cruise Group", icon: Ship, tint: "#00AF87" },
  { key: "bachelor", label: "Bachelor / Bachelorette", icon: GlassWater, tint: "#8B5CF6" },
  { key: "other", label: "Other Celebration", icon: Sparkles, tint: "#EC4899" },
];

const NEEDS = [
  { key: "taxi", label: "Airport / hotel transfers" },
  { key: "tours", label: "Island excursions & tours" },
  { key: "rentals", label: "Car / van rentals" },
  { key: "concierge", label: "Full-day concierge" },
];

const BUDGET_BANDS = [
  "Under $500", "$500 – $1,500", "$1,500 – $5,000", "$5,000 – $15,000", "$15,000+",
];

export default function Groups() {
  const [form, setForm] = useState({
    event_type: "wedding",
    event_date: "",
    guest_count: 10,
    needs: ["taxi"],
    budget_range: "$1,500 – $5,000",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const toggleNeed = (k) =>
    setForm((f) => ({
      ...f,
      needs: f.needs.includes(k) ? f.needs.filter((x) => x !== k) : [...f.needs, k],
    }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.customer_name || !form.customer_email || !form.customer_phone || !form.event_date) {
      toast.error("Please fill in your contact details and event date.");
      return;
    }
    if (Number(form.guest_count) < 2) {
      toast.error("Group bookings start at 2 guests.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/group-inquiries", {
        ...form,
        guest_count: Number(form.guest_count),
      });
      setSubmitted(data);
      toast.success("Inquiry received — we'll reply within 2 hours.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="group-inquiry-success">
        <div className="w-16 h-16 rounded-full bg-[#D4A94A]/15 text-[#D4A94A] mx-auto flex items-center justify-center">
          <Check className="w-8 h-8" />
        </div>
        <h1 className="serif text-5xl sm:text-6xl text-[#0B3B5C] mt-6 leading-[0.9]">Received. <em className="italic text-[#D4A94A]">Sit tight.</em></h1>
        <p className="text-[#64748B] mt-4 max-w-md mx-auto">
          Your inquiry reference is <span className="mono font-semibold text-[#0B3B5C]" data-testid="group-inquiry-id">{submitted.id}</span>. A member of our team will reply within 2 hours with a tailored quote.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <a href={`https://wa.me/12420000000?text=Following%20up%20on%20group%20inquiry%20${submitted.id}`} target="_blank" rel="noreferrer" className="rounded-full bg-[#25D366] text-white px-6 py-3 text-sm font-semibold hover:bg-[#20b757]" data-testid="group-success-whatsapp">
            WhatsApp us about {submitted.id}
          </a>
          <a href="/" className="rounded-full border border-[#E2E8F0] text-[#0B3B5C] px-6 py-3 text-sm font-semibold">Back to home</a>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="groups-page" className="bg-[#FBF7EF]">
      {/* HERO */}
      <section className="relative overflow-hidden bg-[#0B3B5C] text-white py-28">
        <div className="absolute inset-0 opacity-30 bg-cover bg-center" style={{ backgroundImage: "url(https://images.pexels.com/photos/2549018/pexels-photo-2549018.jpeg?auto=compress&cs=tinysrgb&w=1920)" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B3B5C]/70 via-[#0B3B5C]/60 to-[#0B3B5C]" />
        <div className="relative max-w-6xl mx-auto px-6 lg:px-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Groups · Weddings · Events</span>
            <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9] max-w-3xl">
              Big group, <em className="italic text-[#F5E1A4]">bigger celebration</em>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/80 leading-relaxed">
              Cruise crews, wedding parties, corporate retreats, bachelor weekends and family reunions — tell us what you're planning and our concierge will craft a custom quote within two hours.
            </p>
            <div className="mt-8 flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#D4A94A]" /> Custom taxi + tour + rental packages</div>
              <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#D4A94A]" /> Volume pricing from 8 guests</div>
              <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#D4A94A]" /> Dedicated concierge on event day</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FORM */}
      <section className="max-w-4xl mx-auto px-6 lg:px-10 -mt-16 relative z-10 pb-24">
        <form onSubmit={submit} className="bg-white rounded-3xl border border-[#EFE7D5] shadow-[0_30px_60px_rgba(11,59,92,0.10)] p-6 sm:p-10 space-y-8" data-testid="group-form">
          {/* Event type */}
          <div>
            <div className="text-xs tracking-[0.2em] uppercase text-[#64748B] font-semibold mb-3">Event type</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setForm({ ...form, event_type: t.key })}
                  data-testid={`event-type-${t.key}`}
                  className={`group flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                    form.event_type === t.key
                      ? "border-[#0B3B5C] bg-[#0B3B5C] text-white shadow-[0_10px_25px_rgba(11,59,92,0.20)]"
                      : "border-[#EFE7D5] bg-white hover:border-[#D4A94A]/60"
                  }`}
                >
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${form.event_type === t.key ? "bg-white/15" : ""}`} style={{ background: form.event_type === t.key ? undefined : `${t.tint}15`, color: form.event_type === t.key ? "#fff" : t.tint }}>
                    <t.icon className="w-5 h-5" />
                  </span>
                  <span className={`text-sm font-semibold ${form.event_type === t.key ? "text-white" : "text-[#0B3B5C]"}`}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date + guests */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs tracking-[0.2em] uppercase text-[#64748B] font-semibold mb-2">Event date *</div>
              <input
                type="date"
                required
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                className="w-full rounded-xl border border-[#EFE7D5] px-4 py-3 text-sm focus:border-[#D4A94A] focus:ring-2 focus:ring-[#D4A94A]/20 focus:outline-none"
                data-testid="group-event-date"
              />
            </div>
            <div>
              <div className="text-xs tracking-[0.2em] uppercase text-[#64748B] font-semibold mb-2">Number of guests *</div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setForm({ ...form, guest_count: Math.max(2, Number(form.guest_count) - 1) })} className="w-11 h-11 rounded-full border border-[#EFE7D5] text-lg hover:border-[#0B3B5C] active:scale-95" data-testid="group-guests-minus">−</button>
                <input type="number" min={2} max={500} value={form.guest_count} onChange={(e) => setForm({ ...form, guest_count: Math.max(2, Math.min(500, parseInt(e.target.value || "2"))) })} className="w-24 text-center rounded-xl border border-[#EFE7D5] py-2.5 mono text-lg" data-testid="group-guests" />
                <button type="button" onClick={() => setForm({ ...form, guest_count: Math.min(500, Number(form.guest_count) + 1) })} className="w-11 h-11 rounded-full border border-[#EFE7D5] text-lg hover:border-[#0B3B5C] active:scale-95" data-testid="group-guests-plus">+</button>
              </div>
            </div>
          </div>

          {/* Needs */}
          <div>
            <div className="text-xs tracking-[0.2em] uppercase text-[#64748B] font-semibold mb-3">What do you need? <span className="text-[#94a3b8] normal-case tracking-normal">(pick as many as apply)</span></div>
            <div className="grid sm:grid-cols-2 gap-3">
              {NEEDS.map((n) => {
                const active = form.needs.includes(n.key);
                return (
                  <button
                    key={n.key}
                    type="button"
                    onClick={() => toggleNeed(n.key)}
                    data-testid={`group-need-${n.key}`}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                      active ? "border-[#D4A94A] bg-[#D4A94A]/10" : "border-[#EFE7D5] bg-white hover:border-[#D4A94A]/40"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${active ? "border-[#D4A94A] bg-[#D4A94A] text-white" : "border-[#EFE7D5]"}`}>
                      {active && <Check className="w-3 h-3" />}
                    </span>
                    <span className="text-sm text-[#0B3B5C] font-medium">{n.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Budget */}
          <div>
            <div className="text-xs tracking-[0.2em] uppercase text-[#64748B] font-semibold mb-3">Budget range</div>
            <div className="flex flex-wrap gap-2">
              {BUDGET_BANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setForm({ ...form, budget_range: b })}
                  data-testid={`group-budget-${b.replace(/[^a-z0-9]/gi,'-').toLowerCase()}`}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${form.budget_range === b ? "bg-[#0B3B5C] text-white border-[#0B3B5C]" : "border-[#EFE7D5] text-[#0B3B5C] hover:border-[#D4A94A]"}`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="border-t border-[#EFE7D5] pt-6 grid sm:grid-cols-2 gap-4">
            <Field label="Full name *" val={form.customer_name} on={(v) => setForm({ ...form, customer_name: v })} testid="group-name" />
            <Field label="Email *" type="email" val={form.customer_email} on={(v) => setForm({ ...form, customer_email: v })} testid="group-email" />
            <Field label="Phone / WhatsApp *" val={form.customer_phone} on={(v) => setForm({ ...form, customer_phone: v })} testid="group-phone" />
            <Field label="Notes (venues, timing, requests)" val={form.notes} on={(v) => setForm({ ...form, notes: v })} textarea testid="group-notes" />
          </div>

          <button
            type="submit"
            disabled={loading}
            data-testid="group-submit"
            className="btn-shine w-full sm:w-auto inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-8 py-4 text-sm font-semibold hover:bg-[#d55a30] active:scale-95 disabled:opacity-60 shadow-[0_10px_30px_rgba(232,106,60,0.35)]"
          >
            {loading ? "Sending…" : (<>Request a quote <ArrowRight className="w-4 h-4" /></>)}
          </button>
          <p className="text-xs text-[#94a3b8]">We'll respond within 2 hours during business hours. No commitment until you approve the quote.</p>
        </form>
      </section>

      {/* PROOF */}
      <section className="bg-white border-t border-[#EFE7D5] py-20" data-testid="groups-proof">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 grid md:grid-cols-3 gap-8 text-center">
          {[
            { n: "20+", l: "Weddings coordinated / year" },
            { n: "8,400", l: "Group guests moved / year" },
            { n: "2h", l: "Average quote turnaround" },
          ].map((s) => (
            <div key={s.l}>
              <div className="serif text-6xl text-[#D4A94A]">{s.n}</div>
              <div className="text-sm text-[#64748B] mt-2">{s.l}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, val, on, type = "text", textarea, testid }) {
  const cls = "w-full rounded-xl border border-[#EFE7D5] px-4 py-3 text-sm focus:border-[#D4A94A] focus:ring-2 focus:ring-[#D4A94A]/20 focus:outline-none";
  return (
    <div>
      <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] font-semibold mb-2">{label}</label>
      {textarea ? (
        <textarea rows={3} value={val} onChange={(e) => on(e.target.value)} data-testid={testid} className={cls} />
      ) : (
        <input type={type} value={val} onChange={(e) => on(e.target.value)} data-testid={testid} className={cls} />
      )}
    </div>
  );
}
