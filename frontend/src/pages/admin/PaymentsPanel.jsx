import { useEffect, useMemo, useState } from "react";
import { api, money } from "../../lib/api";
import { toast } from "sonner";
import { Search, RefreshCw, DollarSign, CheckCircle2 } from "lucide-react";

const STATUS_COLORS = {
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  refunded: "bg-slate-200 text-slate-700",
  failed: "bg-red-100 text-red-700",
  initiated: "bg-blue-100 text-blue-700",
};

// Admin Payments panel — merges Stripe + PayPal + Zelle rows so the operator
// has one screen to reconcile revenue. Refund + "Mark Zelle received" are
// one-click actions.
export default function PaymentsPanel() {
  const [data, setData] = useState({ rows: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const { data } = await api.get("/admin/payments", { headers: { Authorization: `Bearer ${token}` } });
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
      const token = localStorage.getItem("admin_token");
      await api.post("/admin/payments/zelle-mark-paid", { booking_id: bookingId }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`Zelle payment for ${bookingId} confirmed`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to mark paid");
    }
  };

  const refund = async (paymentId) => {
    if (!window.confirm("Issue a full refund? This cannot be undone.")) return;
    try {
      const token = localStorage.getItem("admin_token");
      await api.post(`/admin/payments/${encodeURIComponent(paymentId)}/refund`, {}, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("Refund issued");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Refund failed");
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
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-[#E2E8F0]" data-testid={`payments-row-${r.booking_id}`}>
                <td className="px-4 py-3 uppercase text-[11px] font-bold text-[#0B3B5C]">{r.provider}</td>
                <td className="px-4 py-3 mono text-[#0B3B5C]">{r.booking_id || "—"}</td>
                <td className="px-4 py-3">
                  <div className="text-[#0B3B5C]">{r.customer_name || "—"}</div>
                  <div className="text-xs text-[#64748B]">{r.customer_email}</div>
                </td>
                <td className="px-4 py-3 text-[#64748B]">{r.item_name || "—"}</td>
                <td className="px-4 py-3 text-right mono font-semibold text-[#0B3B5C]">{money(r.amount)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[String(r.status).toLowerCase()] || "bg-slate-100 text-slate-600"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {r.provider === "zelle" && r.status === "pending" && (
                    <button
                      onClick={() => markZelle(r.booking_id)}
                      className="inline-flex items-center gap-1 rounded-full bg-[#D4A94A] text-[#0B192C] px-3 py-1 text-xs font-bold hover:bg-[#e0b856]"
                      data-testid={`payments-mark-zelle-${r.booking_id}`}
                    >
                      <CheckCircle2 className="w-3 h-3" /> Mark received
                    </button>
                  )}
                  {r.status === "paid" && r.provider !== "zelle" && (
                    <button
                      onClick={() => refund(r.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 text-red-600 px-3 py-1 text-xs font-bold hover:bg-red-50"
                      data-testid={`payments-refund-${r.booking_id}`}
                    >
                      <DollarSign className="w-3 h-3" /> Refund
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
