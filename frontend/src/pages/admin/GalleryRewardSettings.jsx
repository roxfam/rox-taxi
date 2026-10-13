import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Save } from "lucide-react";
import { api } from "../../lib/api";
import { Switch } from "../../components/ui/switch";

// Admin box: thank-you reward on/off + amounts for approvals and Photo of the Month.
export const GalleryRewardSettings = () => {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get("/admin/gallery-rewards").then(({ data }) => setS(data)).catch(() => toast.error("Failed to load reward settings"));
  }, []);
  if (!s) return null;
  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/gallery-rewards", { enabled: s.enabled, approval_amount: Number(s.approval_amount) || 0, potm_amount: Number(s.potm_amount) || 0 });
      toast.success("Reward settings saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail?.[0]?.msg || e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };
  const field = "w-24 rounded-lg border border-[#E2E8F0] px-2 py-1.5 text-sm focus:border-[#D4A94A] focus:outline-none";
  return (
    <div className="mb-5 rounded-2xl bg-white border border-[#E2E8F0] p-4 flex flex-wrap items-end gap-5" data-testid="gallery-reward-settings">
      <div className="flex items-center gap-2 text-[#0B3B5C] font-semibold text-sm"><Gift className="w-4 h-4 text-[#D4A94A]" /> Photo rewards</div>
      <label className="flex items-center gap-2 text-xs text-[#334155]">
        <Switch checked={!!s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} data-testid="gallery-reward-enabled" />
        Thank-you card on approval
      </label>
      <label className="text-xs text-[#334155] flex flex-col gap-1">Approval amount ($)
        <input type="number" min={0} max={500} step={1} value={s.approval_amount} onChange={(e) => setS({ ...s, approval_amount: e.target.value })} className={field} data-testid="gallery-reward-approval-amount" />
      </label>
      <label className="text-xs text-[#334155] flex flex-col gap-1">Photo of the Month ($)
        <input type="number" min={0} max={500} step={1} value={s.potm_amount} onChange={(e) => setS({ ...s, potm_amount: e.target.value })} className={field} data-testid="gallery-reward-potm-amount" />
      </label>
      <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-full bg-[#0B3B5C] hover:bg-[#0B192C] text-white text-xs font-semibold px-4 py-2 disabled:opacity-60" data-testid="gallery-reward-save">
        <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
      </button>
      <p className="w-full text-[11px] text-[#94a3b8]">Cards expire in 12 months. One approval card and one Photo of the Month card per guest email, ever.</p>
    </div>
  );
};
