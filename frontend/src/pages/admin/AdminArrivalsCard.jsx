import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";
import { CheckCircle2, Users, Clock, RefreshCw, Umbrella } from "lucide-react";

/**
 * AdminArrivalsCard — live board of today's Cable Beach arrivals.
 *
 * Polls `/api/admin/cable-beach/arrivals-today` every 10s and renders a
 * compact strip of guests who've been checked in by the beach team.
 * Auto-hides when there are no arrivals yet (so it doesn't clutter the
 * dashboard on quiet days).
 *
 * Each row shows party size, guest name, how long ago they arrived, and
 * which attendant tapped them in. New arrivals since last poll briefly
 * pulse gold to catch the admin's eye.
 */
export default function AdminArrivalsCard() {
  const [arrivals, setArrivals] = useState([]);
  const [lastIds, setLastIds] = useState(new Set());
  const [newIds, setNewIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/cable-beach/arrivals-today");
      const incoming = data?.arrivals || [];
      // Flash gold any row whose ID wasn't in the previous payload.
      const now = new Set(incoming.map((a) => a.id));
      const fresh = new Set();
      if (lastIds.size > 0) {
        for (const a of incoming) if (!lastIds.has(a.id)) fresh.add(a.id);
      }
      setArrivals(incoming);
      setLastIds(now);
      if (fresh.size > 0) {
        setNewIds(fresh);
        setTimeout(() => setNewIds(new Set()), 4000);
      }
    } catch (_e) {
      // Silent — admin can hit Refresh. 401s already auto-redirect at the api layer.
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIds]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-hide the card until the first guest of the day arrives so quiet
  // mornings don't push the stats cards down.
  if (loading) return null;
  if (!arrivals.length) return null;

  const totalGuests = arrivals.reduce((n, a) => n + (a.pax || 0), 0);

  return (
    <section
      className="bg-gradient-to-br from-[#0B3B5C] to-[#082941] text-white rounded-2xl p-5 shadow-xl mb-5"
      data-testid="admin-arrivals-board"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
            <Umbrella className="w-4 h-4 text-emerald-300" />
          </div>
          <div>
            <div className="text-[10px] tracking-[.28em] uppercase font-black text-[#D4A94A]">
              Live · Cable Beach
            </div>
            <h3 className="font-[Georgia] text-xl mt-0.5" data-testid="arrivals-title">
              {arrivals.length} party{arrivals.length === 1 ? "" : "s"} on the sand
            </h3>
            <div className="text-xs text-white/60 mt-0.5">
              {totalGuests} guests arrived today · auto-refresh every 10s
            </div>
          </div>
        </div>
        <button
          onClick={load}
          className="opacity-70 hover:opacity-100 transition p-2"
          title="Refresh now"
          data-testid="arrivals-refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <ul className="space-y-1.5">
        {arrivals.map((a) => {
          const isNew = newIds.has(a.id);
          return (
            <li
              key={a.id}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 border transition-colors ${
                isNew
                  ? "bg-[#D4A94A]/20 border-[#D4A94A] animate-pulse"
                  : "bg-white/5 border-white/10"
              }`}
              data-testid={`arrival-row-${a.id}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate" data-testid={`arrival-name-${a.id}`}>
                    {a.customer_name || "Guest"}
                  </div>
                  <div className="text-[11px] text-white/60 font-mono">{a.id}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-[#D4A94A]" />
                  <span className="font-bold">{a.pax}</span>
                </span>
                <span className="flex items-center gap-1 text-white/60" title={a.arrived_at}>
                  <Clock className="w-3 h-3" />
                  {relativeTime(a.arrived_at)}
                </span>
                {a.attendant_arrived_by && (
                  <span className="hidden sm:inline text-[11px] text-white/50 italic">
                    · {a.attendant_arrived_by}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function relativeTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(iso).toLocaleTimeString();
}
