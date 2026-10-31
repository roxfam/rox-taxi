import { useState } from "react";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { api } from "../../lib/api";

export default function TextPayLinkButton({ booking, onSent }) {
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!booking.customer_phone) {
      toast.error("No guest phone on this booking");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/text-pay-link`, {});
      if (data.sent) toast.success(`Pay link texted to ${data.to}`);
      else toast.error(`Text failed: ${data.error || "unknown"}`);
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
      title="Text the guest a ready-filled tap-to-pay link"
      className="mt-1 inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold px-2 py-1 rounded bg-[#059669]/10 text-[#059669] hover:bg-[#059669] hover:text-white disabled:opacity-60 transition-colors"
      data-testid={`admin-text-paylink-btn-${booking.id}`}
    >
      <MessageSquare className="w-3 h-3" />
      {busy ? "Texting…" : "Text pay link"}
    </button>
  );
}
