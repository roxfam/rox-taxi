import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { api } from "../lib/api";

// "Add to Google Wallet" — hidden until the owner adds the Google Wallet keys in admin.
export const GoogleWalletButton = ({ bookingId, className = "" }) => {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/google-wallet/status").then(({ data }) => setReady(!!data?.configured)).catch(() => setReady(false));
  }, []);
  if (!ready || !bookingId) return null;
  const add = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/bookings/${bookingId}/google-wallet`);
      window.location.href = data.save_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't open Google Wallet");
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={add} disabled={busy}
      className={`w-full inline-flex items-center justify-center gap-2 rounded-full bg-black hover:bg-[#1f1f1f] text-white font-semibold py-3 px-5 transition-colors disabled:opacity-70 ${className}`}
      data-testid="google-wallet-add-btn">
      <Wallet className="w-4 h-4" /> {busy ? "Opening Google Wallet…" : "Add to Google Wallet"}
    </button>
  );
};
