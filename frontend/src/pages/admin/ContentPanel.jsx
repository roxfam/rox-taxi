import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Plus, X, Save, Loader2 } from "lucide-react";

// Website content panel — lets the admin edit hero taglines, about copy,
// cancellation-policy text and the FAQ list without shipping code.
// Content is stored under `site_config.content` and consumed by public
// pages via /api/site-config (already includes the content blob).
export default function ContentPanel() {
  const [content, setContent] = useState({ hero_taglines: [], about_copy: "", cancellation_policy_text: "", faq: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("admin_token");
        const { data } = await api.get("/admin/content", { headers: { Authorization: `Bearer ${token}` } });
        setContent({
          hero_taglines: data.hero_taglines || [],
          about_copy: data.about_copy || "",
          cancellation_policy_text: data.cancellation_policy_text || "",
          faq: data.faq || [],
        });
      } catch (e) {
        toast.error("Failed to load content");
      } finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("admin_token");
      await api.patch("/admin/content", content, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("Content saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0B3B5C]" /></div>;

  return (
    <div className="space-y-6" data-testid="content-panel">
      {/* Hero taglines */}
      <section className="rounded-2xl bg-white border border-[#E2E8F0] p-6">
        <h3 className="serif text-xl text-[#0B3B5C]">Hero taglines</h3>
        <p className="text-xs text-[#64748B] mt-1">Rotating headlines shown on the home page hero carousel.</p>
        <div className="mt-4 space-y-2">
          {content.hero_taglines.map((t, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={t}
                onChange={(e) => setContent({ ...content, hero_taglines: content.hero_taglines.map((x, j) => j === i ? e.target.value : x) })}
                className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                data-testid={`content-hero-${i}`}
              />
              <button
                onClick={() => setContent({ ...content, hero_taglines: content.hero_taglines.filter((_, j) => j !== i) })}
                className="w-9 h-9 rounded-lg border border-[#E2E8F0] text-red-500 hover:bg-red-50 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setContent({ ...content, hero_taglines: [...content.hero_taglines, ""] })}
            className="text-sm text-[#0B3B5C] font-semibold inline-flex items-center gap-1"
            data-testid="content-hero-add"
          >
            <Plus className="w-4 h-4" /> Add tagline
          </button>
        </div>
      </section>

      {/* About */}
      <section className="rounded-2xl bg-white border border-[#E2E8F0] p-6">
        <h3 className="serif text-xl text-[#0B3B5C]">About copy</h3>
        <p className="text-xs text-[#64748B] mt-1">Shown on the /about page. Supports plain text — line breaks are preserved.</p>
        <textarea
          value={content.about_copy}
          onChange={(e) => setContent({ ...content, about_copy: e.target.value })}
          rows={6}
          className="mt-3 w-full rounded-lg border border-[#E2E8F0] p-3 text-sm"
          data-testid="content-about"
        />
      </section>

      {/* Cancellation policy */}
      <section className="rounded-2xl bg-white border border-[#E2E8F0] p-6">
        <h3 className="serif text-xl text-[#0B3B5C]">Cancellation policy</h3>
        <p className="text-xs text-[#64748B] mt-1">Displayed on booking modals and the Track page.</p>
        <textarea
          value={content.cancellation_policy_text}
          onChange={(e) => setContent({ ...content, cancellation_policy_text: e.target.value })}
          rows={3}
          className="mt-3 w-full rounded-lg border border-[#E2E8F0] p-3 text-sm"
          data-testid="content-cancellation"
        />
      </section>

      {/* FAQ */}
      <section className="rounded-2xl bg-white border border-[#E2E8F0] p-6">
        <h3 className="serif text-xl text-[#0B3B5C]">FAQ</h3>
        <p className="text-xs text-[#64748B] mt-1">Rendered on the Contact page and in the JSON-LD structured data for SEO.</p>
        <div className="mt-4 space-y-3">
          {content.faq.map((f, i) => (
            <div key={i} className="rounded-lg border border-[#E2E8F0] p-3 space-y-2 relative">
              <button
                onClick={() => setContent({ ...content, faq: content.faq.filter((_, j) => j !== i) })}
                className="absolute top-2 right-2 text-red-500 hover:bg-red-50 rounded p-1"
              ><X className="w-4 h-4" /></button>
              <input
                value={f.q}
                onChange={(e) => setContent({ ...content, faq: content.faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x) })}
                placeholder="Question"
                className="w-full rounded border border-[#E2E8F0] px-3 py-2 text-sm font-semibold"
                data-testid={`content-faq-q-${i}`}
              />
              <textarea
                value={f.a}
                onChange={(e) => setContent({ ...content, faq: content.faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x) })}
                placeholder="Answer"
                rows={2}
                className="w-full rounded border border-[#E2E8F0] px-3 py-2 text-sm"
                data-testid={`content-faq-a-${i}`}
              />
            </div>
          ))}
          <button
            onClick={() => setContent({ ...content, faq: [...content.faq, { q: "", a: "" }] })}
            className="text-sm text-[#0B3B5C] font-semibold inline-flex items-center gap-1"
            data-testid="content-faq-add"
          >
            <Plus className="w-4 h-4" /> Add Q&A
          </button>
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          data-testid="content-save"
          className="btn-shine inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-6 py-3 text-sm font-black hover:bg-[#d55a30] disabled:opacity-60 shadow-[0_10px_25px_rgba(232,106,60,0.35)]"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save changes
        </button>
      </div>
    </div>
  );
}
