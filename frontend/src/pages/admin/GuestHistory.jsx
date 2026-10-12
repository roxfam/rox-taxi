import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api, money } from "../../lib/api";

export default function GuestHistory({ bookingId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/admin/bookings/${bookingId}/guest-history`).then(({ data: d }) => setData(d)).catch(() => setData({ trips: [], count: 0, total_spent: 0 }));
  }, [bookingId]);

  if (!data) return null;
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4" data-testid="guest-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-[#64748B] font-black">
          <History className="w-3.5 h-3.5 text-[#D4A94A]" /> Guest history
        </div>
        <div className="text-xs text-[#0B3B5C]" data-testid="guest-history-summary">
          {data.count === 0 ? "First booking with us" : (
            <><strong>{data.count}</strong> other trip{data.count === 1 ? "" : "s"} · <strong>{money(data.total_spent)}</strong> spent</>
          )}
        </div>
      </div>
      {data.count > 0 && (
        <ul className="mt-3 divide-y divide-[#F1F5F9] max-h-48 overflow-y-auto">
          {data.trips.map((t) => (
            <li key={t.id} className="py-1.5 flex items-center justify-between gap-3 text-xs" data-testid={`guest-history-trip-${t.id}`}>
              <span className="text-[#0B3B5C]">
                <span className="font-mono font-semibold">{t.id}</span> · {t.item_name} · {t.booking_date ? new Date(t.booking_date).toLocaleDateString() : ""}
              </span>
              <span className="shrink-0 text-[#64748B]">{t.status} · {t.payment_status} · <strong className="text-[#E86A3C]">{money(t.total)}</strong></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
