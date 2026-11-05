import { money } from "../../lib/api";

export default function RefundHistory({ booking }) {
  const rows = (booking.refund_history || []).filter((r) => r.ok);
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  return (
    <div className="mt-1.5 rounded-md border border-[#7C3AED]/20 bg-[#7C3AED]/5 px-2 py-1.5 text-[10px] text-[#5B21B6] max-w-[220px]" data-testid={`refund-history-${booking.id}`}>
      <div className="font-bold uppercase tracking-wider">Refunded {money(total)}</div>
      {rows.map((r, n) => (
        <div key={`${r.at}-${n}`} className="flex justify-between gap-2" title={r.reason || ""} data-testid={`refund-history-row-${booking.id}-${n}`}>
          <span className="truncate">
            {new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "America/Nassau" })}
            {r.reason ? ` · ${r.reason}` : ""}
          </span>
          <span className="font-mono font-semibold shrink-0">−{money(r.amount)}</span>
        </div>
      ))}
    </div>
  );
}
