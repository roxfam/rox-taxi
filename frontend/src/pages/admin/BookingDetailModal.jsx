import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  X, FileText, Download, Send, Unlock, Mail, Phone, Calendar, MapPin,
  Plane, CreditCard, ShieldCheck, ShieldOff, Clock, History, DollarSign, AlertTriangle,
  CheckCircle2, Receipt,
} from "lucide-react";
import { api, money, BACKEND_URL } from "../../lib/api";

/**
 * BookingDetailModal — click any admin booking row to open this. Shows:
 *   • Full guest + trip details
 *   • Payment + deposit status
 *   • Flight info (when applicable)
 *   • Status history timeline (`status_history[]`)
 *   • One-tap: Open invoice PDF · Re-email invoice to guest · Reopen for penalty
 *
 * On "Reopen for penalty" we flip the status back to `confirmed`, optionally
 * reset payment_status, and surface the IncidentalModal (via onReopened)
 * so admin can immediately charge the penalty against the saved card /
 * send a Zelle request.
 */
const STATUS_TONE = {
  pending:   "bg-[#F1F5F9] text-[#64748B]",
  confirmed: "bg-[#0B3B5C]/10 text-[#0B3B5C]",
  picked_up: "bg-[#D4A94A]/15 text-[#B47F26]",
  completed: "bg-[#059669]/15 text-[#047857]",
  cancelled: "bg-[#DC2626]/15 text-[#B91C1C]",
  no_show:   "bg-[#E86A3C]/15 text-[#B04524]",
};

