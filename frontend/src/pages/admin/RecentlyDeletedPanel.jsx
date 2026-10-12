import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArchiveRestore, ChevronDown, ChevronUp } from "lucide-react";
import { api, money } from "../../lib/api";

export default function RecentlyDeletedPanel({ refreshKey, onRestored }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!open) return;
    api.get("/admin/bookings-deleted").then(({ data }) => setRows(data || [])).catch(() => setRows([]));
  }, [open, refreshKey]);

  const restore = async (id) => {
    setBusy(id);
    try {
      await api.post(`/admin/bookings-deleted/${id}/restore`);
      toast.success(`Restored ${id}`);
      setRows((r) => r.filter((x) => x.id !== id));
      onRestored();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Restore failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6 bg-white rounded-xl border border-[#E2E8F0]" data-testid="recently-deleted-panel">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-[#0B3B5C]"
        data-testid="recently-deleted-toggle">
        <span className="inline-flex items-center gap-2"><ArchiveRestore className="w-4 h-4 text-[#D4A94A]" /> Recently deleted bookings</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <ul className="divide-y divide-[#E2E8F0] border-t border-[#E2E8F0]" data-testid="recently-deleted-list">
          {rows.map((b) => (
            <li key={b.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm" data-testid={`deleted-row-${b.id}`}>
              <div>
                <span className="font-mono font-semibold text-[#0B3B5C]">{b.id}</span> · {b.customer_name} · {b.item_name}
                <span className="ml-2 text-[#E86A3C] font-semibold">{money(b.total || b.total_price || 0)}</span>
                <div className="text-xs text-[#94a3b8]">Deleted {b.deleted_at ? new Date(b.deleted_at).toLocaleString() : ""} by {b.deleted_by}</div>
              </div>
              <button type="button" onClick={() => restore(b.id)} disabled={busy === b.id}
                className="inline-flex items-center gap-1 rounded-full border border-[#059669] text-[#047857] px-3 py-1 text-xs font-bold hover:bg-[#059669] hover:text-white transition-colors disabled:opacity-50"
                data-testid={`deleted-restore-${b.id}`}>
                <ArchiveRestore className="w-3.5 h-3.5" /> {busy === b.id ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="px-5 py-4 text-sm text-[#94a3b8]">Nothing deleted recently.</li>}
        </ul>
      )}
    </div>
  );
}
