import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api";
import { RefreshCw, LogOut, Heart } from "lucide-react";

const STATUSES = ["new", "contacted", "quoted", "won", "lost"];

export default function AdminGroups() {
  const nav = useNavigate();
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/group-inquiries");
      setInquiries(data);
    } catch (e) {
      if (e?.response?.status === 401) nav("/admin/login");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!localStorage.getItem("admin_token")) { nav("/admin/login"); return; }
    load();
  }, [nav]);

  const changeStatus = async (id, status) => {
    try {
      await api.patch(`/admin/group-inquiries/${id}/status`, { status });
      toast.success(`${id} → ${status}`);
      load();
    } catch { toast.error("Update failed"); }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9]" data-testid="admin-groups">
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[#0B3B5C] text-white flex items-center justify-center text-xs font-bold">RX</div>
              <span className="font-semibold text-[#0B3B5C]">Group inquiries</span>
            </div>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <button onClick={() => nav("/admin")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-bookings">Bookings</button>
              <button onClick={() => nav("/admin/manage")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-manage">Manage catalog</button>
              <button onClick={() => nav("/admin/groups")} className="px-3 py-1.5 rounded-md bg-[#0B3B5C] text-white" data-testid="admin-nav-groups">Group inquiries</button>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-md hover:bg-[#F1F5F9]" data-testid="admin-groups-refresh"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
            <button onClick={() => { localStorage.removeItem("admin_token"); nav("/admin/login"); }} className="text-sm flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-[#F1F5F9]"><LogOut className="w-4 h-4" /> Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] text-left text-[11px] uppercase tracking-widest text-[#64748B]">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Date · Guests</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Needs</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((i) => (
                <tr key={i.id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC]" data-testid={`group-row-${i.id}`}>
                  <td className="px-4 py-3 mono text-[#0B3B5C] font-semibold">{i.id}</td>
                  <td className="px-4 py-3 text-[#0B3B5C]">
                    <div className="flex items-center gap-1.5 capitalize"><Heart className="w-3 h-3 text-[#E86A3C]" /> {i.event_type.replace("_", " ")}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[#0B3B5C]">{i.event_date}</div>
                    <div className="text-xs text-[#64748B]">{i.guest_count} guests</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[#0B3B5C]">{i.customer_name}</div>
                    <div className="text-xs text-[#64748B]">{i.customer_email} · {i.customer_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#64748B]">{(i.needs || []).join(", ")}</td>
                  <td className="px-4 py-3 text-xs mono text-[#0B3B5C]">{i.budget_range || "-"}</td>
                  <td className="px-4 py-3">
                    <select value={i.status} onChange={(e) => changeStatus(i.id, e.target.value)} className="rounded-md border border-[#E2E8F0] px-2 py-1.5 text-xs bg-white" data-testid={`group-status-${i.id}`}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {inquiries.length === 0 && (
                <tr><td colSpan={7} className="text-center py-16 text-[#64748B]">No group inquiries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
