import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { api, money } from "../lib/api";

export default function RefundRequestCard({ booking, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const req = booking.refund_request;
  if (!["paid", "partially_refunded"].includes(booking.payment_status)) return null;

  const submit = async () => {
    if (reason.trim().length < 3) { toast.error("Tell us briefly why you'd like a refund"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/bookings/${booking.id}/refund-request`, { reason, amount: Number(amount) > 0 ? Number(amount) : null });
      toast.success(data.message);
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not send the request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-white p-5" data-testid="refund-request-section">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm max-w-xl">
          <div className="font-semibold text-[#0B3B5C]">Something not right? Ask for a refund</div>
          <div className="text-[#64748B] mt-0.5">Ask for all or part of what you paid. The processing fee{booking.processing_fee ? ` (${money(booking.processing_fee)})` : ""} is non-refundable. Our team reviews every request.</div>
          {req?.status && (
            <div className="mt-2 text-xs font-semibold text-[#5B21B6]" data-testid="refund-request-status">
              Refund request {req.status === "pending" ? "sent — we're reviewing it" : req.status}
            </div>
          )}
        </div>
        {req?.status !== "pending" && !open && (
          <button type="button" onClick={() => setOpen(true)} data-testid="refund-request-open"
            className="rounded-full bg-white border border-[#E2E8F0] text-[#0B3B5C] px-4 py-2.5 text-sm font-semibold hover:border-[#7C3AED] hover:text-[#6D28D9] inline-flex items-center gap-2">
            <RotateCcw className="w-4 h-4" /> Request a refund
          </button>
        )}
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3}
            placeholder="What happened?" className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm" data-testid="refund-request-reason" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#64748B]">Amount (leave blank for the full amount) $</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-28 px-2 py-1 border border-[#E2E8F0] rounded text-sm" data-testid="refund-request-amount" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={busy} data-testid="refund-request-submit"
              className="rounded-full bg-[#7C3AED] text-white px-5 py-2 text-sm font-bold disabled:opacity-60">{busy ? "Sending…" : "Send request"}</button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-[#64748B] underline" data-testid="refund-request-cancel">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
