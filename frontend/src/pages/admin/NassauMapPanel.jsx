import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";

const EMPTY = { name: "", lat: "", lng: "", aliases: "", active: true };
const errMsg = (e, d) => e?.response?.data?.detail || d;

function RatesCard() {
  const [r, setR] = useState({ base_usd: "", per_km_usd: "" });
  const [test, setTest] = useState({ from: "Nassau Cruise Port", to: "Fort Charlotte", res: null });
  useEffect(() => { api.get("/admin/distance-rates").then((x) => setR(x.data)).catch(() => {}); }, []);
  const save = async () => {
    try {
      const { data } = await api.put("/admin/distance-rates", { base_usd: Number(r.base_usd), per_km_usd: Number(r.per_km_usd) });
      setR(data); toast.success("Distance rates saved");
    } catch (e) { toast.error(errMsg(e, "Couldn't save rates")); }
  };
  const runTest = async () => {
    const { data } = await api.post("/taxi/custom-quote", { from_location: test.from, to_location: test.to }).catch(() => ({ data: { ok: false, error: "Couldn't price" } }));
    setTest({ ...test, res: data });
  };
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4" data-testid="distance-rates-card">
      <div>
        <h3 className="font-semibold text-[#0B3B5C]">Distance rate (custom addresses only)</h3>
        <p className="text-xs text-[#64748B]">Used only when a pickup or drop-off has no set fare. Your listed route prices never change.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Base fare ($)
          <input type="number" min="0" step="0.5" value={r.base_usd} onChange={(e) => setR({ ...r, base_usd: e.target.value })} className="block mt-1 w-28 border rounded-md px-2 py-1.5" data-testid="distance-base-input" />
        </label>
        <label className="text-sm">Per km ($)
          <input type="number" min="0" step="0.25" value={r.per_km_usd} onChange={(e) => setR({ ...r, per_km_usd: e.target.value })} className="block mt-1 w-28 border rounded-md px-2 py-1.5" data-testid="distance-perkm-input" />
        </label>
        <button onClick={save} className="px-4 py-2 rounded-md bg-[#0B3B5C] text-white text-sm" data-testid="distance-rates-save">Save rates</button>
      </div>
      <div className="flex flex-wrap items-end gap-2 pt-3 border-t">
        <input value={test.from} onChange={(e) => setTest({ ...test, from: e.target.value, res: null })} placeholder="From" className="border rounded-md px-2 py-1.5 text-sm" data-testid="distance-test-from" />
        <input value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value, res: null })} placeholder="To" className="border rounded-md px-2 py-1.5 text-sm" data-testid="distance-test-to" />
        <button onClick={runTest} className="px-3 py-1.5 rounded-md border text-sm" data-testid="distance-test-btn">Test a fare</button>
        {test.res && (
          <span className="text-sm" data-testid="distance-test-result">
            {test.res.ok ? <>{test.res.km} km × ${test.res.per_km} + ${test.res.base} = <b>${Number(test.res.fare).toFixed(2)}</b></> : <span className="text-red-600">{test.res.error}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

function PlaceForm({ value, onCancel, onSaved }) {
  const [f, setF] = useState(value);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const lookup = async () => {
    try { const { data } = await api.post("/admin/nassau-places/lookup", { q: f.name }); setF({ ...f, ...data }); toast.success("Map pin found"); }
    catch (e) { toast.error(errMsg(e, "Not found")); }
  };
  const save = async () => {
    const body = { name: f.name, lat: Number(f.lat), lng: Number(f.lng), active: f.active,
      aliases: String(f.aliases || "").split(",").map((a) => a.trim()).filter(Boolean) };
    try {
      if (f.id) await api.put(`/admin/nassau-places/${f.id}`, body); else await api.post("/admin/nassau-places", body);
      toast.success("Place saved"); onSaved();
    } catch (e) { toast.error(errMsg(e, "Couldn't save place")); }
  };
  return (
    <div className="bg-[#F8FAFC] border rounded-lg p-4 grid sm:grid-cols-2 gap-3" data-testid="place-form">
      <input value={f.name} onChange={set("name")} disabled={f.fixed_endpoint} placeholder="Place name (e.g. Goodman's Bay)" className="border rounded-md px-2 py-1.5 text-sm" data-testid="place-name-input" />
      <input value={f.aliases} onChange={set("aliases")} placeholder="Other names guests type, comma separated" className="border rounded-md px-2 py-1.5 text-sm" data-testid="place-aliases-input" />
      <div className="flex gap-2">
        <input value={f.lat} onChange={set("lat")} placeholder="Latitude (25.07)" className="border rounded-md px-2 py-1.5 text-sm w-full" data-testid="place-lat-input" />
        <input value={f.lng} onChange={set("lng")} placeholder="Longitude (-77.34)" className="border rounded-md px-2 py-1.5 text-sm w-full" data-testid="place-lng-input" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={lookup} className="px-3 py-1.5 rounded-md border text-sm" data-testid="place-lookup-btn">Find pin from name</button>
        <button onClick={save} className="px-3 py-1.5 rounded-md bg-[#0B3B5C] text-white text-sm" data-testid="place-save-btn">Save</button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded-md text-sm text-[#64748B]" data-testid="place-cancel-btn">Cancel</button>
      </div>
      <p className="sm:col-span-2 text-[11px] text-[#64748B]">Tip: in Google Maps, right-click the spot and click the numbers to copy latitude, longitude.</p>
    </div>
  );
}

function PlaceRow({ p, onEdit, onRemove, onRestore }) {
  return (
    <tr className="border-t" data-testid={`place-row-${p.id}`}>
      <td className="py-2 pr-2 font-medium text-[#0B3B5C]">{p.name}{p.fixed_endpoint && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#D4A94A]/20 text-[#8a6a1f]">set fares</span>}</td>
      <td className="py-2 pr-2 text-xs text-[#64748B] hidden md:table-cell">{p.aliases.join(", ")}</td>
      <td className="py-2 pr-2 mono text-xs">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</td>
      <td className="py-2 pr-2 text-xs">{p.active ? "On" : "Hidden"}</td>
      <td className="py-2 text-right whitespace-nowrap">
        <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer" className="text-xs underline mr-3" data-testid={`place-view-${p.id}`}>View</a>
        <button onClick={() => onEdit(p)} className="text-xs underline mr-3" data-testid={`place-edit-${p.id}`}>Edit</button>
        {!p.active && <button onClick={() => onRestore(p)} className="text-xs text-green-700 underline" data-testid={`place-restore-${p.id}`}>Restore</button>}
        {!p.fixed_endpoint && p.active && <button onClick={() => onRemove(p)} className="text-xs text-red-600 underline" data-testid={`place-remove-${p.id}`}>Remove</button>}
      </td>
    </tr>
  );
}

export default function NassauMapPanel() {
  const [places, setPlaces] = useState([]);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const load = () => api.get("/admin/nassau-places").then((r) => setPlaces(r.data || [])).catch(() => toast.error("Couldn't load map places"));
  useEffect(() => { load(); }, []);
  const remove = async (p) => {
    if (!window.confirm(`Remove "${p.name}" from the map?`)) return;
    try { await api.delete(`/admin/nassau-places/${p.id}`); toast.success("Removed"); load(); }
    catch (e) { toast.error(errMsg(e, "Couldn't remove")); }
  };
  const restore = async (p) => {
    try { await api.put(`/admin/nassau-places/${p.id}`, { name: p.name, lat: p.lat, lng: p.lng, aliases: p.aliases, active: true }); toast.success("Restored"); load(); }
    catch (e) { toast.error(errMsg(e, "Couldn't restore")); }
  };
  const shown = places.filter((p) => (p.name + p.aliases.join(" ")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6" data-testid="nassau-map-panel">
      <RatesCard />
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[#0B3B5C]">Nassau map places ({places.length})</h3>
            <p className="text-xs text-[#64748B]">Private to admin. New places appear in the taxi drop-downs, priced by distance.</p>
          </div>
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places" className="border rounded-md px-2 py-1.5 text-sm" data-testid="place-search-input" />
            <button onClick={() => setEditing({ ...EMPTY })} className="px-3 py-1.5 rounded-md bg-[#E86A3C] text-white text-sm" data-testid="place-add-btn">+ Add place</button>
          </div>
        </div>
        {editing && <PlaceForm key={editing.id || "new"} value={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="places-table">
            <thead><tr className="text-left text-xs text-[#64748B]"><th className="py-2">Place</th><th className="hidden md:table-cell">Also matches</th><th>Map pin</th><th>Status</th><th /></tr></thead>
            <tbody>{shown.map((p) => <PlaceRow key={p.id} p={p} onEdit={(x) => setEditing({ ...x, aliases: x.aliases.join(", ") })} onRemove={remove} onRestore={restore} />)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
