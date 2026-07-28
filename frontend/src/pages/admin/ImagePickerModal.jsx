import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Upload, X } from "lucide-react";
import { api } from "../../lib/api";
import { resolveUrl } from "./shared";

// Modal photo picker — shared by EditModal (per-item image) and SiteConfigPanel (logo).
export default function ImagePickerModal({ onClose, onPick }) {
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
