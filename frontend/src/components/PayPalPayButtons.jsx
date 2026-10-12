import { useEffect, useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { toast } from "sonner";
import { api } from "../lib/api";

// Live PayPal Smart Buttons for an existing booking; auto-confirms on capture.
export function PayPalPayButtons({ bookingId, onPaid }) {
  const [clientId, setClientId] = useState("");
  useEffect(() => {
    api.get("/paypal/config").then(({ data }) => setClientId(data?.configured ? data.client_id : "")).catch(() => {});
  }, []);
  if (!clientId) return null;
  return (
    <div className="mt-4 rounded-2xl border border-[#E2E8F0] p-5" data-testid="pay-paypal-buttons">
      <div className="font-semibold text-[#0B3B5C] mb-3">PayPal or Venmo · instant confirmation</div>
      <PayPalScriptProvider options={{ clientId, currency: "USD", intent: "capture", components: "buttons" }}>
        <PayPalButtons
          style={{ layout: "vertical", shape: "pill", label: "pay", height: 45 }}
          createOrder={async () => (await api.post("/paypal/create-order", { booking_id: bookingId })).data.order_id}
          onApprove={async (d) => {
            try {
              const { data } = await api.post(`/paypal/capture-order/${d.orderID}`);
              if (data?.payment_status === "paid") { toast.success("Payment received! Your booking is confirmed."); onPaid?.(data.booking); }
            } catch (e) { toast.error(e?.response?.data?.detail || "PayPal capture failed."); }
          }}
          onError={() => toast.error("PayPal error — please try another payment method.")}
        />
      </PayPalScriptProvider>
    </div>
  );
}
