import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Ban, Trash2, Copy, MailCheck } from "lucide-react";
import { api } from "../../lib/api";
import CancelBookingDialog from "./CancelBookingDialog";

const btn = "inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold px-2 py-1 rounded transition-colors disabled:opacity-50";

export default function BookingRowActions({ booking, onEdit, onRepeat, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelled = booking.status === "cancelled";

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
        <button type="button" onClick={cancel} disabled={busy}
          className={`${btn} bg-[#E86A3C]/10 text-[#E86A3C] hover:bg-[#E86A3C] hover:text-white`}
          data-testid={`admin-row-cancel-${booking.id}`}>
          <Ban className="w-3 h-3" /> Cancel
        </button>
      )}
      <button type="button" onClick={remove} disabled={busy}
        className={`${btn} bg-[#DC2626]/10 text-[#B91C1C] hover:bg-[#DC2626] hover:text-white`}
        data-testid={`admin-row-delete-${booking.id}`}>
        <Trash2 className="w-3 h-3" /> Delete
      </button>
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
