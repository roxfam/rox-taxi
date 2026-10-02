import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Send, RotateCw, AlertTriangle, CheckCircle2, Users, DollarSign } from "lucide-react";
import { api, money } from "../../lib/api";

/**
 * PaymentRecoveryCard — admin dunning tool for bookings whose payment
 * never actually settled on the owner's Stripe account (common when the
 * preview env was pointing at the shared `sk_test_emergent` sandbox).
 *
 * Preview who will receive the recovery email + SMS, add an optional
 * note, then fire with one click. Shows per-row delivery status after.
 */
const SCOPES = [
  { id: "stripe_test", label: "Stripe test sessions (never settled)", tone: "text-[#DC2626]" },
  { id: "unpaid",      label: "All unpaid bookings",                   tone: "text-[#D4A94A]" },
];

export default function PaymentRecoveryCard() {
  const [scope, setScope] = useState("stripe_test");
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(true);
  const [lastRun, setLastRun] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (nextScope = scope) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/dunning/candidates?scope=${nextScope}&limit=200`);
      setCandidates(data.candidates || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load candidates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(scope); }, [scope]);

  const sendNudges = async () => {
    if (!candidates.length) return;
    if (!window.confirm(`Send payment-recovery nudges to ${candidates.length} ${candidates.length === 1 ? "guest" : "guests"}?`)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/admin/dunning/send-payment-reminder", {
        scope,
        send_email: sendEmail,
        send_sms: sendSms,
        note: note.trim() || null,
      });
      setLastRun(data);
      toast.success(`Nudged ${data.attempted} · ${data.email_sent} emails · ${data.sms_sent} SMS`);
      load(scope);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const outstanding = candidates.reduce((s, c) => s + (parseFloat(c.total) || 0), 0);

  return (
    <section
      className="mt-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm overflow-hidden"
      data-testid="admin-payment-recovery-card"
    >
      <header className="flex items-center justify-between gap-3 p-5 border-b border-[#E2E8F0] bg-gradient-to-r from-[#DC2626]/8 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#DC2626]/12 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-[#DC2626]" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#64748B] font-black">Payment Recovery</div>
            <div className="serif text-xl text-[#0B3B5C] mt-0.5" data-testid="dunning-candidates-count">
              {loading ? "Loading…" : `${candidates.length} ${candidates.length === 1 ? "booking" : "bookings"} · ${money(outstanding)} outstanding`}
            </div>
          </div>
        </div>
        <button onClick={() => load(scope)} className="p-2 rounded-md hover:bg-[#F1F5F9]" data-testid="dunning-refresh">
          <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""} text-[#0B3B5C]`} />
        </button>
      </header>

      <div className="p-5 space-y-4">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.25em] text-[#64748B] font-black mb-2">Scope</label>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold border transition ${
                  scope === s.id
                    ? "bg-[#0B3B5C] text-white border-[#0B3B5C]"
                    : "bg-white border-[#E2E8F0] text-[#0B3B5C] hover:border-[#D4A94A]"
                }`}
                data-testid={`dunning-scope-${s.id}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-[0.25em] text-[#64748B] font-black mb-2">
            Optional note (prepended to the email)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 'During our platform migration last week, charges were queued but not settled on our end — sincere apologies for the inconvenience.'"
            rows={2}
            className="w-full rounded-xl border border-[#E2E8F0] py-2 px-3 text-sm resize-none"
            data-testid="dunning-note"
          />
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <label className="flex items-center gap-2 text-xs text-[#0B3B5C] font-semibold cursor-pointer">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} data-testid="dunning-send-email" />
            <Mail className="w-3.5 h-3.5" /> Email
          </label>
          <label className="flex items-center gap-2 text-xs text-[#0B3B5C] font-semibold cursor-pointer">
            <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} data-testid="dunning-send-sms" />
            <Users className="w-3.5 h-3.5" /> SMS
          </label>
          <button
            onClick={sendNudges}
            disabled={busy || !candidates.length || (!sendEmail && !sendSms)}
            className="btn-shine ml-auto rounded-full bg-[#DC2626] text-white px-5 py-2.5 text-sm font-black uppercase tracking-wider hover:bg-[#B91C1C] active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
            data-testid="dunning-send-btn"
          >
            <Send className="w-4 h-4" />
            {busy ? "Sending…" : `Nudge ${candidates.length} ${candidates.length === 1 ? "guest" : "guests"}`}
          </button>
        </div>

        {candidates.length > 0 && (
          <div className="rounded-xl border border-[#E2E8F0] overflow-hidden">
            <table className="w-full text-xs" data-testid="dunning-candidates-table">
              <thead className="bg-[#F8FAFC] text-[#64748B]">
                <tr>
                  <th className="text-left px-3 py-2 font-black uppercase tracking-wider">Booking</th>
                  <th className="text-left px-3 py-2 font-black uppercase tracking-wider">Guest</th>
                  <th className="text-left px-3 py-2 font-black uppercase tracking-wider">Item</th>
                  <th className="text-right px-3 py-2 font-black uppercase tracking-wider">Total</th>
                  <th className="text-center px-3 py-2 font-black uppercase tracking-wider">Nudges</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {candidates.slice(0, 50).map((c) => (
                  <tr key={c.id} className="hover:bg-[#F8FAFC]" data-testid={`dunning-row-${c.id}`}>
                    <td className="px-3 py-2 mono font-semibold text-[#0B3B5C]">{c.id}</td>
                    <td className="px-3 py-2 text-[#0B3B5C]">
                      <div>{c.customer_name}</div>
                      <div className="text-[10px] text-[#64748B] truncate max-w-[180px]">{c.customer_email}</div>
                    </td>
                    <td className="px-3 py-2 text-[#64748B]">
                      <div className="truncate max-w-[200px]">{c.item_name}</div>
                      <div className="text-[10px]">{c.booking_date ? new Date(c.booking_date).toLocaleDateString() : ""}</div>
                    </td>
                    <td className="px-3 py-2 mono text-right text-[#E86A3C] font-semibold">{money(c.total)}</td>
                    <td className="px-3 py-2 text-center">
                      {c.dunning_count ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#D4A94A] font-black uppercase">
                          <CheckCircle2 className="w-3 h-3" /> {c.dunning_count}x
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#94a3b8]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {candidates.length > 50 && (
              <div className="text-[10px] text-[#64748B] text-center py-2 bg-[#F8FAFC]">
                Showing 50 of {candidates.length} — all will be nudged on send.
              </div>
            )}
          </div>
        )}

        {lastRun && (
          <div className="rounded-xl bg-[#059669]/10 border border-[#059669]/30 p-3 text-xs text-[#065f46]" data-testid="dunning-last-run">
            <div className="font-black uppercase tracking-wider text-[10px] mb-1">Last run</div>
            Attempted {lastRun.attempted} · {lastRun.email_sent} emails sent · {lastRun.sms_sent} SMS sent
            {lastRun.skipped > 0 && <> · {lastRun.skipped} skipped (no contact channel)</>}
          </div>
        )}
      </div>
    </section>
  );
}
