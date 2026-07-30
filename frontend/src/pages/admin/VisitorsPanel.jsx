import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { ArrowDown, ArrowUp, Globe2, MonitorSmartphone, Users, TrendingUp, Download } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SORT_FIELDS = [
  { key: "ts", label: "Time" },
  { key: "path", label: "Path" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "device", label: "Device" },
];

const WINDOWS = [
  { value: "1", label: "Last hour" },
  { value: "24", label: "Last 24h" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
];

export default function VisitorsPanel() {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState("ts");
  const [order, setOrder] = useState("desc");
  const [windowHrs, setWindowHrs] = useState("24");
  const [countryFilter, setCountryFilter] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 50;

  const token = useMemo(() => localStorage.getItem("admin_token") || "", []);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  async function load() {
    if (!token) return;  // wait for admin_token before hitting the API
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        axios.get(`${API}/admin/visitors/summary`, { headers, params: { hours: windowHrs } }),
        axios.get(`${API}/admin/visitors`, {
          headers,
          params: {
            sort, order, limit, skip,
            hours: windowHrs,
            country: countryFilter || undefined,
            path_contains: pathFilter || undefined,
          },
        }),
      ]);
      setSummary(s.data);
      setRows(l.data.rows || []);
      setTotal(l.data.total || 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sort, order, windowHrs, skip]);

  function toggleSort(k) {
    if (k === sort) setOrder(order === "asc" ? "desc" : "asc");
    else { setSort(k); setOrder("desc"); }
    setSkip(0);
  }

  function exportCsv() {
    const header = ["Time", "Path", "Country", "Region", "City", "Device", "Referrer", "IP", "ISP", "User-Agent"];
    const csv = [header.join(",")].concat(
      rows.map(r => [
        r.ts, r.path, r.country, r.region, r.city, r.device, r.referrer, r.ip, r.isp, r.user_agent,
      ].map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `visitors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6" data-testid="admin-visitors-panel">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={windowHrs} onValueChange={(v) => { setWindowHrs(v); setSkip(0); }}>
          <SelectTrigger className="w-[180px]" data-testid="visitors-window-select"><SelectValue /></SelectTrigger>
          <SelectContent>{WINDOWS.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Filter by country…" value={countryFilter} onChange={e => setCountryFilter(e.target.value)} onKeyDown={e => e.key === "Enter" && (setSkip(0), load())} className="w-[200px]" data-testid="visitors-country-filter" />
        <Input placeholder="Path contains…" value={pathFilter} onChange={e => setPathFilter(e.target.value)} onKeyDown={e => e.key === "Enter" && (setSkip(0), load())} className="w-[220px]" data-testid="visitors-path-filter" />
        <Button variant="outline" onClick={() => { setSkip(0); load(); }} data-testid="visitors-apply-filters">Apply</Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length} data-testid="visitors-export-csv">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Total visits" value={summary.total_visits} />
          <StatCard icon={<Users className="w-4 h-4" />} label="Unique sessions" value={summary.unique_sessions} />
          <StatCard icon={<Globe2 className="w-4 h-4" />} label="Unique IPs" value={summary.unique_ips} />
          <StatCard icon={<MonitorSmartphone className="w-4 h-4" />} label="Top device" value={(summary.top_devices?.[0]?.value) || "—"} sub={summary.top_devices?.[0]?.count} />
        </div>
      )}

      {/* Top lists */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TopList title="Top pages" items={summary.top_paths} />
          <TopList title="Top countries" items={summary.top_countries} />
          <TopList title="Top referrers" items={summary.top_referrers} />
        </div>
      )}

      {/* Visitor table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Visitor log <span className="text-sm text-slate-500 font-normal ml-2">({total.toLocaleString()} total)</span></span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid="visitors-table">
            <thead className="bg-slate-50 border-y">
              <tr>
                {SORT_FIELDS.map(f => (
                  <th key={f.key} className="text-left p-3 cursor-pointer select-none hover:bg-slate-100" onClick={() => toggleSort(f.key)} data-testid={`visitors-sort-${f.key}`}>
                    <span className="inline-flex items-center gap-1 font-semibold">
                      {f.label} {sort === f.key && (order === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                    </span>
                  </th>
                ))}
                <th className="text-left p-3 font-semibold">Referrer</th>
                <th className="text-left p-3 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Loading…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No visitors in this window.</td></tr>}
              {!loading && rows.map((r, i) => (
                <tr key={i} className="border-b hover:bg-slate-50">
                  <td className="p-3 text-slate-600 whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
                  <td className="p-3 font-mono text-xs max-w-[280px] truncate" title={r.path}>{r.path}</td>
                  <td className="p-3">{r.country || <span className="text-slate-400">—</span>}</td>
                  <td className="p-3 text-slate-500">{r.city || "—"}</td>
                  <td className="p-3"><Badge variant={r.device === "mobile" ? "default" : "secondary"} className="text-xs">{r.device}</Badge></td>
                  <td className="p-3 text-xs text-slate-500 max-w-[200px] truncate" title={r.referrer}>{r.referrer || "direct"}</td>
                  <td className="p-3 text-xs font-mono text-slate-400">{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - limit))} data-testid="visitors-prev-page">Prev</Button>
        <span className="text-sm text-slate-500">{skip + 1}–{Math.min(skip + limit, total)} of {total.toLocaleString()}</span>
        <Button variant="outline" size="sm" disabled={skip + limit >= total} onClick={() => setSkip(skip + limit)} data-testid="visitors-next-page">Next</Button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wider">{icon}{label}</div>
        <div className="text-2xl font-semibold mt-1">{(value ?? 0).toLocaleString ? value.toLocaleString() : value}</div>
        {sub != null && <div className="text-xs text-slate-500 mt-1">{sub.toLocaleString()} events</div>}
      </CardContent>
    </Card>
  );
}

function TopList({ title, items }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y">
          {(items || []).slice(0, 8).map((it, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-sm">
              <span className="truncate text-slate-700 max-w-[80%]" title={it.value}>{it.value || "—"}</span>
              <span className="font-mono text-xs text-slate-500">{it.count.toLocaleString()}</span>
            </div>
          ))}
          {!items?.length && <div className="py-3 text-sm text-slate-400">No data</div>}
        </div>
      </CardContent>
    </Card>
  );
}
