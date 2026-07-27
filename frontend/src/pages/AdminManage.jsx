import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { api, money } from "../lib/api";
import { Plus, Edit2, Trash2, Save, X, Settings } from "lucide-react";

const TABS = [
  { key: "tours", label: "Tours" },
  { key: "taxi_services", label: "Taxi Services" },
  { key: "rentals", label: "Rentals" },
  { key: "site", label: "Site Config" },
];

export default function AdminManage() {
  const [tab, setTab] = useState("tours");
  const nav = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem("admin_token")) nav("/admin/login");
  }, [nav]);

  return (
    <div className="min-h-screen bg-[#F1F5F9]" data-testid="admin-manage">
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-[#1A365D] text-white flex items-center justify-center text-xs font-bold">RX</div>
            <span className="font-semibold text-[#1A365D]">Manage catalog</span>
          </div>
          <button onClick={() => nav("/admin")} className="text-sm text-[#64748B] hover:text-[#1A365D]" data-testid="admin-manage-back">← Bookings</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-testid={`admin-tab-${t.key}`}
              className={`px-4 py-2 rounded-md text-sm ${tab === t.key ? "bg-[#1A365D] text-white" : "bg-white border border-[#E2E8F0] hover:border-[#1A365D]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "site" ? <SiteConfigPanel /> : <CatalogPanel kind={tab} />}
      </div>
    </div>
  );
}

function CatalogPanel({ kind }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/admin/${kind}`);
      setItems(data);
    } catch (e) {
      toast.error("Failed to load");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind]);

  const remove = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try { await api.delete(`/admin/${kind}/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]">
      <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center">
        <div className="text-sm text-[#64748B]">{items.length} item(s)</div>
        <button
          onClick={() => setEditing({ new: true, name: "", description: "", price: 0, image_url: "", active: true })}
          data-testid="admin-add-item-btn"
          className="inline-flex items-center gap-2 rounded-md bg-[#1A365D] text-white px-3 py-2 text-sm hover:bg-[#132a4a]"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <div className="divide-y divide-[#E2E8F0]">
        {items.map((it) => (
          <div key={it.id} className="p-4 flex items-center gap-4" data-testid={`admin-item-${it.id}`}>
            {it.image_url && <img src={it.image_url} className="w-16 h-16 rounded-lg object-cover" alt="" />}
            <div className="flex-1">
              <div className="font-semibold text-[#1A365D]">{it.name}</div>
              <div className="text-xs text-[#64748B] mt-0.5 line-clamp-1">{it.description}</div>
              <div className="mt-1 flex gap-3 text-xs text-[#64748B]">
                <span className="mono text-[#FF7F50] font-semibold">{money(it.price)}</span>
                {it.duration && <span>· {it.duration}</span>}
                {it.seats && <span>· {it.seats} seats</span>}
                {it.active === false && <span className="text-red-500">· inactive</span>}
              </div>
            </div>
            <button onClick={() => setEditing(it)} className="p-2 rounded-md hover:bg-[#F1F5F9]" data-testid={`admin-edit-${it.id}`}><Edit2 className="w-4 h-4" /></button>
            <button onClick={() => remove(it.id)} className="p-2 rounded-md hover:bg-red-50 text-red-500" data-testid={`admin-delete-${it.id}`}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {items.length === 0 && <div className="p-10 text-center text-[#64748B]">No items yet.</div>}
      </div>

      {editing && <EditModal kind={kind} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function EditModal({ kind, initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: initial.name || "",
    description: initial.description || "",
    price: initial.price || 0,
    duration: initial.duration || "",
    image_url: initial.image_url || "",
    category: initial.category || "",
    seats: initial.seats || 0,
    active: initial.active !== false,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, price: parseFloat(form.price) || 0, seats: form.seats ? parseInt(form.seats) : null };
      if (initial.new) await api.post(`/admin/${kind}`, payload);
      else await api.put(`/admin/${kind}/${initial.id}`, payload);
      toast.success("Saved");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-[#1A365D]">{initial.new ? "Add item" : "Edit item"}</h3>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[#F1F5F9]"><X className="w-4 h-4" /></button>
        </div>
        <F l="Name" v={form.name} on={(v) => setForm({ ...form, name: v })} testid="edit-name" />
        <F l="Description" v={form.description} on={(v) => setForm({ ...form, description: v })} textarea testid="edit-desc" />
        <div className="grid grid-cols-2 gap-3">
          <F l="Price (USD)" type="number" v={form.price} on={(v) => setForm({ ...form, price: v })} testid="edit-price" />
          <F l="Category" v={form.category} on={(v) => setForm({ ...form, category: v })} testid="edit-cat" />
          {kind !== "rentals" && <F l="Duration" v={form.duration} on={(v) => setForm({ ...form, duration: v })} testid="edit-duration" />}
          {kind === "rentals" && <F l="Seats" type="number" v={form.seats} on={(v) => setForm({ ...form, seats: v })} testid="edit-seats" />}
        </div>
        <F l="Image URL" v={form.image_url} on={(v) => setForm({ ...form, image_url: v })} testid="edit-image" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="edit-active" /> Active
        </label>
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={onClose} className="rounded-md border border-[#E2E8F0] px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} data-testid="edit-save" className="rounded-md bg-[#1A365D] text-white px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function F({ l, v, on, type = "text", textarea, testid }) {
  const props = { value: v, onChange: (e) => on(e.target.value), "data-testid": testid, className: "w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#00B4D8] focus:outline-none" };
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-[#64748B] mb-1">{l}</label>
      {textarea ? <textarea rows={3} {...props} /> : <input type={type} {...props} />}
    </div>
  );
}

function SiteConfigPanel() {
  const [cfg, setCfg] = useState({ facebook_url: "", zelle_email: "", zelle_phone: "", phone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/site-config").then((r) => setCfg({ ...cfg, ...r.data })); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/site-config", cfg);
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 max-w-xl">
      <div className="flex items-center gap-2 mb-4"><Settings className="w-4 h-4 text-[#1A365D]" /><h3 className="font-semibold text-[#1A365D]">Site content</h3></div>
      <div className="space-y-3">
        <F l="Facebook page URL" v={cfg.facebook_url || ""} on={(v) => setCfg({ ...cfg, facebook_url: v })} testid="site-fb" />
        <F l="Zelle email" v={cfg.zelle_email || ""} on={(v) => setCfg({ ...cfg, zelle_email: v })} testid="site-zelle-email" />
        <F l="Zelle phone" v={cfg.zelle_phone || ""} on={(v) => setCfg({ ...cfg, zelle_phone: v })} testid="site-zelle-phone" />
        <F l="Contact phone" v={cfg.phone || ""} on={(v) => setCfg({ ...cfg, phone: v })} testid="site-phone" />
        <button onClick={save} disabled={saving} data-testid="site-save" className="mt-2 rounded-md bg-[#1A365D] text-white px-4 py-2 text-sm">Save</button>
      </div>
    </div>
  );
}
