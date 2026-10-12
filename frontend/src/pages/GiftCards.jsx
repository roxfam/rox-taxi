import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, money } from "../lib/api";
import { Gift, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const AMOUNT_OPTIONS = [50, 100, 150, 250, 500];

const THEMES = [
  { id: "classic", label: "Beach day", grad: "from-[#0B3B5C] via-[#123f66] to-[#128C7E]", line: "You've been gifted a Rox beach day" },
  { id: "birthday", label: "Birthday", grad: "from-[#E86A3C] via-[#e98a4a] to-[#D4A94A]", line: "Happy birthday! Your island treat" },
  { id: "honeymoon", label: "Honeymoon", grad: "from-[#7A2E4D] via-[#a24d6a] to-[#E8A0A8]", line: "For your honeymoon in paradise" },
  { id: "thank_you", label: "Thank you", grad: "from-[#0B3B5C] via-[#24557a] to-[#3C6E91]", line: "Thank you, enjoy some island magic" },
  { id: "anniversary", label: "Anniversary", grad: "from-[#8B1E3F] via-[#a8473f] to-[#D4A94A]", line: "Celebrate your love in paradise" },
  { id: "wedding", label: "Wedding", grad: "from-[#5B6B8C] via-[#9c9fa8] to-[#E8D5B0]", line: "Here's to forever, island style" },
  { id: "graduation", label: "Graduation", grad: "from-[#1E3A8A] via-[#5b5f7a] to-[#D4A94A]", line: "You did it! Time to celebrate" },
  { id: "holiday", label: "Holiday", grad: "from-[#14532D] via-[#6b3a26] to-[#B91C1C]", line: "A holiday gift in the sunshine" },
  { id: "mothers_day", label: "Mother's Day", grad: "from-[#BE185D] via-[#db5d98] to-[#F9A8D4]", line: "For the best mom, a day in paradise" },
  { id: "just_because", label: "Just because", grad: "from-[#0E7490] via-[#2aa5ad] to-[#5EEAD4]", line: "Just because you deserve it" },
];

export default function GiftCards() {
  const [amount, setAmount] = useState(100);
  const [theme, setTheme] = useState("classic");
  const [custom, setCustom] = useState("");
  const [form, setForm] = useState({ buyer_name: "", buyer_email: "", recipient_email: "", recipient_name: "", recipient_phone: "", message: "" });
  const [sendAt, setSendAt] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const paidCode = params.get("code");
  const cancelled = params.get("cancelled");

  const finalAmount = custom ? Number(custom) : amount;
  const activeTheme = THEMES.find((t) => t.id === theme) || THEMES[0];

  const submit = async (e) => {
    e.preventDefault();
    if (!finalAmount || finalAmount < 25 || finalAmount > 1000) return toast.error("Choose $25–$1000");
    if (!form.buyer_name || !form.buyer_email || !form.recipient_email) return toast.error("Fill required fields");
    if (!agree) return toast.error("Please confirm you understand gift cards are non-refundable");
    if (sendAt && new Date(sendAt) < new Date()) return toast.error("Pick a delivery date in the future, or leave it blank to send now");
    setBusy(true);
    try {
      const { data } = await api.post("/gift-cards/purchase", {
        amount: finalAmount, ...form, recipient_phone: form.recipient_phone || undefined, theme,
        scheduled_send_at: sendAt ? new Date(sendAt).toISOString() : undefined, origin_url: window.location.origin,
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
        <h1 className="serif text-5xl sm:text-6xl text-[#0B3B5C] font-bold leading-[0.95]">Treat someone special to a little piece of <em className="italic text-[#D4A94A]">paradise</em>.</h1>
        {paidCode && (
          <div className="mt-6 rounded-2xl bg-white border border-[#059669]/30 p-4 flex items-start gap-3" data-testid="gift-success-banner">
            <CheckCircle2 className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" />
            <div className="text-sm text-[#0B3B5C]">Thank you! Gift card <span className="mono font-bold">{paidCode}</span> is paid. The voucher is on its way by email (on the date you picked, if scheduled).</div>
          </div>
        )}
        {cancelled && (
          <div className="mt-6 rounded-2xl bg-white border border-[#E86A3C]/30 p-4 flex items-start gap-3 text-sm text-[#0B3B5C]" data-testid="gift-cancelled-banner">
            <AlertCircle className="w-5 h-5 text-[#E86A3C] shrink-0" /> Checkout cancelled. No charge was made.
          </div>
        )}
        <p className="text-[#64748B] mt-4 max-w-xl leading-relaxed">Surprise a friend, partner or loved one visiting The Bahamas with a gift they&apos;ll never forget: a smooth island ride, an unforgettable tour, or a sun-soaked day on the beach with us. Sent instantly by email, good on any taxi, tour, car rental, Cable Beach day or group booking, and valid for 12 months. Any unused balance carries over to their next booking. Non-refundable.</p>

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

            <div>
              <div className="text-[10px] tracking-[0.28em] uppercase font-black text-[#64748B] mb-3">Card design</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" data-testid="gift-theme-picker">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTheme(t.id)} data-testid={`gift-theme-${t.id}`}
                    className={`rounded-xl p-1 transition-transform hover:-translate-y-0.5 ${theme === t.id ? "ring-2 ring-[#D4A94A]" : "ring-1 ring-[#EFE7D5]"}`}>
                    <div className={`h-12 rounded-lg bg-gradient-to-br ${t.grad}`} />
                    <div className="text-xs font-semibold text-[#0B3B5C] py-1.5">{t.label}</div>
                  </button>
                ))}
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
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-1.5 block">Recipient mobile number (optional)</span>
              <input type="tel" value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} placeholder="+1 242 555 0123" data-testid="gift-recipient-phone" className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none" />
              <span className="text-[11px] text-[#94a3b8] mt-1 block">We&apos;ll also text them their gift code.</span>
            </label>
            <label className="block">
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-1.5 block">Delivery date (optional)</span>
              <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} data-testid="gift-send-date" className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none" />
              <span className="text-[11px] text-[#94a3b8] mt-1 block" data-testid="gift-send-date-note">{sendAt ? `Delivers on ${new Date(sendAt).toLocaleString()} (your local time). Perfect for birthdays and anniversaries.` : "Leave blank to send right after payment."}</span>
            </label>
            <label className="block">
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-1.5 block">Message (optional)</span>
              <textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} data-testid="gift-message" className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm focus:border-[#D4A94A] focus:outline-none" placeholder="Have a magical Bahamas trip!" />
            </label>
          </div>

          <aside className="rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_25px_60px_rgba(11,25,44,0.14)] p-6 lg:sticky lg:top-24">
            <div className={`w-full aspect-[16/10] rounded-2xl bg-gradient-to-br ${activeTheme.grad} p-6 text-white flex flex-col justify-between shadow-[0_20px_50px_rgba(11,25,44,0.35)] transition-colors`} data-testid="gift-preview-card">
              <div>
                <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-black opacity-80"><Gift className="w-3.5 h-3.5" /> Rox gift card</div>
                <div className="serif italic text-lg mt-2 leading-tight" data-testid="gift-preview-theme-line">{activeTheme.line}</div>
              </div>
              <div>
                <div className="mono text-4xl font-black tracking-tight" data-testid="gift-preview-amount">{money(finalAmount || 0)}</div>
                <div className="text-[10px] tracking-widest uppercase opacity-70 mt-1">Redeemable at checkout</div>
              </div>
            </div>
            <p className="text-[11px] text-[#94a3b8] mt-4 leading-relaxed">Delivered by email (and text, if you add a number) right after payment or on your chosen date. Balance carries over across bookings. Expires 12 months after purchase.</p>
            <div className="mt-3 rounded-xl bg-[#FFF4EE] border border-[#E86A3C]/30 px-3 py-2.5 text-[11px] text-[#7c3a20]" data-testid="gift-nonrefundable-notice">
              <b>All gift cards are non-refundable</b> and can&apos;t be exchanged for cash.
            </div>
            <label className="mt-3 flex items-start gap-2 text-[11px] text-[#0B3B5C] cursor-pointer">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" data-testid="gift-nonrefundable-agree" />
              I understand this gift card is non-refundable.
            </label>
            <button type="submit" disabled={busy || !agree} data-testid="gift-purchase-submit" className="w-full mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white px-6 py-3.5 text-sm font-semibold shadow-[0_10px_25px_rgba(232,106,60,0.35)] disabled:opacity-60">
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
