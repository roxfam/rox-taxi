import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Ban, Trash2, Copy, MailCheck, RotateCcw, CreditCard, Unlock, X, Car, UserX } from "lucide-react";
import { api } from "../../lib/api";
import CancelBookingDialog from "./CancelBookingDialog";
import RefundBookingDialog from "./RefundBookingDialog";
import SendToDriverDialog from "./SendToDriverDialog";

const btn = "inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold px-2 py-1 rounded transition-colors disabled:opacity-50";

export default function BookingRowActions({ booking, onEdit, onRepeat, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const cancelled = booking.status === "cancelled";
  const refundable = ["paid", "partially_refunded"].includes(booking.payment_status);
  const held = booking.card_auth?.status === "held";
  const request = booking.cancel_request?.status === "pending" && !cancelled;
  const refundAsk = booking.refund_request?.status === "pending";

  const run = async (fn, ok) => {
    setBusy(true);
    try { const r = await fn(); toast.success(ok(r.data)); onChanged(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Something went wrong"); }
    finally { setBusy(false); }
  };

  const charge = () => {
    const v = window.prompt(`Charge the held card (up to $${booking.card_auth.amount.toFixed(2)}):`, booking.card_auth.amount.toFixed(2));
    if (v === null) return;
    run(() => api.post(`/admin/bookings/${booking.id}/card-auth/capture`, { amount: Number(v) }), (d) => `Charged $${d.captured.toFixed(2)}`);
  };
  const release = () => {
    if (!window.confirm(`Release the $${booking.card_auth.amount.toFixed(2)} hold? The guest won't be charged.`)) return;
    run(() => api.post(`/admin/bookings/${booking.id}/card-auth/release`), () => "Hold released");
  };
  const decline = () => {
    if (!window.confirm("Decline this cancellation request? The booking stays active.")) return;
    run(() => api.post(`/admin/bookings/${booking.id}/cancel-request/decline`), () => "Request declined");
  };
  const declineRefund = () => {
    if (!window.confirm("Decline this refund request? The guest is told by email + text.")) return;
    run(() => api.post(`/admin/bookings/${booking.id}/refund-request/decline`), () => "Refund request declined");
  };
  const [driverOpen, setDriverOpen] = useState(false);
  const noShow = () => {
    if (!window.confirm(`Mark ${booking.id} as a no-show? No refund is given and the guest is told by email + text.`)) return;
    run(() => api.post(`/admin/bookings/${booking.id}/no-show`), () => "Marked as no-show");
  };

  const sendConfirm = async () => {
    if (!booking.customer_email && !booking.customer_phone) {
      toast.error("No guest email or phone on this booking");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/send-confirmation`);
      const parts = [];
      if (data.email_sent) parts.push("email");
      if (data.sms_sent) parts.push("text");
      if (parts.length) toast.success(`Confirmation sent by ${parts.join(" + ")}`);
      else toast.error(`Not sent: ${data.error || "check email/SMS settings"}`);
      onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => setCancelOpen(true);

  const remove = async () => {
    if (!window.confirm(`Delete booking ${booking.id} for ${booking.customer_name || "guest"}? It will be removed from the list (an archive copy is kept).`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/bookings/${booking.id}`);
      toast.success(`Deleted ${booking.id}`);
      onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap gap-1" data-testid={`admin-row-actions-${booking.id}`}>
      {request && (
        <div className="w-full flex flex-wrap items-center gap-1 rounded bg-[#FEF3C7] px-2 py-1 text-[10px] text-[#92400E]" data-testid={`admin-row-cancel-request-${booking.id}`}>
          <span className="font-bold">Guest asked to cancel</span>
          <span>{booking.cancel_request.hours_notice}h before · policy fee ${Number(booking.cancel_request.suggested_fee || 0).toFixed(2)}</span>
          <button type="button" onClick={() => setCancelOpen(true)} disabled={busy} className="underline font-bold" data-testid={`admin-row-approve-cancel-${booking.id}`}>Approve &amp; refund</button>
          <button type="button" onClick={decline} disabled={busy} className="inline-flex items-center underline" data-testid={`admin-row-decline-cancel-${booking.id}`}><X className="w-3 h-3" />Decline</button>
        </div>
      )}
      {refundAsk && (
        <div className="w-full flex flex-wrap items-center gap-1 rounded bg-[#EDE9FE] px-2 py-1 text-[10px] text-[#5B21B6]" data-testid={`admin-row-refund-request-${booking.id}`}>
          <span className="font-bold">Guest asked for {booking.refund_request.amount ? `$${Number(booking.refund_request.amount).toFixed(2)}` : "a refund"}</span>
          <span className="truncate max-w-[220px]">“{booking.refund_request.reason}”</span>
          {refundable && <button type="button" onClick={() => setRefundOpen(true)} disabled={busy} className="underline font-bold" data-testid={`admin-row-approve-refund-${booking.id}`}>Review &amp; refund</button>}
          <button type="button" onClick={declineRefund} disabled={busy} className="inline-flex items-center underline" data-testid={`admin-row-decline-refund-${booking.id}`}><X className="w-3 h-3" />Decline</button>
        </div>
      )}
      {held && (
        <div className="w-full flex flex-wrap items-center gap-1 rounded bg-[#E0F2FE] px-2 py-1 text-[10px] text-[#075985]" data-testid={`admin-row-hold-${booking.id}`}>
          <span className="font-bold">Card held ${booking.card_auth.amount.toFixed(2)}</span>
          <span>{booking.card_auth.card_brand} {booking.card_auth.card_last4 && `••${booking.card_auth.card_last4}`} · expires {(booking.card_auth.expires_at || "").slice(0, 10)}</span>
          <button type="button" onClick={charge} disabled={busy} className="inline-flex items-center gap-0.5 underline font-bold" data-testid={`admin-row-hold-charge-${booking.id}`}><CreditCard className="w-3 h-3" />Charge</button>
          <button type="button" onClick={release} disabled={busy} className="inline-flex items-center gap-0.5 underline" data-testid={`admin-row-hold-release-${booking.id}`}><Unlock className="w-3 h-3" />Release</button>
        </div>
      )}

      <button type="button" onClick={() => onEdit(booking)} disabled={busy}
        className={`${btn} bg-[#D4A94A]/10 text-[#B47F26] hover:bg-[#D4A94A] hover:text-white`}
        data-testid={`admin-row-edit-${booking.id}`}>
        <Pencil className="w-3 h-3" /> Edit
      </button>
      {!cancelled && (
        <button type="button" onClick={sendConfirm} disabled={busy}
          title="Email + text the guest their booking confirmation"
          className={`${btn} bg-[#059669]/10 text-[#047857] hover:bg-[#059669] hover:text-white`}
          data-testid={`admin-row-confirm-${booking.id}`}>
          <MailCheck className="w-3 h-3" /> Send confirm
        </button>
      )}
      <button type="button" onClick={() => onRepeat(booking)} disabled={busy}
        title="Copy this booking into a new one"
        className={`${btn} bg-[#0B3B5C]/10 text-[#0B3B5C] hover:bg-[#0B3B5C] hover:text-white`}
        data-testid={`admin-row-repeat-${booking.id}`}>
        <Copy className="w-3 h-3" /> Repeat
      </button>
      {!cancelled && (
        <button type="button" onClick={() => setDriverOpen(true)} disabled={busy}
          title="Text the trip details (no prices) to a driver, or to your admin number"
          className={`${btn} bg-[#0369A1]/10 text-[#0369A1] hover:bg-[#0369A1] hover:text-white`}
          data-testid={`admin-row-send-driver-${booking.id}`}>
          <Car className="w-3 h-3" /> {booking.driver_phone ? `Driver: ${booking.driver_name || "set"}` : "Send to driver"}
        </button>
      )}
      {!cancelled && (
        <button type="button" onClick={noShow} disabled={busy}
          className={`${btn} bg-[#64748B]/10 text-[#475569] hover:bg-[#475569] hover:text-white`}
          data-testid={`admin-row-no-show-${booking.id}`}>
          <UserX className="w-3 h-3" /> No-show
        </button>
      )}
      {driverOpen && <SendToDriverDialog booking={booking} onClose={() => setDriverOpen(false)} onDone={() => { setDriverOpen(false); onChanged(); }} />}
      {!cancelled && (
        <button type="button" onClick={cancel} disabled={busy}
          className={`${btn} bg-[#E86A3C]/10 text-[#E86A3C] hover:bg-[#E86A3C] hover:text-white`}
          data-testid={`admin-row-cancel-${booking.id}`}>
          <Ban className="w-3 h-3" /> Cancel
        </button>
      )}
      {refundable && (
        <button type="button" onClick={() => setRefundOpen(true)} disabled={busy}
          title="Refund all or part of the card payment"
          className={`${btn} bg-[#7C3AED]/10 text-[#6D28D9] hover:bg-[#7C3AED] hover:text-white`}
          data-testid={`admin-row-refund-${booking.id}`}>
          <RotateCcw className="w-3 h-3" /> Refund
        </button>
      )}
      <button type="button" onClick={remove} disabled={busy}
        className={`${btn} bg-[#DC2626]/10 text-[#B91C1C] hover:bg-[#DC2626] hover:text-white`}
        data-testid={`admin-row-delete-${booking.id}`}>
        <Trash2 className="w-3 h-3" /> Delete
      </button>
      {refundOpen && (
        <RefundBookingDialog
          booking={booking}
          onClose={() => setRefundOpen(false)}
          onDone={() => { setRefundOpen(false); onChanged(); }}
        />
      )}
      {cancelOpen && (
        <CancelBookingDialog
          booking={booking}
          onClose={() => setCancelOpen(false)}
          onDone={() => { setCancelOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}
