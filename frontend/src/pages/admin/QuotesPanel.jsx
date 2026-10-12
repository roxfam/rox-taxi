import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { api, money } from "../../lib/api";

const TONE = { open: "text-[#059669]", expired: "text-[#94a3b8]", booked: "text-[#1E3A8A]", booking: "text-[#D4A94A]" };

export default function QuotesPanel() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get("/admin/quotes").then(({ data }) => setRows(data)).catch(() => setRows([])); }, []);
  if (!rows) return null;
  const open = rows.filter((r) => r.status === "open").length;
  const booked = rows.filter((r) => r.status === "booked").length;
  return (
    <div className="mt-8 bg-white rounded-xl border border-[#E2E8F0] p-5" data-testid="admin-quotes-panel">
      <div className="flex flex-wrap items-center gap-3">
        <FileText className="w-4 h-4 text-[#D4A94A]" />
        <span className="font-semibold text-[#0B3B5C] text-sm">Quotes</span>
        <span className="text-xs text-[#64748B]">{rows.length} recent · {open} open · {booked} booked{rows.length ? ` · ${Math.round((booked / rows.length) * 100)}% converted` : ""}</span>
      </div>
      {rows.length === 0 ? <p className="text-xs text-[#64748B] mt-2">No quotes yet.</p> : (
        <div className="mt-3 overflow-x-auto max-h-80">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-widest text-[#64748B]">
              <tr><th className="py-1.5">Quote</th><th>Guest</th><th>Service</th><th>Trip date</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t border-[#F1F5F9]" data-testid={`admin-quote-row-${q.id}`}>
                  <td className="py-1.5"><a href={`/quote/${q.id}`} target="_blank" rel="noreferrer" className="mono font-semibold text-[#0B3B5C] hover:underline">{q.id}</a></td>
                  <td>{q.customer_name}<span className="block text-[10px] text-[#64748B]">{q.customer_email} {q.customer_phone}</span></td>
                  <td>{q.item_name}</td>
                  <td>{(q.booking_date || "").replace("T", " ")}</td>
                  <td className="mono">{money(q.total)}</td>
                  <td className={`font-semibold capitalize ${TONE[q.status] || ""}`}>{q.status}{q.booking_id ? ` · ${q.booking_id}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
