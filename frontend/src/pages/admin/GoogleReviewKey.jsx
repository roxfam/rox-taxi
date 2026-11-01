import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";

export default function GoogleReviewKey({ cfg, setCfg }) {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const saved = cfg.google_places_server_key_set;

  const saveKey = async () => {
    const key = (cfg.google_places_server_key || "").trim();
    if (!key) { toast.error("Paste the key first"); return; }
    setBusy("save");
    try {
      const { data } = await api.put("/admin/site-config", { google_places_server_key: key });
      setCfg((c) => ({ ...c, google_places_server_key: "", google_places_server_key_set: data.google_places_server_key_set }));
      toast.success("Google review key saved");
      await test();
    } catch { toast.error("Save failed"); }
    finally { setBusy(""); }
  };

  const test = async () => {
    setBusy("test");
    try {
      const { data } = await api.post("/admin/reviews/test-google-key", {});
      setResult(data);
      if (data.ok) await api.post("/admin/reviews/sync-google-now", {});
    } catch { setResult({ ok: false, error: "Test failed" }); }
    finally { setBusy(""); }
  };

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4" data-testid="google-review-key-box">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#0B3B5C]">
        <KeyRound className="w-4 h-4" /> Google review key
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${saved ? "bg-[#059669]/10 text-[#059669]" : "bg-[#F1F5F9] text-[#94a3b8]"}`} data-testid="google-review-key-status">
          {saved ? "Saved" : "Not saved"}
        </span>
      </div>
      <input
        type="password"
        autoComplete="off"
        value={cfg.google_places_server_key || ""}
        onChange={(e) => setCfg({ ...cfg, google_places_server_key: e.target.value })}
        placeholder={saved ? "•••••••• saved — paste a new key to replace it" : "Paste your Google key (starts with AIza…)"}
        className="mt-2 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
        data-testid="google-review-key-input"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={saveKey} disabled={!!busy} data-testid="google-review-key-save"
          className="text-xs font-bold px-4 py-2 rounded-full bg-[#0B3B5C] text-white hover:bg-[#082a42] disabled:opacity-60 transition-colors">
          {busy === "save" ? "Saving…" : "Save key"}
        </button>
        <button type="button" onClick={test} disabled={!!busy} data-testid="google-review-key-test"
          className="text-xs font-bold px-4 py-2 rounded-full border border-[#0B3B5C] text-[#0B3B5C] hover:bg-[#0B3B5C]/5 disabled:opacity-60 transition-colors">
          {busy === "test" ? "Checking Google…" : "Test & sync now"}
        </button>
      </div>
      {result && (
        <div className={`mt-3 text-xs flex items-start gap-1.5 ${result.ok ? "text-[#059669]" : "text-[#DC2626]"}`} data-testid="google-review-key-result">
          {result.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>
            {result.ok
              ? `Working! Google has ${result.total_on_google} reviews. Newest: ${(result.newest || []).join(", ")}. Syncing now — check the Reviews tab in a minute.`
              : result.error}
          </span>
        </div>
      )}
      <div className="mt-2 text-[10.5px] text-[#94a3b8] leading-relaxed">
        In Google Cloud, set the key's Application restrictions to None and API restrictions to Places API + Places API (New). The key is stored on the server and never shown on the website.
      </div>
    </div>
  );
}
