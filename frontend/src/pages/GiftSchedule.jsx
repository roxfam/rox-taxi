import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Gift, Check, Loader2, CalendarCheck } from "lucide-react";
import { api } from "../lib/api";

const inp = "mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm text-[#0B3B5C] focus:border-[#D4A94A] focus:outline-none";
const lbl = "block text-[11px] uppercase tracking-[.16em] text-[#64748B] font-semibold";
const FIELDS = [["date", "Date", "date"], ["time", "Pickup time", "time"], ["pickup_location", "Pickup (hotel or cruise pier)", "text"], ["phone", "Your phone / WhatsApp", "tel"]];

const ScheduledView = ({ g }) => (
  <div className="mt-8 rounded-2xl bg-emerald-50 border border-emerald-200 p-6" data-testid="gift-scheduled">
    <CalendarCheck className="w-6 h-6 text-emerald-600" />
    <div className="mt-2 font-semibold text-[#0B3B5C]">You're all set!</div>
    <p className="text-sm text-[#64748B] mt-1" data-testid="gift-scheduled-when">
      {new Date(g.booking_date).toLocaleString([], { timeZone: "America/Nassau", dateStyle: "full", timeStyle: "short" })} · pickup at {g.pickup_location}
    </p>
    <p className="text-xs text-[#64748B] mt-3">Need to change it? WhatsApp us at +1 242 432 2587.</p>
  </div>
);

export default function GiftSchedule() {
  const [sp] = useSearchParams();
  const id = sp.get("id");
  const t = sp.get("t");
  const [g, setG] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ date: "", time: "10:00", pickup_location: "", phone: "", cruise_ship: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/gifts/${id}`, { params: { t } }).then((r) => setG(r.data)).catch((e) => setErr(e?.response?.data?.detail || "Gift not found"));
  }, [id, t]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post(`/gifts/${id}/schedule`, { ...form, t });
      setG(data);
      toast.success("Your gift is scheduled!");
    } catch (x) {
      const d = x?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Please check the details");
    } finally {
      setBusy(false);
    }
  };
  if (err) return <div className="max-w-md mx-auto px-6 py-24 text-center text-[#64748B]" data-testid="gift-error">{err}</div>;
  if (!g) return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#D4A94A]" /></div>;
  return (
    <div className="max-w-lg mx-auto px-6 py-14" data-testid="gift-schedule-page">
      <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-2"><Gift className="w-4 h-4" /> A gift from {g.from_name}</div>
      <h1 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-3">Hi {g.to_name?.split(" ")[0]}, enjoy {g.item_name}!</h1>
      {g.message && <blockquote className="mt-6 rounded-xl bg-[#FBF7EF] border-l-4 border-[#D4A94A] px-5 py-4 italic text-[#0B3B5C]" data-testid="gift-message">“{g.message}”</blockquote>}
      <ul className="mt-6 space-y-1.5">{g.includes.map((i) => <li key={i} className="text-sm text-[#0B3B5C] flex gap-2"><Check className="w-4 h-4 text-emerald-500 mt-0.5" />{i}</li>)}</ul>
      {g.scheduled ? <ScheduledView g={g} /> : (
        <form onSubmit={submit} className="mt-8 rounded-2xl border border-[#E2E8F0] bg-white p-5 space-y-3" data-testid="gift-schedule-form">
          <div className="font-semibold text-[#0B3B5C]">Pick your date &amp; pickup</div>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(([k, l, ty]) => (
              <label key={k} className={`${lbl} ${k === "pickup_location" || k === "phone" ? "col-span-2" : ""}`}>{l}
                <input type={ty} required value={form[k]} min={ty === "date" ? new Date().toISOString().slice(0, 10) : undefined}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inp} data-testid={`gift-${k}`} />
              </label>
            ))}
            <label className={`${lbl} col-span-2`}>Cruise ship (optional)
              <input value={form.cruise_ship} onChange={(e) => setForm({ ...form, cruise_ship: e.target.value })} className={inp} data-testid="gift-cruise_ship" />
            </label>
          </div>
          <button type="submit" disabled={busy} className="w-full rounded-full bg-[#0B3B5C] hover:bg-[#082941] text-white font-bold py-3 disabled:opacity-60 transition-colors" data-testid="gift-schedule-submit">
            {busy ? "Saving…" : "Confirm my date"}
          </button>
        </form>
      )}
      <p className="mt-6 text-xs text-[#94a3b8]">Gift reference {g.id}</p>
    </div>
  );
}
