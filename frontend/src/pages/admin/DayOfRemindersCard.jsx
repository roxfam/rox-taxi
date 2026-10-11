import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { BellRing, Send, CheckCircle2 } from "lucide-react";

export default function DayOfRemindersCard() {
  const [data, setData] = useState(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/admin/dayof-reminders/preview");
      setData(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reminder preview failed");
    }
  };
  useEffect(() => { load(); }, []);

  const sendNow = async () => {
    setSending(true);
    try {
      const { data: r } = await api.post("/admin/dayof-reminders/send-now");
      toast.success(`Today's list sent (${r.count} bookings) · ${r.guest_reminders_sent} new guest reminder(s)`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const today = data?.today || [];
  const last = data?.last_run?.last_run_at;
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 mb-6" data-testid="dayof-reminders-card">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold">
        <BellRing className="w-3 h-3" /> Day-of reminders
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 mt-1">
        <div>
          <h2 className="font-[Georgia] text-[#0B3B5C] text-2xl">Today: {today.length} booking(s)</h2>
          <p className="text-sm text-[#64748B]" data-testid="dayof-schedule">
            {data?.schedule || "Daily at 12:00 AM Nassau time"} · guests get email + SMS, owners get the full list
          </p>
        </div>
        <button
          type="button"
          onClick={sendNow}
          disabled={sending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0B3B5C] text-white text-sm font-semibold hover:bg-[#132a4a] disabled:opacity-60 transition-colors"
          data-testid="dayof-send-now-btn"
        >
          <Send className="w-4 h-4" /> {sending ? "Sending…" : "Send today's reminders now"}
        </button>
      </div>
      <ul className="mt-4 divide-y divide-[#E2E8F0]" data-testid="dayof-today-list">
        {today.map((b) => (
          <li key={b.id} className="py-2 flex items-center justify-between gap-3 text-sm" data-testid={`dayof-row-${b.id}`}>
            <span className="text-[#0B3B5C]"><strong>{b.time}</strong> · {b.item_name} · {b.customer_name}</span>
            {b.reminded && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3 h-3" /> reminded</span>}
          </li>
        ))}
        {today.length === 0 && <li className="py-2 text-sm text-[#94a3b8]">No bookings today.</li>}
      </ul>
      <p className="text-xs text-[#94a3b8] mt-3" data-testid="dayof-last-run">
        {last ? `Last run ${new Date(last).toLocaleString()}` : "Not run yet"}
      </p>
    </div>
  );
}
