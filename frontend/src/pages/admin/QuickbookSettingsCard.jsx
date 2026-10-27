import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, Star } from "lucide-react";
import { api } from "../../lib/api";

const CATS = [["taxi", "Taxi routes", "/taxi-services"], ["tours", "Tours", "/tours"], ["rentals", "Car rentals", "/rentals"]];

const PickList = ({ items, picked, onToggle, cat }) => (
  <div className="max-h-56 overflow-y-auto border border-[#E2E8F0] rounded-md divide-y divide-[#F1F5F9]" data-testid={`qb-picklist-${cat}`}>
    {items.map((x) => {
      const on = picked.includes(x.id);
      return (
        <label key={x.id} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer ${on ? "bg-[#FBF7EF]" : ""}`}>
          <input type="checkbox" checked={on} onChange={() => onToggle(x.id)} data-testid={`qb-pick-${cat}-${x.id}`} />
          {on && <Star className="w-3 h-3 text-[#D4A94A] fill-current" />}
          <span className="text-[#0B3B5C] truncate">{x.name}</span>
          <span className="ml-auto text-[#64748B] font-mono">${x.price}</span>
        </label>
      );
    })}
  </div>
);

export default function QuickbookSettingsCard() {
  const [cfg, setCfg] = useState(null);
  const [cat, setCat] = useState({});
  useEffect(() => {
    api.get("/quickbook-config").then((r) => setCfg(r.data)).catch(() => {});
    CATS.forEach(([k, , url]) => api.get(url).then((r) => setCat((c) => ({ ...c, [k]: (r.data || []).filter((x) => x.active !== false && Number(x.price) > 0 && (k !== "taxi" || /→|↔/.test(x.name))) }))).catch(() => {}));
  }, []);
  if (!cfg) return null;
  const toggle = (k) => (id) => setCfg((c) => {
    const cur = c.featured[k] || [];
    return { ...c, featured: { ...c.featured, [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } };
  });
  const save = async () => {
    try {
      const { data } = await api.put("/admin/quickbook-config", { rotate_seconds: Number(cfg.rotate_seconds) || 0, featured: cfg.featured });
      setCfg(data);
      toast.success("Reserve box settings saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Couldn't save"); }
  };
  return (
    <div className="mt-6 bg-white rounded-xl border border-[#E2E8F0] p-5" data-testid="quickbook-settings-card">
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold"><LayoutGrid className="w-3 h-3" /> Home Reserve box</div>
      <h3 className="mt-1 font-[Georgia] text-[#0B3B5C] text-xl">Rotation speed &amp; top picks</h3>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2 text-[#64748B]">Change every
          <input type="number" min="0" max="120" value={cfg.rotate_seconds} onChange={(e) => setCfg({ ...cfg, rotate_seconds: e.target.value })}
            className="w-20 border border-[#E2E8F0] rounded-md px-2 py-1" data-testid="qb-rotate-seconds" /> seconds
        </label>
        <span className="text-xs text-[#94a3b8]">0 = don't rotate (guests can still tap "Show more options")</span>
      </div>
      <p className="mt-4 text-xs text-[#64748B]">Ticked items always show first, in the order you tick them, marked "Top pick". The rest are shuffled for each visitor.</p>
      <div className="mt-3 grid md:grid-cols-3 gap-4">
        {CATS.map(([k, label]) => (
          <div key={k}>
            <div className="text-xs font-semibold text-[#0B3B5C] mb-1.5">{label} <span className="text-[#94a3b8] font-normal">· {(cfg.featured[k] || []).length} picked</span></div>
            <PickList items={cat[k] || []} picked={cfg.featured[k] || []} onToggle={toggle(k)} cat={k} />
          </div>
        ))}
      </div>
      <button onClick={save} className="mt-4 rounded-md bg-[#0B3B5C] text-white text-xs font-semibold px-4 py-2" data-testid="qb-settings-save">Save</button>
    </div>
  );
}
