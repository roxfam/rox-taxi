import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, DollarSign, History, Tag, ImageIcon } from "lucide-react";
import { api, money } from "../../lib/api";
import EditModal from "./EditModal";
import PriceHistoryModal from "./PriceHistoryModal";

// Table/list of tour / taxi / rental items with inline price-edit + history
// buttons. Uses backend annotation: `promo` is present when the latest
// price_history entry's reason includes promo/sale/discount and is a decrease.
export default function CatalogPanel({ kind }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [pricing, setPricing] = useState(null);

  // Guarded fetch: cancel late-arriving responses when `kind` changes so a
  // stale /admin/tours result can't overwrite the freshly loaded /admin/rentals
  // list. Also clear items eagerly so the operator doesn't see stale rows
  // during the fetch. (Fixes iteration_13 HIGH: catalog-tab race.)
  useEffect(() => {
    let alive = true;
    setItems([]);
    api.get(`/admin/${kind}`)
      .then(({ data }) => { if (alive) setItems(data); })
      .catch(() => { if (alive) toast.error("Failed to load"); });
    return () => { alive = false; };
  }, [kind]);

  const load = async () => {
    try {
      const { data } = await api.get(`/admin/${kind}`);
      setItems(data);
    } catch { toast.error("Failed to load"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try { await api.delete(`/admin/${kind}/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  const emptyForm = () => {
    const base = { new: true, name: "", description: "", price: 0, image_url: "", active: true };
    if (kind === "rentals") return { ...base, year: "", make: "", model: "", color: "", body: "", seats: 4, category: "" };
    if (kind === "taxi_services") return { ...base, route: "", featured: false };
    return { ...base, duration: "", location: "", featured: false, category: "" };
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]">
      <div className="p-4 border-b border-[#E2E8F0] flex justify-between items-center">
        <div className="text-sm text-[#64748B]">{items.length} item(s)</div>
        <button
          onClick={() => setEditing(emptyForm())}
          data-testid="admin-add-item-btn"
          className="inline-flex items-center gap-2 rounded-md bg-[#0B3B5C] text-white px-3 py-2 text-sm hover:bg-[#132a4a]"
        >
          <Plus className="w-4 h-4" /> Add {kind === "rentals" ? "vehicle" : "item"}
        </button>
      </div>
      <div className="divide-y divide-[#E2E8F0]">
        {items.map((it) => (
          <div key={it.id} className="p-4 flex items-center gap-4" data-testid={`admin-item-${it.id}`}>
            <PhotoDropzone
              currentUrl={it.image_url}
              onUploaded={async (newUrl) => {
                try {
                  await api.put(`/admin/${kind}/${it.id}`, { image_url: newUrl });
                  toast.success("Photo updated");
                  load();
                } catch (e) {
                  toast.error(e?.response?.data?.detail || "Failed to attach photo");
                }
              }}
              testid={`admin-photo-drop-${it.id}`}
            />
            <div className="flex-1">
              <div className="font-semibold text-[#0B3B5C] flex items-center gap-2">
                {it.name}
                {it.promo?.is_promo && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#E86A3C] text-white px-1.5 py-0.5 rounded" data-testid={`admin-item-promo-${it.id}`}>
                    <Tag className="w-2.5 h-2.5" /> Sale
                  </span>
                )}
              </div>
              <div className="text-xs text-[#64748B] mt-0.5 line-clamp-1">{it.description}</div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-[#64748B] items-center">
                <button
                  type="button"
                  onClick={() => setPricing(it)}
                  data-testid={`admin-price-edit-${it.id}`}
                  className="inline-flex items-center gap-1 mono font-semibold hover:underline decoration-dotted"
                  title="Change price / view history"
                >
                  {it.promo?.is_promo && (
                    <span className="text-[#94a3b8] line-through mr-1">{money(it.promo.original_price)}</span>
                  )}
                  <span className="text-[#E86A3C]">{money(it.price)}</span>
                  <DollarSign className="w-3 h-3 opacity-60" />
                </button>
                {(it.price_history?.length || 0) > 1 && (
                  <span className="text-[10px] text-[#94a3b8]">· {(it.price_history?.length || 0) - 1} change{(it.price_history?.length || 0) - 1 === 1 ? "" : "s"}</span>
                )}
                {it.duration && <span>· {it.duration}</span>}
                {it.seats && <span>· {it.seats} seats</span>}
                {it.year && <span>· {it.year}</span>}
                {it.body && <span>· {it.body}</span>}
                {it.route && <span>· {it.route}</span>}
                {it.active === false && <span className="text-red-500">· inactive</span>}
              </div>
            </div>
            <button onClick={() => setPricing(it)} className="p-2 rounded-md hover:bg-[#F1F5F9] text-[#0B3B5C]" data-testid={`admin-history-${it.id}`} title="Price history"><History className="w-4 h-4" /></button>
            <button onClick={() => setEditing(it)} className="p-2 rounded-md hover:bg-[#F1F5F9]" data-testid={`admin-edit-${it.id}`}><Edit2 className="w-4 h-4" /></button>
            <button onClick={() => remove(it.id)} className="p-2 rounded-md hover:bg-red-50 text-red-500" data-testid={`admin-delete-${it.id}`}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {items.length === 0 && <div className="p-10 text-center text-[#64748B]">No items yet.</div>}
      </div>

      {editing && <EditModal kind={kind} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {pricing && <PriceHistoryModal kind={kind} item={pricing} onClose={() => setPricing(null)} onSaved={() => { setPricing(null); load(); }} />}
    </div>
  );
}

// Inline photo dropzone — thumbnail with hover overlay + native drag-drop.
// Uploads through the existing POST /admin/images endpoint, then hands the
// resulting URL back to the parent to persist against the catalog item.
function PhotoDropzone({ currentUrl, onUploaded, testid }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);

  const upload = async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      return toast.error("Only image files are allowed");
    }
    if (file.size > 8 * 1024 * 1024) return toast.error("Image too large (max 8MB)");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/images", fd, { headers: { "Content-Type": "multipart/form-data" } });
      if (!data?.url) throw new Error("Upload returned no URL");
      await onUploaded(data.url);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Upload failed");
    } finally { setUploading(false); }
  };

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) upload(f);
  };

  return (
    <div
      className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 border-dashed transition-all cursor-pointer ${drag ? "border-[#D4A94A] scale-105 shadow-[0_6px_18px_rgba(212,169,74,0.35)]" : "border-transparent hover:border-[#D4A94A]/60"} ${!currentUrl ? "bg-[#F1F5F9]" : ""}`}
      onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => !uploading && fileRef.current?.click()}
      data-testid={testid}
      title="Click or drag an image to replace"
    >
      {currentUrl ? (
        <img src={currentUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[#94a3b8]">
          <ImageIcon className="w-5 h-5" />
        </div>
      )}
      {(drag || uploading) && (
        <div className="absolute inset-0 bg-[#0B3B5C]/80 text-white flex items-center justify-center text-[10px] font-bold uppercase tracking-widest">
          {uploading ? "Saving…" : "Drop"}
        </div>
      )}
      {!drag && !uploading && currentUrl && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B3B5C]/85 to-transparent text-white text-[9px] font-bold uppercase tracking-widest text-center py-1 opacity-0 hover:opacity-100 transition-opacity">
          Change
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid={`${testid}-input`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { upload(f); e.target.value = ""; } }}
      />
    </div>
  );
}
