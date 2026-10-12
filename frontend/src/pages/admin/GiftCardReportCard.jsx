import { useEffect, useState } from "react";
import { Gift, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, money } from "../../lib/api";

const Tile = ({ label, value, sub, testid }) => (
  <div className="rounded-xl border border-[#E2E8F0] p-4">
    <div className="text-[10px] uppercase tracking-widest text-[#64748B]">{label}</div>
    <div className="mono text-xl font-bold text-[#0B3B5C] mt-1" data-testid={testid}>{value}</div>
    {sub && <div className="text-[11px] text-[#64748B] mt-0.5">{sub}</div>}
  </div>
);

export default function GiftCardReportCard() {
  const [r, setR] = useState(null);
  const [sending, setSending] = useState(null);
  const load = () => api.get("/admin/gift-cards/report").then(({ data }) => setR(data)).catch(() => setR(null));
  useEffect(() => { load(); }, []);
  const resend = async (code) => {
    setSending(code);
    try {
      const { data } = await api.post(`/admin/gift-cards/${code}/resend`);
      if (data.sent) toast.success(`Voucher resent to ${data.to}${data.sms ? " + text" : ""}`);
      else toast.error(data.error || "Email could not be sent");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resend failed");
    } finally { setSending(null); }
  };
  if (!r) return null;
  return (
    <div className="mt-8 bg-white rounded-xl border border-[#E2E8F0] p-5" data-testid="admin-gift-card-report">
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-[#D4A94A]" />
        <span className="font-semibold text-[#0B3B5C] text-sm">Gift card sales</span>
      </div>
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label="Sold (all time)" value={money(r.sold_value)} sub={`${r.sold_count} cards`} testid="gc-report-sold" />
        <Tile label="Sold (30 days)" value={money(r.sold_30d_value)} sub={`${r.sold_30d_count} cards`} testid="gc-report-sold-30d" />
        <Tile label="Redeemed" value={money(r.redeemed_value)} testid="gc-report-redeemed" />
        <Tile label="Outstanding balance" value={money(r.outstanding_balance)} testid="gc-report-outstanding" />
        <Tile label="Expired unused" value={money(r.expired_unused)} testid="gc-report-expired" />
      </div>
      <div className="mt-5">
        <div className="text-xs font-semibold text-[#0B3B5C]">Expiring in the next 30 days</div>
        {r.expiring_soon.length === 0 ? (
          <p className="text-xs text-[#64748B] mt-1" data-testid="gc-report-expiring-empty">No cards with a balance are expiring soon.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-widest text-[#64748B]">
                <tr><th className="py-1.5">Code</th><th>Balance</th><th>Expires</th><th>Holder</th><th>Reminder</th></tr>
              </thead>
              <tbody>
                {r.expiring_soon.map((g) => (
                  <tr key={g.code} className="border-t border-[#F1F5F9]" data-testid={`gc-report-row-${g.code}`}>
                    <td className="py-1.5 mono font-semibold text-[#0B3B5C]">{g.code}</td>
                    <td className="mono text-[#E86A3C]">{money(g.balance)}</td>
                    <td>{new Date(g.expires_at).toLocaleDateString()}</td>
                    <td className="text-[#64748B]">{g.recipient_email || "—"}</td>
                    <td>{g.reminded ? <span className="text-[#059669] font-semibold">Sent</span> : <span className="text-[#64748B]">Pending</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mt-5">
        <div className="text-xs font-semibold text-[#0B3B5C]">Recent gift cards</div>
        {(r.recent || []).length === 0 ? (
          <p className="text-xs text-[#64748B] mt-1">No gift cards sold yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase tracking-widest text-[#64748B]">
                <tr><th className="py-1.5">Code</th><th>Amount</th><th>Balance</th><th>Design</th><th>Holder</th><th>Delivery</th><th></th></tr>
              </thead>
              <tbody>
                {r.recent.map((g) => (
                  <tr key={g.code} className="border-t border-[#F1F5F9]" data-testid={`gc-recent-row-${g.code}`}>
                    <td className="py-1.5 mono font-semibold text-[#0B3B5C]">{g.code}</td>
                    <td className="mono">{money(g.amount)}</td>
                    <td className="mono text-[#E86A3C]">{money(g.balance)}</td>
                    <td className="capitalize">{(g.theme || "classic").replace("_", " ")}</td>
                    <td className="text-[#64748B]">{g.recipient_email}{g.recipient_phone ? ` · ${g.recipient_phone}` : ""}</td>
                    <td className="text-[#64748B]">
                      {g.delivered_at ? `Sent ${new Date(g.delivered_at).toLocaleDateString()}` : g.scheduled_send_at ? `Scheduled ${new Date(g.scheduled_send_at).toLocaleString()}` : "Pending"}
                      {g.resent_at && <span className="block text-[10px]">Resent {new Date(g.resent_at).toLocaleString()}</span>}
                    </td>
                    <td className="text-right">
                      <button onClick={() => resend(g.code)} disabled={sending === g.code}
                        className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] px-3 py-1 font-semibold text-[#0B3B5C] hover:border-[#D4A94A] transition-colors disabled:opacity-60"
                        data-testid={`gc-resend-${g.code}`}>
                        {sending === g.code ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Resend
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
