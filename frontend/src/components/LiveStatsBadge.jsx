import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Flame } from "lucide-react";

// Subtle live-stats badge: "N bookings in the last hour" — polled every 60s.
// Only renders when count > 0 so the site never looks empty.
export default function LiveStatsBadge() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { data } = await api.get("/live-stats");
        if (alive) setStats(data);
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const n = stats?.bookings_last_hour || 0;
  if (n < 1) return null;

  return (
    <div
      className="hidden xl:inline-flex items-center gap-1.5 rounded-full bg-white/70 backdrop-blur-md border border-white/80 px-3 h-8 shadow-[0_4px_12px_rgba(232,106,60,0.10)]"
      title={`${n} bookings in the last hour · ${stats.bookings_last_24h || 0} in the last 24 hours`}
      data-testid="live-stats-badge"
    >
      <Flame className="w-3.5 h-3.5 text-[#E86A3C]" />
      <span className="text-[10px] tracking-widest uppercase font-black text-[#0B3B5C]">
        <span className="text-[#E86A3C]">{n}</span> booked / hr
      </span>
    </div>
  );
}
