import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, ChevronUp, ChevronDown, Save, X, FolderOpen } from "lucide-react";
import { api } from "../../lib/api";
import { F, resolveUrl } from "./shared";
import ImagePickerModal from "./ImagePickerModal";

// CRUD for the /home-slides collection powering the home-page hero carousel.
// Order can be nudged with up/down buttons; active toggle hides from the
// public feed without deleting. All slides survive backend restarts because
// seed_db seeds them with $setOnInsert.
export default function HomeSlidesPanel() {
  const [slides, setSlides] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/home-slides");
      setSlides(data);
    } catch { toast.error("Failed to load slides"); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm("Delete this slide?")) return;
    try { await api.delete(`/admin/home-slides/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  const swap = async (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= slides.length) return;
    const a = slides[idx];
    const b = slides[target];
    try {
      await Promise.all([
        api.put(`/admin/home-slides/${a.id}`, { ...a, order: b.order }),
        api.put(`/admin/home-slides/${b.id}`, { ...b, order: a.order }),
      ]);
      load();
    } catch { toast.error("Reorder failed"); }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]" data-testid="home-slides-panel">
      <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center">
        <div className="text-sm text-[#64748B]">{slides.length} slide(s) · Home hero carousel</div>
        <button
          onClick={() => setEditing({ new: true, title: "", subtitle: "", image_url: "", order: (slides[slides.length - 1]?.order || 0) + 1, active: true })}
          data-testid="home-slide-add-btn"
          className="inline-flex items-center gap-2 rounded-md bg-[#0B3B5C] text-white px-3 py-2 text-sm hover:bg-[#132a4a]"
        >
          <Plus className="w-4 h-4" /> Add slide
        </button>
      </div>
      <div className="divide-y divide-[#E2E8F0]">
        {slides.map((s, idx) => (
          <div key={s.id} className="p-4 flex items-center gap-4" data-testid={`home-slide-row-${s.id}`}>
            {s.image_url && <img src={resolveUrl(s.image_url)} alt={s.title} className="w-20 h-14 rounded-lg object-cover" />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[#0B3B5C] flex items-center gap-2">
                <span className="mono text-xs text-[#94a3b8]">#{s.order}</span>
                {s.title}
                {s.active === false && <span className="text-[10px] text-red-500 uppercase tracking-wider">hidden</span>}
              </div>
              <div className="text-xs text-[#64748B] mt-0.5 line-clamp-1">{s.subtitle}</div>
            </div>
            <div className="flex flex-col gap-0.5">
              <button onClick={() => swap(idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-[#F1F5F9] disabled:opacity-30" data-testid={`home-slide-up-${s.id}`}><ChevronUp className="w-4 h-4" /></button>
              <button onClick={() => swap(idx, +1)} disabled={idx === slides.length - 1} className="p-1 rounded hover:bg-[#F1F5F9] disabled:opacity-30" data-testid={`home-slide-down-${s.id}`}><ChevronDown className="w-4 h-4" /></button>
            </div>
            <button onClick={() => setEditing(s)} className="p-2 rounded-md hover:bg-[#F1F5F9]" data-testid={`home-slide-edit-${s.id}`}><Edit2 className="w-4 h-4" /></button>
            <button onClick={() => remove(s.id)} className="p-2 rounded-md hover:bg-red-50 text-red-500" data-testid={`home-slide-delete-${s.id}`}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {slides.length === 0 && <div className="p-10 text-center text-[#64748B]">No slides yet — add one to activate the home hero carousel.</div>}
      </div>
      {editing && <SlideEditModal slide={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function SlideEditModal({ slide, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: slide.title || "",
    subtitle: slide.subtitle || "",
    image_url: slide.image_url || "",
    order: slide.order ?? 0,
    active: slide.active !== false,
    link_url: slide.link_url || "",
    link_label: slide.link_label || "",
  });
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title required");
    if (!form.image_url.trim()) return toast.error("Image required");
    setSaving(true);
    try {
      const payload = {
        ...form,
        order: parseInt(form.order) || 0,
        link_url: (form.link_url || "").trim(),
        link_label: (form.link_label || "").trim(),
      };
      if (slide.new) await api.post("/admin/home-slides", payload);
      else await api.put(`/admin/home-slides/${slide.id}`, payload);
      toast.success("Saved");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-[#0B3B5C]">{slide.new ? "Add slide" : "Edit slide"}</h3>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[#F1F5F9]"><X className="w-4 h-4" /></button>
        </div>
        <F l="Title" v={form.title} on={(v) => setForm({ ...form, title: v })} testid="slide-edit-title" />
        <F l="Subtitle" v={form.subtitle} on={(v) => setForm({ ...form, subtitle: v })} testid="slide-edit-subtitle" />
        <F l="Image URL" v={form.image_url} on={(v) => setForm({ ...form, image_url: v })} testid="slide-edit-image" />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPicking(true)}
            data-testid="slide-edit-picker-btn"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B3B5C] hover:text-[#D4A94A]"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Pick from library
          </button>
          {form.image_url && (
            <img src={resolveUrl(form.image_url)} alt="preview" className="w-20 h-14 rounded object-cover border border-[#E2E8F0]" />
          )}
        </div>
        <F l="Order" type="number" v={form.order} on={(v) => setForm({ ...form, order: v })} testid="slide-edit-order" />
        <F l="External link URL (optional — turns into a per-slide CTA)" v={form.link_url} on={(v) => setForm({ ...form, link_url: v })} testid="slide-edit-link-url" />
        <F l="External link label (e.g. 'Book at Baha Mar')" v={form.link_label} on={(v) => setForm({ ...form, link_label: v })} testid="slide-edit-link-label" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="slide-edit-active" /> Active on home page
        </label>
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={onClose} className="rounded-md border border-[#E2E8F0] px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} data-testid="slide-edit-save" className="rounded-md bg-[#0B3B5C] text-white px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
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
