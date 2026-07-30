import { useState } from "react";
import { API } from "../lib/api";
import { IdCard, Trash2, RefreshCw, X, Upload, Loader2, Camera, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * License-wallet card shown on the My Bookings page.
 * - Highlights expiry state (green → amber ≤30 days → red expired).
 * - Rotate button opens a modal for the guest to upload fresh photos and
 *   optional metadata, wired to POST /api/my/license-wallet/rotate.
 */
export default function WalletCard({ wallet, onClear, onRotated, busy }) {
  const [rotating, setRotating] = useState(false);
  const tier = wallet.expired
    ? { bg: "from-[#FEF2F2] to-white", brd: "border-[#FCA5A5]", accent: "bg-[#B91C1C]", label: "Expired", labelCls: "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]" }
    : wallet.expires_soon
    ? { bg: "from-[#FFFBEB] to-white", brd: "border-[#FCD34D]", accent: "bg-[#B45309]", label: `${wallet.days_to_expiry ?? "?"}d to expiry`, labelCls: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]" }
    : { bg: "from-[#EEF2FF] via-white to-[#F5F3FF]", brd: "border-[#C7D2FE]", accent: "bg-[#3730A3]", label: "Ready to reuse", labelCls: "bg-[#EEF2FF] text-[#3730A3] border-[#C7D2FE]" };

  return (
    <>
      <div className={`mt-4 rounded-2xl border ${tier.brd} bg-gradient-to-br ${tier.bg} p-5 flex flex-col sm:flex-row items-start gap-4`} data-testid="wallet-card">
        <div className={`w-12 h-12 rounded-2xl ${tier.accent} text-white flex items-center justify-center flex-shrink-0`}>
          <IdCard className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[10px] tracking-[0.22em] uppercase text-[#3730A3] font-semibold">Saved license · Guest wallet</div>
            <span data-testid="wallet-status-chip" className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border ${tier.labelCls}`}>{tier.label}</span>
          </div>
          <div className="text-sm font-semibold text-[#312E81] mt-0.5">
            {wallet.name_on_license || "On file"} <span className="text-[#4C4B95] font-normal">· {wallet.state_or_country || "License"}</span>
          </div>
          <div className="text-xs text-[#4C4B95]">
            {wallet.license_number_masked && <>Number <span className="mono">{wallet.license_number_masked}</span> · </>}
            {wallet.expiry_date && <>Expires {wallet.expiry_date} · </>}
            Approved {wallet.approved_at?.slice(0, 10)}
          </div>
          {wallet.expires_soon && !wallet.expired && (
            <div className="text-xs text-[#B45309] mt-2 inline-flex items-center gap-1" data-testid="wallet-expires-soon">
              <AlertTriangle className="w-3 h-3" /> Expires in {wallet.days_to_expiry ?? "?"} day{wallet.days_to_expiry === 1 ? "" : "s"} — rotate before your next Rox trip.
            </div>
          )}
          {wallet.expired && (
            <div className="text-xs text-[#B91C1C] mt-2 inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Your saved license expired — upload a fresh one to reuse on your next booking.
            </div>
          )}
          {!wallet.expires_soon && !wallet.expired && (
            <div className="text-xs text-[#64748B] mt-2">Your next Rox rental can reuse this license — one tap, no re-upload.</div>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end">
          {wallet.front_url && (
            <a href={wallet.front_url} target="_blank" rel="noreferrer" data-testid="wallet-view-front" className="text-xs text-[#3730A3] font-semibold hover:underline">
              View saved photo →
            </a>
          )}
          <button
            onClick={() => setRotating(true)}
            data-testid="wallet-rotate-btn"
            className="inline-flex items-center gap-1 rounded-full bg-[#3730A3] hover:bg-[#312E81] text-white text-xs font-semibold px-3 py-1.5"
          >
            <RefreshCw className="w-3 h-3" /> Rotate license
          </button>
          <button
            onClick={onClear}
            disabled={busy}
            data-testid="wallet-clear"
            className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-white text-[#B91C1C] text-xs font-semibold px-3 py-1.5 hover:bg-[#FEF2F2]"
          >
            <Trash2 className="w-3 h-3" /> {busy ? "Removing…" : "Forget it"}
          </button>
        </div>
      </div>

      {rotating && <RotateModal onClose={() => setRotating(false)} onDone={() => { setRotating(false); onRotated?.(); }} wallet={wallet} />}
    </>
  );
}

function RotateModal({ onClose, onDone, wallet }) {
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [name, setName] = useState(wallet.name_on_license || "");
  const [num, setNum] = useState("");
  const [exp, setExp] = useState(wallet.expiry_date || "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!front && !back && !selfie) { toast.error("Add at least one photo."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      if (front) fd.append("front", front);
      if (back) fd.append("back", back);
      if (selfie) fd.append("selfie", selfie);
      if (name) fd.append("name_on_license", name);
      if (num) fd.append("license_number", num);
      if (exp) fd.append("expiry_date", exp);
      const r = await fetch(`${API}/my/license-wallet/rotate`, { method: "POST", body: fd, credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      toast.success("License rotated — we'll re-verify at your next booking.");
      onDone();
    } catch (e) {
      toast.error(e.message || "Rotation failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/45 flex items-center justify-center p-4" data-testid="wallet-rotate-modal">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#EAE4D2] bg-[#FAF7EF]">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#3730A3]" />
            <div>
              <div className="font-semibold text-[#0B3B5C]">Rotate saved license</div>
              <div className="text-[11px] text-[#64748B]">Upload fresh photos to update your Rox wallet.</div>
            </div>
          </div>
          <button onClick={onClose} data-testid="wallet-rotate-close" className="w-8 h-8 rounded-full text-[#64748B] hover:bg-[#F1F5F9] flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <MiniFile label="Front of license" file={front} onChange={setFront} testid="rotate-front" />
          <MiniFile label="Back of license"  file={back}  onChange={setBack}  testid="rotate-back" />
          <MiniFile label="Selfie (recommended)" file={selfie} onChange={setSelfie} testid="rotate-selfie" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
            <MiniInput label="Name"   value={name} onChange={setName} testid="rotate-name" />
            <MiniInput label="Number" value={num}  onChange={setNum}  testid="rotate-number" />
            <MiniInput label="Expiry (YYYY-MM-DD)" value={exp} onChange={setExp} testid="rotate-expiry" />
          </div>
        </div>
        <div className="px-6 py-4 flex justify-end gap-2 bg-[#FAF7EF] border-t border-[#EAE4D2]">
          <button onClick={onClose} data-testid="wallet-rotate-cancel" className="rounded-full border border-[#E2E8F0] px-4 py-2 text-sm text-[#0B3B5C]">Cancel</button>
          <button
            onClick={submit}
            disabled={busy || (!front && !back && !selfie)}
            data-testid="wallet-rotate-submit"
            className="rounded-full bg-[#3730A3] hover:bg-[#312E81] disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 inline-flex items-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {busy ? "Rotating…" : "Rotate license"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniFile({ label, file, onChange, testid }) {
  return (
    <label className="block">
      <div className="text-[10px] tracking-[0.22em] uppercase text-[#94856A] font-semibold flex items-center gap-1.5">
        <Camera className="w-3 h-3 text-[#D4A94A]" /> {label}
      </div>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        data-testid={testid}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="mt-1 block w-full text-sm text-[#0B3B5C] file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-[#0B3B5C] file:text-white file:text-xs file:font-semibold hover:file:bg-[#0B192C] cursor-pointer"
      />
      {file && <div className="text-[11px] text-[#059669] mt-1 inline-flex items-center gap-1"><Check className="w-3 h-3" /> {file.name}</div>}
    </label>
  );
}

function MiniInput({ label, value, onChange, testid }) {
  return (
    <label className="block">
      <div className="text-[10px] tracking-[0.22em] uppercase text-[#94856A] font-semibold">{label}</div>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="mt-1 w-full rounded-lg border border-[#E2DBC5] bg-white px-2.5 py-2 text-sm text-[#0B3B5C] focus:border-[#D4A94A] focus:outline-none"
      />
    </label>
  );
}
