import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings, Upload, FolderOpen, Calendar, Trash2, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { F, Toggle } from "./shared";
import ImagePickerModal from "./ImagePickerModal";

// Central site-wide configuration — brand logo, social links, Zelle details,
// contact phone, and notification (email/SMS) toggles.
export default function SiteConfigPanel() {
  const [cfg, setCfg] = useState({ facebook_url: "", zelle_email: "", zelle_phone: "", phone: "", logo_url: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickingLogo, setPickingLogo] = useState(false);

  useEffect(() => { api.get("/site-config").then((r) => setCfg((c) => ({ ...c, ...r.data }))); /* eslint-disable-next-line */ }, []);

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
      // Land in the shared photo library so the logo is reusable elsewhere.
      const { data } = await api.post("/admin/images", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const url = data.url;
      setCfg((c) => ({ ...c, logo_url: url }));
      await api.put("/admin/site-config", { logo_url: url });
      toast.success("Logo uploaded + saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  };

  const pickLogoFromLibrary = async (url) => {
    setCfg((c) => ({ ...c, logo_url: url }));
    setPickingLogo(false);
    try {
      await api.put("/admin/site-config", { logo_url: url });
      toast.success("Logo linked from library");
    } catch { toast.error("Save failed — click Save to retry"); }
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
            <div className="flex flex-wrap gap-2">
              <label className={`inline-flex items-center gap-1.5 rounded-md bg-[#0B3B5C] text-white px-4 py-2 text-sm cursor-pointer hover:bg-[#0a2f4a] ${uploading ? "opacity-60" : ""}`}>
                <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : "Upload new"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={uploadLogo} className="hidden" data-testid="logo-upload-input" disabled={uploading} />
              </label>
              <button
                type="button"
                onClick={() => setPickingLogo(true)}
                data-testid="logo-pick-btn"
                className="inline-flex items-center gap-1.5 rounded-md border border-[#0B3B5C] text-[#0B3B5C] hover:bg-[#0B3B5C] hover:text-white px-4 py-2 text-sm transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" /> Pick from library
              </button>
            </div>
            <div className="text-xs text-[#94a3b8] mt-2">PNG, JPG, WEBP or SVG · ≤ 8MB. Uploads land in your shared photo library.</div>
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

      {pickingLogo && (
        <ImagePickerModal
          onClose={() => setPickingLogo(false)}
          onPick={pickLogoFromLibrary}
        />
      )}

      <div className="space-y-3">
        <F l="Facebook page URL" v={cfg.facebook_url || ""} on={(v) => setCfg({ ...cfg, facebook_url: v })} testid="site-fb" />
        <F l="Messenger URL (auto-derived from Facebook — override if page slug differs)" v={cfg.messenger_url || ""} on={(v) => setCfg({ ...cfg, messenger_url: v })} testid="site-messenger" />
        <F l="Google reviews URL (goo.gl/maps/... or Google Maps link)" v={cfg.google_reviews_url || ""} on={(v) => setCfg({ ...cfg, google_reviews_url: v })} testid="site-google-reviews" />
        <F l="Zelle email" v={cfg.zelle_email || ""} on={(v) => setCfg({ ...cfg, zelle_email: v })} testid="site-zelle-email" />
        <F l="Zelle phone" v={cfg.zelle_phone || ""} on={(v) => setCfg({ ...cfg, zelle_phone: v })} testid="site-zelle-phone" />
        <F l="Contact phone" v={cfg.phone || ""} on={(v) => setCfg({ ...cfg, phone: v })} testid="site-phone" />

        {/* ─── Search-engine verification (SEO) ───
            Paste each console's meta-tag content here to prove you own the
            domain. Injected into <head> on every page for search engines
            to pick up on the next crawl. Blank = tag omitted. */}
        <div className="pt-4 mt-4 border-t border-[#E2E8F0]">
          <div className="text-xs uppercase tracking-widest text-[#64748B] font-semibold mb-1">Search engine verification</div>
          <div className="text-[11px] text-[#94a3b8] mb-3 leading-relaxed">
            Paste the <code className="bg-[#F1F5F9] px-1 py-0.5 rounded">content=""</code> value from each webmaster console (Google, Bing, Yandex, Pinterest, Facebook, Norton). We inject them as <code className="bg-[#F1F5F9] px-1 py-0.5 rounded">&lt;meta&gt;</code> tags so each search engine can verify domain ownership.
          </div>
          <div className="space-y-3">
            <F l="Google Search Console verification code" v={cfg.google_verification || ""} on={(v) => setCfg({ ...cfg, google_verification: v })} testid="seo-google-verification" />
            <F l="Bing Webmaster verification code (msvalidate.01)" v={cfg.bing_verification || ""} on={(v) => setCfg({ ...cfg, bing_verification: v })} testid="seo-bing-verification" />
            <F l="Yandex Webmaster verification code" v={cfg.yandex_verification || ""} on={(v) => setCfg({ ...cfg, yandex_verification: v })} testid="seo-yandex-verification" />
            <F l="Pinterest domain verification code" v={cfg.pinterest_verification || ""} on={(v) => setCfg({ ...cfg, pinterest_verification: v })} testid="seo-pinterest-verification" />
            <F l="Facebook domain verification code" v={cfg.facebook_verification || ""} on={(v) => setCfg({ ...cfg, facebook_verification: v })} testid="seo-facebook-verification" />
            <F l="Norton Safe Web verification code" v={cfg.norton_verification || ""} on={(v) => setCfg({ ...cfg, norton_verification: v })} testid="seo-norton-verification" />
          </div>

          <div className="mt-4 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] p-3">
            <div className="text-[11px] font-semibold text-[#166534] uppercase tracking-widest mb-1">Instant re-crawl</div>
            <div className="text-xs text-[#166534]/80 leading-relaxed mb-2">
              Push your sitemap to Bing + Yandex + Seznam right now (IndexNow). Handy after a big price update, new tour, or car addition. Google auto-discovers via sitemap.xml — no push needed.
            </div>
            <button
              type="button"
              data-testid="indexnow-ping-btn"
              onClick={async () => {
                try {
                  const r = await api.post("/admin/seo/indexnow-ping", {});
                  if (r.data?.ok) toast.success(`Search engines pinged (${r.data.count} URLs).`);
                  else toast.error("Ping failed. Try again in a minute.");
                } catch { toast.error("Ping failed."); }
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0B3B5C] text-white text-xs font-bold px-4 py-2 hover:bg-[#122C4B]"
            >
              Ping Bing + Yandex now
            </button>
          </div>
        </div>

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

        <div className="pt-4 mt-4 border-t border-[#E2E8F0]">
          <div className="text-xs uppercase tracking-widest text-[#64748B] font-semibold mb-3">Taxi add-on (tours)</div>
          <div className="space-y-2">
            <Toggle
              label="Enable optional taxi add-on at checkout"
              hint="Master switch. When OFF, no tour offers the round-trip taxi upsell — even if enabled per-tour. When ON, each tour's own toggle controls whether the add-on appears."
              checked={cfg.taxi_addon_master_enabled !== false}
              onChange={(v) => setCfg({ ...cfg, taxi_addon_master_enabled: v })}
              testid="taxi-addon-master-toggle"
            />
          </div>
        </div>

        <BlackoutReasonPresets cfg={cfg} setCfg={setCfg} />

        <button onClick={save} disabled={saving} data-testid="site-save" className="mt-2 rounded-md bg-[#0B3B5C] text-white px-4 py-2 text-sm">Save</button>
      </div>

      <BlackoutDatesSection />
    </div>
  );
}


// Admin-editable list of common blackout reasons. Surfaces as a
// `<datalist>` on the rental Edit-modal inline reason input so staff can
// pick "Hurricane" from the dropdown instead of retyping. Falls back to a
// sensible default list if empty. Save happens via the parent form's Save
// button — same as every other field on this panel.
function BlackoutReasonPresets({ cfg, setCfg }) {
  const defaults = ["Hurricane", "Maintenance", "Insurance renewal", "Sold", "Detailing", "Rented offline"];
  const list = Array.isArray(cfg.blackout_reason_presets) ? cfg.blackout_reason_presets : defaults;
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) { toast.error("Already in the list"); return; }
    setCfg({ ...cfg, blackout_reason_presets: [...list, v] });
    setDraft("");
  };
  const remove = (v) => setCfg({ ...cfg, blackout_reason_presets: list.filter((x) => x !== v) });
  const reset = () => setCfg({ ...cfg, blackout_reason_presets: defaults });
  return (
    <div className="pt-4 mt-4 border-t border-[#E2E8F0]" data-testid="blackout-reason-presets">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-widest text-[#64748B] font-semibold">Blackout reason presets</div>
        <button type="button" onClick={reset} className="text-[10px] text-[#94a3b8] hover:text-[#0B3B5C] underline decoration-dotted" data-testid="reset-presets-btn">Reset to defaults</button>
      </div>
      <div className="text-[11px] text-[#94a3b8] mb-3 leading-relaxed">
        Surfaces as autocomplete suggestions on the rental Edit-modal reason input. Staff can still type anything.
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3" data-testid="preset-chip-list">
        {list.length === 0 ? (
          <span className="text-xs text-[#94a3b8]">No presets — click "Reset to defaults" or add your own below.</span>
        ) : list.map((p) => (
          <span key={p} className="inline-flex items-center gap-1 rounded-full bg-[#0B3B5C]/8 text-[#0B3B5C] text-xs font-semibold px-2.5 py-1" data-testid={`preset-chip-${p}`}>
            {p}
            <button type="button" onClick={() => remove(p)} className="ml-0.5 opacity-60 hover:opacity-100" data-testid={`preset-remove-${p}`} title={`Remove "${p}"`}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="e.g., Insurance renewal"
          data-testid="preset-add-input"
          className="flex-1 rounded-md border border-[#E2E8F0] px-3 py-1.5 text-sm focus:border-[#D4A94A] focus:outline-none"
        />
        <button type="button" onClick={add} data-testid="preset-add-btn" className="inline-flex items-center gap-1 rounded-md bg-[#0B3B5C] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[#132a4a]">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
    </div>
  );
}

function BlackoutDatesSection() {
  const [dates, setDates] = useState([]);
  const [newDate, setNewDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/blackout-dates");
      setDates(data.blackout_dates || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const persist = async (next) => {
    setSaving(true);
    try {
      const { data } = await api.post("/admin/blackout-dates", { dates: next });
      setDates(data.blackout_dates || []);
      toast.success("Blackout dates saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const addDate = () => {
    if (!newDate) return;
    if (dates.includes(newDate)) { toast.info("Already in list"); return; }
    persist([...dates, newDate].sort());
    setNewDate("");
  };

  const removeDate = (d) => persist(dates.filter((x) => x !== d));

  return (
    <div className="max-w-3xl bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-[0_20px_50px_rgba(11,25,44,0.10)] p-6 lg:p-8 mt-6" data-testid="admin-blackout-panel">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-4 h-4 text-[#D4A94A]" />
        <h2 className="serif text-xl text-[#0B3B5C] font-bold">Blackout dates</h2>
      </div>
      <p className="text-xs text-[#64748B] mb-5 leading-relaxed">
        Mark days you're offline — holidays, family events, sick days. Customers won't be able to book pickups on these dates.
        Saturday closures are handled separately (already blocked for pickup, allowed for drop-off).
      </p>

      <div className="flex items-end gap-3 mb-6">
        <label className="block flex-1 max-w-xs">
          <span className="text-[10px] tracking-[0.28em] uppercase text-[#64748B] font-black mb-1.5 block">Add a date</span>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            data-testid="admin-blackout-date-input"
            min={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-xl border border-[#EFE7D5] bg-white px-3.5 py-2.5 text-sm text-[#0B3B5C] focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20"
          />
        </label>
        <button
          type="button"
          onClick={addDate}
          disabled={!newDate || saving}
          data-testid="admin-blackout-add-btn"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#D4A94A] hover:bg-[#c69938] text-white px-4 py-2.5 text-xs font-black uppercase tracking-widest disabled:opacity-50 shadow-[0_8px_20px_rgba(212,169,74,0.35)]"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-[#94a3b8]">Loading…</div>
      ) : dates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E2E8F0] p-6 text-center text-sm text-[#94a3b8]" data-testid="admin-blackout-empty">
          No blackout dates set. All future days are open for booking.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="admin-blackout-list">
          {dates.map((d) => (
            <li key={d} className="flex items-center justify-between gap-3 rounded-xl border border-[#EFE7D5] bg-white px-4 py-2.5" data-testid={`admin-blackout-item-${d}`}>
              <div>
                <div className="mono text-sm text-[#0B3B5C] font-semibold">{d}</div>
                <div className="text-[10px] text-[#94a3b8]">{new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</div>
              </div>
              <button
                type="button"
                onClick={() => removeDate(d)}
                disabled={saving}
                data-testid={`admin-blackout-remove-${d}`}
                className="inline-flex items-center gap-1 rounded-full border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#B91C1C] hover:text-white text-[#B91C1C] text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-50"
                title={`Remove ${d}`}
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