export default function BookingDetailModal({ booking, onClose, onChanged, onOpenIncidental }) {
  const [reopenOpen, setReopenOpen] = useState(false);
  const [payEmailOpen, setPayEmailOpen] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const bid = booking.id;
  const invoiceUrl = `${BACKEND_URL}/api/bookings/${bid}/receipt.pdf`;

  const resendInvoice = async () => {
    setResendBusy(true);
    try {
      await api.post(`/admin/bookings/${bid}/resend-notification`);
      toast.success("Invoice email re-sent to guest");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resend failed");
    } finally {
      setResendBusy(false);
    }
  };

  // One-tap "mark complete" — the driver mobile app flips this normally,
  // but admin needs it for walk-ups + Zelle bookings where the driver
  // forgot to tap. Server is idempotent so double-clicks are safe.
  const completeNow = async () => {
    if (!window.confirm(`Mark ${bid} as COMPLETED? This fires the trip-complete email + rating prompt to the guest.`)) return;
    setCompleteBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${bid}/complete`, { note: "Closed by admin" });
      if (data.already_completed) {
        toast.info("Already completed");
      } else {
        toast.success(`${bid} marked complete · guest ping fired`);
      }
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Complete failed");
    } finally {
      setCompleteBusy(false);
    }
  };

  const history = Array.isArray(booking.status_history) ? booking.status_history : [];
  const canReopen = ["completed", "cancelled", "no_show"].includes(booking.status);
  const canComplete = !["completed", "cancelled"].includes(booking.status);
  const hasEmail = !!booking.customer_email;

  return (
    <div className="fixed inset-0 z-[200] bg-[#0B192C]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" data-testid="booking-detail-modal">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[94vh] flex flex-col">
        {/* Header */}
        <header className="relative p-6 border-b border-[#E2E8F0] bg-gradient-to-r from-[#0B3B5C] to-[#132a4a] text-white">
          <button onClick={onClose} className="absolute top-5 right-5 w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center" data-testid="booking-detail-close">
            <X className="w-5 h-5" />
          </button>
          <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">Booking detail</div>
          <h2 className="serif text-3xl mt-1 flex items-center gap-3 flex-wrap">
            <span className="mono">{bid}</span>
            <span className={`inline-flex items-center text-[11px] font-black uppercase px-2.5 py-1 rounded-full ${STATUS_TONE[booking.status] || "bg-white/20"}`} data-testid="booking-detail-status">
              {booking.status?.replace("_", " ")}
            </span>
          </h2>
          <div className="text-sm text-white/80 mt-1">{booking.customer_name} · {money(booking.total)}</div>
        </header>

        <div className="overflow-y-auto p-6 space-y-5">
          {/* Primary actions */}
          <div className="flex flex-wrap gap-2">
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-shine inline-flex items-center gap-1.5 rounded-full bg-[#0B3B5C] text-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#132a4a] active:scale-95"
              data-testid="booking-detail-open-invoice"
            >
              <FileText className="w-3.5 h-3.5" /> Open invoice PDF
            </a>
            <a
              href={invoiceUrl}
              download={`rox-invoice-${bid}.pdf`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#0B3B5C] text-[#0B3B5C] bg-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#0B3B5C] hover:text-white active:scale-95"
              data-testid="booking-detail-download-invoice"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
            <button
              onClick={resendInvoice}
              disabled={resendBusy || !booking.customer_email}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D4A94A] text-[#B47F26] bg-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#D4A94A] hover:text-white active:scale-95 disabled:opacity-50"
              data-testid="booking-detail-resend-invoice"
            >
              <Send className="w-3.5 h-3.5" /> {resendBusy ? "Sending…" : "Re-email invoice"}
            </button>
            <button
              onClick={() => setPayEmailOpen(true)}
              disabled={!hasEmail}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#0B3B5C] text-[#0B3B5C] bg-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#0B3B5C] hover:text-white active:scale-95 disabled:opacity-50"
              title={hasEmail ? "Send a one-tap pay link + invoice PDF to the guest" : "Guest has no email on file"}
              data-testid="booking-detail-email-payment"
            >
              <Receipt className="w-3.5 h-3.5" /> Email for payment
            </button>
            {canComplete && (
              <button
                onClick={completeNow}
                disabled={completeBusy}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#059669] text-[#047857] bg-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#059669] hover:text-white active:scale-95 disabled:opacity-50"
                title="Mark the ride complete + fire the trip-complete rating ping"
                data-testid="booking-detail-complete"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> {completeBusy ? "Completing…" : "Mark complete"}
              </button>
            )}
            {canReopen && (
              <button
                onClick={() => setReopenOpen(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#E86A3C] text-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#d55a30] active:scale-95"
                data-testid="booking-detail-reopen"
              >
                <Unlock className="w-3.5 h-3.5" /> Reopen for penalty
              </button>
            )}
          </div>

          {/* Guest + Trip */}
          <div className="grid sm:grid-cols-2 gap-3">
            <InfoCard title="Guest">
              <Row icon={Mail} label="Email">{booking.customer_email || "—"}</Row>
              <Row icon={Phone} label="Phone">{booking.customer_phone || "—"}</Row>
            </InfoCard>
            <InfoCard title="Trip">
              <Row icon={Calendar} label="Date">
                {booking.booking_date ? new Date(booking.booking_date).toLocaleString() : "—"}
              </Row>
              <Row icon={MapPin} label="Service">{booking.item_name} ({booking.service_type})</Row>
            </InfoCard>
          </div>

          {(booking.pickup_location || booking.dropoff_location) && (
            <InfoCard title="Route">
              {booking.pickup_location && <Row icon={MapPin} label="Pickup">{booking.pickup_location}</Row>}
              {booking.dropoff_location && <Row icon={MapPin} label="Drop">{booking.dropoff_location}</Row>}
            </InfoCard>
          )}

          {booking.flight_number && (
            <InfoCard title="Flight">
              <Row icon={Plane} label={booking.flight_number}>
                {booking.flight_last_snapshot?.status || "scheduled"} ·
                {" "}{Array.isArray(booking.flight_events) ? booking.flight_events.length : 0} fan-out events fired
              </Row>
            </InfoCard>
          )}

          <InfoCard title="Payment">
            <Row icon={DollarSign} label="Status">
              <span className={`inline-flex items-center text-[11px] font-black uppercase px-2 py-0.5 rounded ${
                booking.payment_status === "paid" ? "bg-[#059669]/15 text-[#047857]" : "bg-[#DC2626]/15 text-[#B91C1C]"
              }`}>{booking.payment_status || "unpaid"}</span>
              <span className="ml-2 text-xs text-[#64748B]">{booking.payment_method || "—"}</span>
            </Row>
            <Row icon={DollarSign} label="Total">{money(booking.total)}</Row>
            {booking.deposit_amount > 0 && (
              <Row icon={booking.deposit_status === "released" ? ShieldCheck : ShieldOff} label="Deposit">
                {money(booking.deposit_amount)} · {booking.deposit_status || "held"}
              </Row>
            )}
            {booking.card_hold?.payment_method_id && (
              <Row icon={CreditCard} label="Card on file">
                {booking.card_hold.card_brand?.toUpperCase() || "CARD"} •••• {booking.card_hold.card_last4 || "····"}
              </Row>
            )}
          </InfoCard>

          {/* Status timeline */}
          <InfoCard title="Status history" icon={History}>
            {history.length === 0 ? (
              <div className="text-xs text-[#64748B]">
                No transitions recorded. Current status set at {booking.created_at ? new Date(booking.created_at).toLocaleString() : "—"}.
              </div>
            ) : (
              <ol className="relative border-l border-[#E2E8F0] ml-2 space-y-3 pl-4" data-testid="status-history-list">
                {history.slice().reverse().map((h, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-0 w-3 h-3 rounded-full bg-[#D4A94A] border-2 border-white" />
                    <div className="text-sm text-[#0B3B5C] font-semibold">
                      {h.from} → <span className="text-[#059669]">{h.to}</span>
                      {h.intent === "reopen_for_penalty" && <span className="ml-2 text-[10px] uppercase tracking-widest text-[#E86A3C] font-black">penalty</span>}
                    </div>
                    {h.reason && <div className="text-xs text-[#64748B] italic mt-0.5">"{h.reason}"</div>}
                    <div className="text-[10px] text-[#94a3b8] mt-0.5 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {h.at ? new Date(h.at).toLocaleString() : "—"} · by {h.actor || "system"}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </InfoCard>

          {booking.notes && (
            <InfoCard title="Notes">
              <div className="text-sm text-[#0B3B5C] whitespace-pre-wrap">{booking.notes}</div>
            </InfoCard>
          )}
        </div>
      </div>

      {reopenOpen && (
        <ReopenPenaltyDialog
          booking={booking}
          onClose={() => setReopenOpen(false)}
          onDone={() => { setReopenOpen(false); onChanged?.(); onClose(); onOpenIncidental?.(booking); }}
        />
      )}
      {payEmailOpen && (
        <SendPaymentEmailDialog
          booking={booking}
          onClose={() => setPayEmailOpen(false)}
          onDone={() => { setPayEmailOpen(false); onChanged?.(); }}
        />
      )}
    </div>
  );
}

/**
 * SendPaymentEmailDialog — admin composes an optional personal note
 * ("Driver mentioned you'd prefer card over Zelle — here's the link")
 * then fires an email with a one-tap pay button + the invoice PDF
 * attached. Rate-limited server-side to 1 send per 60s per booking.
 */
function SendPaymentEmailDialog({ booking, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const paid = (booking.payment_status || "").toLowerCase() === "paid";

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/send-payment-email`, {
        message: note.trim() || undefined,
      });
      if (data.sent) {
        toast.success(`Email sent to ${data.to}`);
      } else {
        toast.error(`Email provider error: ${data.error || "unknown"}`);
      }
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] bg-[#0B192C]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" data-testid="send-payment-email-dialog">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-[#E2E8F0] bg-gradient-to-r from-[#0B3B5C]/5 to-transparent">
          <div className="text-xs tracking-[0.3em] uppercase text-[#0B3B5C] font-black inline-flex items-center gap-1">
            <Receipt className="w-3.5 h-3.5" /> {paid ? "Resend receipt" : "Email for payment"}
          </div>
          <h2 className="serif text-xl text-[#0B3B5C] mt-1">
            Send to <strong>{booking.customer_email}</strong>
          </h2>
          <p className="text-xs text-[#64748B] mt-1.5">
            {paid
              ? "The guest will get a thank-you email with the branded invoice PDF attached."
              : <>They'll get a one-tap pay button for <strong>{money(booking.total)}</strong> plus the invoice PDF.</>
            }
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.25em] text-[#64748B] font-black mb-2">
              Note to guest (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="e.g. 'As we discussed on the phone, here's your pay link…'"
              className="w-full rounded-xl border border-[#E2E8F0] py-2 px-3 text-sm resize-none"
              data-testid="payment-email-note"
            />
            <div className="text-[10px] text-[#94a3b8] text-right mt-1">{note.length}/600</div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-full border border-[#E2E8F0] px-4 py-2 text-sm" data-testid="payment-email-cancel">Cancel</button>
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-full bg-[#0B3B5C] text-white px-4 py-2 text-sm font-semibold hover:bg-[#132a4a] disabled:opacity-60"
              data-testid="payment-email-send"
            >
              {busy ? "Sending…" : paid ? "Send receipt" : "Send pay link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-[#64748B] font-black mb-2 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2 text-sm text-[#0B3B5C]">
      {Icon && <Icon className="w-3.5 h-3.5 text-[#D4A94A] shrink-0 mt-0.5" />}
      <span className="text-[#64748B] text-xs min-w-[70px]">{label}</span>
      <span className="flex-1 min-w-0">{children}</span>
    </div>
  );
}

function ReopenPenaltyDialog({ booking, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [resetPayment, setResetPayment] = useState(false);
  const [busy, setBusy] = useState(false);
  const presets = [
    "Guest left visible damage in the vehicle",
    "Late return (vehicle rental)",
    "Extra cleaning / detailing required",
    "Toll / parking charge not settled",
    "No-show fee waiver reversal",
  ];

  const submit = async () => {
    const r = reason.trim();
    if (r.length < 3) return toast.error("Reason too short");
    setBusy(true);
    try {
      await api.post(`/admin/bookings/${booking.id}/reopen`, { reason: r, reset_payment: resetPayment });
      toast.success(`Reopened ${booking.id} — now assess the penalty`);
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reopen failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] bg-[#0B192C]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" data-testid="reopen-penalty-dialog">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-[#E2E8F0] bg-gradient-to-r from-[#E86A3C]/10 to-transparent">
          <div className="text-xs tracking-[0.3em] uppercase text-[#E86A3C] font-black inline-flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Reopen for penalty
          </div>
          <h2 className="serif text-xl text-[#0B3B5C] mt-1">
            Flip <span className="mono">{booking.id}</span> back to confirmed?
          </h2>
          <p className="text-xs text-[#64748B] mt-1.5">
            Status will revert from <strong>{booking.status}</strong> → <strong>confirmed</strong>. Once reopened, the
            incidental modal opens so you can charge the saved card or request Zelle.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.25em] text-[#64748B] font-black mb-2">Reason</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => setReason(p)}
                  className={`text-[10px] px-2 py-1 rounded-full border font-semibold transition ${
                    reason === p ? "bg-[#0B3B5C] text-white border-[#0B3B5C]" : "border-[#E2E8F0] text-[#0B3B5C] hover:border-[#D4A94A]"
                  }`}
                  data-testid={`reopen-preset-${p.slice(0,8).replace(/\s/g,"-").toLowerCase()}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Describe the penalty cause…"
              className="w-full rounded-xl border border-[#E2E8F0] py-2 px-3 text-sm resize-none"
              data-testid="reopen-reason"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#0B3B5C] font-semibold cursor-pointer">
            <input type="checkbox" checked={resetPayment} onChange={(e) => setResetPayment(e.target.checked)} data-testid="reopen-reset-payment" />
            Also flip <strong>payment_status</strong> back to unpaid (so the penalty is treated as a new charge)
          </label>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-full border border-[#E2E8F0] px-4 py-2 text-sm" data-testid="reopen-cancel">Cancel</button>
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-full bg-[#E86A3C] text-white px-4 py-2 text-sm font-semibold hover:bg-[#d55a30] disabled:opacity-60"
              data-testid="reopen-submit"
            >
              {busy ? "Reopening…" : "Reopen & assess penalty"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
