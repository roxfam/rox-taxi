import { useEffect, useState } from "react";
import { FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../lib/api";
import EditQuoteDialog from "./EditQuoteDialog";

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
    <div className="inline-flex gap-2">
      <button type="button" disabled={busy} onClick={() => act(`/admin/quotes/${q.id}/send-link`, sent)} className="underline text-[#E86A3C] font-semibold" data-testid={`admin-quote-send-link-${q.id}`}>Send pay link</button>
      <button type="button" disabled={busy} onClick={() => act(`/admin/quotes/${q.id}/cancel`, () => `Quote ${q.id} cancelled`, `Cancel quote ${q.id}? The guest can no longer pay it.`)} className="underline text-[#DC2626]" data-testid={`admin-quote-cancel-${q.id}`}>Cancel</button>
    </div>
  );
}

export default function QuotesPanel() {
  const [rows, setRows] = useState(null);
  const [qText, setQText] = useState("");
  const [status, setStatus] = useState("all");
  const [editId, setEditId] = useState(null);
  const load = () => api.get("/admin/quotes").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  if (!rows) return null;
  const open = rows.filter((r) => r.status === "open").length;
  const booked = rows.filter((r) => r.status === "booked").length;
  const s = qText.trim().toLowerCase();
  const shown = rows.filter((r) => (status === "all" || r.status === status)
    && (!s || [r.id, r.customer_name, r.customer_email, r.customer_phone, r.item_name].some((v) => (v || "").toLowerCase().includes(s))));
  return (
    <div className="mt-8 bg-white rounded-xl border border-[#E2E8F0] p-5" data-testid="admin-quotes-panel">
      <div className="flex flex-wrap items-center gap-3">
        <FileText className="w-4 h-4 text-[#D4A94A]" />
        <span className="font-semibold text-[#0B3B5C] text-sm">Quotes</span>
        <span className="text-xs text-[#64748B]">{rows.length} total · {open} open · {booked} booked{rows.length ? ` · ${Math.round((booked / rows.length) * 100)}% converted` : ""}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Search quote, guest, trip" className="pl-7 pr-2 py-1 border border-[#E2E8F0] rounded text-xs w-52" data-testid="admin-quotes-search" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-[#E2E8F0] rounded text-xs py-1 px-1" data-testid="admin-quotes-status-filter">
            {["all", "open", "expired", "booked", "cancelled"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      </div>
      {editId && <EditQuoteDialog qid={editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load(); }} />}
      {shown.length === 0 ? <p className="text-xs text-[#64748B] mt-2">No quotes found.</p> : (
        <div className="mt-3 overflow-x-auto max-h-[28rem]">
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-widest text-[#64748B]">
              <tr><th className="py-1.5">Quote</th><th>Guest</th><th>Service</th><th>Trip date</th><th>Total</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((q) => (
                <tr key={q.id} className="border-t border-[#F1F5F9]" data-testid={`admin-quote-row-${q.id}`}>
                  <td className="py-1.5"><a href={`/quote/${q.id}`} target="_blank" rel="noreferrer" className="mono font-semibold text-[#0B3B5C] hover:underline">{q.id}</a></td>
                  <td>{q.customer_name}<span className="block text-[10px] text-[#64748B]">{q.customer_email} {q.customer_phone}</span></td>
                  <td>{q.item_name}</td>
                  <td>{(q.booking_date || "").replace("T", " ")}</td>
                  <td className="mono">{money(q.total)}</td>
                  <td className={`font-semibold capitalize ${TONE[q.status] || ""}`}>{q.status}{q.booking_id ? ` · ${q.booking_id}` : ""}</td>
                  <td className="whitespace-nowrap">
                    <button type="button" onClick={() => setEditId(q.id)} className="underline text-[#0B3B5C] font-semibold mr-2" data-testid={`admin-quote-edit-${q.id}`}>{["open", "expired"].includes(q.status) && q.kind !== "cable_beach" ? "View / Edit" : "View"}</button>
                    <QuoteActions q={q} onChanged={load} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
