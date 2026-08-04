import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, money, BACKEND_URL } from "../lib/api";
import { LogOut, RefreshCw, DollarSign, ClipboardList, PlayCircle, Timer, ShieldCheck, ShieldAlert, ShieldOff, Lock, Info, X, Mail, MessageSquare, RotateCw, Zap, Download, Activity, Images, Bell, BellOff, Route, Users, Chrome, Camera, TrendingUp, Car } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, LineChart } from "recharts";

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
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const [authMethods, setAuthMethods] = useState(null);
  const [nudgeStats, setNudgeStats] = useState(null);
  const [addonStats, setAddonStats] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, b, g, a, n, ax] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/bookings"),
        api.get("/admin/gallery/pending").catch(() => ({ data: [] })),
        api.get("/admin/auth/methods-summary").catch(() => ({ data: null })),
        api.get("/admin/photo-nudge-stats").catch(() => ({ data: null })),
        api.get("/admin/analytics/taxi-addon").catch(() => ({ data: null })),
      ]);
      setStats(s.data);
      setBookings(b.data);
      setPendingPhotos(Array.isArray(g.data) ? g.data.length : 0);
      setAuthMethods(a.data);
      setNudgeStats(n.data);
      setAddonStats(ax.data);
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
              <img src="/logo-gold.webp" alt="Rox" width={32} height={32} className="w-9 h-9 object-contain" data-testid="admin-console-logo" />
              <span className="font-semibold text-[#0B3B5C]">Admin Console</span>
            </div>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <button onClick={() => nav("/admin")} className="px-3 py-1.5 rounded-md bg-[#0B3B5C] text-white" data-testid="admin-nav-bookings">Bookings</button>
              <button onClick={() => nav("/admin/manage")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-manage">Manage catalog</button>
              <button onClick={() => nav("/admin/groups")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-groups">Group inquiries</button>
              <button
                onClick={() => nav("/admin/manage?tab=gallery")}
                className={`relative px-3 py-1.5 rounded-md text-sm inline-flex items-center gap-1.5 transition-colors ${pendingPhotos > 0 ? "bg-[#D4A94A]/12 text-[#0B3B5C] hover:bg-[#D4A94A]/20 font-semibold" : "hover:bg-[#F1F5F9] text-[#64748B]"}`}
                data-testid="admin-nav-gallery"
                title={pendingPhotos > 0 ? `${pendingPhotos} photo${pendingPhotos > 1 ? "s" : ""} awaiting review` : "Guest photo submissions"}
              >
                <Images className="w-4 h-4" />
                Guest Photos
                {pendingPhotos > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#E86A3C] text-white text-[10px] font-bold" data-testid="admin-nav-gallery-badge">
                    {pendingPhotos}
                  </span>
                )}
              </button>
              <button
                onClick={() => nav("/driver/manifest")}
                className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B] inline-flex items-center gap-1.5"
                data-testid="admin-nav-manifest"
                title="Today's driver manifest"
              >
                <Route className="w-4 h-4" /> Manifest
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <DeliverabilityBadge />
            <PushToggle />
            <button
              onClick={downloadNotificationsCsv}
              className="text-sm flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-[#F1F5F9] text-[#0B3B5C]"
              data-testid="admin-export-notifications-csv"
              title="Export the last 30 days of notification delivery status as CSV"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
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

        {/* Login-method analytics — how customers actually sign in. Helps
            decide whether to keep the Google tab first or promote email. */}
        <AuthMethodsCard data={authMethods} />

        {/* Post-trip photo-nudge funnel — proves the email nudge is driving
            submissions to fill the "Recent group tours" strip on
            /cruise-groups-nassau with real customer photos. */}
        <PhotoNudgeCard data={nudgeStats} onRecompute={(fresh) => setNudgeStats((prev) => prev ? { ...prev, ...fresh } : fresh)} />

        {/* Taxi add-on attach rate — is the upsell landing? */}
        <TaxiAddonCard data={addonStats} />

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
                  <th className="px-4 py-3">Notify</th>
                  <th className="px-4 py-3">Proof</th>
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
                                {b.deposit_refund_provider && (
                                  <div className={b.deposit_refund_status === "succeeded" ? "text-[#059669] font-semibold" : "text-[#DC2626]"} data-testid={`admin-deposit-refund-${b.id}`}>
                                    Refund via {b.deposit_refund_provider}: {b.deposit_refund_status}
                                    {b.deposit_refund_id && <span className="block mono text-[9px] text-[#94a3b8]">{b.deposit_refund_id}</span>}
                                  </div>
                                )}
                                {b.deposit_reason && <div className="italic truncate" title={b.deposit_reason}>"{b.deposit_reason}"</div>}
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
                        <NotifyCell booking={b} onRefresh={load} />
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
                  <tr><td colSpan={10} className="text-center py-12 text-[#64748B]">No bookings for this filter yet.</td></tr>
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

