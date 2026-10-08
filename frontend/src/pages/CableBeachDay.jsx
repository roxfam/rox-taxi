import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Umbrella, Ship, Hotel, Utensils, Wine, Plus, Minus, Users, MapPin } from "lucide-react";
import { API, money } from "../lib/api";
import Seo from "../components/Seo";

/**
 * CableBeachDay — public booking page for the "Day at Cable Beach /
 * Goodman's Bay" package. Guest picks pax, transfer (cruise or hotel),
 * extra beach seats, lunch and drink add-ons. We hit `/cable-beach/quote`
 * on every change so the live total mirrors Stripe exactly, including
 * 10% VAT + 5% processing fee.
 */
export default function CableBeachDay() {
  const [cfg, setCfg] = useState(null);
  const [pax, setPax] = useState(2);
  const [extraSeats, setExtraSeats] = useState(0);
  const [transferKind, setTransferKind] = useState("none");
  const [hotelFare, setHotelFare] = useState("");
  const [lunchIds, setLunchIds] = useState(new Set());
  const [drinkIds, setDrinkIds] = useState(new Set());
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/cable-beach-package`).then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  const quoteBody = useMemo(() => ({
    pax, extra_seats: extraSeats, transfer_kind: transferKind,
    hotel_fare: transferKind === "hotel" ? Number(hotelFare || 0) : null,
    lunch_item_ids: Array.from(lunchIds),
    drink_item_ids: Array.from(drinkIds),
  }), [pax, extraSeats, transferKind, hotelFare, lunchIds, drinkIds]);

  useEffect(() => {
    if (!cfg?.active) return;
    setQuoting(true);
    const h = setTimeout(() => {
      fetch(`${API}/cable-beach/quote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteBody),
      }).then((r) => r.ok ? r.json() : null).then(setQuote).catch(() => setQuote(null))
        .finally(() => setQuoting(false));
    }, 180);
    return () => { clearTimeout(h); setQuoting(false); };
  }, [cfg, quoteBody]);

  const toggleItem = (setter, id) => setter((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (!cfg) return <div className="max-w-4xl mx-auto px-6 py-16 text-[#64748B]">Loading package…</div>;
  if (!cfg.active) return <div className="max-w-xl mx-auto px-6 py-24 text-center">
    <h1 className="serif text-3xl text-[#0B3B5C]">Cable Beach day — unavailable</h1>
    <p className="text-sm text-[#64748B] mt-3">This package is paused. Check back soon or <a href="/contact" className="text-[#D4A94A] underline">reach out directly</a>.</p>
  </div>;

  const book = () => {
    if (transferKind === "hotel" && !Number(hotelFare)) {
      toast.error("Enter your hotel's taxi fare, or pick a different transfer option.");
      return;
    }
    const payload = {
      pax, extra_seats: extraSeats, transfer_kind: transferKind,
      hotel_fare: transferKind === "hotel" ? Number(hotelFare) : null,
      lunch_ids: Array.from(lunchIds), drink_ids: Array.from(drinkIds),
      total: quote?.total,
    };
    sessionStorage.setItem("cable_beach_cart", JSON.stringify(payload));
    toast.success(`Package saved · ${money(quote?.total || 0)}. Continuing to checkout…`);
    // Routes into the generic BookingFlow with the saved cart in sessionStorage
    window.location.href = `/pay/cable-beach-day`;
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10" data-testid="cable-beach-day">
      <Seo title="Day at Cable Beach · Rox Taxi" description="Beach day at Cable Beach / Goodman's Bay — chair + umbrella, cruise or hotel transfer, lunch and drinks." />
      <header className="mb-8">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">Rox Day Package</div>
        <h1 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-2">A day at Cable Beach</h1>
        <p className="text-[#64748B] mt-2 max-w-2xl">Also known as Goodman's Bay — a soft-sand, calm-water stretch 10 minutes from downtown. Includes a chair + umbrella per guest. Optional transfer, extra seats, lunch, and drinks.</p>
      </header>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8">
        <div className="space-y-6">
          <Section icon={Users} title="How many guests?">
            <StepperRow value={pax} onChange={setPax} min={1} max={30} testId="cable-pax" />
            <p className="text-xs text-[#64748B]">Each guest gets 1 chair + umbrella — included in the ${cfg.base_price}/person base.</p>
          </Section>

          <Section icon={Umbrella} title="Extra beach seats">
            <StepperRow value={extraSeats} onChange={setExtraSeats} min={0} max={30} testId="cable-extra-seats" />
            <p className="text-xs text-[#64748B]">Add seats beyond one-per-guest at ${cfg.extra_seat_price} each.</p>
          </Section>

          <Section icon={Ship} title="Transfer">
            <div className="grid sm:grid-cols-2 gap-2">
              <TransferTile active={transferKind === "none"} onClick={() => setTransferKind("none")} testId="cable-xfer-none"
                title="None · self-drive" sub="You're already in Nassau — $0" />
              <TransferTile active={transferKind === "cruise_oneway"} onClick={() => setTransferKind("cruise_oneway")} testId="cable-xfer-cruise-oneway"
                title="Cruise port · one-way" sub={`$${cfg.cruise_oneway_price} per person`} />
              <TransferTile active={transferKind === "cruise_roundtrip"} onClick={() => setTransferKind("cruise_roundtrip")} testId="cable-xfer-cruise-roundtrip"
                title="Cruise port · round-trip" sub={`$${cfg.cruise_roundtrip_price} per person`} />
              <TransferTile active={transferKind === "hotel"} onClick={() => setTransferKind("hotel")} testId="cable-xfer-hotel"
                title="Hotel transfer" sub="Zone-based taxi fare" Icon={Hotel} />
            </div>
            {transferKind === "hotel" && (
              <div className="mt-3">
                <label className="block text-xs font-bold text-[#0B3B5C] mb-1">Taxi fare for your hotel (USD)</label>
                <div className="relative max-w-xs">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                  <input type="number" min="0" step="1" value={hotelFare}
                    onChange={(e) => setHotelFare(e.target.value)}
                    placeholder="e.g. 25"
                    data-testid="cable-hotel-fare"
                    className="w-full pl-9 pr-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]" />
                </div>
                <p className="text-[11px] text-[#64748B] mt-1">Use the regular Rox taxi tariff for your hotel. Dispatch will confirm after you book.</p>
              </div>
            )}
          </Section>

          <Section icon={Utensils} title="Lunch (optional)">
            {cfg.lunch_items.length === 0 ? (
              <p className="text-xs text-[#64748B]">Menu will be published shortly. Call dispatch to add lunch after booking.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {cfg.lunch_items.map((it) => (
                  <MenuTile key={it.id} it={it} active={lunchIds.has(it.id)} onClick={() => toggleItem(setLunchIds, it.id)} testId={`cable-lunch-${it.id}`} />
                ))}
              </div>
            )}
          </Section>

          <Section icon={Wine} title="Drinks (optional)">
            {cfg.drink_items.length === 0 ? (
              <p className="text-xs text-[#64748B]">Drink menu coming soon — Bahama Mamas, Sky Juice, Beer and more. Call dispatch to add drinks after booking.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {cfg.drink_items.map((it) => (
                  <MenuTile key={it.id} it={it} active={drinkIds.has(it.id)} onClick={() => toggleItem(setDrinkIds, it.id)} testId={`cable-drink-${it.id}`} />
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="lg:sticky lg:top-24 self-start rounded-2xl border border-[#E2E8F0] bg-white p-5" data-testid="cable-beach-summary">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[#64748B] font-bold">Live total</div>
          <div className="serif text-4xl text-[#0B3B5C] mt-1" data-testid="cable-beach-total">
            {quote ? money(quote.total) : "—"}
          </div>
          {quote && (
            <div className="mt-4 text-sm text-[#64748B] space-y-1">
              <Line label={`Base · ${quote.pax}×`}>{money(quote.base)}</Line>
              {quote.extra_seats_total > 0 && <Line label={`Extra seats · ${quote.extra_seats}×`}>{money(quote.extra_seats_total)}</Line>}
              {quote.transfer_total > 0 && <Line label={`Transfer · ${quote.transfer_kind.replace(/_/g," ")}`}>{money(quote.transfer_total)}</Line>}
              {quote.menu_lines.length > 0 && (
                <>
                  <div className="pt-1 text-[11px] font-bold uppercase tracking-wider text-[#0B3B5C]">Menu</div>
                  {quote.menu_lines.map((m) => <Line key={m.id} label={m.name}>{money(m.price)}</Line>)}
                </>
              )}
              <div className="h-px bg-[#E2E8F0] my-2" />
              <Line label="Subtotal">{money(quote.subtotal)}</Line>
              <Line label="VAT 10%">{money(quote.vat)}</Line>
              <Line label="Processing 5%">{money(quote.processing_fee)}</Line>
            </div>
          )}
          <button onClick={book} disabled={!quote || quoting}
            data-testid="cable-beach-book"
            className="mt-5 w-full inline-flex items-center justify-center rounded-full bg-[#E86A3C] text-white font-black uppercase tracking-wider py-3 text-sm hover:bg-[#d55a30] active:scale-95 disabled:opacity-50">
            {quoting ? "Updating…" : "Continue to checkout"}
          </button>
          <p className="text-[11px] text-[#94A3B8] mt-3 text-center">Secure checkout · Stripe or PayPal</p>
        </aside>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-5 h-5 text-[#D4A94A]" />
        <h2 className="font-bold text-[#0B3B5C]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StepperRow({ value, onChange, min, max, testId }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-9 h-9 rounded-full border border-[#E2E8F0] hover:border-[#D4A94A] text-[#0B3B5C] flex items-center justify-center" data-testid={`${testId}-minus`}>
        <Minus className="w-4 h-4" />
      </button>
      <span className="serif text-3xl text-[#0B3B5C] w-12 text-center" data-testid={testId}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="w-9 h-9 rounded-full border border-[#E2E8F0] hover:border-[#D4A94A] text-[#0B3B5C] flex items-center justify-center" data-testid={`${testId}-plus`}>
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

function TransferTile({ active, onClick, title, sub, Icon = Ship, testId }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className={`text-left rounded-xl border p-3 transition ${active ? "border-[#E86A3C] bg-[#FFF4EC]" : "border-[#E2E8F0] bg-white hover:border-[#D4A94A]"}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${active ? "text-[#E86A3C]" : "text-[#64748B]"}`} />
        <span className={`text-sm font-bold ${active ? "text-[#E86A3C]" : "text-[#0B3B5C]"}`}>{title}</span>
      </div>
      <div className="text-[11px] text-[#64748B] mt-1">{sub}</div>
    </button>
  );
}

function MenuTile({ it, active, onClick, testId }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className={`text-left rounded-xl border p-3 transition ${active ? "border-[#E86A3C] bg-[#FFF4EC]" : "border-[#E2E8F0] bg-white hover:border-[#D4A94A]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-bold ${active ? "text-[#E86A3C]" : "text-[#0B3B5C]"}`}>{it.name}</span>
        <span className="text-sm font-mono text-[#0B3B5C]">${it.price}</span>
      </div>
    </button>
  );
}

function Line({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-[#64748B]">{label}</span>
      <span className="text-[#0B3B5C] font-mono">{children}</span>
    </div>
  );
}
