import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { api, money } from "../../lib/api";

const SERVICES = [
  { key: "taxi", label: "Taxi", path: "/taxi-services" },
  { key: "tour", label: "Tour", path: "/tours" },
  { key: "rental", label: "Rental", path: "/rentals" },
  { key: "cable_beach", label: "Cable Beach Day", path: null },
  { key: "other", label: "Other", path: null },
];

const EMPTY = {
  service_type: "taxi", item_id: "", item_name: "", customer_name: "", customer_email: "", customer_phone: "",
  booking_date: "", pickup_location: "", dropoff_location: "", passengers: 1, flight_number: "", notes: "",
  extra_luggage: 0, luggage_price: 3, car_seats: 0, bridge_toll: false, stops: [], trip_legs: [],
  total: "", payment: "unpaid", send_confirmation: true, send_pay_link: true, text_pay_link: true,
};

const input = "w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#0B3B5C]";

function Field({ label, children }) {
  return <label className="block text-xs text-[#64748B] font-semibold">{label}<div className="mt-1">{children}</div></label>;
}

const CUSTOM = "__custom__";

// Dropdown of known places + "Custom" for anywhere not listed.
function LocationSelect({ value, onChange, places, testid }) {
  const known = places.includes(value);
  const [custom, setCustom] = useState(!!value && !known);
  return (
    <div className="space-y-1.5">
      <select value={custom ? CUSTOM : value} className={input} data-testid={`${testid}-select`}
        onChange={(e) => { const v = e.target.value; setCustom(v === CUSTOM); onChange(v === CUSTOM ? "" : v); }}>
        <option value="">Choose…</option>
        {places.map((p) => <option key={p} value={p}>{p}</option>)}
        <option value={CUSTOM}>Custom (not listed)…</option>
      </select>
      {custom && <input value={value} onChange={(e) => onChange(e.target.value)} className={input} placeholder="Type the address or place" autoFocus data-testid={`${testid}-custom`} />}
    </div>
  );
}

const SERVICE_KEYS = SERVICES.map((s) => s.key);

const fromBooking = (b) => ({
  ...EMPTY,
  service_type: SERVICE_KEYS.includes(b.service_type) ? b.service_type : "other",
  item_id: b.item_id || "",
  item_name: b.item_name || "",
  customer_name: b.customer_name || "",
  customer_email: b.customer_email || "",
  customer_phone: b.customer_phone || "",
  pickup_location: b.pickup_location || "",
  dropoff_location: b.dropoff_location || "",
  passengers: b.passengers || 1,
  notes: b.notes || "",
  total: b.total || b.total_price || "",
  bridge_toll: Number(b.bridge_toll_fee || 0) > 0,
});

