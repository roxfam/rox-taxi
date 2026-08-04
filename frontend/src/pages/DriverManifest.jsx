import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, money } from "../lib/api";
import { Phone, MessageCircle, MapPin, ArrowRight, RefreshCw, LogOut, Calendar, User, Navigation, Trophy, Zap } from "lucide-react";

// Mobile-first "today's runs" screen for the driver / dispatcher.
// Auth: reuses the admin JWT — the owner IS the primary driver here.
// A future refactor can add per-driver PINs against a `drivers` collection.
const STATUS_FLOW = [
  { key: "confirmed",       label: "Confirmed",   next: "driver_assigned", cta: "Accept" },
  { key: "driver_assigned", label: "Assigned",    next: "en_route",        cta: "On my way" },
  { key: "en_route",        label: "En route",    next: "arrived",         cta: "Arrived" },
  { key: "arrived",         label: "At pickup",   next: "completed",       cta: "Complete" },
  { key: "completed",       label: "Completed",   next: null,              cta: null },
];

const STATUS_META = {
  confirmed:       { tint: "#0B3B5C", bg: "#0B3B5C15" },
  driver_assigned: { tint: "#D4A94A", bg: "#D4A94A15" },
  en_route:        { tint: "#E86A3C", bg: "#E86A3C15" },
  arrived:         { tint: "#059669", bg: "#05966915" },
  completed:       { tint: "#64748B", bg: "#64748B15" },
  pending_payment: { tint: "#94a3b8", bg: "#94a3b815" },
};