function HandoffPhotosCell({ booking }) {
  // Compact thumbnail strip + lightbox for the driver-uploaded handoff
  // photos. Surfaces exactly where an admin needs it for no-show disputes
  // and rental damage claims — the booking row itself.
  const photos = booking.handoff_photos || [];
  const [preview, setPreview] = useState(null);
  const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${BACKEND_URL}${u}`);
  if (photos.length === 0) {
    return (
      <span className="text-[10px] text-[#94a3b8]" data-testid={`handoff-none-${booking.id}`}>
        —
      </span>
    );
  }
  return (
    <>
      <div className="flex items-center gap-1 flex-wrap" data-testid={`handoff-cell-${booking.id}`}>
        {photos.slice(0, 3).map((p, i) => (
          <button
            key={p.url}
            type="button"
            onClick={() => setPreview(p)}
            data-testid={`handoff-thumb-${booking.id}-${i}`}
            className="w-10 h-10 rounded-md overflow-hidden ring-1 ring-[#E2E8F0] hover:ring-[#D4A94A] transition-all active:scale-95"
            title={`Handoff photo — ${new Date(p.uploaded_at).toLocaleString()}`}
          >
            <img src={resolveUrl(p.url)} alt="Handoff proof" className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
        {photos.length > 3 && (
          <button
            type="button"
            onClick={() => setPreview(photos[3])}
            data-testid={`handoff-more-${booking.id}`}
            className="w-10 h-10 rounded-md bg-[#F1F5F9] text-[10px] font-bold text-[#0B3B5C] hover:bg-[#E2E8F0] active:scale-95"
          >
            +{photos.length - 3}
          </button>
        )}
      </div>
      {preview && (
        <div
          className="fixed inset-0 z-[110] bg-black/85 backdrop-blur flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
          data-testid={`handoff-preview-${booking.id}`}
        >
          <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={resolveUrl(preview.url)} alt="Handoff proof" className="w-full rounded-2xl" />
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-white/70 text-xs">
                <span className="text-white font-semibold">Booking {booking.id}</span>
                <span className="mx-2 text-white/40">·</span>
                {new Date(preview.uploaded_at).toLocaleString()}
                {preview.size_bytes && <span className="ml-2 text-white/40">{Math.round(preview.size_bytes / 1024)} KB</span>}
              </div>
              <div className="flex gap-2">
                {photos.length > 1 && (
                  <div className="flex gap-1">
                    {photos.map((p) => (
                      <button
                        key={p.url}
                        type="button"
                        onClick={() => setPreview(p)}
                        className={`w-2 h-2 rounded-full ${p.url === preview.url ? "bg-[#D4A94A]" : "bg-white/40 hover:bg-white/60"}`}
                        aria-label="Switch photo"
                      />
                    ))}
                  </div>
                )}
                <a
                  href={resolveUrl(preview.url)}
                  download
                  className="rounded-full bg-white/10 border border-white/20 text-white text-xs font-bold px-3 py-2 hover:bg-white/20"
                  data-testid={`handoff-download-${booking.id}`}
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("Delete this handoff photo? This cannot be undone.")) return;
                    try {
                      await api.delete(`/driver/${booking.id}/handoff-photo`, { params: { url: preview.url } });
                      // Optimistic remove from local view; a page refresh
                      // will pull the fresh booking with the photo gone.
                      booking.handoff_photos = (booking.handoff_photos || []).filter((p) => p.url !== preview.url);
                      toast.success("Photo deleted");
                      setPreview(null);
                    } catch (e) {
                      toast.error(e?.response?.data?.detail || "Delete failed");
                    }
                  }}
                  data-testid={`handoff-delete-${booking.id}`}
                  className="rounded-full bg-[#DC2626] text-white text-xs font-bold px-3 py-2 hover:bg-[#B91C1C]"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-full bg-white text-[#0B192C] text-xs font-bold px-3 py-2"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


function NotifyCell({ booking, onRefresh }) {
  const [resending, setResending] = useState(false);
  const status = booking.notification_status || null;
  const notifiedAt = booking.notified_at;
  const paid = booking.payment_status === "paid";

  const badge = (channel, meta) => {
    const Icon = channel === "email" ? Mail : MessageSquare;
    const label = channel === "email" ? "Email" : "SMS";
    if (!meta) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-[#F1F5F9] text-[#94a3b8]"
          title={`${label} — not sent yet`}
          data-testid={`notify-${channel}-${booking.id}`}
        >
          <Icon className="w-3 h-3" /> {label} —
        </span>
      );
    }
    if (!meta.enabled) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-[#F1F5F9] text-[#94a3b8]"
          title={`${label} disabled by admin`}
          data-testid={`notify-${channel}-${booking.id}`}
        >
          <Icon className="w-3 h-3" /> {label} off
        </span>
      );
    }
    if (meta.sent) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-[#059669]/10 text-[#059669] font-semibold"
          title={`${label} sent via ${meta.provider}`}
          data-testid={`notify-${channel}-${booking.id}`}
        >
          <Icon className="w-3 h-3" /> {label} ✓
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-[#DC2626]/10 text-[#DC2626] font-semibold"
        title={`${label} failed: ${meta.error || "unknown error"}`}
        data-testid={`notify-${channel}-${booking.id}`}
      >
        <Icon className="w-3 h-3" /> {label} ✗
      </span>
    );
  };

  const resend = async (force = false) => {
    setResending(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/resend-notification`, force ? { force: true } : {});
      const rep = data?.notification_status || {};
      const emailR = rep.email || {};
      const smsR = rep.sms || {};
      const label = force ? "Force-sent" : "Sent";

      // Per-channel toasts so the admin can see which channel worked and which
      // failed, with the provider + error inline for quick debugging.
      const channels = [
        { key: "email", label: "Email", meta: emailR },
        { key: "sms",   label: "SMS",   meta: smsR },
      ];

      let anyDelivered = false;
      channels.forEach(({ key, label: cLabel, meta }) => {
        if (!meta.enabled) {
          // In non-force mode, respect toggle state — quiet skip, but tell the user.
          if (!force) toast.info(`${cLabel} skipped — disabled in Site Config`, { id: `notify-${key}-${booking.id}` });
          return;
        }
        if (meta.sent) {
          anyDelivered = true;
          toast.success(`${cLabel} ${label.toLowerCase()} via ${meta.provider}`, { id: `notify-${key}-${booking.id}` });
        } else {
          toast.error(`${cLabel} failed${meta.error ? ` — ${meta.error}` : ""}`, { id: `notify-${key}-${booking.id}`, duration: 6000 });
        }
      });

      if (!anyDelivered && channels.every((c) => !c.meta.enabled)) {
        toast.warning("Both channels are disabled — turn them on in Site Config or use Force.", { duration: 5000 });
      }
      onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Re-send failed");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1" data-testid={`notify-cell-${booking.id}`}>
      <div className="flex gap-1 flex-wrap">
        {badge("email", status?.email)}
        {badge("sms", status?.sms)}
      </div>
      {notifiedAt && (
        <div className="text-[9px] text-[#94a3b8]" data-testid={`notify-time-${booking.id}`}>
          {new Date(notifiedAt).toLocaleString()}
        </div>
      )}
      {paid && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => resend(false)}
            disabled={resending}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0B3B5C] hover:text-[#D4A94A] disabled:opacity-60"
            data-testid={`notify-resend-${booking.id}`}
            title="Re-send using current notification preferences"
          >
            <RotateCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} /> {resending ? "…" : "Re-send"}
          </button>
          <button
            onClick={() => resend(true)}
            disabled={resending}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#D4A94A] hover:text-[#0B3B5C] disabled:opacity-60"
            data-testid={`notify-force-resend-${booking.id}`}
            title="Force-send email + SMS, bypassing admin notification toggles"
          >
            <Zap className={`w-3 h-3 ${resending ? "animate-pulse" : ""}`} /> Force
          </button>
        </div>
      )}
    </div>
  );
}

