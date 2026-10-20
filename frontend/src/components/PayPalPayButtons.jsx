import { useEffect, useState } from "react";
import { PayPalScriptProvider, PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { toast } from "sonner";
import { api } from "../lib/api";

// Official yellow PayPal button (PayPal opens in a pop-up, guest stays on our site).
// Defaults to a booking order; pass createOrder/captureOrder for gift cards etc.
export function PayPalPayButtons({ bookingId, onPaid, createOrder, captureOrder, title = "Pay with PayPal", note }) {
  const [clientId, setClientId] = useState("");
  useEffect(() => {
    api.get("/paypal/config").then(({ data }) => setClientId(data?.configured ? data.client_id : "")).catch(() => {});
  }, []);
  if (!clientId) return null;
  const create = createOrder || (async () => (await api.post("/paypal/create-order", { booking_id: bookingId })).data.order_id);
  const capture = captureOrder || (async (id) => (await api.post(`/paypal/capture-order/${id}`)).data);
  return (
    <div className="rounded-2xl border border-[#E2E8F0] p-5 bg-white" data-testid="pay-paypal-buttons">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-semibold text-[#0B3B5C]">{title}</div>
        <span className="text-[10px] font-bold tracking-wider uppercase text-[#003087] bg-[#003087]/10 rounded-full px-2 py-0.5">PayPal · Pay Later · Card</span>
      </div>
      {note && <p className="text-xs text-[#64748B] mb-3">{note}</p>}
      <PayPalScriptProvider options={{ clientId, currency: "USD", intent: "capture", components: "buttons", enableFunding: "paylater,card" }}>
        <ReadyButtons
          createOrder={create}
          onApprove={async (d) => {
            try {
              const data = await capture(d.orderID);
              if (data?.payment_status === "paid" || data?.status === "active") {
                toast.success("Payment received, thank you!");
                onPaid?.(data);
              } else {
                toast.error("Payment could not be verified. Please contact us.");
              }
            } catch (e) { toast.error(e?.response?.data?.detail || "PayPal payment failed."); }
          }}
          onCancel={() => toast.info("PayPal window closed. Nothing was charged.")}
          onError={() => toast.error("PayPal error. Please try again or pay by card.")}
        />
      </PayPalScriptProvider>
    </div>
  );
}

// Render the buttons only once the SDK has loaded (avoids the 'zoid destroyed' crash on fast unmounts).
function ReadyButtons(props) {
  const [{ isResolved, isRejected }] = usePayPalScriptReducer();
  if (isRejected) return <div className="text-xs text-[#64748B]">PayPal couldn't load. Please refresh or pay by card.</div>;
  if (!isResolved) return <div className="h-12 rounded-full bg-[#FFC439]/40 animate-pulse" data-testid="paypal-loading" />;
  return <PayPalButtons style={{ layout: "vertical", shape: "pill", color: "gold", label: "paypal", height: 48 }} {...props} />;
}
