import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Wallet, RotateCw, Send, Clock, AlertTriangle } from "lucide-react";
import { api, money } from "../../lib/api";

/**
 * AdminBalanceDuePanel — "Balance due" dashboard card.
 *
 * Lists every booking with `balance_due > 0`, showing the guest, trip
 * countdown (days to trip), last reminder status, and an admin-initiated
 * "Resend balance link" button that fires an immediate SMS + Email nudge
 * via the same `notify_balance_capture_reminder` channel the cron uses.
 */
function countdownBadge(days) {
  if (days == null) return { label: "—", cls: "bg-slate-100 text-slate-600" };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, cls: "bg-red-100 text-red-700" };
  if (days < 2) return { label: `${days}d · urgent`, cls: "bg-red-100 text-red-700" };
  if (days < 7) return { label: `${days}d`, cls: "bg-amber-100 text-amber-800" };
  return { label: `${days}d`, cls: "bg-emerald-100 text-emerald-800" };
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AdminBalanceDuePanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/balance-due");
      setRows(Array.isArray(r.data?.bookings) ? r.data.bookings : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load balance-due list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const outstanding = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r.balance_due) || 0), 0),
    [rows]
  );

  const resend = async (row) => {
    if (!window.confirm(`Resend balance link to ${row.customer_name || row.customer_email}?\nSMS + Email will fire immediately.`)) return;
    setBusy((b) => ({ ...b, [row.id]: true }));
    try {
      const r = await api.post(`/admin/balance-due/${row.id}/resend-link`);
      const emailOk = r.data?.report?.email?.sent;
      const smsOk = r.data?.report?.sms?.sent;
      toast.success(`Balance link sent · ${emailOk ? "✓ email" : "× email"} · ${smsOk ? "✓ SMS" : "× SMS"}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resend failed");
    } finally {
      setBusy((b) => ({ ...b, [row.id]: false }));
    }
  };

  if (!loading && rows.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden" data-testid="admin-balance-due-panel">
      <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E86A3C]/10 flex items-center justify-center text-[#E86A3C]">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#0B3B5C]">Balance due · group bookings</div>
            <div className="text-xs text-[#64748B] mt-0.5">
              {rows.length} booking{rows.length === 1 ? "" : "s"} with outstanding balance ·
              <span className="font-bold text-[#E86A3C] ml-1" data-testid="admin-balance-due-total">{money(outstanding)}</span> total
            </div>
          </div>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-md hover:bg-[#F1F5F9]"
          data-testid="admin-balance-due-refresh"
          title="Refresh list"
        >
          <RotateCw className={`w-4 h-4 text-[#64748B] ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] text-[#64748B] text-xs">
            <tr>
              <th className="text-left px-5 py-2.5">Guest</th>
              <th className="text-left px-5 py-2.5">Trip</th>
              <th className="text-left px-5 py-2.5">Countdown</th>
              <th className="text-right px-5 py-2.5">Balance</th>
              <th className="text-left px-5 py-2.5">Last reminder</th>
              <th className="text-right px-5 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-6 text-[#64748B]">Loading…</td></tr>
            ) : rows.map((r) => {
              const cd = countdownBadge(r.days_to_trip);
              return (
                <tr key={r.id} className="border-t border-[#E2E8F0]" data-testid={`admin-balance-due-row-${r.id}`}>
                  <td className="px-5 py-3">
                    <div className="text-[#0B3B5C] font-semibold">{r.customer_name || "—"}</div>
                    <div className="text-[11px] text-[#64748B] mono mt-0.5">{r.id}</div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">{r.customer_email || r.customer_phone || ""}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-[#0B3B5C] font-medium">{r.item_name || "—"}</div>
                    <div className="text-[11px] text-[#64748B] mt-0.5">{fmtDate(r.booking_date)}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cd.cls}`} data-testid={`admin-balance-due-countdown-${r.id}`}>
                      {r.days_to_trip != null && r.days_to_trip < 2 && <AlertTriangle className="w-3 h-3" />}
                      {cd.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="text-[#E86A3C] font-bold font-mono">{money(r.balance_due)}</div>
                    {r.deposit_amount > 0 && (
                      <div className="text-[10px] text-[#64748B] mt-0.5">Deposit {money(r.deposit_amount)} paid</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[#64748B]">
                    {r.balance_reminded_at ? (
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="w-3 h-3" />{fmtDate(r.balance_reminded_at)}
                      </div>
                    ) : (
                      <span className="text-xs text-[#94A3B8]">Not sent yet</span>
                    )}
                    {r.reminder_count > 0 && (
                      <div className="text-[10px] text-[#64748B] mt-0.5">{r.reminder_count} nudge{r.reminder_count === 1 ? "" : "s"} sent</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      disabled={!!busy[r.id]}
                      onClick={() => resend(r)}
                      className="inline-flex items-center gap-1 rounded-full bg-[#E86A3C] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#D45A2E] disabled:opacity-50"
                      data-testid={`admin-balance-due-resend-${r.id}`}
                    >
                      <Send className="w-3 h-3" />
                      {busy[r.id] ? "Sending…" : "Resend link"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
