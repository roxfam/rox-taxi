import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Mail, Send } from "lucide-react";

const TILES = [
  { key: "paid", label: "Paid", color: "text-emerald-600" },
  { key: "failed", label: "Failed", color: "text-red-600" },
  { key: "refunded", label: "Refunded", color: "text-amber-600" },
  { key: "pending", label: "Pending", color: "text-slate-500" },
];

export default function PaymentDigestCard() {
  const [data, setData] = useState(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/admin/payment-digest/preview");
      setData(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Digest preview failed");
    }
  };
  useEffect(() => { load(); }, []);

  const sendNow = async () => {
    setSending(true);
    try {
      const res = await api.post("/admin/payment-digest/send-now");
      const ok = (res.data.emails || []).filter((e) => e.sent).length;
      toast.success(`Digest sent to ${ok} email(s)${res.data.sms_sent ? " + SMS" : ""}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const last = data?.last_run?.last_run_at;
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 mb-6" data-testid="payment-digest-card">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold">
        <Mail className="w-3 h-3" /> Nightly payment digest
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 mt-1">
        <div>
          <h2 className="font-[Georgia] text-[#0B3B5C] text-2xl">Last 24 hours of payments</h2>
          <p className="text-sm text-[#64748B]" data-testid="payment-digest-schedule">
            {data?.schedule || "Daily at 9:00 PM Nassau time"} · email to {(data?.recipients || []).join(", ") || "ADMIN_EMAIL"} + SMS to owner phones
          </p>
        </div>
        <button
          type="button"
          onClick={sendNow}
          disabled={sending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#0B3B5C] text-white text-sm font-semibold hover:bg-[#132a4a] disabled:opacity-60 transition-colors"
          data-testid="payment-digest-send-now-btn"
        >
          <Send className="w-4 h-4" /> {sending ? "Sending…" : "Send digest now"}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {TILES.map((t) => {
          const v = data?.totals?.[t.key] || { count: 0, amount: 0 };
          return (
            <div key={t.key} className="border border-[#E2E8F0] rounded-lg p-3" data-testid={`payment-digest-${t.key}`}>
              <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-bold">{t.label}</div>
              <div className={`text-2xl font-extrabold ${t.color}`}>{v.count}</div>
              <div className="text-xs text-[#0B3B5C]">${Number(v.amount).toFixed(2)}</div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[#94a3b8] mt-3" data-testid="payment-digest-last-run">
        {last ? `Last sent ${new Date(last).toLocaleString()}` : "Not sent yet"}
      </p>
    </div>
  );
}
