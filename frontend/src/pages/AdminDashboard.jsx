import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, money, STATUS_STEPS } from "../lib/api";
import { LogOut, RefreshCw, DollarSign, ClipboardList, PlayCircle, Timer } from "lucide-react";

const STATUSES = ["pending_payment", "confirmed", "driver_assigned", "en_route", "arrived", "completed", "cancelled"];

export default function AdminDashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState({ total: 0, paid: 0, pending: 0, active: 0, revenue: 0 });
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([api.get("/admin/stats"), api.get("/admin/bookings")]);
      setStats(s.data);
      setBookings(b.data);
    } catch (e) {
      if (e?.response?.status === 401) {
        localStorage.removeItem("admin_token");
        nav("/admin/login");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!localStorage.getItem("admin_token")) { nav("/admin/login"); return; }
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeStatus = async (id, status) => {
    try {
      await api.patch(`/admin/bookings/${id}/status`, { status });
      toast.success(`Updated ${id} → ${status}`);
      load();
    } catch (e) {
      toast.error("Failed to update");
    }
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    nav("/admin/login");
  };

  const filtered = useMemo(() => {
    if (filter === "all") return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  return (
    <div className="min-h-screen bg-[#F1F5F9]" data-testid="admin-dashboard">
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[#0B3B5C] text-white flex items-center justify-center text-xs font-bold">RX</div>
              <span className="font-semibold text-[#0B3B5C]">Admin Console</span>
            </div>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <button onClick={() => nav("/admin")} className="px-3 py-1.5 rounded-md bg-[#0B3B5C] text-white" data-testid="admin-nav-bookings">Bookings</button>
              <button onClick={() => nav("/admin/manage")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-manage">Manage catalog</button>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-md hover:bg-[#F1F5F9]" data-testid="admin-refresh"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
            <button onClick={logout} className="text-sm flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-[#F1F5F9]" data-testid="admin-logout"><LogOut className="w-4 h-4" /> Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="admin-stats">
          <Stat icon={<ClipboardList />} label="Total bookings" value={stats.total} tint="#0B3B5C" />
          <Stat icon={<DollarSign />} label="Paid revenue" value={money(stats.revenue)} tint="#D4A94A" />
          <Stat icon={<Timer />} label="Pending / Confirmed" value={stats.pending} tint="#E86A3C" />
          <Stat icon={<PlayCircle />} label="En route" value={stats.active} tint="#059669" />
        </div>

        <div className="mt-10 bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap gap-2 items-center">
            <button onClick={() => setFilter("all")} className={`text-xs px-3 py-1.5 rounded-md ${filter === "all" ? "bg-[#0B3B5C] text-white" : "hover:bg-[#F1F5F9]"}`} data-testid="filter-all">All</button>
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setFilter(s)} className={`text-xs px-3 py-1.5 rounded-md ${filter === s ? "bg-[#0B3B5C] text-white" : "hover:bg-[#F1F5F9]"}`} data-testid={`filter-${s}`}>
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-[11px] uppercase tracking-widest text-[#64748B]">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Pay</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC]" data-testid={`admin-row-${b.id}`}>
                    <td className="px-4 py-3 mono text-[#0B3B5C] font-semibold">{b.id}</td>
                    <td className="px-4 py-3">
                      <div className="text-[#0B3B5C] font-medium">{b.customer_name}</div>
                      <div className="text-xs text-[#64748B]">{b.customer_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[#0B3B5C]">{b.item_name}</div>
                      <div className="text-xs text-[#64748B]">{b.service_type}</div>
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">{new Date(b.booking_date).toLocaleString()}</td>
                    <td className="px-4 py-3 mono text-[#E86A3C] font-semibold">{money(b.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${b.payment_status === "paid" ? "bg-[#D4A94A]/10 text-[#D4A94A]" : "bg-[#E86A3C]/10 text-[#E86A3C]"}`}>{b.payment_method} · {b.payment_status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={b.status}
                        onChange={(e) => changeStatus(b.id, e.target.value)}
                        className="rounded-md border border-[#E2E8F0] px-2 py-1.5 text-xs bg-white"
                        data-testid={`admin-status-select-${b.id}`}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-[#64748B]">No bookings for this filter yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tint }) {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 flex gap-4 items-center">
      <div className="w-11 h-11 rounded-md flex items-center justify-center" style={{ background: `${tint}15`, color: tint }}>
        {icon}
      </div>
      <div>
        <div className="text-xs uppercase tracking-widest text-[#64748B]">{label}</div>
        <div className="serif text-2xl text-[#0B3B5C] mt-0.5">{value}</div>
      </div>
    </div>
  );
}
