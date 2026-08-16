import { useEffect, useMemo, useState } from "react";
import { api, money } from "../../lib/api";
import { Gift, Trophy, TrendingUp } from "lucide-react";

/**
 * ReferralLeaderboardCard — admin dashboard card.
 *
 * Aggregates `/refer` link conversions by sharer name for the selected
 * calendar month. Backed by /api/admin/referrals/leaderboard.
 *
 * Auto-hides when the leaderboard is empty so the dashboard doesn't
 * carry dead space during slow months.
 */
export default function ReferralLeaderboardCard() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr("");
    api.get(`/admin/referrals/leaderboard?month=${month}`)
      .then((r) => { if (alive) setData(r.data); })
      .catch((e) => { if (alive) setErr(e?.response?.data?.detail || "Couldn't load referrals"); });
    return () => { alive = false; };
  }, [month]);

  const rows = data?.leaderboard || [];
  const top = rows[0];

  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-US", { month: "short", year: "numeric" }),
      });
    }
    return opts;
  }, [now.getFullYear(), now.getMonth()]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-hide when no conversions this month (keeps dashboard tidy)
  if (data && rows.length === 0 && !err) return null;

  return (
    <div className="mb-6 rounded-2xl border border-[#E2E8F0] bg-white p-6" data-testid="referral-leaderboard-card">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4A94A] to-[#c99738] flex items-center justify-center">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black">
              Refer-a-friend leaderboard
            </div>
            <div className="serif text-xl text-[#0B3B5C] leading-tight">
              Top sharers this month
            </div>
          </div>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          data-testid="referral-leaderboard-month"
          className="rounded-full border border-[#E2E8F0] bg-white px-4 py-1.5 text-xs font-bold text-[#0B3B5C] focus:border-[#D4A94A] focus:outline-none"
        >
          {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {err && (
        <div className="mt-4 rounded-lg bg-[#FEE2E2] text-[#DC2626] text-xs px-3 py-2" data-testid="referral-leaderboard-error">{err}</div>
      )}

      {!data && !err && (
        <div className="mt-6 text-xs text-[#64748B]" data-testid="referral-leaderboard-loading">Loading…</div>
      )}

      {data && rows.length > 0 && (
        <>
          <div className="mt-5 grid sm:grid-cols-3 gap-3">
            <StatChip
              testid="referral-lb-conversions"
              icon={TrendingUp}
              label="Conversions"
              value={data.total_conversions}
              accent="text-[#059669]"
            />
            <StatChip
              testid="referral-lb-revenue"
              icon={Trophy}
              label="Revenue driven"
              value={money(data.total_revenue)}
              accent="text-[#0B3B5C]"
            />
            <StatChip
              testid="referral-lb-top-sharer"
              icon={Gift}
              label="Top sharer"
              value={top ? `${top.name} (${top.conversions})` : "—"}
              accent="text-[#D4A94A]"
            />
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm" data-testid="referral-leaderboard-table">
              <thead>
                <tr className="text-left text-[10px] tracking-[0.2em] uppercase text-[#64748B] font-black">
                  <th className="pb-2 pr-3">#</th>
                  <th className="pb-2 pr-3">Sharer</th>
                  <th className="pb-2 pr-3 text-right">Conversions</th>
                  <th className="pb-2 pr-3 text-right">Revenue</th>
                  <th className="pb-2 pr-3 text-right">Discount given</th>
                  <th className="pb-2 pr-3 text-right">Codes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.name}-${i}`}
                    className="border-t border-[#F1F5F9]"
                    data-testid={`referral-leaderboard-row-${i}`}
                  >
                    <td className="py-2 pr-3 mono text-xs text-[#94a3b8]">{i + 1}</td>
                    <td className="py-2 pr-3 font-bold text-[#0B3B5C]">{r.name}</td>
                    <td className="py-2 pr-3 text-right mono font-bold text-[#059669]">{r.conversions}</td>
                    <td className="py-2 pr-3 text-right mono text-[#0B3B5C]">{money(r.total_revenue)}</td>
                    <td className="py-2 pr-3 text-right mono text-[#D4A94A]">−{money(r.total_discount_given)}</td>
                    <td className="py-2 pr-3 text-right mono text-[#64748B]">{r.codes_used}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatChip({ icon: Icon, label, value, accent, testid }) {
  return (
    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3" data-testid={testid}>
      <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase text-[#64748B] font-black">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`mt-1 mono font-black text-lg ${accent}`}>{value}</div>
    </div>
  );
}
