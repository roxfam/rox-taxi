import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { api, money } from "../lib/api";

const BUYER = [
  ["customer_name", "Your name", "text", true],
  ["customer_email", "Your email", "email", true],
  ["customer_phone", "Your phone / WhatsApp", "tel", true],
];
const TRIP = [
  ["pickup_location", "Pickup (hotel or cruise pier)", "text", false],
  ["cruise_ship", "Cruise ship (optional)", "text", false],
];
const GIFT = [
  ["gift_recipient_name", "Friend's name", "text", true],
  ["gift_recipient_email", "Friend's email", "email", true],
];
const inp = "mt-1 w-full rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm text-[#0B3B5C] normal-case tracking-normal font-normal focus:border-[#D4A94A] focus:outline-none";
const lbl = "block text-[11px] uppercase tracking-[.16em] text-[#64748B] font-semibold";

export const BundleBookDialog = ({ bundle, onClose }) => {
  const nav = useNavigate();
  const [form, setForm] = useState({ customer_name: "", customer_email: "", customer_phone: "", booking_date: "", pickup_location: "", cruise_ship: "", notes: "", is_gift: false, gift_recipient_name: "", gift_recipient_email: "", gift_message: "" });
  const [busy, setBusy] = useState(false);
  const vat = Math.round(bundle.bundle_price * 10) / 100;
  const gift = form.is_gift;
  const field = ([k, l, t, req]) => (
    <label key={k} className={lbl}>{l}
      <input type={t} required={req} value={form[k]} min={t === "date" ? new Date().toISOString().slice(0, 10) : undefined}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inp} data-testid={`bundle-book-${k}`} />
    </label>
  );
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post(`/bundles/${bundle.id}/book`, form);
      nav(`/pay/${data.booking_id}`);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Please check your details");
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto" data-testid="bundle-book-dialog">
        <DialogHeader><DialogTitle className="serif text-2xl text-[#0B3B5C]">{bundle.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-[#FBF7EF] p-1 text-sm font-semibold" data-testid="bundle-gift-toggle">
            {[[false, "For me"], [true, "Send as a gift"]].map(([v, l]) => (
              <button key={l} type="button" onClick={() => setForm({ ...form, is_gift: v })}
                className={`rounded-full py-2 inline-flex items-center justify-center gap-1.5 transition-colors ${gift === v ? "bg-[#0B3B5C] text-white" : "text-[#0B3B5C]"}`}
                data-testid={v ? "bundle-mode-gift" : "bundle-mode-self"}>
                {v && <Gift className="w-3.5 h-3.5" />}{l}
              </button>
            ))}
          </div>
          {BUYER.map(field)}
          {gift && (
            <div className="rounded-2xl border border-[#D4A94A]/40 bg-[#FBF7EF]/60 p-3 space-y-3" data-testid="bundle-gift-fields">
              {GIFT.map(field)}
              <label className={lbl}>Personal message
                <textarea rows={3} maxLength={400} value={form.gift_message} onChange={(e) => setForm({ ...form, gift_message: e.target.value })}
                  placeholder="Happy birthday! Enjoy the island…" className={inp} data-testid="bundle-book-gift_message" />
              </label>
              <p className="text-[11px] text-[#64748B]">We email your friend their gift and message as soon as payment goes through.</p>
            </div>
          )}
          {field(["booking_date", gift ? "Date (optional, they can choose later)" : "Date", "date", !gift])}
          {!gift && TRIP.map(field)}
          <div className="rounded-xl bg-[#FBF7EF] p-3 text-sm text-[#0B3B5C] space-y-1" data-testid="bundle-book-summary">
            <div className="flex justify-between"><span>Bundle</span><span className="font-mono">{money(bundle.bundle_price)}</span></div>
            <div className="flex justify-between text-[#64748B]"><span>VAT 10%</span><span className="font-mono">{money(vat)}</span></div>
            <div className="flex justify-between font-bold"><span>Total</span><span className="font-mono" data-testid="bundle-book-total">{money(bundle.bundle_price + vat)}</span></div>
          </div>
          <button type="submit" disabled={busy} className="w-full rounded-full bg-[#0B3B5C] hover:bg-[#082941] text-white font-bold py-3 disabled:opacity-60 transition-colors" data-testid="bundle-book-submit">
            {busy ? "Creating booking…" : gift ? "Continue to pay for gift" : "Continue to payment"}
          </button>
          <p className="text-[11px] text-center text-[#94a3b8]">Pay by card or PayPal on the next step.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
};
