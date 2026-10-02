import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, CreditCard, Wallet, Copy, Loader2, CheckCircle2, DollarSign, ShieldCheck } from "lucide-react";
import { api, money, BACKEND_URL } from "../../lib/api";

/**
 * IncidentalModal — admin-triggered "hold card / request extra payment"
 * flow. Three tabs:
 *   1. Stripe card on file (SetupIntent via Checkout `setup` mode)
 *   2. Zelle request (SMS + email the guest Zelle details + memo)
 *   3. Charge saved card (off-session PaymentIntent, only when a card is held)
 *
 * Props:
 *   - booking: full booking row from /admin/bookings
 *   - onClose: () => void
 *   - onDone:  () => void   (triggers parent re-fetch)
 */
export default function IncidentalModal({ booking, onClose, onDone }) {
  const [tab, setTab] = useState("stripe");
  const [hold, setHold] = useState(booking.card_hold || null);
  const [busy, setBusy] = useState(false);

  // Zelle form
  const [zAmount, setZAmount] = useState("");
  const [zReason, setZReason] = useState("");

  // Charge form (only when card held)
  const [cAmount, setCAmount] = useState("");
  const [cReason, setCReason] = useState("");

  // Poll card-hold status when switching to Stripe tab so admin sees
  // "card saved" the moment the guest finishes the Checkout flow.
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await api.get(`/admin/bookings/${booking.id}/card-hold/status`);
        if (!active) return;
        setHold(data.card_hold || null);
      } catch { /* ignore */ }
    };
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(iv); };
  }, [booking.id]);

  const createStripeHold = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/card-hold/create`, {
        origin_url: window.location.origin,
        send_sms: true,
        send_email: true,
      });
      setHold({ session_id: data.session_id, status: data.status, checkout_url: data.checkout_url });
      const n = data.notification || {};
      if (n.sms?.sent) toast.success("Secure card-hold SMS sent to guest");
      if (n.email?.sent) toast.success("Secure card-hold email sent to guest");
      if (!n.sms?.sent && !n.email?.sent) toast.info("Link created — copy & share it manually");
      onDone?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create card-hold link");
    } finally {
      setBusy(false);
    }
  };

  const sendZelle = async () => {
    const amt = parseFloat(zAmount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!zReason || zReason.trim().length < 3) return toast.error("Reason is required");
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/zelle-request`, {
        amount: amt,
        reason: zReason.trim(),
        send_sms: true,
        send_email: true,
      });
      const n = data.request?.notification || {};
      if (n.sms?.sent) toast.success("Zelle request SMS sent");
      if (n.email?.sent) toast.success("Zelle request email sent");
      if (!n.sms?.sent && !n.email?.sent) toast.warning("Request stored but no delivery channels — check Twilio / SendGrid");
      setZAmount(""); setZReason("");
      onDone?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Zelle request failed");
    } finally {
      setBusy(false);
    }
  };

  const chargeSaved = async () => {
    const amt = parseFloat(cAmount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!cReason || cReason.trim().length < 3) return toast.error("Reason is required");
    if (!window.confirm(`Charge ${money(amt)} to the saved card for "${cReason}"?`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/card-hold/charge`, {
        amount: amt,
        reason: cReason.trim(),
      });
      const st = data.payment_intent_status;
      if (st === "succeeded") toast.success(`Charged ${money(amt)} — PI ${data.charge?.payment_intent_id?.slice(0, 10)}…`);
      else toast.warning(`Charge status: ${st}`);
      setCAmount(""); setCReason("");
      onDone?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Charge failed");
    } finally {
      setBusy(false);
    }
  };

  const cardSaved = !!(hold && hold.payment_method_id);
  const link = hold?.checkout_url;

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B192C]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" data-testid="incidental-modal">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="relative p-6 border-b border-[#E2E8F0]">
          <button onClick={onClose} className="absolute top-5 right-5 w-9 h-9 rounded-full hover:bg-[#F1F5F9] flex items-center justify-center" data-testid="incidental-close">
            <X className="w-5 h-5 text-[#0B3B5C]" />
          </button>
          <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Incidental / Card on File</div>
          <h2 className="serif text-2xl text-[#0B3B5C] mt-1">{booking.id} · {booking.customer_name}</h2>
          <div className="text-sm text-[#64748B]">{booking.item_name} · {money(booking.total)}</div>
        </div>

        <div className="flex border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <TabBtn active={tab === "stripe"} onClick={() => setTab("stripe")} testid="tab-stripe">
            <CreditCard className="w-4 h-4" /> Stripe card hold
            {cardSaved && <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />}
          </TabBtn>
          <TabBtn active={tab === "zelle"} onClick={() => setTab("zelle")} testid="tab-zelle">
            <Wallet className="w-4 h-4" /> Zelle request
          </TabBtn>
          <TabBtn active={tab === "charge"} onClick={() => setTab("charge")} testid="tab-charge" disabled={!cardSaved}>
            <DollarSign className="w-4 h-4" /> Charge card
          </TabBtn>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {tab === "stripe" && (
            <div className="space-y-4" data-testid="tab-content-stripe">
              <p className="text-sm text-[#64748B] leading-relaxed">
                Create a secure Stripe link the guest uses to save a card on file. No charge happens now —
                you can later charge it off-session from the "Charge card" tab for damage / incidentals / late return.
              </p>
              {cardSaved ? (
                <div className="rounded-xl bg-[#059669]/10 border border-[#059669]/30 p-4 flex items-center gap-3" data-testid="card-saved-banner">
                  <ShieldCheck className="w-6 h-6 text-[#059669]" />
                  <div>
                    <div className="font-semibold text-[#065f46]">Card on file</div>
                    <div className="text-xs text-[#065f46] mono mt-0.5">
                      {hold.card_brand?.toUpperCase() || "CARD"} •••• {hold.card_last4 || "····"}
                      {hold.card_exp_month && ` · ${String(hold.card_exp_month).padStart(2,"0")}/${String(hold.card_exp_year).slice(-2)}`}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {hold?.session_id ? (
                    <div className="rounded-xl bg-[#D4A94A]/10 border border-[#D4A94A]/30 p-4 space-y-3" data-testid="pending-hold-banner">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#0B3B5C]">
                        <Loader2 className="w-4 h-4 animate-spin" /> Waiting for guest to save card…
                      </div>
                      {link && (
                        <div className="flex items-center gap-2">
                          <input readOnly value={link} className="flex-1 mono text-xs rounded-lg border border-[#D4A94A]/40 bg-white px-3 py-2 text-[#0B3B5C]" data-testid="hold-link-input" />
                          <button
                            onClick={() => { navigator.clipboard?.writeText(link); toast.success("Link copied"); }}
                            className="rounded-lg bg-[#0B3B5C] text-white px-3 py-2 text-xs font-semibold hover:bg-[#132a4a] flex items-center gap-1"
                            data-testid="copy-hold-link"
                          >
                            <Copy className="w-3.5 h-3.5" /> Copy
                          </button>
                        </div>
                      )}
                      <div className="text-[11px] text-[#64748B]">Guest was also texted + emailed the link.</div>
                    </div>
                  ) : (
                    <button
                      onClick={createStripeHold}
                      disabled={busy}
                      className="btn-shine rounded-full bg-[#0B3B5C] text-white px-5 py-3 text-sm font-semibold hover:bg-[#132a4a] active:scale-95 disabled:opacity-60 inline-flex items-center gap-2"
                      data-testid="create-stripe-hold-btn"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                      {busy ? "Creating…" : "Create secure Stripe link & SMS guest"}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "zelle" && (
            <div className="space-y-4" data-testid="tab-content-zelle">
              <p className="text-sm text-[#64748B] leading-relaxed">
                Text + email the guest a Zelle payment request for an incidental amount. They send it, you reconcile
                later with "Mark Zelle Paid" on the Payments panel.
              </p>
              <AmountField label="Amount (USD)" value={zAmount} onChange={setZAmount} testid="zelle-amount" />
              <ReasonField label="Reason / line-item" value={zReason} onChange={setZReason} testid="zelle-reason"
                placeholder="e.g. Late return (3 hrs) · Extra cleaning · Fuel top-up" />
              <button
                onClick={sendZelle}
                disabled={busy}
                className="btn-shine rounded-full bg-[#E86A3C] text-white px-5 py-3 text-sm font-semibold hover:bg-[#d55a30] active:scale-95 disabled:opacity-60 inline-flex items-center gap-2"
                data-testid="send-zelle-btn"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                {busy ? "Sending…" : "Send Zelle request to guest"}
              </button>
              {Array.isArray(booking.zelle_requests) && booking.zelle_requests.length > 0 && (
                <div className="pt-3 border-t border-[#E2E8F0]">
                  <div className="text-[10px] tracking-[0.2em] uppercase text-[#64748B] font-bold mb-2">Previous Zelle requests</div>
                  <ul className="space-y-1 text-xs" data-testid="zelle-history">
                    {booking.zelle_requests.slice(-5).reverse().map((z, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span className="text-[#64748B]">{new Date(z.created_at).toLocaleString()} · {z.reason}</span>
                        <span className="mono font-semibold text-[#0B3B5C]">${z.amount?.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "charge" && (
            <div className="space-y-4" data-testid="tab-content-charge">
              {!cardSaved ? (
                <div className="rounded-xl bg-[#E86A3C]/10 border border-[#E86A3C]/30 p-4 text-sm text-[#9a3412]">
                  No card is on file yet — ask the guest to save one from the "Stripe card hold" tab first.
                </div>
              ) : (
                <>
                  <p className="text-sm text-[#64748B] leading-relaxed">
                    Immediately charge the saved card. The guest will see this on their statement with the reason text.
                  </p>
                  <AmountField label="Amount (USD)" value={cAmount} onChange={setCAmount} testid="charge-amount" />
                  <ReasonField label="Reason (shown on statement)" value={cReason} onChange={setCReason} testid="charge-reason"
                    placeholder="e.g. Damaged bumper · Cleaning fee · Late return" />
                  <button
                    onClick={chargeSaved}
                    disabled={busy}
                    className="btn-shine rounded-full bg-[#DC2626] text-white px-5 py-3 text-sm font-semibold hover:bg-[#B91C1C] active:scale-95 disabled:opacity-60 inline-flex items-center gap-2"
                    data-testid="charge-card-btn"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                    {busy ? "Charging…" : `Charge ${money(parseFloat(cAmount) || 0)}`}
                  </button>
                  {Array.isArray(hold?.charges) && hold.charges.length > 0 && (
                    <div className="pt-3 border-t border-[#E2E8F0]">
                      <div className="text-[10px] tracking-[0.2em] uppercase text-[#64748B] font-bold mb-2">Previous charges</div>
                      <ul className="space-y-1 text-xs" data-testid="charge-history">
                        {hold.charges.slice(-5).reverse().map((c, i) => (
                          <li key={i} className="flex items-center justify-between">
                            <span className="text-[#64748B]">{new Date(c.created_at).toLocaleString()} · {c.reason}</span>
                            <span className={`mono font-semibold ${c.status === "succeeded" ? "text-[#059669]" : "text-[#DC2626]"}`}>
                              ${c.amount?.toFixed(2)} · {c.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children, testid, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className={`flex-1 px-4 py-3 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition ${
        active
          ? "bg-white text-[#0B3B5C] border-b-2 border-[#D4A94A]"
          : "text-[#64748B] hover:text-[#0B3B5C] disabled:opacity-40 disabled:cursor-not-allowed"
      }`}
    >
      {children}
    </button>
  );
}

function AmountField({ label, value, onChange, testid }) {
  return (
    <div>
      <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] mono">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-[#E2E8F0] py-2.5 pl-7 pr-3 text-sm mono"
          placeholder="0.00"
          data-testid={testid}
        />
      </div>
    </div>
  );
}

function ReasonField({ label, value, onChange, testid, placeholder }) {
  return (
    <div>
      <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#E2E8F0] py-2.5 px-3 text-sm"
        data-testid={testid}
      />
    </div>
  );
}
