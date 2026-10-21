import { useEffect, useState } from "react";
import { CalendarRange, Dices } from "lucide-react";
import { api, money } from "../../lib/api";

const Stat = ({ label, value, id }) => (
  <div className="bg-[#FBF7EF] rounded-lg p-4 border border-[#E2E8F0]" data-testid={`monthly-${id}`}>
    <div className="text-[10px] uppercase tracking-[.18em] text-[#64748B] font-bold">{label}</div>
    <div className="mt-1 text-2xl font-black text-[#0B3B5C] font-mono">{value}</div>
  </div>
);

const Rows = ({ title, rows, id }) => (
  <div className="bg-white rounded-lg p-4 border border-[#E2E8F0]" data-testid={`monthly-${id}`}>
    <div className="text-[11px] uppercase tracking-[.16em] text-[#64748B] font-bold mb-3">{title}</div>
    {rows.length === 0 ? <div className="text-[12px] text-[#94a3b8]">No data this month.</div> : rows.map(([k, a, b]) => (
      <div key={k} className="flex justify-between text-[12px] py-0.5"><span className="text-[#0B3B5C] font-semibold truncate capitalize">{k}</span><span className="flex gap-3 shrink-0"><span className="text-[#64748B]">{a}</span>{b !== undefined && <span className="font-mono text-[#0B3B5C]">{b}</span>}</span></div>
    ))}
  </div>
);

export default function MonthlyReportCard() {
  const [month, setMonth] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/Nassau" }).slice(0, 7));
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get(`/admin/analytics/monthly-report?month=${month}`).then((r) => setD(r.data)).catch(() => setD(null));
  }, [month]);
  return (
    <div className="mt-6 bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="monthly-report-card">
      <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold"><CalendarRange className="w-3 h-3" /> Monthly report</div>
          <h3 className="mt-1 font-[Georgia] text-[#0B3B5C] text-xl">Paid bookings by month</h3>
        </div>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="text-xs border border-[#E2E8F0] rounded-md px-2 py-1.5 text-[#0B3B5C]" data-testid="monthly-report-month" />
      </div>
      {!d ? <div className="p-5 text-sm text-[#64748B]">Loading…</div> : (
        <>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat id="revenue" label="Revenue" value={money(d.revenue)} />
            <Stat id="bookings" label="Paid bookings" value={d.paid_bookings} />
            <Stat id="avg" label="Avg ticket" value={money(d.avg_ticket)} />
            <Stat id="repeat" label="Repeat guests" value={`${d.guests.repeat} / ${d.guests.unique}`} />
          </div>
          <div className="px-5 pb-5 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Rows id="by-service" title="By service" rows={Object.entries(d.by_service).map(([k, v]) => [k, `${v.count}×`, money(v.revenue)])} />
            <Rows id="top-tours" title="Top tours" rows={d.top_tours.map((t) => [t.name, `${t.count}×`, money(t.revenue)])} />
            <Rows id="busiest-days" title="Busiest days" rows={d.busiest_days.map((x) => [x.day, `${x.count} trips`])} />
            <div className="bg-white rounded-lg p-4 border border-[#E2E8F0]" data-testid="monthly-casino">
              <div className="text-[11px] uppercase tracking-[.16em] text-[#64748B] font-bold mb-3 inline-flex items-center gap-1"><Dices className="w-3 h-3" /> Casino wait</div>
              {[["Booked wait", d.casino.addon_income], ["Extra time paid", d.casino.extension_income], ["Total", d.casino.total_income]].map(([l, v]) => (
                <div key={l} className="flex justify-between text-[12px] py-0.5"><span className="text-[#64748B]">{l}</span><span className="font-mono text-[#0B3B5C] font-bold">{money(v)}</span></div>
              ))}
              <div className="flex justify-between text-[12px] py-0.5"><span className="text-[#64748B]">Minutes waited</span><span className="font-mono text-[#0B3B5C]">{d.casino.waited_minutes}</span></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
