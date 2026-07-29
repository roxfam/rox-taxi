import { useState } from "react";
import { api, money } from "../lib/api";
import { Gift, Sparkles, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const AMOUNT_OPTIONS = [50, 100, 150, 250, 500];

export default function GiftCards() {
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [form, setForm] = useState({ buyer_name: "", buyer_email: "", recipient_email: "", recipient_name: "", message: "" });
  const [busy, setBusy] = useState(false);

  const finalAmount = custom ? Number(custom) : amount;

  const submit = async (e) => {
    e.preventDefault();
    if (!finalAmount || finalAmount < 25 || finalAmount > 1000) return toast.error("Choose $25–$1000");
    if (!form.buyer_name || !form.buyer_email || !form.recipient_email) return toast.error("Fill required fields");
    setBusy(true);
    try {
      const { data } = await api.post("/gift-cards/purchase", {
        amount: finalAmount, ...form, origin_url: window.location.origin,
      });
      window.location.href = data.checkout_url;
    } catch (ex) {
      toast.error(ex?.response?.data?.detail || "Purchase failed");
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-5rem)]" data-testid="gift-cards-page">
      <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(ellipse at 30% 10%, rgba(212,169,74,0.18), transparent 55%), linear-gradient(180deg, #FBF7EF 0%, #F1E8D3 100%)" }} />
      <div className="max-w-4xl mx-auto px-6 lg:px-10 py-16 lg:py-24">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-[1px] bg-[#D4A94A]" />
          <span className="text-[10px] tracking-[0.35em] uppercase font-black text-[#D4A94A]">Rox gift cards</span>
        </div>
        <h1 className="serif text-5xl sm:text-6xl text-[#0B3B5C] font-bold leading-[0.95]">Give the <em className="italic text-[#D4A94A]">gift</em> of the Bahamas.</h1>
        <p className="text-[#64748B] mt-4 max-w-xl leading-relaxed">Instant email delivery. Redeemable on taxis, tours, or car rentals at checkout. Never expires. Balance carries over across bookings.</p>

        <form onSubmit={submit} className="mt-10 grid lg:grid-cols-[1fr_360px] gap-8 items-start" data-testid="gift-purchase-form">
          <div className="space-y-6">
            <div>
              <div className="text-[10px] tracking-[0.28em] uppercase font-black text-[#64748B] mb-3">Amount</div>
              <div className="flex flex-wrap gap-2">
                {AMOUNT_OPTIONS.map((a) => (
                  <button key={a} type="button" onClick={() => { setAmount(a); setCustom(""); }} data-testid={`gift-amount-${a}`}
                    className={`rounded-full px-5 py-2.5 text-sm font-black transition ${amount === a && !custom ? "bg-[#0B3B5C] text-white shadow-[0_10px_25px_rgba(11,25,44,0.25)]" : "border border-[#EFE7D5] bg-white text-[#0B3B5C] hover:border-[#D4A94A]"}`}>
                    {money(a)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-[#64748B]">or custom</span>
                <input type="number" min={25} max={1000} step={5} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Amount" data-testid="gift-amount-custom" className="w-28 rounded-xl border border-[#EFE7D5] bg-white px-3 py-2 text-sm focus:border-[#D4A94A] focus:outline-none" />
                <span className="text-xs text-[#94a3b8]">$25 – $1,000</span>
              </div>
            </div>

            <label className="block">
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-1.5 block">Your name *</span>
              <input required value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} data-testid="gift-buyer-name" className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-1.5 block">Your email *</span>
              <input required type="email" value={form.buyer_email} onChange={(e) => setForm({ ...form, buyer_email: e.target.value })} data-testid="gift-buyer-email" className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-1.5 block">Recipient email *</span>
              <input required type="email" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} data-testid="gift-recipient-email" className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-1.5 block">Recipient name (optional)</span>
              <input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} data-testid="gift-recipient-name" className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-1.5 block">Message (optional)</span>
              <textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} data-testid="gift-message" className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none" placeholder="Have a magical Bahamas trip!" />
            </label>
          </div>

          <aside className="rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_25px_60px_rgba(11,25,44,0.14)] p-6 lg:sticky lg:top-24">
            <div className="w-full aspect-[16/10] rounded-2xl bg-gradient-to-br from-[#0B3B5C] via-[#123f66] to-[#D4A94A] p-6 text-white flex flex-col justify-between shadow-[0_20px_50px_rgba(11,25,44,0.35)]">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-black opacity-80"><Gift className="w-3.5 h-3.5" /> Rox gift card</div>
              <div>
                <div className="mono text-4xl font-black tracking-tight" data-testid="gift-preview-amount">{money(finalAmount || 0)}</div>
                <div className="text-[10px] tracking-widest uppercase opacity-70 mt-1">Redeemable at checkout</div>
              </div>
            </div>
            <p className="text-[11px] text-[#94a3b8] mt-4 leading-relaxed">Delivered by email within seconds of payment. Balance carries over across bookings. Never expires.</p>
            <button type="submit" disabled={busy} data-testid="gift-purchase-submit" className="w-full mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white px-6 py-3.5 text-sm font-semibold shadow-[0_10px_25px_rgba(232,106,60,0.35)] disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {busy ? "Redirecting…" : `Buy ${money(finalAmount || 0)} card`}
            </button>
            <p className="text-[10px] text-[#94a3b8] text-center mt-2">Secured by Stripe · funds go to Rox Taxi</p>
          </aside>
        </form>
      </div>
    </div>
  );
}
