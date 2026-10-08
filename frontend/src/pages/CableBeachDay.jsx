import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Umbrella, Ship, Hotel, Utensils, Wine, Plus, Minus, Users, MapPin, Share2, Gift, Search, ChevronDown, ChefHat } from "lucide-react";
import { API, money } from "../lib/api";
import Seo from "../components/Seo";

/**
 * CableBeachDay — public booking page for the "Day at Cable Beach /
 * Goodman's Bay" package. Guest picks pax, transfer (cruise or hotel),
 * extra beach seats, lunch and drink add-ons. We hit `/cable-beach/quote`
 * on every change so the live total mirrors Stripe exactly, including
 * 10% VAT + 5% processing fee.
 *
 * Hotel fares are auto-filled (read-only) from the Rox zone tariff — the
 * guest picks their hotel and we quote a round-trip. SEO ships
 * TouristTrip + Product JSON-LD so "day at Cable Beach Nassau" lands here.
 */
const SITE_URL = "https://roxtaxi.com";
const HERO_IMAGE = "/images/cable-beach-hero.jpg";
const PAGE_CANONICAL = `${SITE_URL}/tours/cable-beach-day`;

export default function CableBeachDay() {
  const [cfg, setCfg] = useState(null);
  const [hotels, setHotels] = useState([]);
  const [pax, setPax] = useState(2);
  const [extraSeats, setExtraSeats] = useState(0);
  const [transferKind, setTransferKind] = useState("none");
  const [hotelId, setHotelId] = useState("");
  const [lunchIds, setLunchIds] = useState(new Set());
  const [drinkIds, setDrinkIds] = useState(new Set());
  const [comboId, setComboId] = useState(null);                 // Chef's-choice bundle
  const [dietFilters, setDietFilters] = useState(new Set());    // GF / pescatarian / DF filters
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [shareToken, setShareToken] = useState(null);     // Inbound ?r=<token>
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [giftModalOpen, setGiftModalOpen] = useState(false);

  useEffect(() => {
    fetch(`${API}/public/cable-beach-package`).then((r) => r.json()).then(setCfg).catch(() => {});
    fetch(`${API}/cable-beach/hotels`).then((r) => r.json()).then((d) => setHotels(d.hotels || [])).catch(() => {});

    // Capture inbound ?r=<token> (shared beach-day link) and tally the click.
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("r");
      if (t) {
        sessionStorage.setItem("cable_beach_share_token", t);
        setShareToken(t);
        fetch(`${API}/share/cable-beach/click`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t }),
        }).catch(() => {});
      } else {
        const saved = sessionStorage.getItem("cable_beach_share_token");
        if (saved) setShareToken(saved);
      }
    } catch { /* noop */ }
  }, []);

  const quoteBody = useMemo(() => ({
    pax, extra_seats: extraSeats, transfer_kind: transferKind,
    hotel_id: transferKind === "hotel" ? (hotelId || null) : null,
    lunch_item_ids: Array.from(lunchIds),
    drink_item_ids: Array.from(drinkIds),
    combo_id: comboId,
  }), [pax, extraSeats, transferKind, hotelId, lunchIds, drinkIds, comboId]);

  useEffect(() => {
    if (!cfg?.active) return;
    // Hotel transfer selected but no hotel chosen yet — skip quoting until
    // they pick one so we don't flash a wrong (zero-transfer) total.
    if (transferKind === "hotel" && !hotelId) { setQuote(null); return; }
    setQuoting(true);
    const h = setTimeout(() => {
      fetch(`${API}/cable-beach/quote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteBody),
      }).then((r) => r.ok ? r.json() : null).then(setQuote).catch(() => setQuote(null))
        .finally(() => setQuoting(false));
    }, 180);
    return () => { clearTimeout(h); setQuoting(false); };
  }, [cfg, quoteBody, transferKind, hotelId]);

  const toggleItem = (setter, id) => setter((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const selectedHotel = useMemo(
    () => hotels.find((h) => h.id === hotelId) || null,
    [hotels, hotelId],
  );

  const jsonLd = useMemo(() => cfg ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TouristTrip",
        "@id": `${PAGE_CANONICAL}#trip`,
        "name": "Toes in the Turquoise — Cable Beach (Goodman's Bay) Day, Nassau",
        "alternateName": ["A Day at Cable Beach Nassau", "Cable Beach Day Package", "Goodman's Bay Beach Day"],
        "description": "Half-day beach package at Cable Beach / Goodman's Bay in Nassau, Bahamas. Includes a reserved chair + umbrella per guest, optional round-trip transfer from the Nassau cruise port or any Nassau / Paradise Island hotel, extra beach seats, and local lunch and drink add-ons. Round-trip hotel fares are quoted from the published Rox taxi zone tariff.",
        "touristType": ["Beach", "Family", "Cruise excursion", "Group"],
        "itinerary": {
          "@type": "ItemList",
          "itemListElement": [
            { "@type": "Place", "name": "Pickup — your Nassau hotel, cruise port, or self-drive" },
            { "@type": "Place", "name": "Cable Beach / Goodman's Bay — chair + umbrella setup" },
            { "@type": "Place", "name": "Optional lunch & drinks beachside" },
            { "@type": "Place", "name": "Return transfer at your chosen pickup time" }
          ]
        },
        "image": `${SITE_URL}${HERO_IMAGE}`,
        "url": PAGE_CANONICAL,
        "offers": {
          "@type": "Offer",
          "price": String(cfg.base_price),
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "url": PAGE_CANONICAL,
          "validFrom": new Date().toISOString().slice(0, 10),
          "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "price": cfg.base_price,
            "priceCurrency": "USD",
            "unitText": "per adult",
            "referenceQuantity": { "@type": "QuantitativeValue", "value": 1, "unitCode": "C62" }
          }
        }
      },
      {
        "@type": "Product",
        "@id": `${PAGE_CANONICAL}#product`,
        "name": "Toes in the Turquoise — Cable Beach Day, Nassau",
        "description": "Beach day at Cable Beach (Goodman's Bay), Nassau. Reserved chair and umbrella per guest, optional cruise-port or hotel round-trip transfer, extra beach seats, lunch and drink add-ons. All fares include 10% VAT and 5% processing fee at checkout.",
        "image": [`${SITE_URL}${HERO_IMAGE}`],
        "brand": { "@type": "Brand", "name": "Rox Taxi & Tours Bahamas" },
        "category": "Beach day package / Nassau excursion",
        "offers": {
          "@type": "Offer",
          "price": String(cfg.base_price),
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "url": PAGE_CANONICAL,
          "seller": { "@type": "Organization", "name": "Rox Taxi & Tours", "url": SITE_URL }
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL },
          { "@type": "ListItem", "position": 2, "name": "Tours", "item": `${SITE_URL}/tours` },
          { "@type": "ListItem", "position": 3, "name": "Toes in the Turquoise · Cable Beach", "item": PAGE_CANONICAL }
        ]
      }
    ]
  } : null, [cfg]);

  if (!cfg) return <div className="max-w-4xl mx-auto px-6 py-16 text-[#64748B]">Loading package…</div>;
  if (!cfg.active) return <div className="max-w-xl mx-auto px-6 py-24 text-center">
    <Seo title="Day at Cable Beach · Rox Taxi" description="Paused — beach day package will be back soon." canonical={PAGE_CANONICAL} />
    <h1 className="serif text-3xl text-[#0B3B5C]">Cable Beach day — unavailable</h1>
    <p className="text-sm text-[#64748B] mt-3">This package is paused. Check back soon or <a href="/contact" className="text-[#D4A94A] underline">reach out directly</a>.</p>
  </div>;

  const book = () => {
    if (transferKind === "hotel" && !hotelId) {
      toast.error("Pick your hotel so we can confirm your transfer fare.");
      return;
    }
    setGuestModalOpen(true);
  };

  const submitBooking = async (guest) => {
    const payload = {
      customer_name: guest.name,
      customer_email: guest.email,
      customer_phone: guest.phone,
      booking_date: guest.booking_date,
      pax, extra_seats: extraSeats,
      transfer_kind: transferKind,
      hotel_id: transferKind === "hotel" ? hotelId : null,
      lunch_item_ids: Array.from(lunchIds),
      drink_item_ids: Array.from(drinkIds),
      combo_id: comboId,
      special_requests: guest.special_requests || null,
      share_token: shareToken || null,
    };
    const res = await fetch(`${API}/cable-beach/book`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || "Could not create booking. Please try again.");
      return;
    }
    const data = await res.json();
    toast.success(`Booked · ${money(data.total)}. Finishing checkout…`);
    window.location.href = data.pay_url;
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10" data-testid="cable-beach-day">
      <Seo
        title="Toes in the Turquoise · A Day at Cable Beach, Nassau | Rox"
        description="Toes in the Turquoise — the Rox day at Cable Beach / Goodman's Bay, Nassau. Reserved chair + umbrella per guest, round-trip taxi from your hotel or the cruise port, lunch and drink add-ons. Transparent pricing, instant booking."
        canonical={PAGE_CANONICAL}
        keywords="toes in the turquoise, day at cable beach nassau, cable beach day package, goodman's bay beach day, nassau beach day, cruise port to cable beach"
        ogImage={`${SITE_URL}${HERO_IMAGE}`}
        jsonLd={jsonLd}
      />

      <HeroCard />

      <header className="mb-8">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">Rox Beach Day · Signature</div>
        <h1 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-2">
          Toes in the Turquoise
          <span className="block text-xl sm:text-2xl text-[#64748B] font-normal italic mt-1">A day at Cable Beach / Goodman's Bay, Nassau</span>
        </h1>
        <p className="text-[#64748B] mt-3 max-w-2xl">Soft sand, calm shelf water, kayaks and watersports right there on the beach — 10 minutes from downtown Nassau. Every booking includes a reserved chair + umbrella per guest. Add a round-trip transfer, extra seats, lunch and drinks.</p>
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
                title="Hotel round-trip" sub="Auto-filled by zone tariff" Icon={Hotel} />
            </div>
            {transferKind === "hotel" && (
              <div className="mt-3">
                <label className="block text-xs font-bold text-[#0B3B5C] mb-1">Where are you staying?</label>
                <HotelAutocomplete hotels={hotels} value={hotelId} onChange={setHotelId} />
                {selectedHotel ? (
                  <>
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-[#FFF4EC] border border-[#E86A3C]/30 px-3 py-2" data-testid="cable-hotel-fare-readout">
                      <div className="text-xs text-[#64748B]">
                        Round-trip taxi fare for <b className="text-[#0B3B5C]">{selectedHotel.name.split("·")[0].trim()}</b>
                        <span className="block text-[10px] text-[#94A3B8] mt-0.5">${selectedHotel.oneway_fare} each way · zone tariff · flat per taxi</span>
                      </div>
                      <div className="serif text-xl text-[#E86A3C] font-black whitespace-nowrap" data-testid="cable-hotel-fare-amount">
                        ${selectedHotel.roundtrip_fare}
                      </div>
                    </div>
                    <HotelPickupMap hotel={selectedHotel} />
                  </>
                ) : (
                  <p className="text-[11px] text-[#64748B] mt-1">We auto-fill the round-trip fare from the Rox zone tariff — no haggling, no surprises.</p>
                )}
              </div>
            )}
          </Section>

          <Section icon={Utensils} title="Food menu (optional) — dinners include rice & 2 sides">
            {/* Chef's-choice combo card — one-tap selects the bundle items + applies the discount. */}
            {(cfg.combos || []).map((combo) => {
              const required = new Set(combo.items || []);
              const allSelected = Array.from(required).every((id) => lunchIds.has(id) || drinkIds.has(id));
              const active = comboId === combo.id && allSelected;
              const applyCombo = () => {
                const nextLunch = new Set(lunchIds);
                const nextDrink = new Set(drinkIds);
                const lunchIdsAll = new Set((cfg.lunch_items || []).map((x) => x.id));
                combo.items.forEach((id) => {
                  if (lunchIdsAll.has(id)) nextLunch.add(id);
                  else nextDrink.add(id);
                });
                setLunchIds(nextLunch); setDrinkIds(nextDrink); setComboId(combo.id);
                toast.success(`${combo.name} applied · save $${combo.discount}`);
              };
              const clearCombo = () => { setComboId(null); toast.success("Combo removed"); };
              const comboItems = combo.items.map((id) =>
                (cfg.lunch_items || []).find((x) => x.id === id)
                || (cfg.drink_items || []).find((x) => x.id === id)
              ).filter(Boolean);
              return (
                <button key={combo.id} type="button" onClick={active ? clearCombo : applyCombo}
                  data-testid={`cable-combo-${combo.id}`}
                  className={`w-full text-left rounded-xl border-2 p-3 mb-3 transition ${active ? "border-[#D4A94A] bg-gradient-to-br from-[#FFF4EC] to-[#FBF7EF]" : "border-dashed border-[#D4A94A]/50 bg-white hover:border-[#D4A94A]"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ChefHat className={`w-4 h-4 ${active ? "text-[#D4A94A]" : "text-[#64748B]"}`} />
                        <span className="text-[10px] tracking-[0.28em] uppercase font-black text-[#D4A94A]">Chef's pick</span>
                        {active && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">Applied</span>}
                      </div>
                      <div className="serif text-xl text-[#0B3B5C] mt-1">{combo.name}</div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">{combo.subtitle}</div>
                      <div className="text-[11px] text-[#0B3B5C] mt-1 font-medium">
                        {comboItems.map((it) => it.name).join(" + ")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-[#64748B] uppercase tracking-wider font-bold">Save</div>
                      <div className="serif text-2xl text-[#E86A3C] font-black">${combo.discount}</div>
                    </div>
                  </div>
                </button>
              );
            })}
            {/* Dietary filter chips */}
            {(() => {
              const DIET = [
                { id: "gluten_free",   label: "Gluten-free",   short: "GF" },
                { id: "pescatarian",   label: "Pescatarian",   short: "P" },
                { id: "dairy_free",    label: "Dairy-free",    short: "DF" },
                { id: "peanut_free",   label: "Peanut-free",   short: "PF" },
                { id: "shellfish_free",label: "Shellfish-free",short: "SF" },
              ];
              return (
                <div className="flex flex-wrap items-center gap-1.5 mb-3" data-testid="cable-diet-filters">
                  <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider mr-1">Filter:</span>
                  {DIET.map((d) => {
                    const active = dietFilters.has(d.id);
                    return (
                      <button key={d.id} type="button"
                        onClick={() => setDietFilters((prev) => {
                          const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n;
                        })}
                        data-testid={`cable-diet-${d.id}`}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${active ? "bg-[#0B3B5C] text-white" : "border border-[#E2E8F0] bg-white text-[#0B3B5C] hover:border-[#D4A94A]"}`}>
                        {d.label}
                      </button>
                    );
                  })}
                  {dietFilters.size > 0 && (
                    <button onClick={() => setDietFilters(new Set())} className="text-[11px] text-[#64748B] underline hover:text-[#0B3B5C]"
                      data-testid="cable-diet-clear">Clear</button>
                  )}
                </div>
              );
            })()}
            {cfg.lunch_items.length === 0 ? (
              <p className="text-xs text-[#64748B]">Menu will be published shortly. Call dispatch to add dinner after booking.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {cfg.lunch_items
                  .filter((it) => dietFilters.size === 0 || Array.from(dietFilters).every((f) => (it.tags || []).includes(f)))
                  .map((it) => (
                    <MenuTile key={it.id} it={it} active={lunchIds.has(it.id)}
                      onClick={() => toggleItem(setLunchIds, it.id)}
                      testId={`cable-lunch-${it.id}`} />
                  ))}
                {cfg.lunch_items.filter((it) => dietFilters.size === 0 || Array.from(dietFilters).every((f) => (it.tags || []).includes(f))).length === 0 && (
                  <div className="col-span-full text-xs text-[#64748B] italic py-3 text-center">No dinners match these filters — try fewer tags.</div>
                )}
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
              {quote.combo_applied && (
                <Line label={`Chef's combo · ${quote.combo_applied.name}`}>
                  <span className="text-emerald-700">− {money(quote.combo_discount)}</span>
                </Line>
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
          <ShareBeachDayButton quote={quote} pax={pax} transferKind={transferKind} hotelName={selectedHotel?.name} onOpen={() => setShareModalOpen(true)} />
          <button
            onClick={() => setGiftModalOpen(true)}
            data-testid="cable-beach-gift"
            className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#D4A94A] text-[#D4A94A] font-bold py-2.5 text-sm hover:bg-[#D4A94A] hover:text-white active:scale-95 transition"
          >
            <Gift className="w-4 h-4" /> Gift this beach day
          </button>
          {shareToken && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#F0F9FF] border border-[#0EA5E9]/30 px-3 py-2 text-[11px] text-[#0369A1]" data-testid="cable-beach-shared-banner">
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span>You followed a friend's share link — book this beach day and they'll earn a $10 Rox credit.</span>
            </div>
          )}
          <p className="text-[11px] text-[#94A3B8] mt-3 text-center">Secure checkout · Stripe or PayPal</p>
        </aside>
      </div>

      {guestModalOpen && (
        <GuestDetailsModal
          onClose={() => setGuestModalOpen(false)}
          onSubmit={submitBooking}
          totalLabel={quote ? money(quote.total) : ""}
        />
      )}
      {shareModalOpen && (
        <ShareLinkModal
          onClose={() => setShareModalOpen(false)}
          quote={quote} pax={pax} transferKind={transferKind} hotelName={selectedHotel?.name}
        />
      )}
      {giftModalOpen && (
        <GiftBeachDayModal
          onClose={() => setGiftModalOpen(false)}
          suggestedAmount={quote ? Math.round(quote.total) : 160}
        />
      )}
    </div>
  );
}

/**
 * HeroCard — subtle 3D-tilt hero so the beach-chairs / kayaks aerial feels
 * immersive. Uses mouse-position-driven CSS transform on desktop; on
 * touch devices and prefers-reduced-motion it stays flat.
 */
function HeroCard() {
  const wrapRef = useRef(null);
  const imgRef = useRef(null);

  const handleMove = (e) => {
    const el = wrapRef.current, img = imgRef.current;
    if (!el || !img) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1200px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
    img.style.transform = `translate3d(${(x * -18).toFixed(1)}px, ${(y * -12).toFixed(1)}px, 0) scale(1.06)`;
  };
  const handleLeave = () => {
    const el = wrapRef.current, img = imgRef.current;
    if (el) el.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg)";
    if (img) img.style.transform = "translate3d(0,0,0) scale(1.03)";
  };

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className="relative mb-8 overflow-hidden rounded-[28px] border border-white/60 shadow-[0_30px_80px_rgba(11,25,44,0.25)] transition-transform duration-200 ease-out will-change-transform"
      style={{ aspectRatio: "16 / 9", transformStyle: "preserve-3d" }}
      data-testid="cable-beach-hero"
    >
      <img
        ref={imgRef}
        src={HERO_IMAGE}
        alt="Aerial view of Cable Beach, Nassau — rows of beach chairs and kayaks on the white sand with turquoise water and a pier"
        loading="eager"
        fetchpriority="high"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 ease-out will-change-transform"
        style={{ transform: "translate3d(0,0,0) scale(1.03)" }}
      />
      {/* Gradient wash for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B192C]/70 via-[#0B192C]/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 text-white">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#D4A94A] text-[#0B192C] text-[10px] font-black uppercase tracking-[0.3em] px-3 py-1">
          <Umbrella className="w-3 h-3" /> Cable Beach · Goodman's Bay
        </div>
        <div className="serif text-4xl sm:text-6xl font-bold leading-[1.02] mt-3 drop-shadow-lg">
          Toes in the <em className="italic text-[#F7E6C6]">Turquoise.</em>
        </div>
        <div className="text-sm sm:text-base text-white/90 mt-2 max-w-xl">
          Reserved chair, umbrella shade, kayaks and watersports on-site, round-trip taxi from your hotel. Priced upfront — no haggling.
        </div>
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
  const TAG_SHORT = { gluten_free: "GF", pescatarian: "P", dairy_free: "DF", peanut_free: "PF", shellfish_free: "SF" };
  const TAG_COLOR = { gluten_free: "#059669", pescatarian: "#0369A1", dairy_free: "#B45309", peanut_free: "#7C3AED", shellfish_free: "#DB2777" };
  const tags = Array.isArray(it.tags) ? it.tags : [];
  return (
    <button onClick={onClick} data-testid={testId}
      className={`text-left rounded-xl border p-3 transition ${active ? "border-[#E86A3C] bg-[#FFF4EC]" : "border-[#E2E8F0] bg-white hover:border-[#D4A94A]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-bold ${active ? "text-[#E86A3C]" : "text-[#0B3B5C]"}`}>{it.name}</span>
        <span className="text-sm font-mono text-[#0B3B5C]">${it.price}</span>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {tags.map((t) => (
            <span key={t} className="text-[9px] font-bold rounded-full px-1.5 py-0.5"
              title={t.replace("_", " ")}
              style={{ color: TAG_COLOR[t] || "#64748B", background: `${TAG_COLOR[t] || "#64748B"}18` }}>
              {TAG_SHORT[t] || t}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

/**
 * ShareBeachDayButton — opens the ShareLinkModal (which lets the sharer
 * attach their email so a $10 Rox credit lands on their wallet once the
 * recipient books). Falls back to native share if the modal isn't needed.
 */
function ShareBeachDayButton({ quote, onOpen }) {
  if (!quote) return null;
  return (
    <button
      onClick={onOpen}
      data-testid="cable-beach-share"
      className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#25D366] text-[#128C7E] font-bold py-2.5 text-sm hover:bg-[#25D366] hover:text-white active:scale-95 transition"
    >
      <Share2 className="w-4 h-4" /> Share this beach day · earn $10 credit
    </button>
  );
}

/**
 * HotelPickupMap — tiny OpenStreetMap iframe centred on the chosen hotel's
 * zone centroid. No API key, no tracking, loads instantly. We draw a small
 * pickup pin at the exact centroid so the guest can eyeball it before
 * booking.
 */
function HotelPickupMap({ hotel }) {
  if (!hotel?.lat || !hotel?.lng) return null;
  const d = 0.015; // bbox radius in degrees (~1.5 km)
  const bbox = [hotel.lng - d, hotel.lat - d, hotel.lng + d, hotel.lat + d].join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${hotel.lat},${hotel.lng}`;
  const osmLink = `https://www.openstreetmap.org/?mlat=${hotel.lat}&mlon=${hotel.lng}#map=15/${hotel.lat}/${hotel.lng}`;
  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-[#E2E8F0]" data-testid="cable-hotel-map">
      <iframe
        title={`Pickup area · ${hotel.name}`}
        src={src}
        className="w-full h-40 border-0"
        loading="lazy"
      />
      <div className="flex items-center justify-between gap-2 bg-[#F8FAFC] px-2.5 py-1.5">
        <span className="text-[10px] text-[#64748B]">Pickup zone · tap the pin to confirm</span>
        <a href={osmLink} target="_blank" rel="noopener noreferrer"
          className="text-[10px] font-bold text-[#D4A94A] hover:underline">Open in map →</a>
      </div>
    </div>
  );
}

/**
 * GuestDetailsModal — collects name/email/phone/date before the server
 * creates a real booking. Keeps the booking flow lean (one modal instead
 * of a full new page). On submit it hands the data back to CableBeachDay
 * which POSTs `/cable-beach/book` and redirects to `/pay/{booking_id}`.
 */
function GuestDetailsModal({ onClose, onSubmit, totalLabel }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [requests, setRequests] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name || !email || !phone || !bookingDate) {
      toast.error("Please fill name, email, phone and date.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        name, email, phone,
        booking_date: new Date(bookingDate).toISOString(),
        special_requests: requests || null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B192C]/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()} data-testid="cable-guest-modal">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">Final step</div>
            <h3 className="serif text-2xl text-[#0B3B5C]">Who's coming to the beach?</h3>
            {totalLabel && <div className="text-xs text-[#64748B] mt-1">Total · <b className="text-[#0B3B5C]">{totalLabel}</b></div>}
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0B3B5C]" data-testid="cable-guest-close">✕</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
            className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
            data-testid="cable-guest-name" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
            className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
            data-testid="cable-guest-email" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (with country code)" type="tel"
            className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
            data-testid="cable-guest-phone" />
          <input value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} type="datetime-local"
            min={new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16)}
            className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
            data-testid="cable-guest-date" />
          <textarea value={requests} onChange={(e) => setRequests(e.target.value)} placeholder="Allergies, flight #, cabana preference (optional)"
            rows={2} maxLength={500}
            className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
            data-testid="cable-guest-requests" />
          <button type="submit" disabled={busy}
            className="w-full rounded-full bg-[#E86A3C] text-white font-black uppercase tracking-wider py-3 text-sm hover:bg-[#d55a30] active:scale-95 disabled:opacity-50"
            data-testid="cable-guest-submit">
            {busy ? "Reserving…" : `Reserve & pay · ${totalLabel}`}
          </button>
          <p className="text-[11px] text-[#94A3B8] text-center">You'll pay on the next screen with Stripe or PayPal.</p>
        </form>
      </div>
    </div>
  );
}

