import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { api } from "../../lib/api";

/**
 * GroupPricingCard — admin card for `site_config.group_pricing`.
 *
 * Four knobs:
 *   - min_pax                (int, default 10)
 *   - per_head_discount_pct  (float, default 15)
 *   - deposit_pct            (float, default 25)
 *   - min_lead_hours         (int, default 72)
 *
 * Saves on blur so admins never have to hunt for a save button;
 * `GET /public/group-pricing` surfaces the live values back to the
 * `/groups/book` quote preview without a backend restart.
 */
export default function GroupPricingCard() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/public/group-pricing");
      setCfg({
        min_pax: Number(data.min_pax ?? 10),
        per_head_discount_pct: Number(data.per_head_discount_pct ?? 15),
        deposit_pct: Number(data.deposit_pct ?? 25),
        min_lead_hours: Number(data.min_lead_hours ?? 72),
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load group pricing");
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (patch) => {
    setSaving(true);
    try {
      await api.put("/admin/group-pricing", patch);
      toast.success("Group pricing updated");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) return null;

  const fields = [
    { k: "min_pax", label: "Min pax to qualify", unit: "pax", step: 1, min: 2, max: 100 },
    { k: "per_head_discount_pct", label: "Per-head discount", unit: "%", step: 1, min: 0, max: 50 },
    { k: "deposit_pct", label: "Deposit required", unit: "%", step: 5, min: 10, max: 100 },
    { k: "min_lead_hours", label: "Min lead time", unit: "hr", step: 12, min: 12, max: 720 },
  ];

  return (
    <section className="mt-6 rounded-2xl bg-white border border-[#E2E8F0] p-5" data-testid="group-pricing-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0B3B5C]/8 flex items-center justify-center text-[#0B3B5C]">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <div className="text-sm font-bold text-[#0B3B5C]">Group booking pricing</div>
          <div className="text-xs text-[#64748B] mt-0.5">
            Controls what guests see on <a href="/groups/book" className="underline">/groups/book</a>. Changes save on blur.
          </div>
        </div>
      </div>

      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {fields.map(({ k, label, unit, step, min, max }) => (
          <div key={k}>
            <label className="block text-xs font-bold text-[#0B3B5C] mb-1">{label}</label>
            <div className="relative">
              <input
                type="number"
                step={step}
                min={min}
                max={max}
                value={cfg[k]}
                onChange={(e) => setCfg((c) => ({ ...c, [k]: Number(e.target.value) }))}
                onBlur={() => save({ [k]: cfg[k] })}
                disabled={saving}
                data-testid={`group-pricing-${k}`}
                className="w-full rounded-lg border border-[#E2E8F0] pl-3 pr-10 py-2 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#0B3B5C]/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#64748B] uppercase tracking-wider">{unit}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
