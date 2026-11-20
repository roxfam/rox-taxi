import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, X } from "lucide-react";
import { api, money } from "../../lib/api";

export default function RefundBookingDialog({ booking, onClose, onDone }) {
  const [info, setInfo] = useState(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mAmt, setMAmt] = useState("");
  const [mMethod, setMMethod] = useState("cash");

  useEffect(() => {
    api.get(`/admin/bookings/${booking.id}/refundable`)
      .then(({ data }) => { setInfo(data); setAmount(data.amount ? String(data.amount) : ""); setMAmt(data.manual_max ? String(data.manual_max) : ""); })
      .catch((e) => setInfo({ refundable: false, missing: e?.response?.status === 404 }));
  }, [booking.id]);

  const recordManual = async () => {
    const v = Number(mAmt);
    if (!(v > 0) || v > (info.manual_max || 0) + 0.001) { toast.error(`Enter between $0.01 and ${money(info.manual_max)}`); return; }
    if (!window.confirm(`Record a ${money(v)} ${mMethod.replace("_", " ")} refund for ${info.booking_id}? Do this only after you've paid the guest back.`)) return;
    setBusy(true);
    try {
      await api.post(`/admin/bookings/${info.booking_id}/refund-manual`, { amount: Math.round(v * 100) / 100, method: mMethod, reason });
      toast.success(`Recorded ${money(v)} refund`);
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't record the refund");
    } finally {
      setBusy(false);
    }
  };

  const amt = Number(amount);
  const bad = !(amt > 0) || amt > (info?.amount || 0) + 0.001;

  const provLabel = info?.provider === "paypal" ? "PayPal" : "Stripe (card)";
  const submit = async () => {
    if (bad) { toast.error(`Refund must be between $0.01 and ${money(info.amount)}`); return; }
    if (!window.confirm(`Refund ${money(amt)} to ${booking.customer_name || "the guest"} via ${provLabel}? This can't be undone.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/refund`, {
        amount: Math.round(amt * 100) / 100, reason, notify_guest: notify,
      });
      if (data.ok) {
        toast.success(`Refunded ${money(data.amount)}${data.guest_notified ? " · guest notified" : ""}`);
        onDone();
      } else {
        toast.error(`Refund not completed: ${data.refund?.error || data.payment_status || "check Stripe"}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Refund failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose} data-testid="refund-booking-dialog">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-[#7C3AED] font-black">Issue refund</div>
            <h3 className="font-[Georgia] text-xl text-[#0B3B5C] mt-1">{info?.booking_id || booking.id} · {booking.customer_name || info?.customer_name || ""}</h3>
            {info?.item_name && <div className="text-xs text-[#0B3B5C]">{info.item_name} · paid {money(info.total)} · {info.payment_status}</div>}
            <div className="text-xs text-[#64748B] mt-0.5">Policy is credit-only; card refunds are at your discretion. The booking stays active (use Cancel to cancel).</div>
          </div>
          <button type="button" onClick={onClose} className="text-[#64748B]" data-testid="refund-dialog-close"><X className="w-5 h-5" /></button>
        </div>
        {info === null ? (
          <div className="text-xs text-[#94a3b8]">Checking payment…</div>
        ) : info.missing ? (
          <div className="text-sm text-[#DC2626]" data-testid="refund-dialog-not-found">No booking with ID {booking.id}.</div>
        ) : !info.refundable ? (
          <div className="text-sm text-[#94a3b8]" data-testid="refund-dialog-none">Nothing to refund online through Stripe or PayPal{info.manual_max > 0 ? " — record a cash or Zelle refund below." : "."}</div>
        ) : (
          <>
            <div className="text-sm text-[#0B3B5C] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 space-y-2">
              <div>Can refund up to <strong data-testid="refund-dialog-max">{money(info.amount)}</strong> via {provLabel}</div>
              {info.fee_kept > 0 && <div className="text-[11px] text-[#64748B]" data-testid="refund-dialog-fee-kept">Processing fee and gratuity ({money(info.fee_kept)}) are kept (non-refundable).</div>}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#64748B]">Refund $</span>
                <input type="number" step="0.01" min="0.01" max={info.amount} value={amount} onChange={(e) => setAmount(e.target.value)}
                  className={`w-28 px-2 py-1 border rounded text-sm ${bad ? "border-red-400" : "border-[#E2E8F0]"}`} data-testid="refund-dialog-amount" />
                <button type="button" onClick={() => setAmount(String(info.amount))} className="text-xs underline text-[#047857]" data-testid="refund-dialog-full">Full</button>
                <button type="button" onClick={() => setAmount(String(Math.round(info.amount * 50) / 100))} className="text-xs underline text-[#047857]" data-testid="refund-dialog-half">Half</button>
              </div>
            </div>
            <label className="block text-xs text-[#64748B] font-semibold">
              Reason (optional, shown to guest)
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Driver arrived late — sorry!"
                className="mt-1 w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm" data-testid="refund-dialog-reason" />
            </label>
            <label className="flex items-center gap-2 text-sm text-[#0B3B5C]">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} data-testid="refund-dialog-notify" />
              Email + text the guest that a refund is on its way
            </label>
            <button type="button" onClick={submit} disabled={busy || bad}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#7C3AED] text-white py-2.5 text-sm font-bold disabled:opacity-60"
              data-testid="refund-dialog-submit">
              <RotateCcw className="w-4 h-4" /> {busy ? "Refunding…" : `Refund ${amt > 0 ? money(amt) : ""}`}
            </button>
          </>
        )}
        {info?.manual_max > 0 && (
          <div className="border-t border-[#E2E8F0] pt-3 space-y-2" data-testid="refund-dialog-manual">
            <div className="text-xs font-semibold text-[#0B3B5C]">Or record a refund you paid another way</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#64748B]">$</span>
              <input type="number" step="0.01" min="0.01" value={mAmt} onChange={(e) => setMAmt(e.target.value)} className="w-24 px-2 py-1 border border-[#E2E8F0] rounded text-sm" data-testid="refund-dialog-manual-amount" />
              <select value={mMethod} onChange={(e) => setMMethod(e.target.value)} className="border border-[#E2E8F0] rounded text-sm py-1 px-1" data-testid="refund-dialog-manual-method">
                <option value="cash">Cash</option><option value="zelle">Zelle</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option>
              </select>
              <button type="button" onClick={recordManual} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border border-[#7C3AED] text-[#6D28D9] font-semibold disabled:opacity-60" data-testid="refund-dialog-manual-submit">Record refund</button>
            </div>
            <div className="text-[11px] text-[#94a3b8]">Up to {money(info.manual_max)}{info.fee_kept > 0 ? ` (processing fee and gratuity ${money(info.fee_kept)} are kept)` : ""}. This only records it; no money is sent.</div>
          </div>
        )}
      </div>
    </div>
  );
}
