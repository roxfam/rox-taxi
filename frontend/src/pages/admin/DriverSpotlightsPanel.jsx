import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Upload, Save, Trash2, Users, Sparkles, Camera } from "lucide-react";
import { api } from "../../lib/api";

/**
 * DriverSpotlightsPanel — admin editor for each driver's /drivers/:slug
 * public page. Lists every driver in `site_config.driver_spotlights`,
 * expands into a full editor for bio/tagline/specialties/languages, and
 * exposes a headshot uploader that saves to
 * `site_config.driver_spotlights.<slug>.headshot_url`.
 *
 * Reagan surfaces as a "starter" row even before the owner customises
 * anything so the first-time UX has a clear entry point (not an empty
 * list + a scary "Add a driver" button).
 */
export default function DriverSpotlightsPanel() {
  const [roster, setRoster] = useState({});
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("reagan");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/drivers");
      setRoster(data?.drivers || {});
    } catch { toast.error("Failed to load driver spotlights"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const slugs = Object.keys(roster);
  const current = roster[active] || null;

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-6" data-testid="driver-spotlights-panel">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-[#0B3B5C]" />
        <h3 className="font-semibold text-[#0B3B5C]">Driver spotlights</h3>
        <span className="text-[10px] uppercase tracking-widest text-[#D4A94A] font-black ml-2">
          Powers /drivers/:slug pages
        </span>
      </div>

      <div className="grid md:grid-cols-[220px,1fr] gap-6">
        <div className="space-y-1.5">
          {slugs.map((s) => {
            const d = roster[s] || {};
            const isActive = active === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActive(s)}
                data-testid={`driver-tab-${s}`}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all ${
                  isActive
                    ? "bg-gradient-to-br from-[#FBF7EF] to-white border-[#D4A94A] shadow-[0_6px_14px_rgba(212,169,74,0.15)]"
                    : "bg-white border-[#EFE7D5] hover:border-[#D4A94A]/60"
                }`}
              >
                {d.headshot_url ? (
                  <img
                    src={d.headshot_url.startsWith("http") ? d.headshot_url : `${process.env.REACT_APP_BACKEND_URL}${d.headshot_url}`}
                    alt={d.canonical || s}
                    className="w-10 h-10 rounded-full object-cover border border-[#E2E8F0]"
                  />
                ) : (
                  <span className="w-10 h-10 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#94a3b8]">
                    <Camera className="w-4 h-4" />
                  </span>
                )}
                <span className="flex-1 text-left">
                  <span className="block text-sm font-semibold text-[#0B3B5C]">{d.canonical || s}</span>
                  <span className="block text-[10px] text-[#94a3b8]">/drivers/{s}</span>
                </span>
                {d._starter && (
                  <span className="text-[9px] uppercase tracking-widest font-black text-[#D4A94A]">starter</span>
                )}
              </button>
            );
          })}
        </div>

        <div>
          {loading && <div className="text-sm text-[#64748B]">Loading…</div>}
          {!loading && current && (
            <DriverEditor slug={active} profile={current} onSaved={load} />
          )}
        </div>
      </div>
    </div>
  );
}

function DriverEditor({ slug, profile, onSaved }) {
  const [form, setForm] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setForm(profile); }, [profile]);

  const headshotSrc = form.headshot_url
    ? (form.headshot_url.startsWith("http") ? form.headshot_url : `${process.env.REACT_APP_BACKEND_URL}${form.headshot_url}`)
    : "";

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/admin/drivers/${slug}/upload-headshot`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({ ...f, headshot_url: data.headshot_url }));
      toast.success("Headshot uploaded");
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        canonical: form.canonical || slug,
        tagline: form.tagline || "",
        bio: form.bio || "",
        specialties: Array.isArray(form.specialties) ? form.specialties : (form.specialties || "").split("\n").map((s) => s.trim()).filter(Boolean),
        headshot_url: form.headshot_url || "",
        years_experience: Number(form.years_experience || 0),
        languages: Array.isArray(form.languages) ? form.languages : (form.languages || "").split(",").map((s) => s.trim()).filter(Boolean),
      };
      await api.put(`/admin/drivers/${slug}`, payload);
      toast.success("Saved");
      onSaved?.();
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-2xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-center overflow-hidden shrink-0" data-testid={`driver-editor-headshot-${slug}`}>
          {headshotSrc ? (
            <img src={headshotSrc} alt={form.canonical} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-[#94a3b8] text-center px-2">No headshot yet</span>
          )}
        </div>
        <div className="flex-1">
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-full bg-[#0B3B5C] text-white text-xs font-bold px-4 py-2 hover:bg-[#132a4a]">
            <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : "Upload headshot"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={upload}
              disabled={uploading}
              className="hidden"
              data-testid={`driver-headshot-upload-${slug}`}
            />
          </label>
          <div className="text-[10px] text-[#94a3b8] mt-1.5">
            Auto-cropped to a 512×512 square. Real faces convert ~2× better than stock photos.
          </div>
        </div>
      </div>

      <Field label="Display name" testid={`driver-name-${slug}`}>
        <input
          value={form.canonical || ""}
          onChange={(e) => setForm({ ...form, canonical: e.target.value })}
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D4A94A]"
        />
      </Field>

      <Field label="Tagline (1 sentence)" testid={`driver-tagline-${slug}`}>
        <input
          value={form.tagline || ""}
          onChange={(e) => setForm({ ...form, tagline: e.target.value })}
          placeholder="e.g. The reason 4 out of 5 Google reviews mention his name."
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D4A94A]"
        />
      </Field>

      <Field label="Bio (3-4 sentences)" testid={`driver-bio-${slug}`}>
        <textarea
          value={form.bio || ""}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          rows={4}
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D4A94A] leading-relaxed"
        />
      </Field>

      <Field label="Specialties (one per line)" testid={`driver-specialties-${slug}`}>
        <textarea
          value={Array.isArray(form.specialties) ? form.specialties.join("\n") : (form.specialties || "")}
          onChange={(e) => setForm({ ...form, specialties: e.target.value })}
          rows={3}
          placeholder={"Airport transfers\nCruise-port meet-and-greet\nHistorical loop"}
          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D4A94A]"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Years experience" testid={`driver-years-${slug}`}>
          <input
            type="number"
            value={form.years_experience || 0}
            onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
            min={0} max={60}
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D4A94A]"
          />
        </Field>
        <Field label="Languages (comma-separated)" testid={`driver-languages-${slug}`}>
          <input
            value={Array.isArray(form.languages) ? form.languages.join(", ") : (form.languages || "")}
            onChange={(e) => setForm({ ...form, languages: e.target.value })}
            placeholder="English, Bahamian Creole"
            className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#D4A94A]"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          data-testid={`driver-save-${slug}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#059669] text-white text-sm font-bold px-5 py-2.5 hover:bg-[#047857] disabled:opacity-40"
        >
          <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
        </button>
        <a
          href={`/drivers/${slug}`}
          target="_blank"
          rel="noreferrer"
          data-testid={`driver-preview-${slug}`}
          className="text-xs text-[#0B3B5C] hover:text-[#D4A94A] underline font-semibold"
        >
          Preview /drivers/{slug} →
        </a>
      </div>
    </div>
  );
}

function Field({ label, testid, children }) {
  return (
    <label className="block" data-testid={testid}>
      <span className="block text-[10px] uppercase tracking-widest text-[#64748B] mb-1 font-black">{label}</span>
      {children}
    </label>
  );
}
