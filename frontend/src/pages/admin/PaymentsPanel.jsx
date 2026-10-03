import { useEffect, useMemo, useState } from "react";
import { api, money } from "../../lib/api";
import { toast } from "sonner";
import { Search, RefreshCw, DollarSign, CheckCircle2, Mail, X } from "lucide-react";

const STATUS_COLORS = {
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  refunded: "bg-slate-200 text-slate-700",
  partially_refunded: "bg-indigo-100 text-indigo-700",
  refund_pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  initiated: "bg-blue-100 text-blue-700",
};

// Admin Payments panel — merges Stripe + PayPal + Zelle rows so the operator
// has one screen to reconcile revenue. Refund (full OR partial) + "Mark Zelle
// received" + "Resend refund email" are one-click actions.
export default function PaymentsPanel() {
  const [data, setData] = useState({ rows: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [refundModal, setRefundModal] = useState(null); // {row, amount, remaining, busy}
  const [resending, setResending] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/payments");
      setData(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    let out = data.rows || [];
    if (filter !== "all") out = out.filter((r) => String(r.status).toLowerCase() === filter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      out = out.filter((r) => (r.booking_id || "").toLowerCase().includes(s) ||
        (r.customer_name || "").toLowerCase().includes(s) ||
        (r.customer_email || "").toLowerCase().includes(s));
    }
    return out;
  }, [data.rows, q, filter]);

  const markZelle = async (bookingId) => {
    if (!window.confirm(`Mark Zelle payment received for booking ${bookingId}?`)) return;
    try {
      await api.post("/admin/payments/zelle-mark-paid", { booking_id: bookingId });
      toast.success(`Zelle payment for ${bookingId} confirmed`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to mark paid");
    }
  };

  const openRefund = (r) => {
    const already = Number(r.refund_amount || 0);
    const remaining = Math.max(0, Number(r.amount || 0) - already);
    setRefundModal({ row: r, amount: remaining.toFixed(2), remaining, reason: "", busy: false });
  };

  const refund = async (paymentId, { amount, reason }) => {
    await api.post(`/admin/payments/${encodeURIComponent(paymentId)}/refund`, { amount, reason });
  };

  const confirmRefund = async () => {
    if (!refundModal) return;
    const amt = Number(refundModal.amount);
    const reason = (refundModal.reason || "").trim();
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a refund amount greater than $0.");
      return;
    }
    if (amt > refundModal.remaining + 0.001) {
      toast.error(`Refund cannot exceed the ${money(refundModal.remaining)} remaining on this payment.`);
      return;
    }
    setRefundModal((m) => ({ ...m, busy: true }));
    try {
      const { data: res } = await api.post(
        `/admin/payments/${encodeURIComponent(refundModal.row.id)}/refund`,
        { amount: amt, reason },
      );
      if (res?.refund?.refunded === false) {
        toast.warning("Provider could not auto-refund — guest emailed with manual follow-up ETA.");
      } else {
        toast.success(`Refund of ${money(amt)} issued`);
      }
      setRefundModal(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Refund failed");
      setRefundModal((m) => (m ? { ...m, busy: false } : m));
    }
  };

  const resendRefundEmail = async (r) => {
    const extra = window.prompt("Add a short note for this re-send (optional, leave blank to keep the original reason):", "");
    if (extra === null) return; // user cancelled
    setResending((p) => ({ ...p, [r.id]: true }));
    try {
      const { data: res } = await api.post(
        `/admin/payments/${encodeURIComponent(r.id)}/resend-refund-email`,
        extra ? { reason: extra } : {},
      );
      const sent = res?.report?.email?.sent;
      toast[sent ? "success" : "warning"](sent
        ? `Refund email re-sent to ${r.customer_email || "guest"}`
        : `Email provider reported: ${res?.report?.email?.error || "not sent"}`
      );
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resend failed");
    } finally {
      setResending((p) => ({ ...p, [r.id]: false }));
    }
  };

  const t = data.totals || {};
  return (
    <div data-testid="payments-panel">
      {/* Totals row */}
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        {[
          { k: "today_usd",  label: "Today" },
          { k: "week_usd",   label: "Last 7 days" },
          { k: "month_usd",  label: "Last 30 days" },
          { k: "total_usd",  label: "All time" },
        ].map(({ k, label }) => (
          <div key={k} className="rounded-2xl bg-white border border-[#E2E8F0] p-5" data-testid={`payments-total-${k}`}>
            <div className="text-[10px] tracking-[0.28em] uppercase text-[#64748B]">{label}</div>
            <div className="mt-2 mono text-2xl text-[#0B3B5C] font-black">${(t[k] || 0).toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* Filter + search */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by booking, name, or email"
            className="w-full rounded-full border border-[#E2E8F0] pl-9 pr-4 py-2 text-sm"
            data-testid="payments-search"
          />
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-white border border-[#E2E8F0] p-1 text-xs">
          {["all", "paid", "pending", "refunded", "failed"].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              data-testid={`payments-filter-${k}`}
              className={`px-3 py-1.5 rounded-full font-semibold ${filter === k ? "bg-[#0B3B5C] text-white" : "text-[#0B3B5C] hover:bg-[#F1F5F9]"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <button onClick={load} className="rounded-full border border-[#E2E8F0] px-3 py-2 text-xs inline-flex items-center gap-1.5" data-testid="payments-refresh">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] text-[#64748B] text-xs">
            <tr>
              <th className="text-left px-4 py-3">Provider</th>
              <th className="text-left px-4 py-3">Booking</th>
              <th className="text-left px-4 py-3">Customer</th>
              <th className="text-left px-4 py-3">Item</th>
              <th className="text-right px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-[#64748B]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-[#64748B]">No payments match this filter.</td></tr>
            ) : rows.map((r) => {
              const statusLower = String(r.status || "").toLowerCase();
              const isPaid = statusLower === "paid";
              const isPartial = statusLower === "partially_refunded";
              const isRefunded = statusLower === "refunded" || isPartial;
              const canRefund = (isPaid || isPartial) && r.provider !== "zelle";
              return (
                <tr key={r.id} className="border-t border-[#E2E8F0]" data-testid={`payments-row-${r.booking_id}`}>
                  <td className="px-4 py-3 uppercase text-[11px] font-bold text-[#0B3B5C]">{r.provider}</td>
                  <td className="px-4 py-3 mono text-[#0B3B5C]">{r.booking_id || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="text-[#0B3B5C]">{r.customer_name || "—"}</div>
                    <div className="text-xs text-[#64748B]">{r.customer_email}</div>
                  </td>
                  <td className="px-4 py-3 text-[#64748B]">{r.item_name || "—"}</td>
                  <td className="px-4 py-3 text-right mono font-semibold text-[#0B3B5C]">
                    {money(r.amount)}
                    {Number(r.refund_amount) > 0 && (
                      <div className="text-[10px] text-indigo-600 mt-0.5">
                        −{money(r.refund_amount)} refunded
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[statusLower] || "bg-slate-100 text-slate-600"}`}>
                      {String(r.status || "").replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                      {r.provider === "zelle" && r.status === "pending" && (
                        <button
                          onClick={() => markZelle(r.booking_id)}
                          className="inline-flex items-center gap-1 rounded-full bg-[#D4A94A] text-[#0B192C] px-3 py-1 text-xs font-bold hover:bg-[#e0b856]"
                          data-testid={`payments-mark-zelle-${r.booking_id}`}
                        >
                          <CheckCircle2 className="w-3 h-3" /> Mark received
                        </button>
                      )}
                      {canRefund && (
                        <button
                          onClick={() => openRefund(r)}
                          className="inline-flex items-center gap-1 rounded-full border border-red-200 text-red-600 px-3 py-1 text-xs font-bold hover:bg-red-50"
                          data-testid={`payments-refund-${r.booking_id}`}
                        >
                          <DollarSign className="w-3 h-3" /> {isPartial ? "Refund more" : "Refund"}
                        </button>
                      )}
                      {isRefunded && (
                        <button
                          onClick={() => resendRefundEmail(r)}
                          disabled={!!resending[r.id]}
                          className="inline-flex items-center gap-1 rounded-full border border-[#0B3B5C]/30 text-[#0B3B5C] px-3 py-1 text-xs font-bold hover:bg-[#0B3B5C]/5 disabled:opacity-50"
                          data-testid={`payments-resend-refund-email-${r.booking_id}`}
                        >
                          <Mail className="w-3 h-3" /> {resending[r.id] ? "Sending…" : "Resend email"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Partial-refund modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="refund-modal">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-[10px] tracking-[0.24em] uppercase text-[#D4A94A] font-bold">Issue refund</div>
                <h3 className="serif text-xl text-[#0B3B5C] mt-1">
                  {refundModal.row.booking_id}
                </h3>
                <div className="text-xs text-[#64748B] mt-0.5">
                  {refundModal.row.customer_name} · {refundModal.row.customer_email}
                </div>
              </div>
              <button onClick={() => setRefundModal(null)} className="p-1 rounded hover:bg-[#F1F5F9]" data-testid="refund-modal-close">
                <X className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 mb-4">
              <div className="flex justify-between text-xs text-[#64748B]">
                <span>Paid total</span>
                <span className="mono">{money(refundModal.row.amount)}</span>
              </div>
              {Number(refundModal.row.refund_amount) > 0 && (
                <div className="flex justify-between text-xs text-indigo-600 mt-1">
                  <span>Already refunded</span>
                  <span className="mono">−{money(refundModal.row.refund_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-[#0B3B5C] mt-2 pt-2 border-t border-[#E2E8F0]">
                <span>Remaining</span>
                <span className="mono">{money(refundModal.remaining)}</span>
              </div>
            </div>

            <label className="block text-xs font-bold text-[#0B3B5C] mb-1">Refund amount (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={refundModal.remaining}
                value={refundModal.amount}
                onChange={(e) => setRefundModal((m) => ({ ...m, amount: e.target.value }))}
                className="w-full rounded-lg border border-[#E2E8F0] pl-7 pr-3 py-2 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#0B3B5C]/20"
                data-testid="refund-amount-input"
                autoFocus
              />
            </div>
            <div className="flex gap-1.5 mt-2">
              {[0.25, 0.5, 1].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setRefundModal((m) => ({ ...m, amount: (m.remaining * pct).toFixed(2) }))}
                  className="flex-1 rounded-md border border-[#E2E8F0] py-1.5 text-[11px] text-[#64748B] hover:bg-[#F1F5F9]"
                  data-testid={`refund-preset-${Math.round(pct * 100)}`}
                >
                  {Math.round(pct * 100)}%
                </button>
              ))}
            </div>

            <label className="block text-xs font-bold text-[#0B3B5C] mt-4 mb-1">
              Reason <span className="font-normal text-[#64748B]">(optional — shown on guest receipt)</span>
            </label>
            <textarea
              rows={2}
              maxLength={240}
              value={refundModal.reason || ""}
              onChange={(e) => setRefundModal((m) => ({ ...m, reason: e.target.value }))}
              placeholder="e.g. Weather cancellation · duplicate charge · goodwill adjustment"
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0B3B5C]/20"
              data-testid="refund-reason-input"
            />
            <div className="text-[10px] text-[#64748B] text-right mt-0.5">{(refundModal.reason || "").length}/240</div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setRefundModal(null)}
                className="flex-1 rounded-full border border-[#E2E8F0] py-2.5 text-sm font-semibold text-[#0B3B5C] hover:bg-[#F1F5F9]"
                data-testid="refund-cancel"
              >
                Cancel
              </button>
              <button
                onClick={confirmRefund}
                disabled={refundModal.busy}
                className="flex-1 rounded-full bg-red-600 text-white py-2.5 text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                data-testid="refund-confirm"
              >
                {refundModal.busy ? "Processing…" : `Refund ${money(Number(refundModal.amount || 0))}`}
              </button>
            </div>
            <p className="text-[11px] text-[#64748B] mt-3 text-center">
              Guest will receive an email receipt the moment this completes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
