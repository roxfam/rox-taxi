import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Pencil, Receipt, Search, Send, X } from "lucide-react";
import { api, money } from "../../lib/api";
import BookingEditForm from "./BookingEditForm";

const PDF = (id) => `${process.env.REACT_APP_BACKEND_URL}/api/bookings/${id}/receipt.pdf`;

function SendInvoiceButton({ b, label = "Send" }) {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!b.customer_email && !b.customer_phone) { toast.error("No email or phone on this booking"); return; }
    if (!window.confirm(`Email + text invoice ${b.invoice_number || b.id} to ${b.customer_name || "the guest"}?`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${b.id}/send-invoice`);
      const ch = [data.email?.sent && "email", data.text?.sent && "text"].filter(Boolean).join(" + ");
      if (ch) toast.success(`Invoice sent by ${ch}`); else toast.error("Nothing was sent — check the email/phone");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't send the invoice");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={send} disabled={busy} className="inline-flex items-center gap-1 underline text-[#047857] font-semibold mr-3 disabled:opacity-50" data-testid={`admin-invoice-send-${b.id}`}>
      <Send className="w-3 h-3" />{busy ? "Sending…" : label}
    </button>
  );
}

export default function InvoicesPanel() {
  const [rows, setRows] = useState(null);
  const [s, setS] = useState("");
  const [edit, setEdit] = useState(null);
  const [saved, setSaved] = useState(null);
  const load = () => api.get("/admin/bookings").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  if (!rows) return null;
  const q = s.trim().toLowerCase();
  const shown = rows.filter((b) => !q || [b.id, b.invoice_number, b.customer_name, b.customer_email, b.item_name].some((v) => (v || "").toLowerCase().includes(q))).slice(0, 200);
  return (
    <div className="mt-8 bg-white rounded-xl border border-[#E2E8F0] p-5" data-testid="admin-invoices-panel">
      <div className="flex flex-wrap items-center gap-3">
        <Receipt className="w-4 h-4 text-[#D4A94A]" />
        <span className="font-semibold text-[#0B3B5C] text-sm">Invoices</span>
        <span className="text-xs text-[#64748B]">Every booking has an invoice PDF</span>
        <div className="ml-auto relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <input value={s} onChange={(e) => setS(e.target.value)} placeholder="Search booking, invoice, guest" className="pl-7 pr-2 py-1 border border-[#E2E8F0] rounded text-xs w-56" data-testid="admin-invoices-search" />
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-widest text-[#64748B]">
            <tr><th className="py-2">Invoice</th><th>Guest</th><th>Item</th><th>Date</th><th className="text-right">Total</th><th>Paid</th><th /></tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={b.id} className="border-t border-[#F1F5F9]" data-testid={`admin-invoice-row-${b.id}`}>
                <td className="py-2 font-semibold text-[#0B3B5C]">{b.invoice_number || b.id}</td>
                <td>{b.customer_name}</td>
                <td className="max-w-[220px] truncate">{b.item_name}</td>
                <td>{(b.booking_date || "").slice(0, 10)}</td>
                <td className="text-right mono">{money(b.total ?? b.total_price ?? 0)}</td>
                <td>{b.payment_status || "—"}</td>
                <td className="whitespace-nowrap text-right">
                  <a href={PDF(b.id)} download={`rox-invoice-${b.id}.pdf`} className="inline-flex items-center gap-1 underline text-[#0B3B5C] mr-3" data-testid={`admin-invoice-download-${b.id}`}><Download className="w-3 h-3" />PDF</a>
                  <SendInvoiceButton b={b} />
                  <button type="button" onClick={() => setEdit(b)} className="inline-flex items-center gap-1 underline text-[#E86A3C] font-semibold" data-testid={`admin-invoice-edit-${b.id}`}><Pencil className="w-3 h-3" />Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={() => setEdit(null)} data-testid="admin-invoice-edit-dialog">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-[Georgia] text-xl text-[#0B3B5C]">Edit invoice {edit.invoice_number || edit.id}</h3>
              <button type="button" onClick={() => setEdit(null)} data-testid="admin-invoice-edit-close"><X className="w-5 h-5 text-[#64748B]" /></button>
            </div>
            <BookingEditForm booking={edit} onCancel={() => setEdit(null)} onSaved={(nb) => { setEdit(null); setSaved(nb || edit); load(); }} />
          </div>
        </div>
      )}
      {saved && (
        <div className="fixed bottom-6 right-6 z-[85] bg-white border border-[#E2E8F0] shadow-xl rounded-xl p-4 text-sm flex items-center gap-3" data-testid="admin-invoice-saved-toast">
          <span className="text-[#0B3B5C]">Invoice {saved.invoice_number || saved.id} updated. Send it to the guest?</span>
          <SendInvoiceButton b={saved} label="Send invoice" />
          <button type="button" onClick={() => setSaved(null)} className="text-[#64748B]" data-testid="admin-invoice-saved-dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
