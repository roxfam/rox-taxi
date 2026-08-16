import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, money } from "../lib/api";
import { HandCoins, Check, Heart, Sparkles, Loader2 } from "lucide-react";

/**
 * TipTopUp — public page reached via the post-trip SMS.
 *
 * URL: /tip-topup?id=<booking_id>&t=<hmac_token>
 * Backend endpoints:
 *   GET  /api/bookings/{id}/tip-topup-info?t=X → booking summary
 *   POST /api/bookings/{id}/tip-topup?t=X       → { amount, method, note }
 *
 * The extra tip is stored as a "pledge" on the booking (no new card
 * charge). Admin gets an SMS the moment it's submitted so they can
 * reconcile with the driver via cash / Zelle / Venmo.
 */
const QUICK_TIP_AMOUNTS = [5, 10, 20, 40];

export default function TipTopUp() {
  const [params] = useSearchParams();
  const bookingId = params.get("id") || "";
  const token = params.get("t") || "";

  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [amountMode, setAmountMode] = useState(10);
  const [customAmount, setCustomAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    document.title = "Add a tip · Rox Taxi";
  }, []);

  useEffect(() => {
    if (!bookingId || !token) {
      setLoadErr("Missing or expired link. Please open the SMS link again.");
      return;
    }
    api.get(`/bookings/${encodeURIComponent(bookingId)}/tip-topup-info`, { params: { t: token } })
      .then((r) => setInfo(r.data))
      .catch((e) => setLoadErr(e?.response?.data?.detail || "Couldn't load your booking. The link may have expired."));
  }, [bookingId, token]);

  const amount = useMemo(() => {
    if (amountMode === "custom") {
      const n = Number(customAmount);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return Math.min(500, Math.max(1, Math.round(n * 100) / 100));
    }
    return Number(amountMode) || 0;
  }, [amountMode, customAmount]);

  const submit = async () => {
    if (amount < 1) { toast.error("Enter at least $1"); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(
        `/bookings/${encodeURIComponent(bookingId)}/tip-topup`,
        { amount, method, note: note.trim() || undefined },
        { params: { t: token } },
      );
      setSubmitted(true);
      setInfo((prev) => prev ? { ...prev, current_topup: data.pledged_total } : prev);
      toast.success(`Thanks — ${money(amount)} pledged`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't submit your top-up");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadErr) {
    return (
      <div className="min-h-screen bg-[#FBF7EF] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl bg-white border border-[#E2E8F0] p-8 text-center shadow-xl" data-testid="tip-topup-error">
          <div className="text-[10px] tracking-[0.28em] uppercase text-[#DC2626] font-black">Link error</div>
          <h1 className="serif text-3xl text-[#0B3B5C] mt-3">Can't open your top-up</h1>
          <p className="mt-3 text-sm text-[#334155]">{loadErr}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-[#FBF7EF] flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 text-[#D4A94A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FBF7EF] via-white to-[#FBF7EF] py-10 sm:py-16" data-testid="tip-topup-page">
      <div className="max-w-lg mx-auto px-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#D4A94A] to-[#c99738] text-white text-[10px] uppercase tracking-widest font-black px-3 py-1.5 shadow-[0_10px_25px_rgba(212,169,74,0.35)]">
            <HandCoins className="w-3 h-3" /> Post-trip tip top-up
          </div>
          <h1 className="serif text-4xl sm:text-5xl mt-4 leading-tight text-[#0B3B5C]">
            {submitted ? "Thanks 🙏" : `Add a tip for ${info.driver_name || "your driver"}`}
          </h1>
          <p className="mt-3 text-sm text-[#334155] max-w-md mx-auto leading-relaxed">
            {submitted
              ? "We've flagged your top-up to the team — they'll get it to the driver right away."
              : "100% goes to your driver — pay via whichever channel works best for you and confirm the amount here."}
          </p>
        </div>

        {/* Booking snapshot */}
        <div className="mt-8 rounded-2xl bg-white border border-[#E2E8F0] p-5" data-testid="tip-topup-booking-card">
          <div className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black">Your ride</div>
          <div className="mt-1 font-black text-[#0B3B5C]">{info.item_name || "Rox Taxi booking"}</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[#94a3b8]">Booking</div>
              <div className="mono font-bold text-[#0B3B5C] mt-0.5">{info.id}</div>
            </div>
            <div>
              <div className="text-[#94a3b8]">Pre-charged tip</div>
              <div className="mono font-bold text-[#059669] mt-0.5">{money(info.current_tip)}</div>
            </div>
            {info.current_topup > 0 && (
              <div className="col-span-2" data-testid="tip-topup-existing-pledge">
                <div className="text-[#94a3b8]">Already pledged</div>
                <div className="mono font-bold text-[#D4A94A] mt-0.5">+{money(info.current_topup)}</div>
              </div>
            )}
          </div>
        </div>

        {!submitted && (
          <div className="mt-6 rounded-3xl bg-white border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_15px_35px_rgba(11,59,92,0.08)]">
            {/* Amount picker */}
            <div className="text-[10px] tracking-[0.28em] uppercase text-[#0B3B5C] font-black">
              How much would you like to add?
            </div>
            <div className="mt-3 flex flex-wrap gap-2" data-testid="tip-topup-amounts">
              {QUICK_TIP_AMOUNTS.map((amt) => {
                const active = amountMode === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => { setAmountMode(amt); setCustomAmount(""); }}
                    data-testid={`tip-topup-amt-${amt}`}
                    className={`rounded-full border px-5 py-2 text-sm font-bold transition-colors ${
                      active
                        ? "bg-[#0B3B5C] border-[#0B3B5C] text-white"
                        : "bg-white border-[#E2E8F0] text-[#0B3B5C] hover:border-[#D4A94A]"
                    }`}
                  >
                    +${amt}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setAmountMode("custom")}
                data-testid="tip-topup-amt-custom"
                className={`rounded-full border px-5 py-2 text-sm font-bold transition-colors ${
                  amountMode === "custom"
                    ? "bg-[#0B3B5C] border-[#0B3B5C] text-white"
                    : "bg-white border-[#E2E8F0] text-[#0B3B5C] hover:border-[#D4A94A]"
                }`}
              >
                Custom
              </button>
            </div>
            {amountMode === "custom" && (
              <div className="mt-3 flex items-center gap-2">
                <span className="mono text-lg text-[#64748B]">$</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  inputMode="decimal"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Amount"
                  data-testid="tip-topup-custom-input"
                  className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-base mono focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20"
                />
              </div>
            )}

            {/* Payment method */}
            <div className="mt-6 text-[10px] tracking-[0.28em] uppercase text-[#0B3B5C] font-black">
              How will you send it?
            </div>
            <div className="mt-3 flex flex-wrap gap-2" data-testid="tip-topup-methods">
              {[
                { id: "cash", label: "Cash on pickup" },
                { id: "zelle", label: "Zelle" },
                { id: "venmo", label: "Venmo" },
                { id: "paypal", label: "PayPal" },
              ].map((m) => {
                const active = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    data-testid={`tip-topup-method-${m.id}`}
                    className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-colors ${
                      active
                        ? "bg-[#D4A94A] border-[#D4A94A] text-white"
                        : "bg-white border-[#E2E8F0] text-[#0B3B5C] hover:border-[#D4A94A]"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Optional note */}
            <label className="mt-6 block">
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#0B3B5C] font-black">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="Reagan crushed it — the flamingo timing was perfect."
                rows={3}
                data-testid="tip-topup-note"
                className="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm leading-relaxed focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20 resize-none"
              />
              <div className="mt-1 text-[11px] text-[#94a3b8] text-right mono">{note.length}/200</div>
            </label>

            <button
              type="button"
              onClick={submit}
              disabled={amount < 1 || submitting}
              data-testid="tip-topup-submit"
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] text-white px-6 py-3.5 text-base font-bold hover:bg-[#d55a30] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_15px_35px_rgba(232,106,60,0.35)]"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <>Pledge {money(amount || 0)} <Heart className="w-4 h-4" /></>}
            </button>

            <p className="mt-3 text-[11px] text-[#94a3b8] text-center leading-relaxed">
              We'll flag your top-up to the driver. Payment happens through the channel you chose — no extra card charge here.
            </p>
          </div>
        )}

        {submitted && (
          <div className="mt-6 rounded-3xl bg-gradient-to-br from-[#059669] to-[#047857] text-white p-6 text-center" data-testid="tip-topup-thanks">
            <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7" />
            </div>
            <div className="mt-4 serif text-2xl leading-tight">
              We'll get it to {info.driver_name || "your driver"}.
            </div>
            <div className="mt-2 text-sm text-white/85">
              Total pledged: <span className="mono font-black">{money(info.current_topup || 0)}</span>
            </div>
            <div className="mt-6 text-[11px] tracking-[0.28em] uppercase text-white/70">
              <Sparkles className="w-3 h-3 inline mr-1" /> Thanks for riding with us
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