/**
 * ShareLinkModal — asks the sharer for their email (first time only; cached
 * in localStorage), mints a durable share token via `/share/cable-beach/create`,
 * then hands the URL off to the native share sheet or a wa.me deeplink.
 */
function ShareLinkModal({ onClose, quote, pax, transferKind, hotelName }) {
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem("cable_sharer_email") || ""; } catch { return ""; }
  });
  const [busy, setBusy] = useState(false);

  const paxLabel = pax === 1 ? "1 guest" : `${pax} guests`;
  const transferLabel =
    transferKind === "cruise_roundtrip" ? " + round-trip cruise port ride"
    : transferKind === "cruise_oneway" ? " + one-way cruise port ride"
    : transferKind === "hotel" ? ` + round-trip ride (${(hotelName || "").split("·")[0].trim() || "hotel"})`
    : "";

  const buildText = (url) =>
    `🌴 Toes in the Turquoise · Cable Beach, Nassau\nJust priced our beach day for ${paxLabel} — ${money(quote?.total || 0)} all-in (chair + umbrella${transferLabel}).\nBook your spot: ${url}`;

  const share = async (opts) => {
    setBusy(true);
    let shareUrl = PAGE_CANONICAL;
    try {
      if (opts.useEmail) {
        try { localStorage.setItem("cable_sharer_email", email); } catch { /* noop */ }
        const r = await fetch(`${API}/share/cable-beach/create`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sharer_email: email }),
        });
        if (r.ok) {
          const d = await r.json();
          shareUrl = `${SITE_URL}${d.share_url}`;
        }
      }
      const text = buildText(shareUrl);
      const nav = typeof navigator !== "undefined" ? navigator : null;
      if (nav?.share) {
        try {
          await nav.share({ title: "Toes in the Turquoise · Cable Beach Nassau", text, url: shareUrl });
          toast.success(opts.useEmail ? "Shared · $10 credit tracked" : "Shared · no credit (anonymous)");
          onClose();
          return;
        } catch (e) {
          if (e?.name === "AbortError") { setBusy(false); return; }
        }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      toast.success(opts.useEmail ? "WhatsApp opened · $10 credit tracked" : "WhatsApp opened");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B192C]/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()} data-testid="cable-share-modal">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#128C7E] font-black">Share · Earn $10</div>
            <h3 className="serif text-2xl text-[#0B3B5C]">Send this beach day to a friend</h3>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0B3B5C]" data-testid="cable-share-close">✕</button>
        </div>
        <p className="text-sm text-[#64748B] mb-4">
          Drop your email so we can track your referral — when a friend books Toes in the Turquoise through your link, you'll get a <b className="text-[#128C7E]">$10 Rox credit</b> on your next trip.
        </p>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" type="email"
          className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#128C7E] mb-3"
          data-testid="cable-share-email" />
        <button onClick={() => share({ useEmail: true })} disabled={busy || !email}
          className="w-full rounded-full bg-[#25D366] text-white font-black uppercase tracking-wider py-3 text-sm hover:bg-[#1DA851] active:scale-95 disabled:opacity-50"
          data-testid="cable-share-submit">
          {busy ? "Preparing…" : "Share & earn $10"}
        </button>
        <button onClick={() => share({ useEmail: false })} disabled={busy}
          className="mt-2 w-full rounded-full border border-[#E2E8F0] text-[#64748B] font-semibold py-2 text-xs hover:border-[#D4A94A] hover:text-[#0B3B5C]"
          data-testid="cable-share-anon">
          Share without earning credit
        </button>
      </div>
    </div>
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

