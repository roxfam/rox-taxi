import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Key, Eye, EyeOff, Save, X, CheckCircle2, AlertCircle, Facebook, RefreshCw, Download, Copy } from "lucide-react";
import { api } from "../../lib/api";

// ---- Group meta (icons + subtitles) ------------------------------------
const GROUP_META = {
  Facebook:       { subtitle: "Auto-post approved guest photos + track ad conversions with the Meta Pixel." },
  "Twilio SMS":   { subtitle: "Booking confirmations + owner alerts via SMS." },
  Email:          { subtitle: "Booking confirmations. SendGrid first, SMTP fallback." },
  Stripe:         { subtitle: "Credit-card checkout + auto-refund of deposits." },
  PayPal:         { subtitle: "Alternate checkout + auto-refund of deposits." },
  AviationStack:  { subtitle: "Live flight tracking on airport pickups." },
  "Emergent LLM": { subtitle: "Powers the Roxi live-chat concierge (Claude / GPT / Gemini)." },
  "Web Push":     { subtitle: "VAPID keys for the admin browser push notifications." },
  "Google OAuth": { subtitle: "Only needed if you swap out Emergent-managed Google sign-in." },
};

const SOURCE_META = {
  db:    { label: "DB Override", tone: "bg-[#059669]/10 text-[#059669]" },
  env:   { label: ".env",         tone: "bg-[#D4A94A]/12 text-[#A88235]" },
  unset: { label: "Not Set",      tone: "bg-[#E86A3C]/10 text-[#E86A3C]" },
};

// Group tokens by their `group` key preserving registry order.
function groupBy(tokens) {
  const out = new Map();
  for (const t of tokens) {
    if (!out.has(t.group)) out.set(t.group, []);
    out.get(t.group).push(t);
  }
  return out;
}

