import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ship, Trash2, Plus } from "lucide-react";
import { api } from "../../lib/api";

const EMPTY = { ship_name: "", cruise_line: "", date: "", arrive: "08:00", all_aboard: "16:30", depart: "17:00", berth: "" };
const FIELDS = [
  ["ship_name", "Ship name", "text"], ["cruise_line", "Cruise line", "text"], ["date", "Date", "date"],
  ["arrive", "Arrives", "time"], ["all_aboard", "All aboard", "time"], ["depart", "Departs", "time"], ["berth", "Berth", "text"],
];

export default function CruiseShipsCard() {
  const [ships, setShips] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const load = () => api.get("/admin/cruise-ships").then((r) => setShips(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/cruise-ships", form);
      toast.success("Ship added");
      setForm({ ...EMPTY, date: form.date });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail?.[0]?.msg || err?.response?.data?.detail || "Couldn't add ship"); }
  };
  const del = async (id) => { await api.delete(`/admin/cruise-ships/${id}`); load(); };
  return (
    <div className="mt-6 bg-white rounded-xl border border-[#E2E8F0] p-5" data-testid="admin-cruise-ships-card">
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold"><Ship className="w-3 h-3" /> Cruise ship schedule</div>
      <h3 className="mt-1 font-[Georgia] text-[#0B3B5C] text-xl">Ships in port</h3>
      <p className="text-xs text-[#64748B] mt-1">Shown on /cruise-schedule and as a home-page banner on the day.</p>
      <form onSubmit={add} className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
        {FIELDS.map(([k, l, t]) => (
          <label key={k} className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">{l}
            <input type={t} value={form[k]} required={k === "ship_name" || k === "date"} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className="mt-1 w-full border border-[#E2E8F0] rounded-md px-2 py-1.5 text-sm text-[#0B3B5C] normal-case tracking-normal" data-testid={`cruise-input-${k}`} />
          </label>
        ))}
        <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-md bg-[#0B3B5C] text-white text-xs font-semibold px-3 py-2" data-testid="cruise-add-btn"><Plus className="w-3 h-3" /> Add</button>
      </form>
      <div className="mt-4 divide-y divide-[#E2E8F0]">
        {ships.length === 0 && <div className="text-xs text-[#94a3b8] py-2">No ships posted.</div>}
        {ships.map((s) => (
          <div key={s.id} className="py-2 flex items-center justify-between text-sm" data-testid={`admin-cruise-row-${s.id}`}>
            <div><b className="text-[#0B3B5C]">{s.ship_name}</b> <span className="text-[#64748B]">· {s.cruise_line} · {s.date} · {s.arrive}–{s.depart} (all aboard {s.all_aboard})</span></div>
            <button onClick={() => del(s.id)} className="text-[#DC2626] p-1" data-testid={`cruise-delete-${s.id}`} aria-label="Delete ship"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
