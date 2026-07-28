import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Check, ImageIcon, Upload, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { fallbackCopy, resolveUrl } from "./shared";

const GRID_COMPACT = "grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-2";
const GRID_COMFORT = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3";

// Standalone photo library manager. `density` is persisted to localStorage so
// operators can pick their preferred grid tightness — surfaced only when the
// library exceeds ~20 items to avoid distraction on small collections.
export default function ImagesPanel() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copiedName, setCopiedName] = useState("");
  const [density, setDensity] = useState(() => localStorage.getItem("admin_img_density") || "comfortable");
  const inputRef = useRef(null);

  useEffect(() => { localStorage.setItem("admin_img_density", density); }, [density]);

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
    const done = () => {
      setCopiedName(img.name);
      setTimeout(() => setCopiedName(""), 1600);
      toast.success("URL copied");
    };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
      } else {
        fallbackCopy(url, done);
      }
    } catch { fallbackCopy(url, done); }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]" data-testid="images-panel">
      <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-sm text-[#64748B]">
          <span>{images.length} image(s) in the library</span>
          {images.length > 20 && (
            <div className="inline-flex items-center rounded-md border border-[#E2E8F0] overflow-hidden text-xs" data-testid="images-density-toggle">
              <button
                onClick={() => setDensity("comfortable")}
                className={`px-2.5 py-1 ${density === "comfortable" ? "bg-[#0B3B5C] text-white" : "text-[#64748B] hover:bg-[#F1F5F9]"}`}
                data-testid="images-density-comfortable"
              >
                Comfortable
              </button>
              <button
                onClick={() => setDensity("compact")}
                className={`px-2.5 py-1 border-l border-[#E2E8F0] ${density === "compact" ? "bg-[#0B3B5C] text-white" : "text-[#64748B] hover:bg-[#F1F5F9]"}`}
                data-testid="images-density-compact"
              >
                Compact
              </button>
            </div>
          )}
        </div>
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
          <div className={density === "compact" ? GRID_COMPACT : GRID_COMFORT}>
            {images.map((img) => (
              <div key={img.name} className="group relative bg-white rounded-xl border border-[#E2E8F0] overflow-hidden hover:border-[#D4A94A] hover:shadow-md transition-all" data-testid={`image-card-${img.name}`}>
                <div className="aspect-square bg-[#F1F5F9]">
                  <img src={resolveUrl(img.url)} alt={img.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
                {density === "comfortable" ? (
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
                ) : (
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-t from-black/70 via-black/20 to-transparent transition-opacity flex flex-col justify-end p-1.5 gap-1">
                    <div className="text-white text-[9px] truncate" title={img.name}>{img.name}</div>
                    <div className="flex gap-1">
                      <button onClick={() => copy(img)} className="flex-1 rounded bg-white/90 hover:bg-white text-[#0B3B5C] px-1 py-0.5 text-[9px] font-semibold flex items-center justify-center gap-0.5" data-testid={`image-copy-${img.name}`}>
                        {copiedName === img.name ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                      </button>
                      <button onClick={() => remove(img.name)} className="rounded bg-white/90 hover:bg-red-500 hover:text-white text-[#DC2626] px-1 py-0.5" data-testid={`image-delete-${img.name}`}>
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
