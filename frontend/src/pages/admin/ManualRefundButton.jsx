import { useState } from "react";
import { RotateCcw } from "lucide-react";
import RefundBookingDialog from "./RefundBookingDialog";

export default function ManualRefundButton({ onDone }) {
  const [id, setId] = useState(null);
  const ask = () => {
    const v = window.prompt("Booking ID to refund (e.g. 5D4D4857):");
    if (v && v.trim()) setId(v.trim().toUpperCase());
  };
  return (
    <>
      <button type="button" onClick={ask} className="text-xs px-3 py-1.5 rounded-md border border-[#7C3AED] text-[#6D28D9] font-semibold inline-flex items-center gap-1 hover:bg-[#F5F3FF] transition-colors" data-testid="admin-manual-refund-btn">
        <RotateCcw className="w-3.5 h-3.5" /> Refund
      </button>
      {id && <RefundBookingDialog booking={{ id }} onClose={() => setId(null)} onDone={() => { setId(null); onDone(); }} />}
    </>
  );
}
