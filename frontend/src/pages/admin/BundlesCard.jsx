import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Package, Trash2, Eye, EyeOff, Plus } from "lucide-react";
import { api, money } from "../../lib/api";

const EMPTY = { name: "", description: "", includes: "", regular_price: "", bundle_price: "", image_url: "" };

export default function BundlesCard() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const load = () => api.get("/admin/bundles").then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const payload = (f, active = true) => ({
    name: f.name, description: f.description, image_url: f.image_url || "", active,
    includes: Array.isArray(f.includes) ? f.includes : f.includes.split("\n").map((s) => s.trim()).filter(Boolean),
    regular_price: parseFloat(f.regular_price), bundle_price: parseFloat(f.bundle_price),
  });
  const err = (e) => toast.error(typeof e?.response?.data?.detail === "string" ? e.response.data.detail : "Check the fields and try again");
  const add = async (e) => {
    e.preventDefault();
    try { await api.post("/admin/bundles", payload(form)); toast.success("Bundle added"); setForm(EMPTY); load(); } catch (x) { err(x); }
  };
  const toggle = async (b) => { try { await api.put(`/admin/bundles/${b.id}`, payload(b, !b.active)); load(); } catch (x) { err(x); } };
  const del = async (id) => { await api.delete(`/admin/bundles/${id}`); load(); };
  const inp = "mt-1 w-full border border-[#E2E8F0] rounded-md px-2 py-1.5 text-sm text-[#0B3B5C]";
  return (
    <div className="mt-6 bg-white rounded-xl border border-[#E2E8F0] p-5" data-testid="admin-bundles-card">
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold"><Package className="w-3 h-3" /> Bundle deals</div>
      <h3 className="mt-1 font-[Georgia] text-[#0B3B5C] text-xl">Combo packages</h3>
      <p className="text-xs text-[#64748B] mt-1">Shown on the home page and cruise schedule. Guests book through WhatsApp.</p>
      <form onSubmit={add} className="mt-4 grid md:grid-cols-2 gap-3">
        <input placeholder="Name, e.g. Airport + Love Beach day" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} data-testid="bundle-input-name" />
        <input placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inp} data-testid="bundle-input-description" />
        <textarea placeholder={"What's included (one per line)"} rows={3} value={form.includes} onChange={(e) => setForm({ ...form, includes: e.target.value })} className={inp} data-testid="bundle-input-includes" />
        <div className="grid grid-cols-2 gap-2 content-start">
          <input type="number" step="0.01" min="1" placeholder="Regular price $" required value={form.regular_price} onChange={(e) => setForm({ ...form, regular_price: e.target.value })} className={inp} data-testid="bundle-input-regular" />
          <input type="number" step="0.01" min="1" placeholder="Bundle price $" required value={form.bundle_price} onChange={(e) => setForm({ ...form, bundle_price: e.target.value })} className={inp} data-testid="bundle-input-price" />
          <input placeholder="Image URL (optional)" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className={`${inp} col-span-2`} data-testid="bundle-input-image" />
        </div>
        <button type="submit" className="md:col-span-2 inline-flex items-center justify-center gap-1 rounded-md bg-[#0B3B5C] text-white text-xs font-semibold px-3 py-2" data-testid="bundle-add-btn"><Plus className="w-3 h-3" /> Add bundle</button>
      </form>
      <div className="mt-4 divide-y divide-[#E2E8F0]">
        {list.length === 0 && <div className="text-xs text-[#94a3b8] py-2">No bundles yet.</div>}
        {list.map((b) => (
          <div key={b.id} className={`py-2 flex items-center justify-between text-sm ${b.active ? "" : "opacity-50"}`} data-testid={`admin-bundle-row-${b.id}`}>
            <div><b className="text-[#0B3B5C]">{b.name}</b> <span className="text-[#64748B]">· {money(b.bundle_price)} <s>{money(b.regular_price)}</s></span></div>
            <div className="flex gap-1">
              <button onClick={() => toggle(b)} className="p-1 text-[#0B3B5C]" title={b.active ? "Hide" : "Show"} data-testid={`bundle-toggle-${b.id}`}>{b.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
              <button onClick={() => del(b.id)} className="p-1 text-[#DC2626]" aria-label="Delete bundle" data-testid={`bundle-delete-${b.id}`}><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