export default function DriverManifest() {
  const nav = useNavigate();
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState({});
  const [leaderboard, setLeaderboard] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem("admin_token")) nav("/admin/login");
  }, [nav]);

  // Pull the team on-time leaderboard once on mount. Failures are silent —
  // the manifest UX shouldn't break if the stats endpoint hiccups.
  useEffect(() => {
    api.get("/admin/driver/leaderboard")
      .then(({ data }) => setLeaderboard(data))
      .catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/driver/manifest", { params: { date } });
      setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
    } catch (e) {
      if (e?.response?.status === 401) {
        localStorage.removeItem("admin_token");
        nav("/admin/login");
        return;
      }
      toast.error("Failed to load manifest");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Auto-refresh every 60s so a dispatcher-created booking pops up
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = async (b) => {
    const step = STATUS_FLOW.find((s) => s.key === b.status);
    if (!step?.next) return;
    setUpdating((u) => ({ ...u, [b.id]: true }));
    try {
      await api.patch(`/admin/bookings/${b.id}/status`, { status: step.next });
      toast.success(`${b.id} → ${step.next.replace("_", " ")}`);
      setBookings((xs) => xs.map((x) => (x.id === b.id ? { ...x, status: step.next } : x)));
    } catch {
      toast.error("Update failed");
    } finally {
      setUpdating((u) => { const n = { ...u }; delete n[b.id]; return n; });
    }
  };

  const summary = useMemo(() => {
    const total = bookings.length;
    const done = bookings.filter((b) => b.status === "completed").length;
    const active = bookings.filter((b) => ["driver_assigned", "en_route", "arrived"].includes(b.status)).length;
    return { total, done, active };
  }, [bookings]);

  return (
    <div className="min-h-screen bg-[#0B192C] text-white pb-24" data-testid="driver-manifest-page">
      <header className="sticky top-0 z-40 bg-[#0B192C]/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo-gold.webp" alt="Rox" width={36} height={36} className="w-9 h-9 object-contain" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[#D4A94A] font-bold">Driver</div>
              <div className="serif text-lg leading-none">Today's Manifest</div>
            </div>
          </div>
          <button
            onClick={() => { localStorage.removeItem("admin_token"); nav("/admin/login"); }}
            className="text-white/60 hover:text-white text-xs inline-flex items-center gap-1"
            data-testid="driver-manifest-logout"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="flex-1 relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-white/10 border border-white/15 rounded-full pl-10 pr-4 py-2 text-sm font-medium focus:outline-none focus:border-[#D4A94A]"
              data-testid="driver-manifest-date"
            />
          </label>
          <button
            onClick={load}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            data-testid="driver-manifest-refresh"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="driver-manifest-summary">
          <div className="rounded-xl bg-white/5 border border-white/10 py-2">
            <div className="text-[9px] uppercase tracking-widest text-white/50">Total</div>
            <div className="serif text-xl">{summary.total}</div>
          </div>
          <div className="rounded-xl bg-[#E86A3C]/15 border border-[#E86A3C]/30 py-2">
            <div className="text-[9px] uppercase tracking-widest text-[#E86A3C]">Active</div>
            <div className="serif text-xl text-[#E86A3C]">{summary.active}</div>
          </div>
          <div className="rounded-xl bg-[#059669]/15 border border-[#059669]/30 py-2">
            <div className="text-[9px] uppercase tracking-widest text-[#059669]">Done</div>
            <div className="serif text-xl text-[#059669]">{summary.done}</div>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {leaderboard && leaderboard.this_month?.total > 0 && (
          <LeaderboardCard data={leaderboard} />
        )}
        {bookings.length === 0 ? (
          <div className="text-center py-24 text-white/50" data-testid="driver-manifest-empty">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
            {loading ? "Loading…" : "No bookings scheduled for this day."}
          </div>
        ) : (
          bookings.map((b) => {
            const meta = STATUS_META[b.status] || STATUS_META.confirmed;
            const step = STATUS_FLOW.find((s) => s.key === b.status);
            const dt = new Date(b.booking_date);
            const phone = (b.customer_phone || "").replace(/[^+\d]/g, "");
            return (
              <div
                key={b.id}
                className="rounded-2xl bg-white text-[#0B192C] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                data-testid={`driver-manifest-card-${b.id}`}
              >
                <div className="px-4 py-3 flex items-center justify-between bg-[#F7F5EF] border-b border-[#EFE7D5]">
                  <div>
                    <div className="mono text-[#0B3B5C] font-bold">{b.id}</div>
                    <div className="text-[11px] text-[#64748B]">
                      {dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {b.service_type}
                    </div>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-full"
                    style={{ color: meta.tint, background: meta.bg }}
                    data-testid={`driver-manifest-status-${b.id}`}
                  >
                    {b.status.replace("_", " ")}
                  </span>
                </div>

                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#0B3B5C] shrink-0" />
                    <div className="flex-1">
                      <div className="font-semibold text-[#0B3B5C]">{b.customer_name}</div>
                      <div className="text-[11px] text-[#64748B]">{b.customer_phone || "—"}{b.pax ? ` · ${b.pax} pax` : ""}</div>
                    </div>
                    <div className="mono text-[#E86A3C] font-bold">{money(b.total)}</div>
                  </div>

                  <div className="rounded-lg bg-[#F7F5EF] border border-[#EFE7D5] px-3 py-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-[#D4A94A] mt-0.5 shrink-0" />
                      <div className="flex-1 text-[13px]">
                        <div className="text-[#0B3B5C] font-medium">{b.pickup_location || b.item_name}</div>
                        {b.dropoff_location && (
                          <div className="mt-0.5 text-[#64748B] flex items-center gap-1">
                            <ArrowRight className="w-3 h-3" /> {b.dropoff_location}
                          </div>
                        )}
                      </div>
                    </div>
                    {(b.notes || b.flight_number) && (
                      <div className="mt-2 text-[11px] text-[#64748B] italic">
                        {b.flight_number && <span className="mr-2">✈ {b.flight_number}</span>}
                        {b.notes}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 pb-4 grid grid-cols-3 gap-2">
                  {phone ? (
                    <>
                      <a
                        href={`tel:${phone}`}
                        className="rounded-xl bg-[#059669] text-white text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 active:scale-95"
                        data-testid={`driver-manifest-call-${b.id}`}
                      >
                        <Phone className="w-4 h-4" /> Call
                      </a>
                      <a
                        href={`https://wa.me/${phone.replace(/[^\d]/g, "")}`}
                        target="_blank" rel="noreferrer"
                        className="rounded-xl bg-[#25D366] text-white text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 active:scale-95"
                        data-testid={`driver-manifest-wa-${b.id}`}
                      >
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                      </a>
                    </>
                  ) : (
                    <span className="col-span-2 text-[11px] text-[#94a3b8] italic self-center pl-1">No phone provided</span>
                  )}
                  {b.pickup_location && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(b.pickup_location + " Nassau Bahamas")}`}
                      target="_blank" rel="noreferrer"
                      className="rounded-xl bg-[#0B3B5C] text-white text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 active:scale-95"
                      data-testid={`driver-manifest-map-${b.id}`}
                    >
                      <Navigation className="w-4 h-4" /> Map
                    </a>
                  )}
                </div>

                {step?.next && (
                  <button
                    onClick={() => advance(b)}
                    disabled={!!updating[b.id]}
                    className="w-full text-white text-sm font-bold py-3 active:scale-[0.98] disabled:opacity-60"
                    style={{ background: meta.tint }}
                    data-testid={`driver-manifest-advance-${b.id}`}
                  >
                    {updating[b.id] ? "…" : step.cta} →
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


// ── Leaderboard card ─────────────────────────────────────────────────
// Team on-time performance gamification. Shows this month's on-time %,
// delta vs last month, current streak, and a 6-month spark bar. Zero
// PII — purely a "beat last month" scorecard.
function LeaderboardCard({ data }) {
  const pct = data.this_month.on_time_pct;
  const delta = data.delta_pct;
  const streak = data.streak || 0;
  const trend = data.trend || [];
  const maxPct = Math.max(100, ...trend.map((t) => t.on_time_pct));
  const tone = pct >= 90 ? "#059669" : pct >= 75 ? "#D4A94A" : "#E86A3C";

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#0B3B5C] via-[#0B192C] to-[#0B192C] border border-[#D4A94A]/30 p-4" data-testid="leaderboard-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.28em] uppercase text-[#D4A94A] font-black">
          <Trophy className="w-3.5 h-3.5" /> Team on-time · this month
        </div>
        {streak >= 3 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#D4A94A]" data-testid="leaderboard-streak">
            <Zap className="w-3 h-3" /> {streak} in a row
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="serif text-4xl leading-none" style={{ color: tone }} data-testid="leaderboard-pct">{pct}%</span>
        <span className="text-xs text-white/60">of {data.this_month.total} runs</span>
        {delta !== 0 && (
          <span className={`text-[11px] font-bold ${delta > 0 ? "text-[#059669]" : "text-[#E86A3C]"}`} data-testid="leaderboard-delta">
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}% vs last month
          </span>
        )}
      </div>
      {trend.length > 0 && (
        <div className="mt-3 flex items-end gap-1 h-10" data-testid="leaderboard-trend">
          {trend.map((t, i) => {
            const h = maxPct > 0 ? Math.max(4, (t.on_time_pct / maxPct) * 40) : 4;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t"
                  style={{ height: `${h}px`, background: i === trend.length - 1 ? tone : "#D4A94A80" }}
                  title={`${t.month}: ${t.on_time_pct}% (${t.total} runs)`}
                />
                <span className="text-[8px] text-white/50">{t.month}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 text-[10px] text-white/50 leading-relaxed">
        On-time = arrived within {data.on_time_tolerance_min || 5} min of the scheduled pickup.
      </div>
    </div>
  );
}