async function downloadNotificationsCsv() {
  toast.info("Exporting last 30 days…");
  try {
    const token = localStorage.getItem("admin_token");
    const res = await fetch(`${BACKEND_URL}/api/admin/notifications/report.csv?days=30`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const cd = res.headers.get("Content-Disposition") || "";
    const nameMatch = cd.match(/filename="([^"]+)"/);
    const filename = nameMatch ? nameMatch[1] : `rox-notifications-${Date.now()}.csv`;
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded — check your Downloads folder");
  } catch (e) {
    toast.error(`Export failed: ${e.message || e}`);
  }
}

function PushToggle() {
  // Web Push (VAPID) subscribe button — one-tap opt-in for phone-native
  // notifications on new bookings + guest photo submissions.
  const [supported] = useState(() => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  const [status, setStatus] = useState("checking"); // 'checking' | 'off' | 'on' | 'denied' | 'unsupported'
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) { setStatus("unsupported"); return; }
    if (Notification.permission === "denied") { setStatus("denied"); return; }
    navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
      if (!reg) return setStatus("off");
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    }).catch(() => setStatus("off"));
  }, [supported]);

  const urlBase64ToUint8Array = (base64String) => {
    const pad = "=".repeat((4 - (base64String.length % 4)) % 4);
    const b64 = (base64String + pad).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(b64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  };

  const enable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus(perm === "denied" ? "denied" : "off"); toast.error("Notifications not granted"); return; }
      const { data } = await api.get("/admin/push/vapid-public-key");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      });
      await api.post("/admin/push/subscribe", { ...sub.toJSON(), user_agent: navigator.userAgent });
      setStatus("on");
      toast.success("Push notifications enabled");
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Enable failed");
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) {
        await api.post("/admin/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setStatus("off");
      toast.success("Push notifications disabled");
    } catch (e) {
      toast.error(e?.message || "Disable failed");
    } finally { setBusy(false); }
  };

  const sendTest = async () => {
    try {
      const { data } = await api.post("/admin/push/test");
      toast.success(`Test sent to ${data?.sent ?? 0} device${(data?.sent ?? 0) === 1 ? "" : "s"}`);
    } catch { toast.error("Test send failed"); }
  };

  if (status === "unsupported") return null;
  if (status === "denied") {
    return (
      <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-[#DC2626]/10 text-[#DC2626] font-semibold" title="Enable notifications in your browser site settings" data-testid="push-toggle-denied">
        <BellOff className="w-3 h-3" /> Push blocked
      </span>
    );
  }
  if (status === "on") {
    return (
      <div className="hidden md:inline-flex items-center gap-1" data-testid="push-toggle-on">
        <button onClick={sendTest} className="text-[11px] rounded-full bg-[#059669]/10 text-[#059669] font-semibold px-2.5 py-1 hover:bg-[#059669]/20 inline-flex items-center gap-1.5" title="Send a test push" data-testid="push-test-btn">
          <Bell className="w-3 h-3" /> Push on
        </button>
        <button onClick={disable} disabled={busy} className="text-[10px] text-[#94a3b8] hover:text-[#DC2626]" title="Disable push" data-testid="push-disable-btn">off</button>
      </div>
    );
  }
  return (
    <button
      onClick={enable}
      disabled={busy || status === "checking"}
      className="hidden md:inline-flex items-center gap-1.5 text-[11px] rounded-full bg-[#0B3B5C]/10 text-[#0B3B5C] font-semibold px-3 py-1 hover:bg-[#0B3B5C] hover:text-white transition-colors disabled:opacity-60"
      data-testid="push-enable-btn"
      title="Enable push notifications on this device"
    >
      <Bell className="w-3 h-3" /> {busy ? "…" : "Enable push"}
    </button>
  );
}



