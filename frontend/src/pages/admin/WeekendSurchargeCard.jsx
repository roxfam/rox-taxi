import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, DollarSign } from "lucide-react";
import { api } from "../../lib/api";

const ALL_SERVICES = [
  { key: "taxi", label: "Taxi" },
  { key: "tour", label: "Tours" },
  { key: "excursion", label: "Excursions" },
  { key: "rental", label: "Car rentals" },
];

/**
 * WeekendSurchargeCard — admin control for the Sunday pickup surcharge.
 * Three editable knobs:
 *   - On/off toggle
 *   - USD amount (0..500)
 *   - Which service types it applies to (checkbox per type)
 * Updates land immediately — the next guest reschedule-quote reflects
 * the new config without a backend restart.
 */
export default function WeekendSurchargeCard() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/weekend-surcharge");
      setCfg({
        enabled: !!data.enabled,
        amount_usd: Number(data.amount_usd ?? 15),
        service_types: Array.isArray(data.service_types) ? data.service_types : ["taxi", "tour"],
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load weekend surcharge");
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (patch) => {
    setSaving(true);
    try {
      await api.put("/admin/weekend-surcharge", patch);
      toast.success("Weekend surcharge updated");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) return null;
  const toggleSvc = (k) => {
    const next = cfg.service_types.includes(k)
      ? cfg.service_types.filter((s) => s !== k)
      : [...cfg.service_types, k];
    save({ service_types: next });
  };

  return (
    <section className="mt-6 rounded-2xl bg-white border border-[#E2E8F0] p-5" data-testid="weekend-surcharge-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/15 flex items-center justify-center text-[#D4A94A]">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#0B3B5C]">Sunday pickup surcharge</div>
            <div className="text-xs text-[#64748B] mt-0.5">
              Applied when the pickup lands on Sunday (Saturday remains closed). Surfaces live on the Track-page reschedule quote.
            </div>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => save({ enabled: e.target.checked })}
            disabled={saving}
            className="peer sr-only"
            data-testid="weekend-surcharge-toggle"
          />
          <span className="w-10 h-6 rounded-full bg-[#E2E8F0] peer-checked:bg-[#059669] relative transition">
            <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
          </span>
          <span className="text-xs font-bold text-[#0B3B5C]">{cfg.enabled ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[#0B3B5C] mb-1">Amount (USD)</label>
          <div className="relative">
            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input
              type="number"
              step="1"
              min="0"
              max="500"
              value={cfg.amount_usd}
              onChange={(e) => setCfg((c) => ({ ...c, amount_usd: Number(e.target.value) }))}
              onBlur={() => save({ amount_usd: cfg.amount_usd })}
              className="w-full rounded-lg border border-[#E2E8F0] pl-8 pr-3 py-2 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#0B3B5C]/20"
              data-testid="weekend-surcharge-amount"
            />
          </div>
          <div className="text-[10px] text-[#64748B] mt-1">Changes save on blur.</div>
        </div>
        <div>
          <label className="block text-xs font-bold text-[#0B3B5C] mb-1">Applies to</label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_SERVICES.map(({ key, label }) => {
              const on = cfg.service_types.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleSvc(key)}
                  disabled={saving}
                  className={`rounded-full px-3 py-1 text-xs font-bold border transition ${
                    on
                      ? "bg-[#D4A94A] text-[#0B192C] border-[#D4A94A]"
                      : "bg-white text-[#64748B] border-[#E2E8F0] hover:border-[#D4A94A]/50"
                  }`}
                  data-testid={`weekend-surcharge-svc-${key}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
