import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../lib/api";

const TONE = { open: "text-[#059669]", expired: "text-[#94a3b8]", booked: "text-[#1E3A8A]", booking: "text-[#D4A94A]", cancelled: "text-[#DC2626]" };

function QuoteActions({ q, onChanged }) {
  const [busy, setBusy] = useState(false);
  const act = async (path, ok, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try { const { data } = await api.post(path); toast.success(ok(data)); onChanged(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Something went wrong"); } finally { setBusy(false); }
  };
  if (q.status !== "open") return null;
  const sent = (d) => `Pay link sent by ${[d.email?.sent && "email", d.text?.sent && "text"].filter(Boolean).join(" + ") || "nothing (check email/SMS settings)"}`;
  return (
    <div className="flex gap-2">
      <button type="button" disabled={busy} onClick={() => act(`/admin/quotes/${q.id}/send-link`, sent)} className="underline text-[#E86A3C] font-semibold" data-testid={`admin-quote-send-link-${q.id}`}>Send pay link</button>
      <button type="button" disabled={busy} onClick={() => act(`/admin/quotes/${q.id}/cancel`, () => `Quote ${q.id} cancelled`, `Cancel quote ${q.id}? The guest can no longer pay it.`)} className="underline text-[#DC2626]" data-testid={`admin-quote-cancel-${q.id}`}>Cancel</button>
    </div>
  );
}

export default function QuotesPanel() {
  const [rows, setRows] = useState(null);
  const load = () => api.get("/admin/quotes").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
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
              <tr><th className="py-1.5">Quote</th><th>Guest</th><th>Service</th><th>Trip date</th><th>Total</th><th>Status</th><th /></tr>
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
                  <td><QuoteActions q={q} onChanged={load} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
