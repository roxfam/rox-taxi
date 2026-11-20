import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Download, Printer, CalendarCheck, Loader2, Clock, AlertCircle, CheckCircle2, Share2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { API, api, money } from "../lib/api";

const left = (iso) => {
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return "";
  const h = Math.floor(ms / 3600000);
  return `${h}h ${Math.floor((ms % 3600000) / 60000)}m left`;
};

const Row = ({ k, v }) => v ? (
  <div className="flex justify-between gap-4 py-2 border-b border-[#F1F5F9] text-sm"><span className="text-[#64748B]">{k}</span><span className="text-[#0B3B5C] font-medium text-right">{v}</span></div>
) : null;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function RouteMap({ q }) {
  const pts = [q.pickup_location, ...(q.stops || []), q.dropoff_location].filter(Boolean);
  const legs = q.trip_legs || [];
  if (pts.length < 3) return null;
  return (
    <div className="mt-6 rounded-2xl border border-[#EFE7D5] p-5" data-testid="quote-route-map">
      <div className="text-[10px] tracking-[0.3em] uppercase font-black text-[#8a6b1f] mb-4">Your route · {pts.length - 1} legs</div>
      <ol className="relative">
        {pts.map((p, i) => (
          <li key={`${p}-${i}`} className="relative pl-12 pb-5 last:pb-0" data-testid={`quote-route-point-${i}`}>
            {i < pts.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-[repeating-linear-gradient(to_bottom,#D4A94A_0_6px,transparent_6px_10px)]" />}
            <span className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? "bg-[#0B3B5C] text-white" : i === pts.length - 1 ? "bg-[#E86A3C] text-white" : "bg-white border-2 border-[#D4A94A] text-[#0B3B5C]"}`}>{LETTERS[i] || i + 1}</span>
            <div className="text-sm font-semibold text-[#0B3B5C] pt-1.5">{p}</div>
            <div className="text-[11px] text-[#64748B]">{i === 0 ? "Pickup" : i === pts.length - 1 ? "Drop-off" : `Stop ${i}`}</div>
            {legs[i] && i < pts.length - 1 && <div className="mt-2 inline-block rounded-full bg-[#FBF7EF] px-3 py-1 text-[11px] mono text-[#0B3B5C]">Leg {i + 1} · {money(legs[i].fare)}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ShareTrip({ q }) {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const pts = [q.pickup_location, ...(q.stops || []), q.dropoff_location].filter(Boolean);
  const text = `Our Nassau trip (${pts.join(" → ")}): ${money(q.total)} — quote ${q.id}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast.success("Trip link copied"); } catch { toast.error("Couldn't copy the link"); }
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: `Rox quote ${q.id}`, text, url }); } catch { /* cancelled */ } } else copy();
  };
  const btn = "inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] px-6 py-3.5 text-sm font-semibold text-[#0B3B5C] hover:border-[#D4A94A] transition-colors";
  return (
    <>
      <button onClick={share} className={btn} data-testid="quote-share-btn"><Share2 className="w-4 h-4" /> Share trip</button>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noreferrer" className={btn} data-testid="quote-whatsapp-share">WhatsApp</a>
      <button onClick={copy} className={btn} data-testid="quote-copy-link-btn"><Link2 className="w-4 h-4" /> Copy link</button>
    </>
  );
}

