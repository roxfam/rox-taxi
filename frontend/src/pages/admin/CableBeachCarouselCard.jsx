import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Images, Save, Loader2, Eye, EyeOff } from "lucide-react";

/**
 * CableBeachCarouselCard — admin editor for the home-page carousel slides.
 *
 * Config lives at `site_config.cable_beach_home_slides` (array of
 * `{ src, src_mobile?, alt, active? }`). Admin can:
 *   • Reorder slides via up/down arrows
 *   • Add a slide (desktop URL required; mobile URL optional)
 *   • Remove any slide (confirm toast)
 *   • Toggle each slide active/paused without deleting
 *
 * Changes save on blur AND via the "Save slides" button so a half-typed
 * URL never wipes the real carousel. Public endpoint auto-filters inactive
 * slides so a paused slide never surfaces on the home page.
 */
export default function CableBeachCarouselCard() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ src: "", src_mobile: "", alt: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/cable-beach/carousel");
      setSlides(Array.isArray(data?.slides) ? data.slides : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load slides");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (next) => {
    setSaving(true);
    try {
      await api.put("/admin/cable-beach/carousel", { slides: next });
      setSlides(next);
      toast.success("Carousel saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const move = (idx, delta) => {
    const next = [...slides];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    save(next);
  };

  const remove = (idx) => {
    if (!window.confirm(`Remove slide ${idx + 1}?`)) return;
    save(slides.filter((_, i) => i !== idx));
  };

  const toggleActive = (idx) => {
    const next = slides.map((s, i) => i === idx ? { ...s, active: s.active === false ? true : false } : s);
    save(next);
  };

  const updateField = (idx, key, value) => {
    setSlides((prev) => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s));
  };

  const commit = (idx) => {
    save(slides);
  };

  const addSlide = () => {
    const src = draft.src.trim();
    if (!src) {
      toast.error("Add a desktop image URL first");
      return;
    }
    const next = [...slides, {
      src,
      src_mobile: draft.src_mobile.trim() || null,
      alt: draft.alt.trim() || "Cable Beach photo",
      active: true,
    }];
    save(next);
    setDraft({ src: "", src_mobile: "", alt: "" });
  };

  return (
    <section
      className="bg-white rounded-2xl p-5 shadow-sm border border-[#E2E8F0] mb-5"
      data-testid="cable-beach-carousel-card"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#FBF7EF] border border-[#D4A94A]/30 flex items-center justify-center">
            <Images className="w-4 h-4 text-[#D4A94A]" />
          </div>
          <div>
            <h3 className="font-[Georgia] text-xl text-[#0B3B5C]">Cable Beach home carousel</h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              Reorder, add or pause the rotating photos on <a href="/" className="underline">home page</a>.
              Max 8 slides. Paths like <code className="text-[11px] bg-[#F8FAFC] px-1 rounded">/images/your-photo.jpg</code> work when the file lives in <code className="text-[11px] bg-[#F8FAFC] px-1 rounded">frontend/public/images/</code>.
            </p>
          </div>
        </div>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-[#64748B]" />}
      </div>

      {loading ? (
        <div className="text-sm text-[#64748B] flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <ul className="space-y-2 mb-4" data-testid="carousel-slides-list">
            {slides.map((s, i) => (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                  s.active === false ? "border-[#E2E8F0] bg-[#F8FAFC] opacity-60" : "border-[#D4A94A]/30 bg-white"
                }`}
                data-testid={`carousel-slide-${i}`}
              >
                <div className="w-20 h-14 rounded-md overflow-hidden bg-[#F1F5F9] shrink-0 border border-[#E2E8F0]">
                  {s.src && (
                    <img
                      src={s.src}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    value={s.src || ""}
                    onChange={(e) => updateField(i, "src", e.target.value)}
                    onBlur={() => commit(i)}
                    placeholder="/images/cable-beach-slide-4.jpg"
                    className="w-full text-xs font-mono border border-[#E2E8F0] rounded px-2 py-1 focus:outline-none focus:border-[#D4A94A]"
                    data-testid={`slide-${i}-src`}
                  />
                  <div className="flex gap-1.5">
                    <input
                      value={s.src_mobile || ""}
                      onChange={(e) => updateField(i, "src_mobile", e.target.value)}
                      onBlur={() => commit(i)}
                      placeholder="/images/…-mobile.webp (optional)"
                      className="flex-1 text-[11px] font-mono border border-[#E2E8F0] rounded px-2 py-1 focus:outline-none focus:border-[#D4A94A]"
                      data-testid={`slide-${i}-src-mobile`}
                    />
                    <input
                      value={s.alt || ""}
                      onChange={(e) => updateField(i, "alt", e.target.value)}
                      onBlur={() => commit(i)}
                      placeholder="Alt text (SEO + a11y)"
                      className="flex-1 text-[11px] border border-[#E2E8F0] rounded px-2 py-1 focus:outline-none focus:border-[#D4A94A]"
                      data-testid={`slide-${i}-alt`}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || saving}
                    className="w-7 h-7 rounded-md hover:bg-[#F1F5F9] text-[#64748B] disabled:opacity-30 flex items-center justify-center"
                    title="Move up"
                    data-testid={`slide-${i}-up`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => move(i, +1)}
                    disabled={i === slides.length - 1 || saving}
                    className="w-7 h-7 rounded-md hover:bg-[#F1F5F9] text-[#64748B] disabled:opacity-30 flex items-center justify-center"
                    title="Move down"
                    data-testid={`slide-${i}-down`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggleActive(i)}
                    disabled={saving}
                    className="w-7 h-7 rounded-md hover:bg-[#F1F5F9] text-[#64748B] flex items-center justify-center"
                    title={s.active === false ? "Resume" : "Pause"}
                    data-testid={`slide-${i}-toggle`}
                  >
                    {s.active === false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => remove(i)}
                    disabled={saving}
                    className="w-7 h-7 rounded-md hover:bg-[#FEF2F2] text-[#B91C1C] flex items-center justify-center"
                    title="Remove"
                    data-testid={`slide-${i}-remove`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
            {slides.length === 0 && (
              <li className="text-sm text-[#64748B] italic">No slides yet — add one below.</li>
            )}
          </ul>

          {slides.length < 8 && (
            <div className="border-t border-[#F1F5F9] pt-3">
              <div className="text-[10px] font-black tracking-widest uppercase text-[#64748B] mb-2">
                Add a slide
              </div>
              <div className="grid gap-1.5">
                <input
                  value={draft.src}
                  onChange={(e) => setDraft((d) => ({ ...d, src: e.target.value }))}
                  placeholder="Desktop image URL — /images/your-photo.jpg"
                  className="text-xs font-mono border border-[#E2E8F0] rounded px-2.5 py-2 focus:outline-none focus:border-[#D4A94A]"
                  data-testid="new-slide-src"
                />
                <div className="flex gap-1.5">
                  <input
                    value={draft.src_mobile}
                    onChange={(e) => setDraft((d) => ({ ...d, src_mobile: e.target.value }))}
                    placeholder="Mobile 4:5 WebP (optional)"
                    className="flex-1 text-[11px] font-mono border border-[#E2E8F0] rounded px-2.5 py-2 focus:outline-none focus:border-[#D4A94A]"
                    data-testid="new-slide-src-mobile"
                  />
                  <input
                    value={draft.alt}
                    onChange={(e) => setDraft((d) => ({ ...d, alt: e.target.value }))}
                    placeholder="Alt text"
                    className="flex-1 text-[11px] border border-[#E2E8F0] rounded px-2.5 py-2 focus:outline-none focus:border-[#D4A94A]"
                    data-testid="new-slide-alt"
                  />
                  <button
                    onClick={addSlide}
                    disabled={!draft.src.trim() || saving}
                    className="bg-[#0B3B5C] text-white rounded px-3 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#082941] disabled:opacity-50 inline-flex items-center gap-1.5"
                    data-testid="add-slide-btn"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
