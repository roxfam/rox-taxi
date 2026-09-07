import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, money } from "../../lib/api";
import { TrendingUp, TrendingDown, Send, RefreshCw, Mail } from "lucide-react";

/**
 * WeeklyReportCard — 7-day sales & transactions rollup for the admin
 * dashboard. Mirrors the numbers in the auto-emailed Monday-morning
 * report so the owner sees the same picture on-screen and in inbox.
 */
export default function WeeklyReportCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [days, setDays] = useState(7);

  const load = async (windowDays = days) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/analytics/weekly-report?days=${windowDays}`);
      setData(data);
    } catch {
      // silent — card just hides on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(days); /* eslint-disable-next-line */ }, [days]);

  const sendNow = async () => {
    setSending(true);
    try {
      await api.post("/admin/analytics/weekly-report/send-now");
      toast.success("Weekly report emailed to the owner inbox");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setSending(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="mt-6 bg-white rounded-xl border border-[#E2E8F0] p-6" data-testid="weekly-report-card-loading">
        <div className="text-sm text-[#64748B]">Loading weekly report…</div>
      </div>
    );
  }
  if (!data) return null;

  const { totals, delta, prev_period, daily, top_services, by_payment_method, deliverability } = data;

  const DeltaChip = ({ pct, prev, label }) => {
    if (pct === null || pct === undefined) {
      return <span className="text-[11px] text-[#94a3b8]">vs prev — no data</span>;
    }
    const up = pct >= 0;
    const Icon = up ? TrendingUp : TrendingDown;
    const color = up ? "text-[#059669]" : "text-[#DC2626]";
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${color}`}>
        <Icon className="w-3 h-3" /> {up ? "+" : ""}{pct}% <span className="text-[#94a3b8] font-normal">vs {label} {prev}</span>
      </span>
    );
  };

  const maxDaily = Math.max(...(daily || []).map((d) => d.revenue), 1);

  return (
    <div className="mt-6 bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="weekly-report-card">
      <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold">
            <TrendingUp className="w-3 h-3" /> Weekly report
          </div>
          <h3 className="mt-1 font-[Georgia] text-[#0B3B5C] text-xl">Last {data.days} days</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="text-xs border border-[#E2E8F0] rounded-md px-2 py-1.5 bg-white text-[#0B3B5C]"
            data-testid="weekly-report-days-select"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            onClick={() => load(days)}
            className="inline-flex items-center gap-1 rounded-md bg-[#F1F5F9] text-[#0B3B5C] text-xs font-semibold px-3 py-1.5 hover:bg-[#E2E8F0]"
            data-testid="weekly-report-refresh"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          <button
            onClick={sendNow}
            disabled={sending}
            className="inline-flex items-center gap-1 rounded-md bg-[#0B3B5C] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[#082941] disabled:opacity-60"
            data-testid="weekly-report-send-now"
            title="Email this report to the owner inbox now"
          >
            <Send className="w-3 h-3" /> {sending ? "Sending…" : "Email me now"}
          </button>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#FBF7EF] rounded-lg p-4 border border-[#E2E8F0]" data-testid="weekly-revenue-stat">
          <div className="text-[10px] uppercase tracking-[.18em] text-[#64748B] font-bold">Revenue</div>
          <div className="mt-1 text-2xl font-black text-[#0B3B5C] font-mono">{money(totals.revenue)}</div>
          <div className="mt-1"><DeltaChip pct={delta?.revenue_pct} prev={money(prev_period?.revenue || 0)} label="prev" /></div>
        </div>
        <div className="bg-[#FBF7EF] rounded-lg p-4 border border-[#E2E8F0]" data-testid="weekly-bookings-stat">
          <div className="text-[10px] uppercase tracking-[.18em] text-[#64748B] font-bold">Paid bookings</div>
          <div className="mt-1 text-2xl font-black text-[#0B3B5C]">{totals.paid_bookings}</div>
          <div className="mt-1"><DeltaChip pct={delta?.paid_bookings_pct} prev={prev_period?.paid_bookings || 0} label="prev" /></div>
        </div>
        <div className="bg-[#FBF7EF] rounded-lg p-4 border border-[#E2E8F0]" data-testid="weekly-avg-stat">
          <div className="text-[10px] uppercase tracking-[.18em] text-[#64748B] font-bold">Avg ticket</div>
          <div className="mt-1 text-2xl font-black text-[#0B3B5C] font-mono">{money(totals.avg_ticket)}</div>
          <div className="mt-1 text-[11px] text-[#94a3b8]">Tips {money(totals.tips_collected)} · Top-ups {money(totals.tips_topup_pledged)}</div>
        </div>
      </div>

      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daily sparkline */}
        <div className="bg-white rounded-lg p-4 border border-[#E2E8F0]" data-testid="weekly-daily-chart">
          <div className="text-[11px] uppercase tracking-[.16em] text-[#64748B] font-bold mb-3">Daily revenue</div>
          <div className="flex items-end gap-1 h-24">
            {(daily || []).map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full bg-[#D4A94A]/60 hover:bg-[#D4A94A] rounded-t transition-colors"
                  style={{ height: `${Math.max(2, (d.revenue / maxDaily) * 88)}px` }}
                  title={`${d.date}: ${money(d.revenue)} · ${d.count} bookings`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[9px] text-[#94a3b8]">
            <span>{(daily || [])[0]?.date?.slice(5)}</span>
            <span>{(daily || [])[(daily?.length || 1) - 1]?.date?.slice(5)}</span>
          </div>
        </div>

        {/* Top services */}
        <div className="bg-white rounded-lg p-4 border border-[#E2E8F0]" data-testid="weekly-top-services">
          <div className="text-[11px] uppercase tracking-[.16em] text-[#64748B] font-bold mb-3">Top services</div>
          {(top_services || []).length === 0 ? (
            <div className="text-[12px] text-[#94a3b8] py-3">No paid bookings in this window.</div>
          ) : (
            <div className="space-y-2">
              {top_services.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-[12px]" data-testid={`weekly-service-row-${s.name}`}>
                  <div className="truncate text-[#0B3B5C] font-semibold">{s.name}</div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[#64748B]">{s.count}×</span>
                    <span className="font-mono text-[#0B3B5C]">{money(s.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payment methods */}
        <div className="bg-white rounded-lg p-4 border border-[#E2E8F0]" data-testid="weekly-payment-methods">
          <div className="text-[11px] uppercase tracking-[.16em] text-[#64748B] font-bold mb-3">Payment methods</div>
          {Object.keys(by_payment_method || {}).length === 0 ? (
            <div className="text-[12px] text-[#94a3b8] py-3">—</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(by_payment_method).map(([method, v]) => (
                <div key={method} className="flex items-center justify-between text-[12px]" data-testid={`weekly-method-row-${method}`}>
                  <div className="uppercase tracking-wider text-[#64748B] font-semibold text-[10px]">{method}</div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[#64748B]">{v.count}×</span>
                    <span className="font-mono text-[#0B3B5C]">{money(v.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deliverability */}
        <div className="bg-white rounded-lg p-4 border border-[#E2E8F0]" data-testid="weekly-deliverability">
          <div className="text-[11px] uppercase tracking-[.16em] text-[#64748B] font-bold mb-3 inline-flex items-center gap-1.5">
            <Mail className="w-3 h-3" /> Notification health
          </div>
          <div className="space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-[#64748B]">Email sent</span>
              <span className="font-mono text-[#059669] font-bold">{deliverability.email_sent}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Email failed</span>
              <span className={`font-mono font-bold ${deliverability.email_failed ? "text-[#DC2626]" : "text-[#94a3b8]"}`}>{deliverability.email_failed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">SMS sent</span>
              <span className="font-mono text-[#059669] font-bold">{deliverability.sms_sent}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">SMS failed</span>
              <span className={`font-mono font-bold ${deliverability.sms_failed ? "text-[#DC2626]" : "text-[#94a3b8]"}`}>{deliverability.sms_failed}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
