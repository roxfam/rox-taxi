import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { api } from "../../lib/api";

export default function ResendPayLinkButton({ booking, onSent }) {
  const [busy, setBusy] = useState(false);
  const last = booking.payment_email_last_sent_at;

  const send = async () => {
    if (!booking.customer_email) {
      toast.error("No guest email on this booking");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/send-payment-email`, {});
      if (data.sent) toast.success(`Payment link sent to ${data.to}`);
      else toast.error(`Email provider error: ${data.error || "unknown"}`);
      onSent?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={send}
      disabled={busy}
      title={last ? `Last sent ${new Date(last).toLocaleString()}` : "Email the guest a one-tap payment link"}
      className="mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold px-2 py-1 rounded bg-[#E86A3C]/10 text-[#E86A3C] hover:bg-[#E86A3C] hover:text-white disabled:opacity-60 transition-colors"
      data-testid={`admin-resend-paylink-btn-${booking.id}`}
    >
      <Send className="w-3 h-3" />
      {busy ? "Sending…" : "Resend pay link"}
    </button>
  );
}
