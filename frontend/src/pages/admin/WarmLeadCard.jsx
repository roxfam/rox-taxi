import { useEffect, useState } from "react";
import { MessageSquare, TrendingUp, TrendingDown, Users, UserCheck } from "lucide-react";
import { api } from "../../lib/api";

/**
 * WarmLeadCard — 30-day view of how often returning visitors (3rd+ session)
 * open the chat vs first-timers. Ratio-based so raw traffic differences
 * don't skew the signal.
 *
 * Success criteria (rules of thumb):
 *   • warm engagement rate should be ≥ 2x first-time rate — otherwise the
 *     warm-lead prompt copy needs tuning
 *   • lift < 0 means warm-lead visitors are actually opening the chat LESS
 *     than first-timers (bug or copy misfit)
 */
export default function WarmLeadCard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    api.get("/admin/analytics/warm-lead")
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setBusy(false));
  }, []);

  if (busy) return <div className="mt-8 h-40 rounded-2xl bg-white border border-[#E2E8F0] p-6 text-xs text-[#94a3b8] flex items-center justify-center">Loading warm-lead stats…</div>;
  if (!data) return null;

  const lift = data.warm_vs_first_lift_pct || 0;
  const liftPositive = lift >= 0;
  const noWarmTraffic = data.warm_unique_visitors === 0;

  return (
    <div className="mt-8 rounded-2xl bg-white border border-[#E2E8F0] p-6" data-testid="warm-lead-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#D4A94A]" />
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#D4A94A] font-bold">Warm-lead engagement</div>
          </div>
          <div className="serif text-2xl text-[#0B3B5C] mt-1 leading-tight">Returning-visitor chat conversion</div>
          <div className="text-xs text-[#64748B] mt-1 max-w-lg">
            30-day snapshot. Warm leads are visitors on their 3rd+ session — they see the amber-glow FAB + priority-booking greeting.
          </div>
        </div>

        {!noWarmTraffic && (
          <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold text-sm ${
            liftPositive ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#FEE2E2] text-[#991B1B]"
          }`} data-testid="warm-lead-lift">
            {liftPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {liftPositive ? "+" : ""}{lift}% lift vs first-timers
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <Stat
          label="Warm opens"
          value={data.warm_opens}
          detail={`${data.warm_unique_visitors} unique`}
          icon={<UserCheck className="w-3 h-3" />}
          tone="#D4A94A"
          testid="stat-warm-opens"
        />
        <Stat
          label="First-timer opens"
          value={data.first_opens}
          detail={`${data.first_unique_visitors} unique`}
          icon={<Users className="w-3 h-3" />}
          tone="#0B3B5C"
          testid="stat-first-opens"
        />
        <Stat
          label="Warm engagement"
          value={`${data.warm_engagement_rate.toFixed(2)}×`}
          detail="opens / visitor"
          tone="#D4A94A"
          testid="stat-warm-rate"
        />
        <Stat
          label="First-timer engagement"
          value={`${data.first_engagement_rate.toFixed(2)}×`}
          detail="opens / visitor"
          tone="#0B3B5C"
          testid="stat-first-rate"
        />
      </div>

      {noWarmTraffic && (
        <div className="mt-4 rounded-xl bg-[#FBF7EF] border border-[#E2E8F0] px-4 py-3 text-xs text-[#64748B]" data-testid="warm-lead-empty">
          <span className="font-semibold text-[#0B3B5C]">No warm-lead traffic yet.</span> Data will start showing up once a real visitor returns for their 3rd session and opens the chat. Give it a few days.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, detail, icon, tone, testid }) {
  return (
    <div className="rounded-xl bg-[#FBF7EF] border border-[#E2E8F0] px-4 py-3" data-testid={testid}>
      <div className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-semibold flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="serif text-2xl leading-none mt-1" style={{ color: tone }}>{value}</div>
      {detail && <div className="text-[10px] text-[#94a3b8] mt-1">{detail}</div>}
    </div>
  );
}
