import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquareReply } from "lucide-react";
import { api } from "../../lib/api";

export default function ReturnReminderCard() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    api.get("/admin/return-reminder").then((r) => setCfg(r.data)).catch(() => {});
  }, []);
  if (!cfg) return null;
  const save = async () => {
    try {
      await api.put("/admin/return-reminder", { enabled: cfg.enabled, hours_after: parseFloat(cfg.hours_after) });
      toast.success("Return-trip reminder saved");
    } catch { toast.error("Hours must be between 0.5 and 12"); }
  };
  return (
    <div className="mt-6 bg-white rounded-xl border border-[#E2E8F0] p-5" data-testid="return-reminder-card">
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold"><MessageSquareReply className="w-3 h-3" /> Return-trip reminder</div>
      <h3 className="mt-1 font-[Georgia] text-[#0B3B5C] text-xl">Ask one-way taxi guests if they need a ride back</h3>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2 text-[#0B3B5C] font-semibold">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} data-testid="return-reminder-enabled" /> Send text
        </label>
        <label className="inline-flex items-center gap-2 text-[#64748B]">
          <input type="number" min="0.5" max="12" step="0.5" value={cfg.hours_after} onChange={(e) => setCfg({ ...cfg, hours_after: e.target.value })} className="w-16 border border-[#E2E8F0] rounded-md px-2 py-1" data-testid="return-reminder-hours" /> hours after pickup
        </label>
        <button onClick={save} className="rounded-md bg-[#0B3B5C] text-white text-xs font-semibold px-3 py-2" data-testid="return-reminder-save">Save</button>
        <span className="text-xs text-[#94a3b8]" data-testid="return-reminder-sent">{cfg.sent_last_30d} sent in last 30 days</span>
      </div>
    </div>
  );
}
