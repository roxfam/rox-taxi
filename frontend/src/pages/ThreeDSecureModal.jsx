import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { ShieldCheck, X } from "lucide-react";
import { API } from "../lib/api";

/**
 * ThreeDSecureModal — picks up a Stripe `requires_action` response from
 * the Pay-with-Saved-Card flow and runs `stripe.confirmCardPayment` so
 * the guest can tap through 3-D Secure right in the app instead of
 * waiting for a new emailed card link.
 */
let _stripePromise = null;
async function getStripe() {
  if (_stripePromise) return _stripePromise;
  const r = await fetch(`${API}/stripe/public-key`);
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.publishable_key) return null;
  _stripePromise = loadStripe(d.publishable_key);
  return _stripePromise;
}

export default function ThreeDSecureModal({ clientSecret, onDone, onClose }) {
  const [status, setStatus] = useState("confirming");
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !clientSecret) return;
    started.current = true;
    (async () => {
      const stripe = await getStripe();
      if (!stripe) {
        setStatus("missing_key");
        setError("Stripe 3-D Secure isn't configured on this site yet. Admin: set STRIPE_PUBLISHABLE_KEY.");
        return;
      }
      try {
        const { error: err, paymentIntent } = await stripe.confirmCardPayment(clientSecret);
        if (err) {
          setStatus("error");
          setError(err.message || "Your bank declined the extra check.");
          return;
        }
        if (paymentIntent?.status === "succeeded") {
          setStatus("succeeded");
          toast.success("3-D Secure cleared — payment complete!");
          onDone?.();
          return;
        }
        setStatus("pending");
      } catch (e) {
        setStatus("error");
        setError(e?.message || "Could not finish 3-D Secure.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret]);

  return (
    <div className="fixed inset-0 z-[220] bg-[#0B192C]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" data-testid="three-d-secure-modal">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 flex items-center justify-between gap-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0B3B5C]/8 flex items-center justify-center text-[#0B3B5C]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#0B3B5C]">3-D Secure check</div>
              <div className="text-[11px] text-[#64748B]">Your bank wants one quick confirmation to approve this charge.</div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-[#F1F5F9] flex items-center justify-center" data-testid="three-d-secure-close">
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>
        <div className="p-6 min-h-[160px] flex flex-col items-center justify-center text-center">
          {status === "confirming" && (
            <>
              <div className="w-12 h-12 rounded-full border-4 border-[#E2E8F0] border-t-[#E86A3C] animate-spin" data-testid="three-d-secure-spinner" />
              <p className="text-sm text-[#64748B] mt-4">Follow your bank's prompt — we'll bring you right back when it's done.</p>
            </>
          )}
          {status === "succeeded" && (
            <>
              <div className="text-emerald-600 text-5xl" data-testid="three-d-secure-ok">✓</div>
              <p className="text-sm text-[#0B3B5C] mt-3 font-semibold">Payment complete.</p>
            </>
          )}
          {status === "error" && (
            <>
              <div className="text-[#DC2626] text-5xl" data-testid="three-d-secure-err">!</div>
              <p className="text-sm text-[#B91C1C] mt-3">{error}</p>
            </>
          )}
          {status === "missing_key" && (
            <>
              <div className="text-[#D4A94A] text-5xl">⚙</div>
              <p className="text-sm text-[#64748B] mt-3">{error}</p>
            </>
          )}
          {status === "pending" && (
            <>
              <div className="text-[#D4A94A] text-5xl">⏱</div>
              <p className="text-sm text-[#64748B] mt-3">Payment processing — we'll notify you when it clears.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
