import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Trash2, Upload, FolderOpen, RotateCcw } from "lucide-react";
import { api } from "../../lib/api";
import ImagePickerModal from "./ImagePickerModal";
import { DEFAULT_DOLPHIN_SLIDES } from "../../components/DolphinSlides";

export default function DolphinSlidesAdmin() {
  const [slides, setSlides] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api.get("/site-config").then((r) => {
      const list = (r.data?.dolphin_slides || []).filter(Boolean);
      setSlides(list.length ? list : DEFAULT_DOLPHIN_SLIDES);
    }).catch(() => setSlides(DEFAULT_DOLPHIN_SLIDES));
  }, []);

  const save = async (next) => {
    setSlides(next);
    try {
      await api.put("/admin/site-config", { dolphin_slides: next });
      toast.success("Dolphin slideshow saved");
    } catch { toast.error("Save failed"); }
  };

  const move = (n, d) => {
    const next = [...slides];
    [next[n], next[n + d]] = [next[n + d], next[n]];
    save(next);
  };

  const remove = (n) => {
    if (slides.length <= 1) { toast.error("Keep at least one photo"); return; }
    save(slides.filter((_, k) => k !== n));
  };

  const add = (url) => {
    if (slides.length >= 12) { toast.error("Up to 12 photos"); return; }
    save([...slides, url]);
  };

  const upload = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setBusy(true);
    try {
      let next = [...slides];
      for (const file of list.slice(0, 12 - next.length)) {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await api.post("/admin/images", fd, { headers: { "Content-Type": "multipart/form-data" } });
        next = [...next, data.url];
      }
      await save(next);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (!slides) return null;

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] mb-5 p-4" data-testid="dolphin-slides-admin">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-[#0B3B5C]">Home page dolphin slideshow</div>
          <div className="text-xs text-[#64748B]">Photos behind "Swim with dolphins" on the home page, in this order. Changes save instantly. Wide photos look best.</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} data-testid="dolphin-slides-upload"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0B3B5C] text-white text-xs font-semibold px-3.5 py-2 hover:bg-[#082a42] disabled:opacity-60 transition-colors">
            <Upload className="w-3.5 h-3.5" /> {busy ? "Uploading…" : "Upload photo"}
          </button>
          <button type="button" onClick={() => setPicking(true)} data-testid="dolphin-slides-pick"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#0B3B5C] text-[#0B3B5C] text-xs font-semibold px-3.5 py-2 hover:bg-[#0B3B5C]/5 transition-colors">
            <FolderOpen className="w-3.5 h-3.5" /> From library
          </button>
          <button type="button" onClick={() => window.confirm("Go back to the original 4 dolphin photos?") && save(DEFAULT_DOLPHIN_SLIDES)} data-testid="dolphin-slides-reset"
            className="inline-flex items-center gap-1.5 rounded-full text-[#64748B] text-xs font-semibold px-3 py-2 hover:bg-[#F1F5F9] transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} data-testid="dolphin-slides-file" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {slides.map((src, n) => (
          <div key={`${src}-${n}`} className="relative rounded-lg overflow-hidden border border-[#E2E8F0] group" data-testid={`dolphin-slide-admin-${n}`}>
            <img src={src} alt={`Dolphin slide ${n + 1}`} className="w-full aspect-video object-cover" />
            <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-black/60 text-white rounded-full px-2 py-0.5">{n + 1}</span>
            <div className="absolute bottom-0 inset-x-0 flex justify-between bg-gradient-to-t from-black/70 to-transparent p-1.5">
              <div className="flex gap-1">
                <button type="button" disabled={n === 0} onClick={() => move(n, -1)} aria-label="Move earlier" data-testid={`dolphin-slide-left-${n}`}
                  className="w-7 h-7 rounded-full bg-white/90 text-[#0B3B5C] flex items-center justify-center disabled:opacity-30"><ArrowLeft className="w-3.5 h-3.5" /></button>
                <button type="button" disabled={n === slides.length - 1} onClick={() => move(n, 1)} aria-label="Move later" data-testid={`dolphin-slide-right-${n}`}
                  className="w-7 h-7 rounded-full bg-white/90 text-[#0B3B5C] flex items-center justify-center disabled:opacity-30"><ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
              <button type="button" onClick={() => remove(n)} aria-label="Remove photo" data-testid={`dolphin-slide-remove-${n}`}
                className="w-7 h-7 rounded-full bg-white/90 text-[#DC2626] flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      {picking && <ImagePickerModal onClose={() => setPicking(false)} onPick={(url) => { setPicking(false); add(url); }} />}
    </div>
  );
}