export default function TokensPanel() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({}); // key -> new value being typed
  const [saving, setSaving] = useState({}); // key -> bool
  const [reveal, setReveal] = useState({}); // key -> bool (show plaintext of pending draft)
  const [fbStatus, setFbStatus] = useState(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/tokens");
      setTokens(data.tokens || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load tokens");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (key) => {
    const value = drafts[key] ?? "";
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await api.put("/admin/tokens", { key, value });
      toast.success(value ? `${key} saved` : `${key} override cleared`);
      setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving((s) => ({ ...s, [key]: false })); }
  };

  const clearOverride = async (key) => {
    if (!window.confirm(`Clear the DB override for ${key}? The .env value (if any) will take over.`)) return;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await api.delete(`/admin/tokens/${key}`);
      toast.success(`${key} override cleared`);
      setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Clear failed");
    } finally { setSaving((s) => ({ ...s, [key]: false })); }
  };

  const probeFacebook = async () => {
    setFbLoading(true);
    try {
      const { data } = await api.get("/admin/tokens/facebook/status");
      setFbStatus(data);
      if (data.valid) toast.success(`Facebook OK — connected to "${data.page?.name}"`);
      else if (data.configured === false) toast.error("Facebook not configured — set FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN.");
      else toast.error(`Facebook check failed: ${data.error || "unknown"}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Probe failed");
    } finally { setFbLoading(false); }
  };

  // Copy the current effective config to clipboard as a .env text block.
  // `reveal=true` echoes plaintext for handoff/migration (double-confirm),
  // default masks sensitive values.
  const exportEnv = async ({ reveal = false, download = false } = {}) => {
    if (reveal && !window.confirm(
      "Export PLAINTEXT secrets?\n\n" +
      "All API keys, tokens and passwords will be included in cleartext. " +
      "Only do this if you're handing off the site or migrating hosts, and " +
      "share the resulting file via a secure channel (never email or Slack)."
    )) return;
    setExporting(true);
    try {
      const { data } = await api.get(`/admin/tokens/env-snapshot?reveal=${reveal ? "true" : "false"}`);
      const text = data.text || "";
      if (download) {
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rox-taxi-env${reveal ? "-plaintext" : "-masked"}-${new Date().toISOString().slice(0, 10)}.env`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success(`.env snapshot downloaded${reveal ? " (plaintext)" : " (masked)"}`);
      } else {
        try {
          await navigator.clipboard.writeText(text);
          toast.success(`Copied ${text.split("\n").length} lines${reveal ? " (plaintext)" : " (masked)"}`);
        } catch {
          // Clipboard blocked → fall back to a prompt.
          window.prompt("Copy manually (Ctrl-C / ⌘-C):", text);
        }
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Snapshot export failed");
    } finally { setExporting(false); }
  };

  const grouped = groupBy(tokens);

  return (
    <div className="space-y-6 max-w-4xl" data-testid="tokens-panel">
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/12 flex items-center justify-center">
              <Key className="w-5 h-5 text-[#D4A94A]" />
            </div>
            <div>
              <h3 className="serif text-xl text-[#0B3B5C]">API Tokens & Secrets</h3>
              <p className="text-xs text-[#64748B] mt-0.5">Rotate live — no restart needed. DB values override the .env file at read time.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => exportEnv({ reveal: false, download: false })}
              disabled={exporting}
              className="text-xs inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] px-3 py-1.5 hover:border-[#0B3B5C] text-[#0B3B5C] disabled:opacity-60"
              data-testid="tokens-copy-env-masked"
              title="Copy the current effective config to clipboard (sensitive values masked)"
            >
              <Copy className="w-3.5 h-3.5" /> {exporting ? "Working…" : "Copy .env (masked)"}
            </button>
            <button
              onClick={() => exportEnv({ reveal: true, download: true })}
              disabled={exporting}
              className="text-xs inline-flex items-center gap-1.5 rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white px-3 py-1.5 disabled:opacity-60"
              data-testid="tokens-download-env-plaintext"
              title="Download a plaintext .env for handoff / migration"
            >
              <Download className="w-3.5 h-3.5" /> Download plaintext
            </button>
            <button
              onClick={load}
              className="text-xs inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] px-3 py-1.5 hover:border-[#0B3B5C] text-[#0B3B5C]"
              data-testid="tokens-refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {loading && tokens.length === 0 && (
        <div className="text-sm text-[#94a3b8] px-1">Loading token registry…</div>
      )}

      {[...grouped.entries()].map(([group, items]) => (
        <div key={group} className="bg-white rounded-2xl border border-[#E2E8F0] p-6" data-testid={`token-group-${group.toLowerCase().replace(/\s+/g, "-")}`}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h4 className="font-semibold text-[#0B3B5C] text-base">{group}</h4>
              {GROUP_META[group]?.subtitle && (
                <p className="text-xs text-[#64748B] mt-0.5">{GROUP_META[group].subtitle}</p>
              )}
            </div>
            {group === "Facebook" && (
              <button
                onClick={probeFacebook}
                disabled={fbLoading}
                className="text-xs inline-flex items-center gap-1.5 rounded-full bg-[#1877F2] hover:bg-[#0f5cc7] text-white px-3 py-1.5 disabled:opacity-60"
                data-testid="tokens-fb-probe"
                title="Ping Facebook Graph API with the current token"
              >
                <Facebook className="w-3.5 h-3.5" /> {fbLoading ? "Checking…" : "Test connection"}
              </button>
            )}
          </div>

          {group === "Facebook" && fbStatus && (
            <div
              className={`mb-4 rounded-xl border p-3 text-xs ${fbStatus.valid ? "border-[#059669]/30 bg-[#059669]/6 text-[#059669]" : "border-[#DC2626]/30 bg-[#DC2626]/6 text-[#DC2626]"}`}
              data-testid="tokens-fb-status"
            >
              {fbStatus.valid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 inline mr-1" />
                  Connected to <strong>{fbStatus.page?.name}</strong> · {fbStatus.page?.fan_count?.toLocaleString?.() || 0} fans · Auto-post {fbStatus.enabled ? "ON" : "OFF"}
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  {fbStatus.error || "Not configured — set FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN below."}
                </>
              )}
            </div>
          )}

          <div className="space-y-4">
            {items.map((t) => {
              const draftVal = drafts[t.key];
              const isDraft = draftVal !== undefined;
              const revealed = reveal[t.key];
              const src = SOURCE_META[t.source] || SOURCE_META.unset;
              const isSaving = !!saving[t.key];
              return (
                <div key={t.key} className="rounded-xl border border-[#E2E8F0] p-4" data-testid={`token-row-${t.key}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="mono text-[13px] font-semibold text-[#0B3B5C]">{t.key}</label>
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${src.tone}`} data-testid={`token-source-${t.key}`}>
                          {src.label}
                        </span>
                        {t.sensitive && (
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#0B3B5C]/8 text-[#0B3B5C]">
                            Sensitive
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#64748B] mt-1">{t.label}</div>
                      {t.help && (
                        <div className="text-[11px] text-[#94a3b8] mt-1 italic">{t.help}</div>
                      )}
                      {t.has_value && !isDraft && (
                        <div className="mt-2 mono text-xs text-[#0B3B5C]/70" data-testid={`token-preview-${t.key}`}>
                          {t.sensitive ? t.masked : t.value}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.db_override && !isDraft && (
                        <button
                          onClick={() => clearOverride(t.key)}
                          disabled={isSaving}
                          className="text-[11px] inline-flex items-center gap-1 rounded-full border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#B91C1C] hover:text-white text-[#B91C1C] px-3 py-1.5 transition-colors disabled:opacity-60"
                          data-testid={`token-clear-${t.key}`}
                          title="Remove the DB override (falls back to .env value)"
                        >
                          <X className="w-3 h-3" /> Clear override
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-stretch gap-2">
                    <div className="relative flex-1">
                      <input
                        type={t.sensitive && !revealed ? "password" : "text"}
                        value={draftVal ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [t.key]: e.target.value }))}
                        placeholder={t.has_value ? (t.sensitive ? "Enter a new value to replace" : t.value || "Enter a value") : "Enter a value"}
                        autoComplete="off"
                        className="w-full mono text-sm rounded-lg border border-[#E2E8F0] px-3 py-2 pr-10 focus:border-[#D4A94A] focus:outline-none"
                        data-testid={`token-input-${t.key}`}
                      />
                      {t.sensitive && (draftVal ?? "").length > 0 && (
                        <button
                          type="button"
                          onClick={() => setReveal((r) => ({ ...r, [t.key]: !r[t.key] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0B3B5C]"
                          data-testid={`token-reveal-${t.key}`}
                          title={revealed ? "Hide" : "Show"}
                        >
                          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => save(t.key)}
                      disabled={!isDraft || isSaving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B3B5C] hover:bg-[#132a4a] text-white px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                      data-testid={`token-save-${t.key}`}
                    >
                      <Save className="w-3.5 h-3.5" /> {isSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="text-[11px] text-[#94a3b8] leading-relaxed max-w-3xl">
        <strong className="text-[#0B3B5C]">How this works.</strong> Values you save here are stored in MongoDB under <code>site_config.secrets</code> and take
        precedence over the same key in <code>backend/.env</code>. Facebook, Twilio and Email tokens are hot-swappable — no restart needed.
        For Stripe, PayPal, AviationStack and Emergent LLM keys, the backend caches on next call, so restart is only required if you flip a key mid-request.
      </div>
    </div>
  );
}