function PeopleEditor({ q, onChange }) {
  const child = q.adults !== null && q.adults !== undefined;
  const [v, setV] = useState(child ? { adults: q.adults, kids: q.kids || 0, toddlers: q.toddlers || 0 } : { passengers: q.passengers || 1 });
  const [busy, setBusy] = useState(false);
  const dirty = child ? (v.adults !== q.adults || v.kids !== (q.kids || 0) || v.toddlers !== (q.toddlers || 0)) : v.passengers !== q.passengers;
  const step = (k, d, min, max) => setV((x) => ({ ...x, [k]: Math.max(min, Math.min(max, (x[k] || 0) + d)) }));
  const save = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/quotes/${q.id}/people`, v); onChange(data); toast.success("Price updated"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Couldn't update the quote"); } finally { setBusy(false); }
  };
  const fields = child ? [["adults", "Adults", 1, 40], ["kids", "Kids", 0, 40], ["toddlers", "Toddlers", 0, 20]] : [["passengers", "People", 1, 60]];
  return (
    <div className="print:hidden mt-6 rounded-2xl border border-[#EFE7D5] p-5" data-testid="quote-people-editor">
      <div className="text-[10px] tracking-[0.3em] uppercase font-black text-[#8a6b1f] mb-3">Number of people</div>
      <div className="flex flex-wrap items-center gap-5">
        {fields.map(([k, label, min, max]) => (
          <div key={k} className="flex items-center gap-2" data-testid={`quote-people-${k}`}>
            <span className="text-sm text-[#64748B] w-16">{label}</span>
            <button type="button" onClick={() => step(k, -1, min, max)} className="w-9 h-9 rounded-full border border-[#E2E8F0]" data-testid={`quote-people-${k}-minus`}>−</button>
            <span className="mono w-6 text-center font-bold text-[#0B3B5C]" data-testid={`quote-people-${k}-count`}>{v[k]}</span>
            <button type="button" onClick={() => step(k, 1, min, max)} className="w-9 h-9 rounded-full border border-[#E2E8F0]" data-testid={`quote-people-${k}-plus`}>+</button>
          </div>
        ))}
        <button type="button" onClick={save} disabled={!dirty || busy} className="rounded-full bg-[#0B3B5C] text-white px-5 py-2 text-sm font-semibold disabled:opacity-40" data-testid="quote-people-update">
          {busy ? "Updating…" : "Update price"}
        </button>
      </div>
    </div>
  );
}

export default function QuoteView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/quotes/${id}`).then(({ data }) => setQ(data)).catch(() => setErr("We couldn't find that quote.")); }, [id]);
  const book = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/quotes/${q.id}/book`);
      sessionStorage.removeItem("rox_quote_mode");
      toast.success(`Invoice ${data.invoice_number || ""} created — taking you to payment…`);
      nav(`/pay/${data.booking_id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not book this quote");
      setBusy(false);
    }
  };
  if (err) return <div className="max-w-xl mx-auto py-24 text-center text-[#64748B]" data-testid="quote-not-found">{err} <Link to="/quote" className="text-[#E86A3C] underline">Get a new quote</Link></div>;
  if (!q) return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#D4A94A]" /></div>;
  const status = { open: ["bg-[#ECFDF5] text-[#065F46]", Clock, `Valid until ${q.expires_label} · ${left(q.expires_at)}`],
    expired: ["bg-[#FEF2F2] text-[#B91C1C]", AlertCircle, "This quote has expired. Prices are only held for 48 hours."],
    booked: ["bg-[#EFF6FF] text-[#1E3A8A]", CheckCircle2, "This quote has been booked."] }[q.status];
  const Icon = status[1];
  return (
    <div className="max-w-3xl mx-auto px-6 py-14 print:py-0" data-testid="quote-view-page">
      <div className={`print:hidden mb-6 rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${status[0]}`} data-testid={`quote-status-${q.status}`}><Icon className="w-4 h-4" />{status[2]}</div>
      <div className="rounded-3xl bg-white border border-[#EFE7D5] shadow-[0_30px_80px_-40px_rgba(11,25,44,0.35)] overflow-hidden print:shadow-none print:border-0">
        <div className="bg-[#0B192C] text-white px-8 py-7 flex items-start justify-between gap-6 print:bg-white print:text-[#0B3B5C]">
          <div>
            <div className="text-[10px] tracking-[0.35em] uppercase font-bold text-[#D4A94A]">Price quote</div>
            <div className="serif text-4xl mt-1" data-testid="quote-id">{q.id}</div>
            <div className="text-xs opacity-70 mt-1">Issued {new Date(q.created_at).toLocaleDateString()} · Valid until {q.expires_label}</div>
          </div>
          <img src="/logo-white.webp" alt="Rox Taxi Service & Tours" className="h-16 w-auto print:hidden" />
        </div>
        <div className="px-8 py-6">
          <Row k="Prepared for" v={q.customer_name} />
          <Row k="Email / phone" v={`${q.customer_email} ${q.customer_phone || ""}`} />
          <Row k="Service" v={q.item_name} />
          <Row k="Date & time" v={(q.booking_date || "").replace("T", " ")} />
          <Row k="Pickup" v={q.pickup_location} />
          {(q.stops || []).map((s, n) => <Row key={`${s}-${n}`} k={`Stop ${n + 1}`} v={s} />)}
          <Row k="Drop-off" v={q.dropoff_location} />
          <Row k={q.service_type === "rental" ? "Rental days" : "Guests"} v={String(q.service_type === "rental" ? q.days : q.passengers || "")} />
          <RouteMap q={q} />
          {q.status === "open" && (q.kind === "booking" || (q.kind === "manual" && q.per_person)) && <PeopleEditor key={q.total} q={q} onChange={setQ} />}
          <div className="mt-6 rounded-2xl bg-[#FBF7EF] p-5" data-testid="quote-lines">
            {q.lines.map((l) => (
              <div key={l.label} className="flex justify-between text-sm py-1"><span className="text-[#64748B]">{l.label}</span><span className="mono text-[#0B3B5C]">{money(l.amount)}</span></div>
            ))}
            <div className="flex justify-between items-baseline border-t border-[#EFE7D5] mt-3 pt-3">
              <span className="font-semibold text-[#0B3B5C]">Quote total (USD)</span>
              <span className="serif text-3xl text-[#E86A3C]" data-testid="quote-total">{money(q.total)}</span>
            </div>
          </div>
          <p className="text-xs text-[#64748B] mt-5 leading-relaxed">This is a quote, not a booking. Nothing has been reserved or charged. Prices are held for 48 hours. Discounts and gift cards on your account are applied at checkout. Rox Taxi Service &amp; Tours · Nassau &amp; Paradise Island · Call / WhatsApp +1 (242) 432-2587</p>
        </div>
      </div>
      <div className="print:hidden mt-6 flex flex-wrap gap-3">
        {q.status === "open" && (
          <button onClick={book} disabled={busy} className="btn-shine inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-7 py-3.5 text-sm font-bold hover:bg-[#d55a30] transition-colors disabled:opacity-60" data-testid="quote-book-btn">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />} Convert to invoice &amp; pay
          </button>
        )}
        {q.status === "booked" && q.booking_id && <Link to={`/pay/${q.booking_id}`} className="rounded-full bg-[#0B3B5C] text-white px-7 py-3.5 text-sm font-bold" data-testid="quote-view-booking">View invoice &amp; pay</Link>}
        {q.status === "expired" && <Link to="/quote" className="rounded-full bg-[#0B3B5C] text-white px-7 py-3.5 text-sm font-bold" data-testid="quote-new-btn">Get a new quote</Link>}
        <a href={`${API}/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] px-6 py-3.5 text-sm font-semibold text-[#0B3B5C] hover:border-[#D4A94A] transition-colors" data-testid="quote-pdf-btn"><Download className="w-4 h-4" /> Download PDF</a>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] px-6 py-3.5 text-sm font-semibold text-[#0B3B5C] hover:border-[#D4A94A] transition-colors" data-testid="quote-print-btn"><Printer className="w-4 h-4" /> Print</button>
        <ShareTrip q={q} />
      </div>
    </div>
  );
}
