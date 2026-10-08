import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Umbrella, Plus, Trash2, Save, Power, Share2, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";

/**
 * CableBeachPackageCard — admin control for `site_config.cable_beach_pkg`.
 *
 * Lets you tweak the Cable Beach day pricing, toggle it live/paused, and
 * manage the lunch + drink menus. Items use a simple name/price schema;
 * ids are auto-generated server-side on save.
 */
export default function CableBeachPackageCard() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/public/cable-beach-package");
      setCfg({
        base_price: Number(data.base_price || 40),
        extra_seat_price: Number(data.extra_seat_price || 15),
        cruise_oneway_price: Number(data.cruise_oneway_price || 10),
        cruise_roundtrip_price: Number(data.cruise_roundtrip_price || 20),
        lunch_items: data.lunch_items || [],
        drink_items: data.drink_items || [],
        active: data.active !== false,
      });
    } catch (e) {
      toast.error("Could not load Cable Beach config");
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (patch) => {
    setSaving(true);
    try {
      await api.put("/admin/cable-beach-package", patch);
      toast.success("Cable Beach package updated");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  if (!cfg) return null;

  const fields = [
    { k: "base_price", label: "Base per adult", unit: "$", hint: "Includes 1 chair + umbrella" },
    { k: "extra_seat_price", label: "Extra seat", unit: "$", hint: "Each additional chair" },
    { k: "cruise_oneway_price", label: "Cruise port · one-way", unit: "$", hint: "Per person" },
    { k: "cruise_roundtrip_price", label: "Cruise port · round-trip", unit: "$", hint: "Per person" },
  ];

  const updateItem = (key, idx, patch) => setCfg((c) => ({
    ...c, [key]: c[key].map((row, i) => i === idx ? { ...row, ...patch } : row),
  }));
  const addItem = (key) => setCfg((c) => ({
    ...c, [key]: [...c[key], { id: "", name: "", price: 0 }],
  }));
  const removeItem = (key, idx) => setCfg((c) => ({
    ...c, [key]: c[key].filter((_, i) => i !== idx),
  }));

  return (
    <section className="mt-8 rounded-2xl bg-white border border-[#E2E8F0] p-5" data-testid="cable-beach-admin">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E86A3C]/10 flex items-center justify-center text-[#E86A3C]">
            <Umbrella className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#0B3B5C]">Cable Beach day package</div>
            <div className="text-xs text-[#64748B] mt-0.5">
              Pricing, menu + active state for <a href="/tours/cable-beach-day" className="underline">/tours/cable-beach-day</a>. Blurs save individual fields; menu uses Save buttons.
            </div>
          </div>
        </div>
        <button
          onClick={() => save({ active: !cfg.active })}
          disabled={saving}
          data-testid="cable-beach-toggle-active"
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${cfg.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
        >
          <Power className="w-3 h-3" /> {cfg.active ? "Live" : "Paused"}
        </button>
      </div>

      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {fields.map(({ k, label, unit, hint }) => (
          <div key={k}>
            <label className="block text-xs font-bold text-[#0B3B5C] mb-1">{label}</label>
            <div className="relative">
              <input
                type="number" step="1" min="0"
                value={cfg[k]}
                onChange={(e) => setCfg((c) => ({ ...c, [k]: Number(e.target.value) }))}
                onBlur={() => save({ [k]: cfg[k] })}
                disabled={saving}
                data-testid={`cable-beach-${k}`}
                className="w-full rounded-lg border border-[#E2E8F0] pl-7 pr-3 py-2 text-sm mono focus:outline-none focus:ring-2 focus:ring-[#0B3B5C]/20"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#64748B]">{unit}</span>
            </div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5">{hint}</div>
          </div>
        ))}
      </div>

      {["lunch_items", "drink_items"].map((key) => (
        <div key={key} className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wider text-[#0B3B5C]">
              {key === "lunch_items" ? "Lunch menu" : "Drink menu"}
              <span className="ml-2 text-[10px] text-[#94A3B8]">{cfg[key].length} item{cfg[key].length === 1 ? "" : "s"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => addItem(key)}
                className="inline-flex items-center gap-1 text-xs text-[#0B3B5C] border border-[#E2E8F0] bg-white rounded-full px-2.5 py-1 hover:border-[#D4A94A]"
                data-testid={`cable-beach-${key}-add`}>
                <Plus className="w-3 h-3" /> Add item
              </button>
              <button onClick={() => save({ [key]: cfg[key] })} disabled={saving}
                className="inline-flex items-center gap-1 text-xs text-white bg-[#0B3B5C] rounded-full px-2.5 py-1 hover:bg-[#0a2a44] disabled:opacity-50"
                data-testid={`cable-beach-${key}-save`}>
                <Save className="w-3 h-3" /> Save menu
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {cfg[key].length === 0 ? (
              <div className="text-xs text-[#94A3B8] italic py-2">No items yet · click Add item.</div>
            ) : cfg[key].map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_36px] gap-2 items-center" data-testid={`cable-beach-${key}-row-${i}`}>
                <input value={item.name} placeholder="e.g. Grilled Snapper"
                  onChange={(e) => updateItem(key, i, { name: e.target.value })}
                  className="text-sm bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4A94A]" />
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#64748B]">$</span>
                  <input type="number" step="1" min="0" value={item.price}
                    onChange={(e) => updateItem(key, i, { price: Number(e.target.value) })}
                    className="w-full pl-6 pr-2 py-1.5 text-sm mono bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#D4A94A]" />
                </div>
                <button onClick={() => removeItem(key, i)}
                  className="w-9 h-9 rounded-lg border border-[#FECACA] bg-white text-[#B91C1C] hover:bg-[#FEF2F2] flex items-center justify-center"
                  data-testid={`cable-beach-${key}-remove-${i}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <ShareStatsPanel />
    </section>
  );
}

/**
 * ShareStatsPanel — Cable Beach "Share this beach day" conversion board.
 * Each row = one sharer email; shows clicks, bookings, conversion %, and
 * total $10 credits already paid out to them.
 */
function ShareStatsPanel() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/admin/share-stats/cable-beach")
      .then((r) => setStats(r.data))
      .catch(() => setStats({ rows: [], totals: { clicks: 0, bookings: 0, credits_awarded_total: 0 } }));
  }, []);
  if (!stats) return null;
  const { rows, totals } = stats;
  return (
    <div className="mt-8 pt-6 border-t border-[#E2E8F0]" data-testid="cable-beach-share-stats">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-[#25D366]" />
          <div className="text-xs font-bold uppercase tracking-wider text-[#0B3B5C]">Share-link conversions</div>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-[#64748B]">
          <span><b className="text-[#0B3B5C]">{totals.clicks}</b> clicks</span>
          <span><b className="text-[#0B3B5C]">{totals.bookings}</b> bookings</span>
          <span className="text-[#128C7E] font-bold">${totals.credits_awarded_total.toFixed(2)} paid</span>
          {totals.clicks > 0 && (
            <span className="inline-flex items-center gap-1 text-[#128C7E]"><TrendingUp className="w-3 h-3" />{((totals.bookings / totals.clicks) * 100).toFixed(1)}%</span>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-[#94A3B8] italic py-2">No shares yet · guests who tap "Share this beach day" will show up here.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC] text-[#64748B]">
              <tr>
                <th className="text-left px-3 py-2 font-bold uppercase tracking-wider">Sharer</th>
                <th className="text-right px-3 py-2 font-bold uppercase tracking-wider">Clicks</th>
                <th className="text-right px-3 py-2 font-bold uppercase tracking-wider">Bookings</th>
                <th className="text-right px-3 py-2 font-bold uppercase tracking-wider">Conv %</th>
                <th className="text-right px-3 py-2 font-bold uppercase tracking-wider">$ paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.token} className="border-t border-[#E2E8F0]">
                  <td className="px-3 py-2 text-[#0B3B5C]">{r.sharer_email}</td>
                  <td className="px-3 py-2 text-right mono">{r.clicks}</td>
                  <td className="px-3 py-2 text-right mono">{r.bookings}</td>
                  <td className="px-3 py-2 text-right mono text-[#128C7E]">{r.conversion_rate.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right mono font-bold">${r.credits_awarded_total.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
