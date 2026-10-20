import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Timer, Loader2, CreditCard, CheckCircle2 } from "lucide-react";
import { api, money } from "../lib/api";
import { PayPalPayButtons } from "../components/PayPalPayButtons";

const fmt = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—");

// Guest page from the "wait ends in 10 min" text: buy more casino wait time.
export default function CasinoWait() {
  const [params] = useSearchParams();
  const id = params.get("id") || "";
  const t = params.get("t") || "";
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [blocks, setBlocks] = useState(1);
  const [busy, setBusy] = useState(false);
  const load = () => api.get(`/bookings/${id}/casino-wait`, { params: { t } }).then(({ data }) => setInfo(data)).catch((e) => setErr(e?.response?.data?.detail || "Link not valid"));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = (info?.block_price || 20) * blocks;
  const payCard = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/bookings/${id}/casino-wait/extend`, { blocks, pay_with: "stripe", origin_url: window.location.origin }, { params: { t } });
      window.location.href = data.checkout_url;
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't start payment"); setBusy(false); }
  };
  if (err) return <div className="max-w-md mx-auto px-6 py-24 text-center text-[#64748B]" data-testid="casino-wait-error">{err}</div>;
  if (!info) return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#D4A94A]" /></div>;
  if (info.picked_up_at) return <div className="max-w-md mx-auto px-6 py-24 text-center text-[#64748B]" data-testid="casino-wait-picked-up"><CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />You've been picked up. Thanks for riding with Rox!</div>;
  return (
    <div className="max-w-md mx-auto px-6 py-14" data-testid="casino-wait-page">
      <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-1.5"><Timer className="w-4 h-4" /> Casino wait · {info.id}</div>
      <h1 className="serif text-4xl text-[#0B3B5C] mt-2">Need more time?</h1>
      {params.get("paid") && <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-center gap-2" data-testid="casino-wait-paid"><CheckCircle2 className="w-4 h-4" /> Payment received. Your driver has been told.</div>}
      <p className="mt-3 text-[#64748B]">Your driver picks you up at <b className="text-[#0B3B5C]" data-testid="casino-wait-ends">{fmt(info.ends_at)}</b>. Add 30 minutes for {money(info.block_price)}.</p>
      <div className="mt-6 flex items-center justify-between rounded-2xl border border-[#E2E8F0] p-4">
        <button type="button" onClick={() => setBlocks((b) => Math.max(1, b - 1))} className="w-10 h-10 rounded-full border border-[#E2E8F0] text-xl" data-testid="casino-wait-minus">−</button>
        <div className="text-center"><div className="mono text-2xl font-black text-[#0B3B5C]" data-testid="casino-wait-minutes">+{blocks * 30} min</div><div className="text-sm text-[#64748B]" data-testid="casino-wait-amount">{money(amount)}</div></div>
        <button type="button" onClick={() => setBlocks((b) => Math.min(8, b + 1))} className="w-10 h-10 rounded-full border border-[#D4A94A] text-xl" data-testid="casino-wait-plus">+</button>
      </div>
      <button type="button" onClick={payCard} disabled={busy} className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white font-semibold py-3.5 disabled:opacity-60" data-testid="casino-wait-pay-card">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Pay {money(amount)} by card
      </button>
      {info.paypal && (
        <div className="mt-4">
          <PayPalPayButtons key={blocks} title={`Pay ${money(amount)} with PayPal`}
            createOrder={async () => (await api.post(`/bookings/${id}/casino-wait/extend`, { blocks, pay_with: "paypal" }, { params: { t } })).data.order_id}
            captureOrder={async (oid) => (await api.post(`/casino-wait/paypal/capture/${oid}`)).data}
            onPaid={() => load()} />
        </div>
      )}
    </div>
  );
}
