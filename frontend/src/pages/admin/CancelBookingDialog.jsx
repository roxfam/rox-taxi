import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, X } from "lucide-react";
import { api, money } from "../../lib/api";

export default function CancelBookingDialog({ booking, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [refundInfo, setRefundInfo] = useState(null);
  const [refund, setRefund] = useState(true);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/admin/bookings/${booking.id}/refundable`)
      .then(({ data }) => { setRefundInfo(data); setAmount(data.amount ? String(data.amount) : ""); })
      .catch(() => setRefundInfo({ refundable: false }));
  }, [booking.id]);

  const canRefund = !!refundInfo?.refundable;

  const amt = Number(amount);
  const amountBad = canRefund && refund && (!(amt > 0) || amt > (refundInfo?.amount || 0) + 0.001);
  const fee = canRefund && refund && amt > 0 ? Math.max(0, (refundInfo.amount || 0) - amt) : 0;

  const submit = async () => {
    if (amountBad) {
      toast.error(`Refund must be between $0.01 and ${money(refundInfo.amount)}`);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/cancel`, {
        reason, notify_guest: notify, refund: canRefund && refund,
        refund_amount: canRefund && refund ? Math.round(amt * 100) / 100 : null,
      });
      const parts = [`Cancelled ${booking.id}`];
      if (data.guest_notified) parts.push("guest notified");
      if (data.refund) {
        if (data.refund.ok && data.refund.refund?.refunded) parts.push(`refunded ${money(data.refund.amount)}`);
        else toast.error(`Refund not completed: ${data.refund.error || data.refund.refund?.error || data.refund.payment_status || "check Payments"}`);
      }
      toast.success(parts.join(" · "));
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose} data-testid="cancel-booking-dialog">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-[#E86A3C] font-black">Cancel booking</div>
            <h3 className="font-[Georgia] text-xl text-[#0B3B5C] mt-1">{booking.id} · {booking.customer_name}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#64748B]" data-testid="cancel-dialog-close"><X className="w-5 h-5" /></button>
        </div>
        <label className="block text-xs text-[#64748B] font-semibold">
          Reason (optional, shown to guest)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
            className="mt-1 w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm" data-testid="cancel-dialog-reason" />
        </label>
        <label className="flex items-center gap-2 text-sm text-[#0B3B5C]">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} data-testid="cancel-dialog-notify" />
          Email + text the guest about the cancellation
        </label>
        {refundInfo === null ? (
          <div className="text-xs text-[#94a3b8]">Checking payment…</div>
        ) : canRefund ? (
          <div className="text-sm text-[#0B3B5C] bg-[#059669]/5 border border-[#059669]/30 rounded-lg p-3 space-y-2" data-testid="cancel-dialog-refund-row">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} data-testid="cancel-dialog-refund" />
              Refund to the guest's card ({refundInfo.provider}) · paid {money(refundInfo.amount)}
            </label>
            {refund && (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <span className="text-xs text-[#64748B]">Refund $</span>
                <input type="number" step="0.01" min="0.01" max={refundInfo.amount} value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`w-28 px-2 py-1 border rounded text-sm ${amountBad ? "border-red-400" : "border-[#E2E8F0]"}`}
                  data-testid="cancel-dialog-refund-amount" />
                <button type="button" onClick={() => setAmount(String(refundInfo.amount))} className="text-xs underline text-[#047857]" data-testid="cancel-dialog-refund-full">Full</button>
                {fee > 0.004 && <span className="text-xs text-[#B47F26] font-semibold" data-testid="cancel-dialog-fee">You keep {money(fee)} as cancellation fee</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-[#94a3b8]" data-testid="cancel-dialog-no-refund">No card payment to refund on this booking.</div>
        )}
        <button type="button" onClick={submit} disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] text-white py-2.5 text-sm font-bold disabled:opacity-60"
          data-testid="cancel-dialog-submit">
          <Ban className="w-4 h-4" /> {busy ? "Working…" : canRefund && refund ? `Cancel & refund ${amt > 0 ? money(amt) : ""}` : "Cancel booking"}
        </button>
      </div>
    </div>
  );
}
