import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trophy, TrendingUp, DollarSign, RefreshCw, Filter } from "lucide-react";
import { api, money } from "../../lib/api";

/**
 * AttachRateCard — 30-day breakdown of which taxi add-ons are actually
 * landing. Each row shows the service + add-on, attach rate %, revenue,
 * and a gold "Recommended" ribbon when the winner threshold (≥25 % and
 * ≥4 attaches) is met. Winners auto-surface a gold ribbon on the public
 * /taxi chip strip via the /taxi-services recommended-decorator so the
 * dashboard doubles as an editorial control loop.
 */
export default function AttachRateCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState("winners"); // winners | all | zero

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/analytics/addon-attach-rate?days=${days}`);
      setData(data);
    } catch {
      toast.error("Failed to load attach-rate stats");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    if (filter === "winners") return data.rows.filter((r) => r.recommended);
    if (filter === "zero")    return data.rows.filter((r) => r.attaches === 0);
    return data.rows;
  }, [data, filter]);

  return (
    <div
      className="rounded-2xl bg-white border border-[#E2E8F0] p-5 mt-6"
      data-testid="attach-rate-card"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[10px] tracking-[0.28em] uppercase text-[#D4A94A] font-black flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5" /> Add-on attach rate · last {days} days
          </div>
          <div className="serif text-2xl text-[#0B3B5C] mt-1">Which extras convert?</div>
          <div className="text-xs text-[#64748B] mt-1">
            Winners (≥25% attach + ≥4 picks) auto-earn a gold ribbon on the /taxi chip strip.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            data-testid="attach-rate-days"
            className="text-xs rounded-full border border-[#E2E8F0] px-3 py-1.5 bg-white text-[#0B3B5C] font-semibold cursor-pointer"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            data-testid="attach-rate-reload"
            className="w-9 h-9 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-center text-[#64748B] disabled:opacity-40"
            aria-label="Reload"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat label="Winners" value={data.totals.winners} icon={Trophy} tone="#D4A94A"
                testid="attach-rate-total-winners" />
          <Stat label="Total attaches" value={data.totals.attaches} icon={TrendingUp} tone="#0B3B5C"
                testid="attach-rate-total-attaches" />
          <Stat label="Extras revenue" value={money(data.totals.revenue)} icon={DollarSign} tone="#059669"
                testid="attach-rate-total-revenue" />
        </div>
      )}

      <div className="flex items-center gap-1 mb-3 text-xs">
        <Filter className="w-3.5 h-3.5 text-[#94a3b8] mr-1" />
        {[
          { k: "winners", label: "Winners" },
          { k: "all",     label: "All rows" },
          { k: "zero",    label: "Never attached" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setFilter(t.k)}
            data-testid={`attach-rate-filter-${t.k}`}
            className={`px-3 py-1.5 rounded-full font-semibold ${
              filter === t.k
                ? "bg-[#0B3B5C] text-white"
                : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[#94a3b8]">
            <tr className="border-b border-[#F1F5F9]">
              <th className="px-3 py-2 text-left">Add-on</th>
              <th className="px-3 py-2 text-left">Route</th>
              <th className="px-3 py-2 text-right">Attach rate</th>
              <th className="px-3 py-2 text-right">Attaches</th>
              <th className="px-3 py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-[#94a3b8]" data-testid="attach-rate-empty">
                  {loading ? "Loading…" : "No rows match this filter yet."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={`${r.service_id}-${r.addon_id}`}
                data-testid={`attach-rate-row-${r.service_id}-${r.addon_id}`}
                className={`border-b border-[#F8FAFC] ${r.recommended ? "bg-gradient-to-r from-[#FBF7EF] to-transparent" : ""}`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {r.recommended && (
                      <span
                        className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-black text-white bg-gradient-to-r from-[#D4A94A] to-[#c99738] px-2 py-0.5 rounded-full"
                        title="Attach rate ≥25% + ≥4 picks — gold ribbon shows on /taxi"
                      >
                        <Trophy className="w-2.5 h-2.5" /> Recommended
                      </span>
                    )}
                    <span className="font-semibold text-[#0B3B5C]">{r.addon_label}</span>
                  </div>
                  <span className="block text-[10px] text-[#94a3b8] mt-0.5">
                    ${r.addon_price.toFixed(0)} · {r.addon_price_mode.replace("_", " ")}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-[#64748B] truncate max-w-[240px]" title={r.service_name}>
                  {r.service_name}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className="mono font-bold"
                    style={{ color: r.attach_rate_pct >= 25 ? "#D4A94A" : r.attach_rate_pct >= 10 ? "#0B3B5C" : "#94a3b8" }}
                  >
                    {r.attach_rate_pct}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-[#0B3B5C]">
                  {r.attaches} <span className="text-[10px] text-[#94a3b8]">/ {r.total_bookings}</span>
                </td>
                <td className="px-3 py-2.5 text-right mono font-semibold text-[#E86A3C]">
                  {r.revenue > 0 ? money(r.revenue) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.generated_at && (
        <div className="mt-3 text-[10px] text-[#94a3b8] text-right">
          Generated {new Date(data.generated_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone, testid }) {
  return (
    <div className="rounded-xl bg-[#F8FAFC] border border-[#F1F5F9] p-3" data-testid={testid}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#94a3b8] font-black">
        <Icon className="w-3 h-3" style={{ color: tone }} /> {label}
      </div>
      <div className="mt-1 serif text-2xl" style={{ color: tone }}>{value}</div>
    </div>
  );
}
