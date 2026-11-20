import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { api, money } from "../../lib/api";
import { normalizePhone } from "../../lib/phone";

const inp = "w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm";
const Field = ({ label, children }) => <label className="block text-xs text-[#64748B] font-semibold">{label}<div className="mt-1">{children}</div></label>;

const pick = (q) => ({
  customer_name: q.customer_name || "", customer_email: q.customer_email || "", customer_phone: q.customer_phone || "",
  booking_date: (q.booking_date || "").slice(0, 16), pickup_location: q.pickup_location || "", dropoff_location: q.dropoff_location || "",
  passengers: q.passengers || q.payload?.passengers || 1, notes: q.payload?.notes || "", dropoff_time: q.dropoff_time || "",
  item_name: q.item_name || "", trip_cost: q.trip_cost ?? q.payload?.trip_cost ?? "", per_person: !!(q.per_person ?? q.payload?.per_person),
  deposit_pct: q.deposit_pct ?? q.payload?.deposit_pct ?? "", no_vat: !!q.no_vat, processing_fee_on: q.processing_fee_on ?? q.payload?.processing_fee_on ?? ((q.lines || []).some((l) => /processing/i.test(l.label)) || null),
  tip_amount: q.payload?.tip_amount || "",
});

export default function EditQuoteDialog({ qid, onClose, onSaved }) {
  const [q, setQ] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/admin/quotes/${qid}`).then(({ data }) => { setQ(data); setF(pick(data)); }).catch(() => { toast.error("Quote not found"); onClose(); });
  }, [qid, onClose]);
  if (!q || !f) return null;
  const manual = q.kind === "manual";
  const editable = ["open", "expired"].includes(q.status) && ["manual", "booking"].includes(q.kind);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, passengers: Number(f.passengers) || 1, tip_amount: Number(f.tip_amount) || 0,
        trip_cost: f.trip_cost === "" ? null : Number(f.trip_cost), deposit_pct: Number(f.deposit_pct) || 0 };
      const { data } = await api.put(`/admin/quotes/${qid}`, body);
      toast.success(`Quote ${qid} updated \u00b7 ${money(data.total)}`);
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save the quote");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose} data-testid="edit-quote-dialog">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-[#D4A94A] font-black">Quote {q.id} · {q.status}</div>
            <h3 className="font-[Georgia] text-xl text-[#0B3B5C] mt-1">{q.item_name}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#64748B]" data-testid="edit-quote-close"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs space-y-1" data-testid="edit-quote-lines">
          {(q.lines || []).map((l) => <div key={l.label} className="flex justify-between"><span>{l.label}</span><span className="mono">{money(l.amount)}</span></div>)}
          <div className="flex justify-between font-bold text-[#0B3B5C] pt-1 border-t border-[#E2E8F0]"><span>Total</span><span className="mono" data-testid="edit-quote-total">{money(q.total)}</span></div>
        </div>
        {!editable ? (
          <p className="text-xs text-[#94a3b8]" data-testid="edit-quote-readonly">This quote is {q.status === "open" || q.status === "expired" ? "a Cable Beach quote" : q.status} and can only be viewed.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Guest name"><input value={f.customer_name} onChange={set("customer_name")} className={inp} data-testid="edit-quote-name" /></Field>
              <Field label="Email"><input value={f.customer_email} onChange={set("customer_email")} className={inp} data-testid="edit-quote-email" /></Field>
              <Field label="Phone"><input value={f.customer_phone} onChange={set("customer_phone")} onBlur={() => setF({ ...f, customer_phone: normalizePhone(f.customer_phone) })} className={inp} data-testid="edit-quote-phone" /></Field>
              <Field label="Date & time"><input type="datetime-local" value={f.booking_date} onChange={set("booking_date")} className={inp} data-testid="edit-quote-date" /></Field>
              <Field label="Pickup"><input value={f.pickup_location} onChange={set("pickup_location")} className={inp} data-testid="edit-quote-pickup" /></Field>
              <Field label="Drop-off"><input value={f.dropoff_location} onChange={set("dropoff_location")} className={inp} data-testid="edit-quote-dropoff" /></Field>
              <Field label="People"><input type="number" min="1" value={f.passengers} onChange={set("passengers")} className={inp} data-testid="edit-quote-pax" /></Field>
              {q.service_type === "tour" && <Field label="Tour drop-off time"><input type="time" value={f.dropoff_time} onChange={set("dropoff_time")} className={inp} data-testid="edit-quote-dropoff-time" /></Field>}
              {manual && <Field label="Trip name"><input value={f.item_name} onChange={set("item_name")} className={inp} data-testid="edit-quote-item" /></Field>}
              {manual && <Field label="Trip cost ($)"><input type="number" min="0" step="0.01" value={f.trip_cost} onChange={set("trip_cost")} className={inp} data-testid="edit-quote-cost" /></Field>}
              {manual && <Field label="Deposit %"><input type="number" min="0" max="90" value={f.deposit_pct} onChange={set("deposit_pct")} className={inp} data-testid="edit-quote-deposit" /></Field>}
              <Field label="Gratuity ($)"><input type="number" min="0" step="0.01" value={f.tip_amount} onChange={set("tip_amount")} className={inp} data-testid="edit-quote-tip" /></Field>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-[#0B3B5C]">
              {manual && <label className="flex items-center gap-2"><input type="checkbox" checked={f.per_person} onChange={set("per_person")} data-testid="edit-quote-per-person" />Price per person</label>}
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.no_vat} onChange={set("no_vat")} data-testid="edit-quote-no-vat" />No VAT</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.processing_fee_on ?? (q.lines || []).some((l) => /processing/i.test(l.label))} onChange={(e) => setF({ ...f, processing_fee_on: e.target.checked })} data-testid="edit-quote-processing" />Processing fee</label>
            </div>
            <Field label="Notes"><textarea value={f.notes} onChange={set("notes")} rows={2} className={inp} data-testid="edit-quote-notes" /></Field>
            <p className="text-[11px] text-[#64748B]">Saving re-prices the quote and gives it another 48 hours. The guest&apos;s quote link stays the same.</p>
            <button type="button" onClick={save} disabled={busy} className="w-full rounded-full bg-[#0B3B5C] text-white py-2.5 text-sm font-bold disabled:opacity-60" data-testid="edit-quote-save">{busy ? "Saving\u2026" : "Save quote"}</button>
          </>
        )}
      </div>
    </div>
  );
}