/**
 * HotelAutocomplete — typeahead replacement for the native select so cruise
 * guests can type "Atlantis" / "Baha Mar" instead of scrolling. Fuzzy-matches
 * on hotel name (words + sub-brands separated by `·`). Keyboard: ↑↓ Enter Esc.
 * Keeps `data-testid="cable-hotel-select"` so existing selectors still work.
 */
function HotelAutocomplete({ hotels, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [weather, setWeather] = useState(null);
  const wrapRef = useRef(null);

  // Fetch Cable Beach marine conditions once — same for every hotel row since
  // the whole island shares the same shelf. Fire-and-forget; empty-state hides
  // the badge if the API call fails.
  useEffect(() => {
    fetch(`${API}/cable-beach/weather`).then((r) => r.ok ? r.json() : null).then(setWeather).catch(() => {});
  }, []);

  // Keep the input text in sync with the selected hotel label.
  useEffect(() => {
    const sel = hotels.find((h) => h.id === value);
    if (sel && !open) setQuery(sel.name);
    if (!value && !open) setQuery("");
  }, [value, hotels, open]);

  // Click-outside closes the dropdown without clobbering a valid selection.
  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = !q
    ? hotels
    : hotels.filter((h) => h.name.toLowerCase().includes(q));

  const pick = (h) => {
    onChange(h.id);
    setQuery(h.name);
    setOpen(false);
  };

  const onKey = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[highlight]) pick(filtered[highlight]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative" data-testid="cable-hotel-autocomplete">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B] pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); if (!e.target.value) onChange(""); }}
        onFocus={() => { setOpen(true); setHighlight(0); }}
        onKeyDown={onKey}
        placeholder="Type your hotel — Atlantis, Baha Mar, Riu…"
        data-testid="cable-hotel-select"
        className="w-full pl-9 pr-9 py-2.5 border border-[#E2E8F0] rounded-lg bg-white text-sm text-[#0B3B5C] font-semibold focus:outline-none focus:border-[#D4A94A] focus:ring-2 focus:ring-[#D4A94A]/20"
      />
      <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B] pointer-events-none transition ${open ? "rotate-180" : ""}`} />
      {weather && (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[#64748B]" data-testid="cable-hotel-weather">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold" style={{ background: `${weather.hex}22`, color: weather.hex }}>
            <span>{weather.emoji}</span><span>{weather.label}</span>
          </span>
          {weather.wave_m != null && <span>wave {weather.wave_m}m</span>}
          {weather.wind_kmh != null && <span>· wind {Math.round(weather.wind_kmh)} km/h</span>}
          {weather.water_c != null && <span>· water {Math.round(weather.water_c)}°C</span>}
        </div>
      )}
      {open && filtered.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-[#E2E8F0] bg-white shadow-[0_18px_40px_rgba(11,25,44,0.12)] max-h-72 overflow-auto">
          {filtered.map((h, i) => (
            <button
              key={h.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(h); }}
              onMouseEnter={() => setHighlight(i)}
              data-testid={`cable-hotel-option-${h.id}`}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-3 transition ${
                i === highlight ? "bg-[#FFF4EC] text-[#E86A3C]" : "text-[#0B3B5C] hover:bg-[#F8FAFC]"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="truncate">{h.name}</span>
                {weather && (
                  <span className="shrink-0 text-[10px]" style={{ color: weather.hex }} title={weather.label}>{weather.emoji}</span>
                )}
              </span>
              <span className="text-xs font-mono shrink-0">${h.roundtrip_fare} r/t</span>
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-[#E2E8F0] bg-white p-3 text-xs text-[#64748B]">
          No match for "<b>{query}</b>" — try "Cable Beach" or "Paradise Island".
        </div>
      )}
    </div>
  );
}

/**
 * GiftBeachDayModal — reuses the existing `/api/gift-cards/purchase` flow
 * with a Cable-Beach-themed amount preset. Recipient gets a branded PDF
 * voucher by email (handled by the Stripe webhook on payment). Buyer is
 * redirected to Stripe Checkout and lands back on `/gift-cards/success`.
 */
function GiftBeachDayModal({ onClose, suggestedAmount }) {
  const presets = [80, 160, 240, 320];
  const [amount, setAmount] = useState(suggestedAmount && presets.includes(Math.round(suggestedAmount / 10) * 10) ? Math.round(suggestedAmount / 10) * 10 : 160);
  const [custom, setCustom] = useState("");
  const [form, setForm] = useState({
    buyer_name: "", buyer_email: "",
    recipient_name: "", recipient_email: "",
    message: "",
  });
  const [deliverMode, setDeliverMode] = useState("now"); // "now" | "scheduled"
  const [deliverAt, setDeliverAt] = useState("");
  const [busy, setBusy] = useState(false);

  // Three pre-written notes — one-tap fills the message textarea so a buyer
  // who isn't a writer still ships a thoughtful gift in 30 seconds.
  const SUGGESTED_NOTES = [
    { id: "birthday",   label: "🎂 Birthday",   text: "Happy Birthday — toes in the turquoise ☀️ enjoy every minute of this one." },
    { id: "honeymoon",  label: "🥂 Honeymoon",  text: "Congrats on the honeymoon 🥂 soak up the Bahamas, you two deserve it." },
    { id: "reset",      label: "🌴 Just because",text: "You deserve a reset 🌴 go get some sand on your feet — on me." },
  ];

  const finalAmount = custom ? Number(custom) : amount;
  const giftedPax = Math.max(1, Math.round(finalAmount / 40));

  const submit = async (e) => {
    e.preventDefault();
    if (!finalAmount || finalAmount < 25 || finalAmount > 1000) {
      toast.error("Pick an amount between $25 and $1,000"); return;
    }
    if (!form.buyer_name || !form.buyer_email || !form.recipient_email) {
      toast.error("Fill your name/email and the recipient's email"); return;
    }
    if (deliverMode === "scheduled" && !deliverAt) {
      toast.error("Pick a delivery date — or switch to Send now"); return;
    }
    setBusy(true);
    try {
      const prefixedMessage =
        `🌴 Toes in the Turquoise — your Cable Beach day on me.` +
        (form.message ? `\n\n${form.message}` : "");
      const scheduledIso = deliverMode === "scheduled" && deliverAt
        ? new Date(deliverAt).toISOString() : null;
      const res = await fetch(`${API}/gift-cards/purchase`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: finalAmount, buyer_name: form.buyer_name, buyer_email: form.buyer_email,
          recipient_email: form.recipient_email, recipient_name: form.recipient_name,
          message: prefixedMessage, origin_url: window.location.origin,
          scheduled_send_at: scheduledIso,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Gift purchase failed"); setBusy(false); return;
      }
      const data = await res.json();
      window.location.href = data.checkout_url;
    } catch {
      toast.error("Gift purchase failed"); setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0B192C]/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()} data-testid="cable-gift-modal">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">Gift a beach day</div>
            <h3 className="serif text-2xl text-[#0B3B5C]">Send Toes in the Turquoise</h3>
            <div className="text-xs text-[#64748B] mt-1">Branded voucher · instant email delivery · never expires</div>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0B3B5C]" data-testid="cable-gift-close">✕</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="text-[10px] tracking-[0.28em] uppercase font-black text-[#64748B] mb-2">Amount</div>
            <div className="flex flex-wrap gap-2">
              {presets.map((a) => (
                <button key={a} type="button" onClick={() => { setAmount(a); setCustom(""); }}
                  data-testid={`cable-gift-amount-${a}`}
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${amount === a && !custom ? "bg-[#0B3B5C] text-white" : "border border-[#E2E8F0] text-[#0B3B5C] hover:border-[#D4A94A]"}`}>
                  ${a}
                </button>
              ))}
              <input type="number" min="25" max="1000" value={custom}
                onChange={(e) => setCustom(e.target.value)} placeholder="Custom"
                data-testid="cable-gift-amount-custom"
                className="w-24 px-3 py-2 text-sm border border-[#E2E8F0] rounded-full focus:outline-none focus:border-[#D4A94A]" />
            </div>
            <div className="text-[11px] text-[#64748B] mt-1.5">Covers ≈ {giftedPax} guest{giftedPax === 1 ? "" : "s"} of the base beach day</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
              placeholder="Your name"
              className="px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="cable-gift-buyer-name" />
            <input value={form.buyer_email} onChange={(e) => setForm({ ...form, buyer_email: e.target.value })}
              placeholder="Your email" type="email"
              className="px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="cable-gift-buyer-email" />
            <input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
              placeholder="Recipient name (optional)"
              className="px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="cable-gift-recipient-name" />
            <input value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })}
              placeholder="Recipient email" type="email"
              className="px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="cable-gift-recipient-email" />
          </div>

          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="A personal note for the voucher (optional)…" rows={2} maxLength={400}
            className="w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]"
            data-testid="cable-gift-message" />
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_NOTES.map((n) => (
              <button key={n.id} type="button"
                onClick={() => setForm((f) => ({ ...f, message: n.text }))}
                data-testid={`cable-gift-note-${n.id}`}
                className="rounded-full border border-[#E2E8F0] bg-[#FBF7EF] px-3 py-1.5 text-[11px] font-bold text-[#0B3B5C] hover:border-[#D4A94A] hover:bg-[#FFF4EC] active:scale-95 transition">
                {n.label}
              </button>
            ))}
          </div>

          <div className="pt-1">
            <div className="text-[10px] tracking-[0.28em] uppercase font-black text-[#64748B] mb-2">When to deliver</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeliverMode("now")}
                data-testid="cable-gift-deliver-now"
                className={`rounded-xl border p-3 text-left text-sm transition ${deliverMode === "now" ? "border-[#E86A3C] bg-[#FFF4EC]" : "border-[#E2E8F0] hover:border-[#D4A94A]"}`}>
                <div className={`font-bold ${deliverMode === "now" ? "text-[#E86A3C]" : "text-[#0B3B5C]"}`}>Send now</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Recipient gets it the moment payment lands</div>
              </button>
              <button type="button" onClick={() => setDeliverMode("scheduled")}
                data-testid="cable-gift-deliver-scheduled"
                className={`rounded-xl border p-3 text-left text-sm transition ${deliverMode === "scheduled" ? "border-[#E86A3C] bg-[#FFF4EC]" : "border-[#E2E8F0] hover:border-[#D4A94A]"}`}>
                <div className={`font-bold ${deliverMode === "scheduled" ? "text-[#E86A3C]" : "text-[#0B3B5C]"}`}>Schedule date</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Birthday morning, anniversary, holiday…</div>
              </button>
            </div>
            {deliverMode === "scheduled" && (
              <input type="datetime-local" value={deliverAt} onChange={(e) => setDeliverAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                data-testid="cable-gift-deliver-at"
                className="mt-2 w-full px-3 py-2.5 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A]" />
            )}
          </div>

          <button type="submit" disabled={busy}
            className="w-full rounded-full bg-[#D4A94A] text-[#0B192C] font-black uppercase tracking-wider py-3 text-sm hover:bg-[#c99b3d] active:scale-95 disabled:opacity-50"
            data-testid="cable-gift-submit">
            {busy ? "Preparing checkout…" : `Gift ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(finalAmount)}`}
          </button>
          <p className="text-[11px] text-[#94A3B8] text-center">Paid on the next screen with Stripe. Recipient gets a branded PDF voucher by email instantly on payment.</p>
        </form>
      </div>
    </div>
  );
}
