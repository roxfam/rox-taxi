import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { api, money } from "../lib/api";
import { Plus, Edit2, Trash2, Save, X, Settings, ImageIcon, Upload, Copy, Check, FolderOpen } from "lucide-react";

const TABS = [
  { key: "tours", label: "Tours" },
  { key: "taxi_services", label: "Taxi Services" },
  { key: "rentals", label: "Rentals" },
  { key: "images", label: "Images" },
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
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-[80]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[#0B3B5C] text-white flex items-center justify-center text-xs font-bold">RX</div>
              <span className="font-semibold text-[#0B3B5C]">Manage catalog</span>
            </div>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <button onClick={() => nav("/admin")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-bookings">Bookings</button>
              <button onClick={() => nav("/admin/manage")} className="px-3 py-1.5 rounded-md bg-[#0B3B5C] text-white" data-testid="admin-nav-manage">Manage catalog</button>
            </nav>
          </div>
          <button onClick={() => nav("/admin")} className="text-sm text-[#64748B] hover:text-[#0B3B5C]" data-testid="admin-manage-back">← Dashboard</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-testid={`admin-tab-${t.key}`}
              className={`px-4 py-2 rounded-md text-sm ${tab === t.key ? "bg-[#0B3B5C] text-white" : "bg-white border border-[#E2E8F0] hover:border-[#0B3B5C]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "site" ? <SiteConfigPanel /> : tab === "images" ? <ImagesPanel /> : <CatalogPanel kind={tab} />}
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
          className="inline-flex items-center gap-2 rounded-md bg-[#0B3B5C] text-white px-3 py-2 text-sm hover:bg-[#132a4a]"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <div className="divide-y divide-[#E2E8F0]">
        {items.map((it) => (
          <div key={it.id} className="p-4 flex items-center gap-4" data-testid={`admin-item-${it.id}`}>
            {it.image_url && <img src={it.image_url} className="w-16 h-16 rounded-lg object-cover" alt="" />}
            <div className="flex-1">
              <div className="font-semibold text-[#0B3B5C]">{it.name}</div>
              <div className="text-xs text-[#64748B] mt-0.5 line-clamp-1">{it.description}</div>
              <div className="mt-1 flex gap-3 text-xs text-[#64748B]">
                <span className="mono text-[#E86A3C] font-semibold">{money(it.price)}</span>
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
  const [picking, setPicking] = useState(false);

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
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-[#0B3B5C]">{initial.new ? "Add item" : "Edit item"}</h3>
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPicking(true)}
            data-testid="edit-image-picker-btn"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B3B5C] hover:text-[#D4A94A] transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Pick from library
          </button>
          {form.image_url && (
            <img src={resolveUrl(form.image_url)} alt="preview" className="w-12 h-12 rounded-md object-cover border border-[#E2E8F0]" />
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="edit-active" /> Active
        </label>
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={onClose} className="rounded-md border border-[#E2E8F0] px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} data-testid="edit-save" className="rounded-md bg-[#0B3B5C] text-white px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
      {picking && (
        <ImagePickerModal
          onClose={() => setPicking(false)}
          onPick={(url) => { setForm((f) => ({ ...f, image_url: url })); setPicking(false); toast.success("Image linked"); }}
        />
      )}
    </div>
  );
}

function resolveUrl(u) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  return `${process.env.REACT_APP_BACKEND_URL}${u}`;
}

// ---- Image Picker modal — shared between EditModal + ImagesPanel ----------
function ImagePickerModal({ onClose, onPick }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/images");
      setImages(data);
    } catch { toast.error("Failed to load images"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleUpload = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUploading(true);
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        await api.post("/admin/images", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast.success(`${list.length} image(s) uploaded`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <div className="fixed inset-0 z-[105] bg-black/50 flex items-center justify-center p-4" data-testid="image-picker-modal">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#0B3B5C]" />
            <h3 className="serif text-xl text-[#0B3B5C]">Photo library</h3>
            <span className="text-xs text-[#64748B] ml-2">{images.length} images</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              data-testid="picker-upload-btn"
              className="inline-flex items-center gap-2 rounded-md bg-[#D4A94A] hover:bg-[#c99b3d] text-white px-3 py-2 text-sm disabled:opacity-60"
            >
              <Upload className="w-4 h-4" /> {uploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
              data-testid="picker-file-input"
            />
            <button onClick={onClose} className="p-2 rounded-md hover:bg-[#F1F5F9]" data-testid="picker-close"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 bg-[#FBF7EF]">
          {loading ? (
            <div className="text-center py-16 text-[#64748B]">Loading photos…</div>
          ) : images.length === 0 ? (
            <div className="text-center py-16 text-[#64748B]">
              <ImageIcon className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <div className="font-semibold">No images yet</div>
              <div className="text-xs mt-1">Click "Upload" to add your first photo.</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((img) => (
                <ImageTile key={img.name} img={img} onPick={onPick} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageTile({ img, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(img.url)}
      className="group relative aspect-square rounded-xl overflow-hidden bg-white border border-[#E2E8F0] hover:border-[#D4A94A] hover:shadow-lg transition-all"
      data-testid={`picker-tile-${img.name}`}
      title={img.name}
    >
      <img src={resolveUrl(img.url)} alt={img.name} className="w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="text-white text-[10px] truncate">{img.name}</div>
      </div>
    </button>
  );
}

// ---- Images tab panel (standalone manager) --------------------------------
function ImagesPanel() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copiedName, setCopiedName] = useState("");
  const inputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/images");
      setImages(data);
    } catch { toast.error("Failed to load images"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const upload = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUploading(true);
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        await api.post("/admin/images", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      toast.success(`${list.length} image(s) uploaded`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const remove = async (name) => {
    if (!window.confirm(`Delete ${name}? Any tour/taxi/rental using this URL will break.`)) return;
    try {
      await api.delete(`/admin/images/${name}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const copy = (img) => {
    const url = resolveUrl(img.url);
    navigator.clipboard?.writeText(url);
    setCopiedName(img.name);
    setTimeout(() => setCopiedName(""), 1600);
    toast.success("URL copied");
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]" data-testid="images-panel">
      <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
        <div className="text-sm text-[#64748B]">{images.length} image(s) in the library</div>
        <div className="flex gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            data-testid="images-upload-btn"
            className="inline-flex items-center gap-2 rounded-md bg-[#D4A94A] hover:bg-[#c99b3d] text-white px-3 py-2 text-sm disabled:opacity-60"
          >
            <Upload className="w-4 h-4" /> {uploading ? "Uploading…" : "Upload photo(s)"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
            data-testid="images-file-input"
          />
        </div>
      </div>
      <div className="p-5 bg-[#FBF7EF] min-h-[300px]">
        {loading ? (
          <div className="text-center py-16 text-[#64748B]">Loading photos…</div>
        ) : images.length === 0 ? (
          <div className="text-center py-16 text-[#64748B]">
            <ImageIcon className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <div className="font-semibold">Your photo library is empty</div>
            <div className="text-xs mt-1">Upload a photo — it will be available in every Tour / Taxi / Rental image picker.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {images.map((img) => (
              <div key={img.name} className="group bg-white rounded-xl border border-[#E2E8F0] overflow-hidden hover:border-[#D4A94A] hover:shadow-md transition-all" data-testid={`image-card-${img.name}`}>
                <div className="aspect-square bg-[#F1F5F9]">
                  <img src={resolveUrl(img.url)} alt={img.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="p-2 border-t border-[#E2E8F0]">
                  <div className="text-[10px] text-[#0B3B5C] font-semibold truncate" title={img.name}>{img.name}</div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">{(img.size / 1024).toFixed(1)} KB</div>
                  <div className="mt-2 flex gap-1">
                    <button
                      onClick={() => copy(img)}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-[#F1F5F9] hover:bg-[#0B3B5C] hover:text-white px-2 py-1.5 text-[10px] font-semibold transition-colors"
                      data-testid={`image-copy-${img.name}`}
                    >
                      {copiedName === img.name ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedName === img.name ? "Copied" : "Copy URL"}
                    </button>
                    <button
                      onClick={() => remove(img.name)}
                      className="rounded bg-[#F1F5F9] hover:bg-red-500 hover:text-white px-2 py-1.5 transition-colors"
                      data-testid={`image-delete-${img.name}`}
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function F({ l, v, on, type = "text", textarea, testid }) {
  const props = { value: v, onChange: (e) => on(e.target.value), "data-testid": testid, className: "w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#D4A94A] focus:outline-none" };
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-[#64748B] mb-1">{l}</label>
      {textarea ? <textarea rows={3} {...props} /> : <input type={type} {...props} />}
    </div>
  );
}

function SiteConfigPanel() {
  const [cfg, setCfg] = useState({ facebook_url: "", zelle_email: "", zelle_phone: "", phone: "", logo_url: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { api.get("/site-config").then((r) => setCfg({ ...cfg, ...r.data })); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/site-config", cfg);
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload-logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setCfg((c) => ({ ...c, logo_url: data.logo_url }));
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const logoPreview = cfg.logo_url ? (cfg.logo_url.startsWith("http") ? cfg.logo_url : `${process.env.REACT_APP_BACKEND_URL}${cfg.logo_url}`) : "";

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 max-w-xl">
      <div className="flex items-center gap-2 mb-4"><Settings className="w-4 h-4 text-[#0B3B5C]" /><h3 className="font-semibold text-[#0B3B5C]">Site content</h3></div>

      <div className="mb-6">
        <label className="block text-xs uppercase tracking-widest text-[#64748B] mb-2">Brand logo</label>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-center overflow-hidden" data-testid="logo-preview">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-[#94a3b8]">No logo</span>
            )}
          </div>
          <div className="flex-1">
            <label className={`inline-block rounded-md bg-[#0B3B5C] text-white px-4 py-2 text-sm cursor-pointer hover:bg-[#0a2f4a] ${uploading ? "opacity-60" : ""}`}>
              {uploading ? "Uploading…" : "Upload logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={uploadLogo} className="hidden" data-testid="logo-upload-input" disabled={uploading} />
            </label>
            <div className="text-xs text-[#94a3b8] mt-2">PNG, JPG, WEBP or SVG · ≤ 5MB. Recommended: transparent PNG, ~200×80px.</div>
            {cfg.logo_url && (
              <button
                type="button"
                onClick={() => { setCfg((c) => ({ ...c, logo_url: "" })); toast.info("Cleared — click Save to apply"); }}
                className="mt-2 text-xs text-red-500 hover:underline"
                data-testid="logo-clear-btn"
              >
                Remove logo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <F l="Facebook page URL" v={cfg.facebook_url || ""} on={(v) => setCfg({ ...cfg, facebook_url: v })} testid="site-fb" />
        <F l="Messenger URL (auto-derived from Facebook — override if page slug differs)" v={cfg.messenger_url || ""} on={(v) => setCfg({ ...cfg, messenger_url: v })} testid="site-messenger" />
        <F l="Zelle email" v={cfg.zelle_email || ""} on={(v) => setCfg({ ...cfg, zelle_email: v })} testid="site-zelle-email" />
        <F l="Zelle phone" v={cfg.zelle_phone || ""} on={(v) => setCfg({ ...cfg, zelle_phone: v })} testid="site-zelle-phone" />
        <F l="Contact phone" v={cfg.phone || ""} on={(v) => setCfg({ ...cfg, phone: v })} testid="site-phone" />

        <div className="pt-4 mt-4 border-t border-[#E2E8F0]">
          <div className="text-xs uppercase tracking-widest text-[#64748B] font-semibold mb-3">Notification preferences</div>
          <div className="space-y-2">
            <Toggle
              label="Send booking confirmation emails"
              hint="Delivered via SendGrid or SMTP (Namecheap Private Email) on paid bookings."
              checked={cfg.notify_email_enabled !== false}
              onChange={(v) => setCfg({ ...cfg, notify_email_enabled: v })}
              testid="notify-email-toggle"
            />
            <Toggle
              label="Send booking confirmation SMS"
              hint="Delivered via Twilio to the customer's phone number on paid bookings."
              checked={cfg.notify_sms_enabled !== false}
              onChange={(v) => setCfg({ ...cfg, notify_sms_enabled: v })}
              testid="notify-sms-toggle"
            />
          </div>
        </div>

        <button onClick={save} disabled={saving} data-testid="site-save" className="mt-2 rounded-md bg-[#0B3B5C] text-white px-4 py-2 text-sm">Save</button>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, testid }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${checked ? "border-[#059669]/40 bg-[#059669]/5" : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"}`} data-testid={testid}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-[#059669]"
        data-testid={`${testid}-checkbox`}
      />
      <span className="flex-1">
        <span className="block text-sm font-semibold text-[#0B3B5C]">{label}</span>
        <span className="block text-[11px] text-[#64748B] mt-0.5">{hint}</span>
      </span>
    </label>
  );
}
