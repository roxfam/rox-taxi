import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, money } from "../lib/api";
import { LogOut, RefreshCw, DollarSign, ClipboardList, PlayCircle, Timer, ShieldCheck, ShieldAlert, ShieldOff, Lock, Info, X } from "lucide-react";

const STATUSES = ["pending_payment", "confirmed", "driver_assigned", "en_route", "arrived", "completed", "cancelled"];

const DEPOSIT_META = {
  held:      { label: "Held",      Icon: Lock,        tone: "text-[#D4A94A]",  bg: "bg-[#D4A94A]/12"  },
  released:  { label: "Released",  Icon: ShieldCheck, tone: "text-[#059669]",  bg: "bg-[#059669]/12"  },
  forfeited: { label: "Forfeited", Icon: ShieldOff,   tone: "text-[#DC2626]",  bg: "bg-[#DC2626]/12"  },
};

export default function AdminDashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState({ total: 0, paid: 0, pending: 0, active: 0, revenue: 0, deposits_held: 0, deposits_held_amount: 0 });
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [depositModal, setDepositModal] = useState(null); // { booking, action: 'released'|'forfeited' }

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
    if (filter === "deposits_held") return bookings.filter((b) => (b.deposit_amount || 0) > 0 && b.deposit_status === "held");
    if (filter === "deposits") return bookings.filter((b) => (b.deposit_amount || 0) > 0);
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
              <button onClick={() => nav("/admin/groups")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-groups">Group inquiries</button>
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

        {/* Deposits panel */}
        <div className="mt-6 rounded-2xl border border-[#D4A94A]/25 bg-gradient-to-r from-[#D4A94A]/8 to-transparent p-5 flex flex-wrap items-center justify-between gap-4" data-testid="admin-deposits-panel">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#D4A94A]/15 flex items-center justify-center text-[#D4A94A]">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-[#64748B]">Rental deposits held</div>
              <div className="serif text-2xl text-[#0B3B5C] mt-0.5">
                {money(stats.deposits_held_amount || 0)} <span className="text-sm font-normal text-[#64748B] ml-2">across {stats.deposits_held || 0} rentals</span>
              </div>
              <div className="text-[11px] text-[#64748B] mt-1">
                {stats.deposits_released || 0} released · {stats.deposits_forfeited || 0} forfeited
              </div>
            </div>
          </div>
          <button
            onClick={() => setFilter("deposits_held")}
            className="rounded-full bg-[#0B3B5C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#132a4a] active:scale-95"
            data-testid="admin-view-deposits-btn"
          >
            View deposits →
          </button>
        </div>

        <div className="mt-8 bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap gap-2 items-center">
            <button onClick={() => setFilter("all")} className={`text-xs px-3 py-1.5 rounded-md ${filter === "all" ? "bg-[#0B3B5C] text-white" : "hover:bg-[#F1F5F9]"}`} data-testid="filter-all">All</button>
            <button onClick={() => setFilter("deposits_held")} className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 ${filter === "deposits_held" ? "bg-[#D4A94A] text-white" : "hover:bg-[#F1F5F9] text-[#D4A94A]"}`} data-testid="filter-deposits-held">
              <Lock className="w-3 h-3" /> Deposits held
            </button>
            <button onClick={() => setFilter("deposits")} className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 ${filter === "deposits" ? "bg-[#0B3B5C] text-white" : "hover:bg-[#F1F5F9]"}`} data-testid="filter-deposits-all">
              All deposits
            </button>
            <span className="w-px h-5 bg-[#E2E8F0] mx-1" />
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
                  <th className="px-4 py-3">Deposit</th>
                  <th className="px-4 py-3">Pay</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const hasDeposit = (b.deposit_amount || 0) > 0;
                  const dstatus = b.deposit_status || "held";
                  const meta = DEPOSIT_META[dstatus] || DEPOSIT_META.held;
                  return (
                    <tr key={b.id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] align-top" data-testid={`admin-row-${b.id}`}>
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
                        {hasDeposit ? (
                          <div data-testid={`admin-deposit-cell-${b.id}`}>
                            <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ${meta.bg} ${meta.tone}`} data-testid={`admin-deposit-badge-${b.id}`}>
                              <meta.Icon className="w-3 h-3" />
                              {meta.label} · <span className="mono font-semibold">{money(b.deposit_amount)}</span>
                            </span>
                            {dstatus === "held" && (
                              <div className="mt-2 flex gap-1 flex-wrap">
                                <button
                                  onClick={() => setDepositModal({ booking: b, action: "released" })}
                                  className="text-[10px] font-semibold px-2 py-1 rounded bg-[#059669] text-white hover:bg-[#047857] active:scale-95 flex items-center gap-1"
                                  data-testid={`admin-release-deposit-${b.id}`}
                                >
                                  <ShieldCheck className="w-3 h-3" /> Release
                                </button>
                                <button
                                  onClick={() => setDepositModal({ booking: b, action: "forfeited" })}
                                  className="text-[10px] font-semibold px-2 py-1 rounded bg-[#DC2626] text-white hover:bg-[#B91C1C] active:scale-95 flex items-center gap-1"
                                  data-testid={`admin-forfeit-deposit-${b.id}`}
                                >
                                  <ShieldOff className="w-3 h-3" /> Forfeit
                                </button>
                              </div>
                            )}
                            {dstatus !== "held" && (b.deposit_reason || b.deposit_updated_at) && (
                              <div className="mt-1 text-[10px] text-[#64748B] max-w-[220px]">
                                {b.deposit_updated_at && <div>{new Date(b.deposit_updated_at).toLocaleDateString()}</div>}
                                {b.deposit_reason && <div className="italic truncate" title={b.deposit_reason}>"{b.deposit_reason}"</div>}
                                {dstatus === "held" && (
                                  <button onClick={() => setDepositModal({ booking: b, action: "held" })} className="text-[10px] text-[#0B3B5C] underline mt-1" data-testid={`admin-reset-deposit-${b.id}`}>Reset to held</button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#94a3b8]">—</span>
                        )}
                      </td>
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
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-[#64748B]">No bookings for this filter yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {depositModal && (
        <DepositActionModal
          booking={depositModal.booking}
          action={depositModal.action}
          onClose={() => setDepositModal(null)}
          onDone={() => { setDepositModal(null); load(); }}
        />
      )}
    </div>
  );
}

function DepositActionModal({ booking, action, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const isRelease = action === "released";
  const meta = DEPOSIT_META[action] || DEPOSIT_META.held;

  const submit = async () => {
    if (!isRelease && !reason.trim()) {
      toast.error("A reason is required when forfeiting a deposit.");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/admin/bookings/${booking.id}/deposit`, { status: action, reason: reason.trim() || null });
      toast.success(isRelease ? `Deposit released — refund $${booking.deposit_amount} to ${booking.customer_name}` : `Deposit forfeited — $${booking.deposit_amount} retained`);
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update deposit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="deposit-modal">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className={`w-10 h-10 rounded-xl ${meta.bg} ${meta.tone} flex items-center justify-center`}>
              <meta.Icon className="w-5 h-5" />
            </span>
            <div>
              <div className="serif text-xl text-[#0B3B5C]">{isRelease ? "Release deposit" : "Forfeit deposit"}</div>
              <div className="text-xs text-[#64748B]">Booking <span className="mono">{booking.id}</span> · {booking.item_name}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#0B3B5C]" data-testid="deposit-modal-close"><X className="w-5 h-5" /></button>
        </div>

        <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 mt-4 flex items-start gap-2">
          <Info className="w-4 h-4 text-[#0B3B5C] mt-0.5 shrink-0" />
          <div className="text-xs text-[#64748B] leading-relaxed">
            {isRelease ? (
              <>Mark the <span className="mono font-semibold text-[#059669]">${booking.deposit_amount}</span> deposit as refunded to <strong>{booking.customer_name}</strong>. This records the action — you must still issue the refund manually via Stripe / PayPal / Zelle.</>
            ) : (
              <>Retain the <span className="mono font-semibold text-[#DC2626]">${booking.deposit_amount}</span> deposit for <strong>{booking.customer_name}</strong> due to damage, late return, or an unpaid balance. A reason is required and stored on the booking.</>
            )}
          </div>
        </div>

        <label className="block mt-4">
          <span className="text-xs uppercase tracking-widest text-[#64748B] font-semibold">
            Reason {isRelease ? <span className="text-[#94a3b8] normal-case tracking-normal">(optional)</span> : <span className="text-[#DC2626] normal-case tracking-normal">(required)</span>}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={isRelease ? "e.g. Returned on time, no damage" : "e.g. Damaged bumper — repair estimate $95"}
            className="mt-1.5 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#D4A94A]"
            data-testid="deposit-reason-input"
          />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-[#E2E8F0] px-5 py-2 text-sm hover:border-[#0B3B5C]" data-testid="deposit-cancel-btn">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className={`btn-shine rounded-full px-5 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-60 ${isRelease ? "bg-[#059669] hover:bg-[#047857]" : "bg-[#DC2626] hover:bg-[#B91C1C]"}`}
            data-testid="deposit-confirm-btn"
          >
            {saving ? "Saving..." : isRelease ? "Release $" + booking.deposit_amount : "Forfeit $" + booking.deposit_amount}
          </button>
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
