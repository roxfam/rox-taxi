import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { api } from "../../lib/api";

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
  total: "", payment: "unpaid", send_confirmation: true, send_pay_link: true,
};

const input = "w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#0B3B5C]";

function Field({ label, children }) {
  return <label className="block text-xs text-[#64748B] font-semibold">{label}<div className="mt-1">{children}</div></label>;
}

export default function NewBookingDialog({ onClose, onCreated }) {
  const [f, setF] = useState(EMPTY);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  useEffect(() => {
    const svc = SERVICES.find((s) => s.key === f.service_type);
    if (!svc?.path) { setItems([]); return; }
    api.get(svc.path).then(({ data }) => setItems(Array.isArray(data) ? data : data?.items || [])).catch(() => setItems([]));
  }, [f.service_type]);

  const pickItem = (e) => {
    const it = items.find((x) => x.id === e.target.value);
    setF((x) => ({ ...x, item_id: it?.id || "", item_name: it?.name || "", total: x.total || (it?.price ?? it?.price_per_day ?? "") }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...f, passengers: Number(f.passengers) || 1, total: Number(f.total) || 0,
        send_pay_link: f.payment === "unpaid" && f.send_pay_link };
      if (f.service_type === "cable_beach" && !body.item_name) body.item_name = "Cable Beach Day";
      const { data } = await api.post("/admin/bookings/manual", body);
      const extra = [];
      if (data.report?.confirmation?.email?.sent) extra.push("confirmation sent");
      if (data.report?.pay_link?.sent) extra.push("pay link sent");
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
            <div className="text-[10px] tracking-[0.25em] uppercase text-[#D4A94A] font-black">Add booking</div>
            <h3 className="font-[Georgia] text-xl text-[#0B3B5C] mt-1">New booking (phone, WhatsApp, walk-in)</h3>
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
              <select value={f.item_id} onChange={pickItem} className={input} data-testid="new-booking-item" required>
                <option value="">Choose…</option>
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
          <Field label="Pickup"><input value={f.pickup_location} onChange={set("pickup_location")} className={input} data-testid="new-booking-pickup" /></Field>
          <Field label="Drop-off"><input value={f.dropoff_location} onChange={set("dropoff_location")} className={input} data-testid="new-booking-dropoff" /></Field>
          <Field label="Passengers"><input type="number" min="1" max="60" value={f.passengers} onChange={set("passengers")} className={input} data-testid="new-booking-passengers" /></Field>
          <Field label="Flight # (optional)"><input value={f.flight_number} onChange={set("flight_number")} className={input} data-testid="new-booking-flight" /></Field>
          <Field label="Total ($)"><input type="number" step="0.01" min="0" value={f.total} onChange={set("total")} className={input} required data-testid="new-booking-total" /></Field>
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
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={f.send_pay_link} onChange={set("send_pay_link")} data-testid="new-booking-send-paylink" /> Email the guest a payment link</label>
          )}
        </div>
        <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0B3B5C] text-white py-2.5 text-sm font-bold disabled:opacity-60" data-testid="new-booking-submit">
          <Plus className="w-4 h-4" /> {busy ? "Creating…" : "Create booking"}
        </button>
      </form>
    </div>
  );
}
