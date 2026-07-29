import { useEffect, useMemo, useState } from "react";
import { api, money } from "../lib/api";
import { ArrowRight, ArrowLeftRight, Loader2, CheckCircle2, MapPin, Info, Send } from "lucide-react";
import { toast } from "sonner";

/**
 * Custom route quote — user picks From + To, we call /api/taxi/quote and
 * either show the matched flat fare or fall through to a "Request a quote"
 * form for routes we haven't priced.
 *
 * Props:
 *  - services: array of taxi services (used to find the matched item for booking)
 *  - onBook: (service) => void, opens the shared BookingModal on the parent
 */
export default function RouteQuoteWidget({ services, onBook }) {
  const [locations, setLocations] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [quote, setQuote] = useState(null); // {matched, service?, fallback?, message?}
  const [loading, setLoading] = useState(false);
  // First-paint nudge for the swap arrow — fades out after 3s so it never
  // becomes visual noise for returning users. Dismissed immediately once the
  // user actually picks a location (they've clearly engaged).
  const [showSwapHint, setShowSwapHint] = useState(true);

  useEffect(() => {
    api.get("/taxi/locations").then((r) => setLocations(r.data || [])).catch(() => {});
  }, []);

  // 3-second fade-out timer for the swap-direction hint.
  useEffect(() => {
    if (!showSwapHint) return;
    const t = setTimeout(() => setShowSwapHint(false), 3000);
    return () => clearTimeout(t);
  }, [showSwapHint]);

  // Kill the hint the moment the user selects anything — they're engaged.
  useEffect(() => { if (from || to) setShowSwapHint(false); }, [from, to]);

  const canQuote = from && to && from !== to;

  const runQuote = async () => {
    if (!canQuote) return;
    setLoading(true); setQuote(null);
    try {
      const fromLoc = locations.find((l) => l.tag === from);
      const toLoc = locations.find((l) => l.tag === to);
      const { data } = await api.post("/taxi/quote", {
        from_location: fromLoc?.label || from,
        to_location: toLoc?.label || to,
      });
      setQuote(data);
    } catch {
      toast.error("Couldn't fetch quote. Please try again.");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (canQuote) runQuote(); /* eslint-disable-next-line */ }, [from, to]);

  const swap = () => { const a = from; setFrom(to); setTo(a); };

  const bookMatched = () => {
    const matchedId = quote?.service?.id;
    if (!matchedId) return;
    const svc = services?.find((s) => s.id === matchedId) || quote.service;
    const fromLabel = locations.find((l) => l.tag === (quote.direction === "reverse" ? quote.to_tag : quote.from_tag))?.label || "";
    const toLabel = locations.find((l) => l.tag === (quote.direction === "reverse" ? quote.from_tag : quote.to_tag))?.label || "";
    onBook?.({ service: svc, pickup: fromLabel, dropoff: toLabel });
  };

  const bookHourly = () => {
    if (!quote?.fallback) return;
    const svc = services?.find((s) => s.id === quote.fallback.id) || quote.fallback;
    const fromLabel = locations.find((l) => l.tag === from)?.label || "";
    const toLabel = locations.find((l) => l.tag === to)?.label || "";
    onBook?.({ service: svc, pickup: fromLabel, dropoff: toLabel });
  };

  return (
    <section
      className="max-w-7xl mx-auto px-6 lg:px-10 pt-20"
      data-testid="taxi-route-quote-section"
    >
      <div className="rounded-[28px] overflow-hidden border border-white/60 shadow-[0_25px_60px_rgba(11,25,44,0.10)] backdrop-blur-xl"
        style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(251,247,239,0.92) 100%)" }}
      >
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-[#D4A94A] to-transparent" />
        <div className="p-7 lg:p-10">
          <div className="flex items-center gap-3">
            <span className="w-8 h-[1px] bg-[#D4A94A]" />
            <span className="text-[10px] tracking-[0.35em] uppercase font-black text-[#D4A94A]">Instant quote</span>
          </div>
          <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] font-bold leading-[1.02] mt-3">
            Pick your <em className="italic text-[#D4A94A]">destination</em>.
          </h2>
          <p className="text-sm text-[#64748B] mt-2 max-w-xl leading-relaxed">
            Choose any two Nassau or Paradise Island locations and we'll show the fixed fare instantly. Route not listed? Send us a one-click custom quote request.
          </p>

          {/* From / Swap / To */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-end">
            <LocationSelect label="From" tag="from" value={from} onChange={setFrom} locations={locations} exclude={to} />
            <button
              type="button"
              onClick={swap}
              disabled={!from && !to}
              data-testid="quote-swap-btn"
              className="mx-auto md:mb-2 w-11 h-11 rounded-full border border-[#EFE7D5] bg-white hover:border-[#D4A94A] hover:bg-[#D4A94A]/10 text-[#0B3B5C] hover:text-[#D4A94A] flex items-center justify-center transition-all disabled:opacity-40"
              title="Swap direction"
              aria-label="Swap"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
            <LocationSelect label="To" tag="to" value={to} onChange={setTo} locations={locations} exclude={from} />
          </div>

          {/* First-paint swap-arrow nudge — fades out after 3s. */}
          <div
            aria-hidden={!showSwapHint}
            data-testid="quote-swap-hint"
            className={`mt-2 flex items-center gap-2 text-[11px] tracking-widest uppercase text-[#94a3b8] transition-opacity duration-700 ${showSwapHint ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <ArrowLeftRight className="w-3 h-3 text-[#D4A94A] animate-pulse" />
            <span className="font-semibold">Tip:</span>
            <span>Tap the arrows to swap direction for round-trip fares.</span>
          </div>

          {/* Result */}
          <div className="mt-6 min-h-[80px]" data-testid="quote-result">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-[#64748B]" data-testid="quote-loading">
                <Loader2 className="w-4 h-4 animate-spin" /> Fetching your fare…
              </div>
            )}

            {!loading && !canQuote && (
              <div className="text-sm text-[#94a3b8]" data-testid="quote-empty">Pick two locations to see your fare.</div>
            )}

            {!loading && quote?.matched && (
              <div className="rounded-2xl border border-[#D4A94A]/40 bg-[#D4A94A]/8 p-5 flex flex-wrap items-center justify-between gap-4"
                style={{ backgroundColor: "rgba(212,169,74,0.08)" }} data-testid="quote-matched">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-full bg-[#D4A94A] text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="text-[10px] tracking-[0.28em] uppercase text-[#8a6b1f] font-black">Fixed fare</div>
                    <div className="serif text-xl text-[#0B3B5C] mt-1">{quote.service.name}</div>
                    <div className="text-xs text-[#64748B] mt-1">First 2 passengers · +$5 per extra passenger</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="mono text-4xl font-black tracking-tight bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg,#E86A3C 0%,#F59E0B 55%,#D4A94A 100%)" }} data-testid="quote-price">{money(quote.service.price)}</div>
                    <div className="text-[10px] tracking-[0.22em] uppercase text-[#64748B] font-semibold mt-1">Flat rate</div>
                  </div>
                  <button
                    onClick={bookMatched}
                    data-testid="quote-book-btn"
                    className="btn-shine inline-flex items-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white px-6 py-3 text-sm font-semibold shadow-[0_10px_25px_rgba(232,106,60,0.35)]"
                  >
                    Book this route <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {!loading && quote && !quote.matched && (
              <QuoteFallback
                quote={quote}
                locations={locations}
                fromTag={from}
                toTag={to}
                onHourly={bookHourly}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function LocationSelect({ label, tag, value, onChange, locations, exclude }) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-2 flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-[#D4A94A]" /> {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`quote-${tag}-select`}
        className="w-full appearance-none rounded-2xl border border-[#EFE7D5] bg-white px-4 py-3.5 text-sm text-[#0B3B5C] font-semibold focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20 cursor-pointer"
      >
        <option value="" disabled>Select a location…</option>
        {locations.map((l) => (
          <option key={l.tag} value={l.tag} disabled={l.tag === exclude}>{l.label}</option>
        ))}
      </select>
    </label>
  );
}

function QuoteFallback({ quote, locations, fromTag, toTag, onHourly }) {
  const [form, setForm] = useState({ customer_name: "", customer_email: "", customer_phone: "", passengers: 1, when: "", notes: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const fromLabel = useMemo(() => locations.find((l) => l.tag === fromTag)?.label || "", [locations, fromTag]);
  const toLabel = useMemo(() => locations.find((l) => l.tag === toTag)?.label || "", [locations, toTag]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.customer_name || !form.customer_email || !form.customer_phone) {
      toast.error("Please fill in name, email and phone."); return;
    }
    setSending(true);
    try {
      const { data } = await api.post("/taxi/quote-request", {
        from_location: fromLabel, to_location: toLabel,
        customer_name: form.customer_name, customer_email: form.customer_email,
        customer_phone: form.customer_phone, passengers: Number(form.passengers) || 1,
        when: form.when || null, notes: form.notes || null,
      });
      setSent(data);
      toast.success("Quote request sent — we'll reply within the hour.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not send request.");
    } finally { setSending(false); }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5" data-testid="quote-request-sent">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="serif text-xl text-[#0B3B5C]">Request received — <code className="mono text-emerald-700">{sent.id}</code></div>
            <p className="text-sm text-[#64748B] mt-1">We'll email/text a custom quote for <b>{fromLabel} → {toLabel}</b> within the hour. Check your inbox for confirmation.</p>
          </div>
        </div>
      </div>
    );
  }

  const reasonMsg = quote.reason === "same_location"
    ? "Pickup and dropoff look like the same spot — try different locations."
    : quote.reason === "no_fixed_rate"
    ? `No fixed fare for ${fromLabel} → ${toLabel} yet.`
    : quote.message || "This route isn't in our fare table yet.";

  return (
    <div className="rounded-2xl border border-[#E86A3C]/30 bg-[#E86A3C]/6 p-5" style={{ backgroundColor: "rgba(232,106,60,0.06)" }} data-testid="quote-unmatched">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-[#E86A3C]/15 text-[#E86A3C] flex items-center justify-center shrink-0">
          <Info className="w-5 h-5" />
        </span>
        <div className="flex-1">
          <div className="serif text-xl text-[#0B3B5C]">{reasonMsg}</div>
          <p className="text-sm text-[#64748B] mt-1">Request a custom quote — a driver will reply with a fair, transparent price within the hour.</p>

          {quote.fallback && (
            <div className="mt-3">
              <button
                onClick={onHourly}
                data-testid="quote-book-hourly-btn"
                className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#0B3B5C] hover:text-[#D4A94A]"
              >
                Or book the hourly charter — {money(quote.fallback.price)}/hr <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 grid sm:grid-cols-2 gap-3" data-testid="quote-request-form">
        <Field label="Full name *" val={form.customer_name} on={(e) => setForm({ ...form, customer_name: e.target.value })} testid="quote-name" />
        <Field label="Email *" type="email" val={form.customer_email} on={(e) => setForm({ ...form, customer_email: e.target.value })} testid="quote-email" />
        <Field label="Phone *" val={form.customer_phone} on={(e) => setForm({ ...form, customer_phone: e.target.value })} testid="quote-phone" />
        <Field label="Passengers" type="number" val={form.passengers} on={(e) => setForm({ ...form, passengers: e.target.value })} testid="quote-pax" />
        <Field label="When (optional)" type="datetime-local" val={form.when} on={(e) => setForm({ ...form, when: e.target.value })} testid="quote-when" />
        <div>
          <label className="block text-[10px] tracking-[0.22em] uppercase text-[#64748B] font-black mb-1.5">Notes</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="quote-notes" placeholder="Flight #, luggage, etc." className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20" />
        </div>
        <div className="sm:col-span-2 flex items-center justify-end pt-1">
          <button type="submit" disabled={sending} data-testid="quote-request-submit" className="inline-flex items-center gap-2 rounded-full bg-[#0B3B5C] hover:bg-[#0B192C] text-white px-6 py-3 text-sm font-semibold disabled:opacity-60 shadow-[0_10px_25px_rgba(11,59,92,0.25)]">
            <Send className="w-4 h-4" /> {sending ? "Sending…" : "Request custom quote"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, val, on, type = "text", testid }) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.22em] uppercase text-[#64748B] font-black mb-1.5">{label}</label>
      <input type={type} value={val} onChange={on} data-testid={testid} className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20" />
    </div>
  );
}
