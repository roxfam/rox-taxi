import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Smartphone, Shield, RotateCw, LogOut, MapPin, Clock, Check } from "lucide-react";
import { api } from "../../lib/api";

/**
 * AdminSessionsCard — "Signed-in devices" panel for the admin dashboard.
 *
 * Lists every live admin session (JWT not expired and not revoked),
 * surfacing device/UA, IP, issued-at and last-seen so the owner can
 * see from the dashboard who is logged in. The current session is
 * flagged with a gold ribbon and its Revoke button is suppressed so
 * nobody accidentally knocks themselves out of the tab they're using.
 */
function timeAgo(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!then || Number.isNaN(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminSessionsCard() {
  const [sessions, setSessions] = useState([]);
  const [trusted, setTrusted] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        api.get("/admin/sessions"),
        api.get("/admin/trusted-devices").catch(() => ({ data: { devices: [] } })),
      ]);
      setSessions(Array.isArray(s.data?.sessions) ? s.data.sessions : []);
      setTrusted(Array.isArray(t.data?.devices) ? t.data.devices : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load admin sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const otherCount = useMemo(
    () => sessions.filter((s) => !s.current).length,
    [sessions]
  );

  const revoke = async (sess) => {
    if (sess.current) {
      toast.info("You cannot revoke the session you're currently signed in with. Use 'Sign out' instead.");
      return;
    }
    if (!window.confirm(`Revoke this session (${sess.device})? The signed-in user will be bounced to the login screen on their next request.`)) return;
    setBusy((b) => ({ ...b, [sess.id]: true }));
    try {
      await api.post(`/admin/sessions/${sess.id}/revoke`);
      toast.success("Session revoked");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Revoke failed");
    } finally {
      setBusy((b) => ({ ...b, [sess.id]: false }));
    }
  };

  const trust = async (sess) => {
    const label = window.prompt(
      `Mark "${sess.device}" as trusted?\n\nFuture logins from this device won't ping your phone. Optional short label:`,
      sess.device || "",
    );
    if (label === null) return;
    setBusy((b) => ({ ...b, [`trust-${sess.id}`]: true }));
    try {
      await api.post("/admin/trusted-devices", {
        session_prefix: sess.id,
        label: label || "",
      });
      toast.success("Device marked as trusted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Trust failed");
    } finally {
      setBusy((b) => ({ ...b, [`trust-${sess.id}`]: false }));
    }
  };

  const untrust = async (td) => {
    if (!window.confirm(`Remove "${td.label || td.device_signature}" from trusted devices? Future logins will ping you again.`)) return;
    try {
      await api.delete(`/admin/trusted-devices/${td.id}`);
      toast.success("Device removed from trusted list");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Remove failed");
    }
  };

  // Hide the whole card when there's only the current session AND no
  // trusted devices to manage.
  if (!loading && otherCount === 0 && trusted.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden" data-testid="admin-sessions-card">
      <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B3B5C]/8 flex items-center justify-center text-[#0B3B5C]">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#0B3B5C]">Signed-in admin devices</div>
            <div className="text-xs text-[#64748B] mt-0.5">
              {otherCount} other active session{otherCount === 1 ? "" : "s"} alongside this one. Revoke anything you don't recognise.
            </div>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-md hover:bg-[#F1F5F9]" data-testid="admin-sessions-refresh">
          <RotateCw className={`w-4 h-4 text-[#64748B] ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-[#F8FAFC] text-[#64748B] text-xs">
          <tr>
            <th className="text-left px-5 py-2.5">Device</th>
            <th className="text-left px-5 py-2.5">Location / IP</th>
            <th className="text-left px-5 py-2.5">Signed in</th>
            <th className="text-left px-5 py-2.5">Last activity</th>
            <th className="text-right px-5 py-2.5">Action</th>
          </tr>
        </thead>
        <tbody>
          {loading && sessions.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-6 text-[#64748B]">Loading…</td></tr>
          ) : sessions.length === 0 ? (
            <tr><td colSpan={5} className="text-center py-6 text-[#64748B]">No active admin sessions.</td></tr>
          ) : sessions.map((s) => (
            <tr key={s.id} className="border-t border-[#E2E8F0]" data-testid={`admin-session-row-${s.id}`}>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#64748B]" />
                  <span className="text-[#0B3B5C] font-semibold">{s.device || "Unknown device"}</span>
                  {s.current && (
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#D4A94A]/15 text-[#8a6a1a] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" data-testid={`admin-session-current-${s.id}`}>
                      This session
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5 mono">{s.sub}</div>
              </td>
              <td className="px-5 py-3 text-[#64748B]">
                <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /><span>{s.ip || "—"}</span></div>
              </td>
              <td className="px-5 py-3 text-[#64748B]">{timeAgo(s.issued_at)}</td>
              <td className="px-5 py-3 text-[#64748B]">
                <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /><span>{timeAgo(s.last_seen_at)}</span></div>
              </td>
              <td className="px-5 py-3 text-right">
                <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                  {!s.current && !s.trusted && (
                    <button
                      disabled={!!busy[`trust-${s.id}`]}
                      onClick={() => trust(s)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#D4A94A]/40 text-[#8a6a1a] px-3 py-1 text-xs font-bold hover:bg-[#D4A94A]/10 disabled:opacity-50"
                      data-testid={`admin-session-trust-${s.id}`}
                    >
                      <Check className="w-3 h-3" /> Trust
                    </button>
                  )}
                  {s.trusted && !s.current && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" data-testid={`admin-session-trusted-${s.id}`}>
                      <Check className="w-3 h-3" /> Trusted
                    </span>
                  )}
                  {s.current ? (
                    <span className="text-xs text-[#64748B]">—</span>
                  ) : (
                    <button
                      disabled={!!busy[s.id]}
                      onClick={() => revoke(s)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 text-red-600 px-3 py-1 text-xs font-bold hover:bg-red-50 disabled:opacity-50"
                      data-testid={`admin-session-revoke-${s.id}`}
                    >
                      <LogOut className="w-3 h-3" /> Revoke
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {trusted.length > 0 && (
        <div className="px-5 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC]" data-testid="admin-trusted-devices-list">
          <div className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-bold mb-2">
            Trusted devices · won't trigger new-device alerts
          </div>
          <div className="flex flex-wrap gap-2">
            {trusted.map((td) => (
              <div
                key={td.id}
                className="inline-flex items-center gap-2 rounded-full bg-white border border-[#E2E8F0] pl-3 pr-1 py-1"
                data-testid={`admin-trusted-device-${td.id}`}
              >
                <Check className="w-3 h-3 text-emerald-600" />
                <span className="text-xs text-[#0B3B5C] font-semibold">{td.label || td.device_signature}</span>
                {td.city && <span className="text-[10px] text-[#64748B]">· {td.city}</span>}
                <button
                  onClick={() => untrust(td)}
                  className="w-5 h-5 rounded-full hover:bg-red-50 text-[#64748B] hover:text-red-600 text-xs"
                  data-testid={`admin-trusted-remove-${td.id}`}
                  title="Remove from trusted devices"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
