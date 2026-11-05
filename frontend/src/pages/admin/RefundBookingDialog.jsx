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

  useEffect(() => {
    api.get(`/admin/bookings/${booking.id}/refundable`)
      .then(({ data }) => { setInfo(data); setAmount(data.amount ? String(data.amount) : ""); })
      .catch(() => setInfo({ refundable: false }));
  }, [booking.id]);

  const amt = Number(amount);
  const bad = !(amt > 0) || amt > (info?.amount || 0) + 0.001;

  const submit = async () => {
    if (bad) { toast.error(`Refund must be between $0.01 and ${money(info.amount)}`); return; }
    if (!window.confirm(`Refund ${money(amt)} to ${booking.customer_name || "the guest"}'s card? This can't be undone.`)) return;
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
            <h3 className="font-[Georgia] text-xl text-[#0B3B5C] mt-1">{booking.id} · {booking.customer_name}</h3>
            <div className="text-xs text-[#64748B] mt-0.5">The booking stays active. Use Cancel instead to cancel and refund.</div>
          </div>
          <button type="button" onClick={onClose} className="text-[#64748B]" data-testid="refund-dialog-close"><X className="w-5 h-5" /></button>
        </div>
        {info === null ? (
          <div className="text-xs text-[#94a3b8]">Checking payment…</div>
        ) : !info.refundable ? (
          <div className="text-sm text-[#94a3b8]" data-testid="refund-dialog-none">Nothing left to refund by card on this booking (cash, Zelle or already refunded).</div>
        ) : (
          <>
            <div className="text-sm text-[#0B3B5C] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 space-y-2">
              <div>Can refund up to <strong data-testid="refund-dialog-max">{money(info.amount)}</strong> via {info.provider === "stripe" ? "Stripe (card)" : info.provider}</div>
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
      </div>
    </div>
  );
}
