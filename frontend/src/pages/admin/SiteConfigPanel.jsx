import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings, Upload, FolderOpen } from "lucide-react";
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