function DeliverabilityBadge() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/admin/notifications/summary?days=30")
      .then((r) => setStats(r.data))
      .catch(() => setStats(null));
  }, []);
  if (!stats) return null;
  const emailRate = stats.email_success_rate;
  const smsRate = stats.sms_success_rate;
  const worst = Math.min(emailRate, smsRate);
  const tint = worst >= 95 ? "text-[#059669] bg-[#059669]/10" : worst >= 80 ? "text-[#D4A94A] bg-[#D4A94A]/10" : "text-[#E86A3C] bg-[#E86A3C]/10";
  return (
    <div
      className={`hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${tint}`}
      title={`Last 30 days: ${stats.email_sent}/${stats.email_sent + stats.email_failed} email · ${stats.sms_sent}/${stats.sms_sent + stats.sms_failed} SMS`}
      data-testid="deliverability-badge"
    >
      <Activity className="w-3 h-3" />
      <span>{emailRate}% email · {smsRate}% SMS</span>
    </div>
  );
}


function DepositActionModal({ booking, action, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [autoRefund, setAutoRefund] = useState(true);
  const isRelease = action === "released";
  const meta = DEPOSIT_META[action] || DEPOSIT_META.held;
  const canAutoRefund = booking.payment_status === "paid" && (
    booking.paypal_capture_id || ["stripe", "card"].includes((booking.payment_method || "").toLowerCase())
  );

  const submit = async () => {
    if (!isRelease && !reason.trim()) {
      toast.error("A reason is required when forfeiting a deposit.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch(`/admin/bookings/${booking.id}/deposit`, {
        status: action,
        reason: reason.trim() || null,
        auto_refund: isRelease ? autoRefund : false,
      });
      if (isRelease && autoRefund) {
        const info = data?.refund_info || {};
        if (info.refunded) {
          toast.success(`Deposit released — $${booking.deposit_amount} refunded via ${info.provider} (${info.refund_id || info.status})`);
        } else if (info.error) {
          toast.warning(`Deposit marked released — but auto-refund failed: ${info.error}. Refund manually.`);
        } else {
          toast.success(`Deposit released — $${booking.deposit_amount} recorded (manual refund needed for ${booking.payment_method}).`);
        }
      } else {
        toast.success(isRelease ? `Deposit released — refund $${booking.deposit_amount} to ${booking.customer_name}` : `Deposit forfeited — $${booking.deposit_amount} retained`);
      }
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update deposit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" data-testid="deposit-modal">
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
              <>Mark the <span className="mono font-semibold text-[#059669]">${booking.deposit_amount}</span> deposit as refunded to <strong>{booking.customer_name}</strong>. {canAutoRefund ? "Auto-refund will attempt to move the money back to their original payment method." : "This is a manual payment method — record only; issue the refund by hand."}</>
            ) : (
              <>Retain the <span className="mono font-semibold text-[#DC2626]">${booking.deposit_amount}</span> deposit for <strong>{booking.customer_name}</strong> due to damage, late return, or an unpaid balance. A reason is required and stored on the booking.</>
            )}
          </div>
        </div>

        {isRelease && (
          <label className={`mt-4 flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${autoRefund ? "border-[#059669]/40 bg-[#059669]/6" : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"} ${!canAutoRefund ? "opacity-60 cursor-not-allowed" : ""}`} data-testid="auto-refund-toggle">
            <input
              type="checkbox"
              checked={autoRefund && canAutoRefund}
              disabled={!canAutoRefund}
              onChange={(e) => setAutoRefund(e.target.checked)}
              className="mt-1 accent-[#059669]"
              data-testid="auto-refund-checkbox"
            />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-[#0B3B5C]">Auto-refund ${booking.deposit_amount} to customer</span>
              <span className="block text-[11px] text-[#64748B] mt-0.5">
                {canAutoRefund
                  ? booking.paypal_capture_id
                    ? "Refund will be issued via PayPal REST API using the original capture."
                    : "Refund will be issued via Stripe using the original payment intent."
                  : `Not available for ${booking.payment_method} — refund manually.`}
              </span>
            </span>
          </label>
        )}

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
            {saving ? "Processing..." : isRelease ? (autoRefund && canAutoRefund ? "Release & Refund $" + booking.deposit_amount : "Release $" + booking.deposit_amount) : "Forfeit $" + booking.deposit_amount}
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

/**
 * AuthMethodsCard — lifetime signup breakdown by provider (Google vs email)
 * plus a 30-day active-login split. Helps the owner decide which auth method
 * actually converts and drives return logins — e.g. "60% of my last-30-day
 * logins came via Google, so keep that tab first."
 */
function AuthMethodsCard({ data }) {
  if (!data) return null;
  const {
    total_users,
    google_users,
    email_users,
    google_only = 0,
    email_only = 0,
    both_users = 0,
    sessions_30d,
    new_signups_30d,
  } = data;
  // Three mutually-exclusive buckets so segments sum to exactly 100%
  const pct = (n) => (total_users > 0 ? Math.round((n / total_users) * 100) : 0);
  const googleOnlyPct = pct(google_only);
  const emailOnlyPct  = pct(email_only);
  const bothPct       = pct(both_users);
  const sessGoogle = sessions_30d?.google || 0;
  const sessEmail = sessions_30d?.email || 0;
  const sessTotal = sessions_30d?.total || 0;
  const sessGooglePct = sessTotal > 0 ? Math.round((sessGoogle / sessTotal) * 100) : 0;
  const sessEmailPct = sessTotal > 0 ? Math.round((sessEmail / sessTotal) * 100) : 0;

  return (
    <div
      className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-5"
      data-testid="admin-auth-methods-card"
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B3B5C]/8 flex items-center justify-center text-[#0B3B5C]">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#64748B]">Customer sign-ins</div>
            <div className="serif text-xl text-[#0B3B5C] mt-0.5">
              {total_users} {total_users === 1 ? "user" : "users"}
              <span className="text-xs font-normal text-[#64748B] ml-2">
                · {new_signups_30d} new in the last 30 days
              </span>
            </div>
          </div>
        </div>
        <div className="hidden sm:flex text-right text-[11px] text-[#64748B] leading-tight">
          <div>
            Can log in with Google: <span className="font-semibold text-[#0B3B5C]">{google_users}</span>
            <br />
            Can log in with Email: <span className="font-semibold text-[#0B3B5C]">{email_users}</span>
          </div>
        </div>
      </div>

      {/* Lifetime split — 3-segment bar (Google-only / Both / Email-only) */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold mb-2">
          Lifetime signup method
        </div>
        <div
          className="flex h-3 rounded-full overflow-hidden bg-[#F1F5F9]"
          data-testid="admin-auth-methods-lifetime-bar"
        >
          {googleOnlyPct > 0 && (
            <div className="bg-gradient-to-r from-[#4285F4] to-[#3B78E7]" style={{ width: `${googleOnlyPct}%` }} title={`Google only: ${google_only}`} />
          )}
          {bothPct > 0 && (
            <div className="bg-gradient-to-r from-[#7c3aed] to-[#5b21b6]" style={{ width: `${bothPct}%` }} title={`Both methods linked: ${both_users}`} />
          )}
          {emailOnlyPct > 0 && (
            <div className="bg-gradient-to-r from-[#D4A94A] to-[#B8912F]" style={{ width: `${emailOnlyPct}%` }} title={`Email only: ${email_only}`} />
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-sm">
          <LegendChip testId="admin-auth-lifetime-google"   Icon={Chrome} color="#4285F4" label="Google only" value={google_only} pct={googleOnlyPct} />
          {both_users > 0 && (
            <LegendChip testId="admin-auth-lifetime-both"   Icon={Users}  color="#7c3aed" label="Both linked" value={both_users}   pct={bothPct} />
          )}
          <LegendChip testId="admin-auth-lifetime-email"    Icon={Mail}   color="#D4A94A" label="Email only"  value={email_only}  pct={emailOnlyPct} />
        </div>
      </div>

      {/* Last-30-day active logins — the more useful signal week-to-week */}
      <div className="pt-4 border-t border-[#E2E8F0]">
        <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold mb-2">
          Active logins · Last 30 days
        </div>
        {sessTotal === 0 ? (
          <div className="text-sm text-[#64748B]">
            No customer logins recorded in the last 30 days. Fresh sign-ins will appear here as they happen.
          </div>
        ) : (
          <>
            <div className="flex h-3 rounded-full overflow-hidden bg-[#F1F5F9]" data-testid="admin-auth-methods-30d-bar">
              {sessGooglePct > 0 && (
                <div className="bg-gradient-to-r from-[#4285F4] to-[#3B78E7]" style={{ width: `${sessGooglePct}%` }} />
              )}
              {sessEmailPct > 0 && (
                <div className="bg-gradient-to-r from-[#D4A94A] to-[#B8912F]" style={{ width: `${sessEmailPct}%` }} />
              )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-sm">
              <LegendChip testId="admin-auth-30d-google" Icon={Chrome} color="#4285F4" label="Google" value={sessGoogle} pct={sessGooglePct} />
              <LegendChip testId="admin-auth-30d-email"  Icon={Mail}   color="#D4A94A" label="Email"  value={sessEmail}  pct={sessEmailPct} />
              <span className="text-[11px] text-[#94a3b8] ml-auto self-center">
                {sessTotal} total logins
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LegendChip({ testId, Icon, color, label, value, pct }) {
  return (
    <span className="inline-flex items-center gap-2" data-testid={testId}>
      <span className="inline-flex items-center justify-center w-5 h-5 rounded" style={{ background: `${color}18`, color }}>
        <Icon className="w-3 h-3" />
      </span>
      <span className="text-[#0B3B5C] font-semibold">{label}</span>
      <span className="text-[#64748B]">
        {value} <span className="text-[11px] text-[#94a3b8]">· {pct}%</span>
      </span>
    </span>
  );
}

/**
 * PhotoNudgeCard — proves the post-trip "share your photos" email nudge is
 * driving real submissions. Shows lifetime + last-30-day funnel:
 * nudges sent → attributed submissions → conversion %.
 */
function PhotoNudgeCard({ data, onRecompute }) {
  const [recomputing, setRecomputing] = useState(false);
  const [flash, setFlash] = useState(false);
  if (!data) return null;
  const life = data.lifetime || {};
  const r = data.last_30d || {};
  const lifeConv = Number(life.conversion_pct || 0);
  const recentConv = Number(r.conversion_pct || 0);

  const recompute = async () => {
    if (recomputing) return;
    setRecomputing(true);
    try {
      const { data: fresh } = await api.get("/admin/photo-nudge-stats/ab-significance");
      if (fresh && typeof onRecompute === "function") {
        onRecompute({ ab_test: fresh.ab_test, ab_significance: fresh.ab_significance });
      }
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
    } catch {
      // Silent — the panel keeps whatever it had.
    } finally {
      setRecomputing(false);
    }
  };
  return (
    <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-5" data-testid="admin-photo-nudge-card">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/12 flex items-center justify-center text-[#D4A94A]">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#64748B]">Photo-share nudge funnel</div>
            <div className="serif text-xl text-[#0B3B5C] mt-0.5">
              {r.attributed_submissions || 0} submissions from nudges
              <span className="text-xs font-normal text-[#64748B] ml-2">· last 30 days</span>
            </div>
          </div>
        </div>
        <div className="hidden sm:block text-right text-[11px] text-[#64748B] leading-tight">
          <div>Lifetime nudges: <span className="font-semibold text-[#0B3B5C]">{life.nudges_sent || 0}</span></div>
          <div>Lifetime conversion: <span className="font-semibold text-[#0B3B5C]">{lifeConv}%</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NudgeStat testId="nudge-30d-sent"      label="Nudges sent"          value={r.nudges_sent || 0}           tone="#0B3B5C" />
        <NudgeStat testId="nudge-30d-attributed" label="Attributed subs"      value={r.attributed_submissions || 0} tone="#059669" />
        <NudgeStat testId="nudge-30d-total"     label="Total gallery subs"   value={r.total_submissions || 0}     tone="#D4A94A" />
        <NudgeStat testId="nudge-30d-conv"      label="Conversion"           value={`${recentConv}%`}             tone="#E86A3C" Icon={TrendingUp} />
      </div>

      {/* A/B variant breakdown — 24h send vs 3-day send. Tapping any card
          triggers a fresh /admin/photo-nudge-stats/ab-significance recompute
          so the "Ship the winner" hint below updates inline without a
          full page reload. */}
      {Array.isArray(data.ab_test) && data.ab_test.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#E2E8F0]" data-testid="nudge-ab-block">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold">
              A/B send-window test · last 30 days
            </div>
            <button
              type="button"
              onClick={recompute}
              disabled={recomputing}
              data-testid="nudge-ab-recompute"
              className="text-[10px] uppercase tracking-widest inline-flex items-center gap-1 rounded-full px-2 py-1 border border-[#E2E8F0] text-[#0B3B5C] hover:bg-[#F1F5F9] active:scale-95 disabled:opacity-60"
              title="Recompute variant conversion + significance from the latest data"
            >
              <RotateCw className={`w-3 h-3 ${recomputing ? "animate-spin" : ""}`} />
              {recomputing ? "Recomputing…" : "Recompute"}
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {data.ab_test.map((v) => {
              const isWinning = data.ab_test.length === 2
                && v.conversion_pct === Math.max(...data.ab_test.map((x) => x.conversion_pct))
                && v.conversion_pct > 0
                && data.ab_test[0].conversion_pct !== data.ab_test[1].conversion_pct;
              return (
                <button
                  key={v.variant}
                  type="button"
                  onClick={recompute}
                  disabled={recomputing}
                  data-testid={`nudge-ab-variant-${v.variant}`}
                  className={`text-left rounded-xl border p-3 transition-all cursor-pointer hover:shadow-sm active:scale-[.99] ${isWinning ? "border-[#059669] bg-[#059669]/6 hover:bg-[#059669]/10" : "border-[#E2E8F0] bg-[#FAF9F6] hover:border-[#D4A94A]"} ${flash ? "ring-2 ring-[#D4A94A]" : ""}`}
                  title="Tap to recompute significance from the latest data"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-[#0B3B5C]">
                      Variant {v.variant}
                      <span className="ml-1 text-[10px] font-normal text-[#64748B]">· {v.label}</span>
                    </div>
                    {isWinning && (
                      <span className="text-[9px] font-black uppercase tracking-widest rounded-full bg-[#059669] text-white px-2 py-0.5" data-testid={`nudge-ab-winner-${v.variant}`}>
                        Winning
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="mono text-2xl font-black text-[#0B3B5C]">{v.conversion_pct}%</span>
                    <span className="text-[11px] text-[#64748B]">
                      {v.attributed_submissions} / {v.nudges_sent} nudges
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Statistical-significance hint — tells the owner exactly when it's
              safe to call a winner instead of "keep waiting" ambiguity. */}
          {data.ab_significance && (
            <div
              data-testid="nudge-ab-significance"
              className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-snug flex items-start gap-2 ${
                data.ab_significance.is_significant
                  ? "bg-[#059669]/10 border border-[#059669]/30 text-[#065f46]"
                  : "bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B]"
              }`}
            >
              {data.ab_significance.is_significant
                ? <ShieldCheck className="w-4 h-4 mt-[1px] text-[#059669] shrink-0" />
                : <Info className="w-4 h-4 mt-[1px] text-[#94a3b8] shrink-0" />}
              <div>
                <div className={data.ab_significance.is_significant ? "font-bold" : "font-semibold text-[#0B3B5C]"}>
                  {data.ab_significance.is_significant ? "Declare a winner" : "Not yet significant"}
                </div>
                <div className="mt-0.5">{data.ab_significance.message}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 text-[11px] text-[#64748B] leading-relaxed">
        Attribution: a gallery submission counts as "from a nudge" when the submitter's email matches a booking that received a photo-nudge email in the previous 7 days.
      </div>
    </div>
  );
}

function NudgeStat({ testId, label, value, tone, Icon }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#FAF9F6] p-3" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <div className="mono text-2xl mt-1 font-black" style={{ color: tone }}>{value}</div>
    </div>
  );
}


// Taxi add-on attach rate + revenue chart. Reads from
// GET /admin/analytics/taxi-addon (last 30d). Renders a compact card with:
//  · Attach-rate + revenue KPIs
//  · 30-day sparkline (add-on revenue per day)
//  · Top 5 tours ranked by add-on revenue
function TaxiAddonCard({ data }) {
  if (!data) return null;
  const attach = Number(data.attach_rate || 0);
  const totalTours = Number(data.total_tour_bookings || 0);
  const addonBookings = Number(data.addon_bookings || 0);
  const revenue = Number(data.addon_revenue || 0);
  const daily = Array.isArray(data.daily) ? data.daily : [];
  const byTour = Array.isArray(data.by_tour) ? data.by_tour : [];
  const empty = totalTours === 0;
  return (
    <div
      className="mt-6 rounded-2xl border border-[#D4A94A]/25 bg-white p-5 lg:p-6"
      data-testid="admin-taxi-addon-card"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/15 flex items-center justify-center text-[#D4A94A]">
          <Car className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="serif text-lg text-[#0B3B5C] leading-tight">Taxi add-on performance</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">
            Attach rate + revenue for the optional round-trip taxi upsell · last {data.window_days || 30} days · confirmed tour bookings
          </div>
        </div>
      </div>

      {empty ? (
        <div
          className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-6 text-center text-sm text-[#64748B]"
          data-testid="admin-taxi-addon-empty"
        >
          No paid tour bookings yet in this window — the chart will populate as bookings come in.
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 space-y-3">
            <AddonStat testId="addon-attach-rate" label="Attach rate" value={`${attach}%`} sub={`${addonBookings} of ${totalTours} tours`} tone="#D4A94A" />
            <AddonStat testId="addon-revenue" label="Add-on revenue" value={money(revenue)} sub={addonBookings > 0 ? `${money(revenue / addonBookings)} avg` : "—"} tone="#059669" />
          </div>
          <div className="lg:col-span-3">
            <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-semibold mb-2">Add-on revenue · daily</div>
            <div className="h-32" data-testid="admin-taxi-addon-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} tickFormatter={(d) => d.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} width={40} />
                  <Tooltip
                    contentStyle={{ background: "#0B3B5C", border: "none", borderRadius: 8, color: "#fff", fontSize: 11 }}
                    labelStyle={{ color: "#D4A94A" }}
                    formatter={(v, k) => k === "revenue" ? [`$${Number(v).toFixed(2)}`, "Revenue"] : [v, k === "addons" ? "Add-ons" : "Tours"]}
                  />
                  <Bar dataKey="revenue" fill="#D4A94A" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {byTour.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[#F1F5F9]" data-testid="admin-taxi-addon-by-tour">
          <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-semibold mb-2">Top tours by add-on revenue</div>
          <div className="space-y-1.5">
            {byTour.map((t) => (
              <div key={t.name} className="flex items-center gap-3 text-xs" data-testid={`admin-taxi-addon-tour-${t.name}`}>
                <div className="flex-1 min-w-0 truncate text-[#0B3B5C] font-semibold">{t.name}</div>
                <div className="w-16 text-right text-[#64748B] mono">{t.attach_rate}%</div>
                <div className="w-14 text-right text-[#94a3b8]">{t.addons}/{t.tours}</div>
                <div className="w-20 text-right mono font-semibold text-[#D4A94A]">{money(t.revenue)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AddonStat({ testId, label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-[#F1F5F9] bg-[#FBF7EF]/40 p-3" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-semibold">{label}</div>
      <div className="serif text-2xl mt-0.5" style={{ color: tone }}>{value}</div>
      <div className="text-[11px] text-[#64748B] mt-0.5">{sub}</div>
    </div>
  );
}