export default function NewBookingDialog({ initial, onClose, onCreated }) {
  const [f, setF] = useState(() => (initial ? fromBooking(initial) : EMPTY));
  const [items, setItems] = useState([]);
  const [places, setPlaces] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const luggageFee = Math.round((Number(f.extra_luggage) || 0) * (Number(f.luggage_price) || 0) * 100) / 100;
  const seatFee = (Number(f.car_seats) || 0) * 2;
  const tollFee = f.service_type === "taxi" && f.bridge_toll ? 2 : 0;
  const tollPts = JSON.stringify([f.pickup_location, ...f.stops, f.dropoff_location]);
  useEffect(() => {
    if (f.service_type !== "taxi") return undefined;
    const t = setTimeout(() => {
      api.post("/taxi/bridge-toll", { points: JSON.parse(tollPts).filter(Boolean) }).then(({ data }) => {
        const on = Number(data?.toll || 0) > 0;
        setF((x) => (x.bridge_toll === on ? x : { ...x, bridge_toll: on,
          total: x.total === "" ? x.total : Math.max(0, Math.round((Number(x.total) + (on ? 2 : -2)) * 100) / 100) }));
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [tollPts, f.service_type]);
  const setToll = (e) => setF((x) => ({ ...x, bridge_toll: e.target.checked,
    total: x.total === "" ? x.total : Math.max(0, Math.round((Number(x.total) + (e.target.checked ? 2 : -2)) * 100) / 100) }));
  const [pricing, setPricing] = useState(false);
  const priceRoute = async () => {
    const pts = [f.pickup_location, ...f.stops, f.dropoff_location].map((p) => String(p || "").trim());
    if (pts.some((p) => !p)) { toast.error("Fill in pickup, every stop and drop-off first"); return; }
    setPricing(true);
    try {
      const { data } = await api.post("/taxi/multi-quote", { points: pts, passengers: Number(f.passengers) || 1 });
      if (!data.ok) { toast.error(data.error); return; }
      setF((x) => ({ ...x, trip_legs: data.legs, total: Math.round((data.total + luggageFee + seatFee + tollFee) * 100) / 100 }));
    } catch { toast.error("Couldn't price this route"); } finally { setPricing(false); }
  };
  const setLeg = (n, fare) => setF((x) => {
    const legs = x.trip_legs.map((lg, k) => (k === n ? { ...lg, fare: Number(fare) || 0 } : lg));
    const sum = legs.reduce((s, lg) => s + Number(lg.fare || 0), 0);
    return { ...x, trip_legs: legs, total: Math.round((sum + luggageFee + seatFee + tollFee) * 100) / 100 };
  });
  const setSeats = (e) => setF((x) => {
    const v = Math.max(0, Math.min(4, Number(e.target.value) || 0));
    return { ...x, car_seats: v, total: x.total === "" ? x.total : Math.max(0, Math.round((Number(x.total) - (Number(x.car_seats) || 0) * 2 + v * 2) * 100) / 100) };
  });
  const setLuggage = (k) => (e) => setF((x) => {
    const next = { ...x, [k]: e.target.value };
    const oldFee = (Number(x.extra_luggage) || 0) * (Number(x.luggage_price) || 0);
    const newFee = (Number(next.extra_luggage) || 0) * (Number(next.luggage_price) || 0);
    if (x.total !== "") next.total = Math.max(0, Math.round((Number(x.total) - oldFee + newFee) * 100) / 100);
    return next;
  });

  useEffect(() => {
    api.get("/taxi/locations").then(({ data }) => setPlaces((data || []).map((l) => l.label))).catch(() => {});
  }, []);

  useEffect(() => {
    const svc = SERVICES.find((s) => s.key === f.service_type);
    if (!svc?.path) { setItems([]); return; }
    api.get(svc.path).then(({ data }) => {
      const list = Array.isArray(data) ? data : data?.items || [];
      setItems(list);
      setF((x) => (x.item_id && !list.some((it) => it.id === x.item_id) ? { ...x, item_id: "" } : x));
    }).catch(() => setItems([]));
  }, [f.service_type]);

  const pickItem = (e) => {
    const it = items.find((x) => x.id === e.target.value);
    setF((x) => ({ ...x, item_id: it?.id || "", item_name: it?.name || "", total: x.total || (it?.price ?? it?.price_per_day ?? "") }));
  };

  const sendQuote = async () => {
    const it = items.find((x) => x.id === f.item_id);
    if (!it || !["taxi", "tour", "rental"].includes(f.service_type)) { toast.error("Pick a taxi route, tour or car from the list to send a quote"); return; }
    if (!f.customer_name.trim() || !f.customer_email.trim() || !f.customer_phone.trim() || !f.booking_date) { toast.error("Guest name, email, phone and date are needed for a quote"); return; }
    setBusy(true);
    try {
      const pax = Number(f.passengers) || 1;
      const payload = {
        service_type: f.service_type, item_id: it.id, item_name: it.name, price: it.price ?? it.price_per_day ?? 0,
        customer_name: f.customer_name, customer_email: f.customer_email, customer_phone: f.customer_phone,
        booking_date: f.booking_date, pickup_location: f.pickup_location || null, dropoff_location: f.dropoff_location || null,
        stops: f.stops.filter((s) => s && s.trim()), passengers: pax, adults: f.service_type === "tour" ? pax : undefined,
        extra_luggage: Number(f.extra_luggage) || 0, car_seats: Number(f.car_seats) || 0, days: 1,
        notes: f.notes || null, payment_method: "stripe", tip_amount: 0,
      };
      const { data } = await api.post("/admin/quotes", { payload, text_guest: !!f.customer_phone?.trim() });
      toast.success(`Quote ${data.id} sent · ${money(data.total)}${data.text_sent ? " · texted" : ""}`);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't create the quote");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, passengers: Number(f.passengers) || 1, total: Number(f.total) || 0,
        extra_luggage: Number(f.extra_luggage) || 0, luggage_price: Number(f.luggage_price) || 0,
        car_seats: Number(f.car_seats) || 0, stops: f.stops.filter((s) => s && s.trim()),
        item_name: f.item_name || (f.service_type === "taxi" ? `Taxi: ${f.pickup_location || "pickup"} → ${f.dropoff_location || "drop-off"}` : f.item_name),
        send_pay_link: f.payment === "unpaid" && f.send_pay_link,
        text_pay_link: f.payment === "unpaid" && !!f.text_pay_link && !!f.customer_phone.trim() };
      if (f.service_type === "cable_beach" && !body.item_name) body.item_name = "Cable Beach Day";
      const { data } = await api.post("/admin/bookings/manual", body);
      const extra = [];
      if (data.report?.confirmation?.email?.sent) extra.push("confirmation sent");
      if (data.report?.pay_link?.sent) extra.push("pay link sent");
      if (data.report?.pay_text?.sent) extra.push("pay link texted");
      else if (data.report?.pay_text?.error) toast.error(`Pay link text failed: ${data.report.pay_text.error}`);
      toast.success(`Booking ${data.booking.id} created${extra.length ? ` · ${extra.join(" · ")}` : ""}`);
      onCreated(data.booking);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose} data-testid="new-booking-dialog">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-[#D4A94A] font-black">{initial ? `Repeat booking ${initial.id}` : "Add booking"}</div>
            <h3 className="font-[Georgia] text-xl text-[#0B3B5C] mt-1">{initial ? "Pick the new date — everything else is copied" : "New booking (phone, WhatsApp, walk-in)"}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#64748B]" data-testid="new-booking-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Service">
            <select value={f.service_type} onChange={(e) => setF((x) => ({ ...x, service_type: e.target.value, item_id: "", item_name: "" }))} className={input} data-testid="new-booking-service">
              {SERVICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          {items.length > 0 ? (
            <Field label="Item">
              <select value={f.item_id} onChange={pickItem} className={input} data-testid="new-booking-item">
                <option value="">Optional — choose or leave blank…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Description">
              <input value={f.item_name} onChange={set("item_name")} className={input} placeholder={f.service_type === "cable_beach" ? "Cable Beach Day" : "e.g. Private charter"} data-testid="new-booking-item-name" required={f.service_type !== "cable_beach"} />
            </Field>
          )}
          <Field label="Guest name"><input value={f.customer_name} onChange={set("customer_name")} className={input} required data-testid="new-booking-name" /></Field>
          <Field label="Email"><input type="email" value={f.customer_email} onChange={set("customer_email")} className={input} data-testid="new-booking-email" /></Field>
          <Field label="Phone"><input value={f.customer_phone} onChange={set("customer_phone")} className={input} data-testid="new-booking-phone" /></Field>
          <Field label="Date & time"><input type="datetime-local" value={f.booking_date} onChange={set("booking_date")} className={input} required data-testid="new-booking-date" /></Field>
          <Field label="Pickup"><LocationSelect value={f.pickup_location} onChange={(v) => setF((x) => ({ ...x, pickup_location: v }))} places={places} testid="new-booking-pickup" /></Field>
          <Field label="Drop-off"><LocationSelect value={f.dropoff_location} onChange={(v) => setF((x) => ({ ...x, dropoff_location: v }))} places={places} testid="new-booking-dropoff" /></Field>
          {f.service_type === "taxi" && (
            <div className="sm:col-span-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2" data-testid="new-booking-stops">
              {f.stops.map((s, n) => (
                <div key={n} className="flex gap-2 items-start">
                  <div className="flex-1"><Field label={`Stop ${n + 1}`}><LocationSelect value={s} onChange={(v) => setF((x) => ({ ...x, stops: x.stops.map((y, k) => (k === n ? v : y)), trip_legs: [] }))} places={places} testid={`new-booking-stop-${n}`} /></Field></div>
                  <button type="button" onClick={() => setF((x) => ({ ...x, stops: x.stops.filter((_, k) => k !== n), trip_legs: [] }))} className="mt-5 w-9 h-9 rounded-full border border-[#E2E8F0] text-[#DC2626]" data-testid={`new-booking-stop-remove-${n}`}>×</button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setF((x) => ({ ...x, stops: [...x.stops, ""], trip_legs: [] }))} className="text-xs font-bold text-[#0B3B5C] rounded-full border border-dashed border-[#0B3B5C]/40 px-3 py-1.5" data-testid="new-booking-add-stop">+ Add a stop</button>
                <button type="button" onClick={priceRoute} disabled={pricing} className="text-xs font-bold text-white bg-[#0B3B5C] rounded-full px-3 py-1.5 disabled:opacity-60" data-testid="new-booking-price-route">{pricing ? "Pricing…" : "Calculate price"}</button>
                <span className="text-[11px] text-[#64748B] self-center">Fixed routes use your set fares; other addresses use your distance rate.</span>
              </div>
              {f.trip_legs.length > 0 && f.trip_legs.map((lg, n) => (
                <div key={n} className="flex items-center justify-between gap-2 text-xs" data-testid={`new-booking-leg-${n}`}>
                  <span className="text-[#0B3B5C]">Leg {n + 1}: {lg.from} → {lg.to} <span className="text-[#94a3b8]">({lg.route})</span></span>
                  <input type="number" step="0.5" min="0" value={lg.fare} onChange={(e) => setLeg(n, e.target.value)} className="w-24 px-2 py-1 border border-[#E2E8F0] rounded text-right" data-testid={`new-booking-leg-fare-${n}`} />
                </div>
              ))}
            </div>
          )}
          <Field label="Passengers"><input type="number" min="1" max="60" value={f.passengers} onChange={set("passengers")} className={input} data-testid="new-booking-passengers" /></Field>
          <Field label="Flight # (optional)"><input value={f.flight_number} onChange={set("flight_number")} className={input} data-testid="new-booking-flight" /></Field>
          <Field label="Extra bags"><input type="number" min="0" max="30" value={f.extra_luggage} onChange={setLuggage("extra_luggage")} className={input} data-testid="new-booking-luggage-count" /></Field>
          <Field label={`Price per bag ($)${luggageFee ? ` · luggage ${luggageFee.toFixed(2)}` : ""}`}><input type="number" min="0" step="0.5" value={f.luggage_price} onChange={setLuggage("luggage_price")} className={input} data-testid="new-booking-luggage-price" /></Field>
          {f.service_type === "taxi" && <Field label="Baby car seats ($2 each)"><input type="number" min="0" max="4" value={f.car_seats} onChange={setSeats} className={input} data-testid="new-booking-car-seats" /></Field>}
          {f.service_type === "taxi" && (
            <label className="flex items-center gap-2 text-sm text-[#0B3B5C] self-end pb-2" data-testid="new-booking-bridge-toll">
              <input type="checkbox" checked={!!f.bridge_toll} onChange={setToll} data-testid="new-booking-bridge-toll-checkbox" />
              Paradise Island bridge toll pass (+$2)
            </label>
          )}
          <Field label="Total ($, includes luggage)"><input type="number" step="0.01" min="0" value={f.total} onChange={set("total")} className={input} required data-testid="new-booking-total" /></Field>
          <Field label="Payment">
            <select value={f.payment} onChange={set("payment")} className={input} data-testid="new-booking-payment">
              <option value="unpaid">Not paid yet (card)</option>
              <option value="cash">Paid — cash</option>
              <option value="zelle">Paid — Zelle</option>
              <option value="card_offline">Paid — card in person</option>
            </select>
          </Field>
        </div>
        <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} className={input} data-testid="new-booking-notes" /></Field>
        <div className="flex flex-col gap-2 text-sm text-[#0B3B5C]">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.send_confirmation} onChange={set("send_confirmation")} data-testid="new-booking-send-confirmation" /> Email + text the guest a confirmation</label>
          {f.payment === "unpaid" && (
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.send_pay_link} onChange={set("send_pay_link")} data-testid="new-booking-send-paylink" /> Email the guest a payment link (with option to add a driver tip)</label>
          )}
          {f.payment === "unpaid" && (
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!f.text_pay_link} onChange={set("text_pay_link")} data-testid="new-booking-text-paylink" /> Text the guest a tap-to-pay link {!f.customer_phone?.trim() && <span className="text-xs text-[#94a3b8]">(add a phone number)</span>}</label>
          )}
        </div>
        <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0B3B5C] text-white py-2.5 text-sm font-bold disabled:opacity-60" data-testid="new-booking-submit">
          <Plus className="w-4 h-4" /> {busy ? "Creating…" : "Create booking"}
        </button>
        {["taxi", "tour", "rental"].includes(f.service_type) && (
          <button type="button" onClick={sendQuote} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-[#0B3B5C] text-[#0B3B5C] py-2.5 text-sm font-bold disabled:opacity-60" data-testid="new-booking-send-quote">
            Send as quote instead (guest can change people, then pay)
          </button>
        )}
      </form>
    </div>
  );
}
