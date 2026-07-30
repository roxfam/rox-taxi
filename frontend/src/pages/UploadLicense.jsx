import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Camera, Check, Upload, ShieldCheck, AlertTriangle, Loader2,
  Lock, Eye, Trash2, ArrowRight, IdCard, X, RotateCw,
} from "lucide-react";

/**
 * Elegant, modern driver's-license upload page for car-rental bookings.
 * URL pattern: /upload-license/:bookingId?t=<token>
 *
 * Design language:
 * - Deep navy #0B3B5C · gold #D4A94A · warm cream #FAF7EF · sun-orange CTA
 * - Drop-zone cards with live image previews (front + back side-by-side on ≥ md)
 * - Serif display heads (from global .serif), monospaced booking id
 * - Trust chips (encrypted / private / auto-delete) so guests feel safe
 * - Smooth cross-fade between status states (not_uploaded → pending → approved)
 */
export default function UploadLicense() {
  const { bookingId } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") || "";

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [frontUrl, setFrontUrl] = useState("");
  const [backUrl, setBackUrl] = useState("");
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");

  const API = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    if (!bookingId || !token) { setErr("This upload link is missing its token."); setLoading(false); return; }
    (async () => {
      try {
        const r = await fetch(`${API}/api/bookings/${bookingId}/license/status?t=${encodeURIComponent(token)}`);
        if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
        setStatus(await r.json());
      } catch (e) { setErr(e.message || "Couldn't load your booking."); }
      finally { setLoading(false); }
    })();
  }, [bookingId, token, API]);

  // Local preview object-URLs (revoke on unmount / change).
  useEffect(() => {
    if (!front) { setFrontUrl(""); return; }
    const u = URL.createObjectURL(front); setFrontUrl(u); return () => URL.revokeObjectURL(u);
  }, [front]);
  useEffect(() => {
    if (!back) { setBackUrl(""); return; }
    const u = URL.createObjectURL(back); setBackUrl(u); return () => URL.revokeObjectURL(u);
  }, [back]);

  const submit = async () => {
    if (!front && !back) { toast.error("Add at least the front photo."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("t", token);
      if (front) fd.append("front", front);
      if (back) fd.append("back", back);
      if (name) fd.append("name_on_license", name);
      if (num) fd.append("license_number", num);
      if (exp) fd.append("expiry_date", exp);
      const r = await fetch(`${API}/api/bookings/${bookingId}/license`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
      toast.success("Uploaded — we'll email you the moment it's approved.");
      const r2 = await fetch(`${API}/api/bookings/${bookingId}/license/status?t=${encodeURIComponent(token)}`);
      setStatus(await r2.json());
      setFront(null); setBack(null);
    } catch (e) { toast.error(e.message || "Upload failed"); }
    finally { setBusy(false); }
  };

  if (loading) return <Shell><LoadingState /></Shell>;
  if (err)     return <Shell><ErrorCard message={err} /></Shell>;

  const st = status?.status || "not_uploaded";
  const canSubmit = !busy && (front || back);

  return (
    <Shell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14" data-testid="upload-license-page">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="relative mb-8 sm:mb-10">
          <div className="absolute -inset-x-4 -top-6 h-24 bg-gradient-to-b from-[#D4A94A]/10 to-transparent rounded-3xl -z-10" />
          <div className="inline-flex items-center gap-2 rounded-full bg-white border border-[#E7E1D0] px-3 py-1 text-[11px] tracking-[0.2em] uppercase text-[#0B3B5C]/70 font-semibold mb-4 shadow-sm">
            <IdCard className="w-3.5 h-3.5 text-[#D4A94A]" /> Driver verification
          </div>
          <h1 className="serif text-4xl sm:text-5xl leading-[1.05] text-[#0B3B5C]" data-testid="upload-license-title">
            One last step before your keys, {firstName(status?.customer_name)}.
          </h1>
          <p className="mt-3 text-[15px] text-[#5F6875] max-w-xl">
            Snap the <strong className="text-[#0B3B5C]">front and back</strong> of your driver's license and we'll have you rolling in <strong className="text-[#0B3B5C]">{status?.item_name || "your vehicle"}</strong> on <strong className="text-[#0B3B5C]">{formatDate(status?.booking_date)}</strong>. Takes about 30 seconds.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-[12px] text-[#5F6875]">
            Booking <span className="mono text-[#0B3B5C] bg-[#F1EFE7] px-2 py-0.5 rounded-md">{status?.booking_id}</span>
          </div>
        </div>

        {/* ── Status banner (only when uploaded) ─────────────── */}
        <div className={`transition-all duration-300 ${st === "not_uploaded" ? "hidden" : "block mb-6"}`}>
          <StatusBanner status={st} reason={status?.rejection_reason} at={status?.uploaded_at} />
        </div>

        {/* ── Drop-zone cards ────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DropCard
            side="front"
            label="Front of license"
            hint="Photo, name and expiry visible"
            file={front}
            previewUrl={frontUrl}
            onSelect={setFront}
          />
          <DropCard
            side="back"
            label="Back of license"
            hint="Signature strip / barcode side"
            file={back}
            previewUrl={backUrl}
            onSelect={setBack}
          />
        </div>

        {/* ── Optional metadata ──────────────────────────────── */}
        <details className="mt-6 group" data-testid="license-meta-toggle">
          <summary className="cursor-pointer inline-flex items-center gap-2 text-sm text-[#0B3B5C] font-semibold select-none">
            <span className="w-6 h-6 rounded-full bg-[#F1EFE7] flex items-center justify-center group-open:bg-[#D4A94A] group-open:text-white transition-colors">+</span>
            Add license details (optional — speeds up review)
          </summary>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextField label="Name on license"  value={name} onChange={setName} placeholder="As printed"           testid="license-name" />
            <TextField label="License number"   value={num}  onChange={setNum}  placeholder="e.g. B123456"         testid="license-number" />
            <TextField label="Expiry"           value={exp}  onChange={setExp}  placeholder="YYYY-MM-DD"           testid="license-expiry" />
          </div>
        </details>

        {/* ── Submit ─────────────────────────────────────────── */}
        <button
          onClick={submit}
          disabled={!canSubmit}
          data-testid="license-submit"
          className={`
            mt-8 w-full rounded-2xl px-6 py-4 text-[15px] font-semibold inline-flex items-center justify-center gap-2 shadow-lg transition-all
            ${canSubmit
              ? "bg-[#E86A3C] hover:bg-[#d55a30] text-white shadow-[#E86A3C]/25 hover:shadow-[#E86A3C]/40 hover:-translate-y-0.5"
              : "bg-[#E7E1D0] text-[#94856A] cursor-not-allowed shadow-none"}
          `}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>{busy ? "Uploading securely…" : "Submit for review"}</span>
          {!busy && canSubmit && <ArrowRight className="w-4 h-4 -mr-0.5" />}
        </button>

        {/* ── Trust row ─────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
          <Trust icon={<Lock className="w-3.5 h-3.5" />}       title="Encrypted upload"    body="Files travel over HTTPS." />
          <Trust icon={<Eye className="w-3.5 h-3.5" />}        title="Rox staff only"      body="Never shared with third parties." />
          <Trust icon={<Trash2 className="w-3.5 h-3.5" />}     title="Auto-delete"         body="Removed after your rental." />
        </div>

        <p className="text-[11px] text-[#94a3b8] mt-8 text-center">
          Trouble with the upload? WhatsApp us at <a className="text-[#0B3B5C] font-semibold underline decoration-[#D4A94A] underline-offset-2" href="https://wa.me/12424322587">+1 (242) 432-2587</a>.
        </p>
      </div>
    </Shell>
  );
}

/* ─── Shell ──────────────────────────────────────────────────────── */
function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#FAF7EF] relative overflow-hidden" data-testid="upload-license-shell">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute -top-40 -right-40 w-[420px] h-[420px] rounded-full bg-[radial-gradient(ellipse_at_center,#D4A94A22_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 w-[520px] h-[520px] rounded-full bg-[radial-gradient(ellipse_at_center,#0B3B5C14_0%,transparent_70%)]" />
      <header className="relative bg-white/60 backdrop-blur border-b border-[#EAE4D2]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <img src="/logo-gold.webp" alt="" className="w-9 h-9 object-contain" />
          <div className="leading-tight">
            <div className="font-semibold text-[#0B3B5C]">Rox Taxi Service <span className="text-[#D4A94A]">& Tours</span></div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-[#94856A]">Nassau · Bahamas</div>
          </div>
        </div>
      </header>
      <div className="relative">{children}</div>
    </div>
  );
}

/* ─── Drop-zone card ─────────────────────────────────────────────── */
function GuideFrame({ side }) {
  // Standard ID-1 aspect ratio ≈ 1.585 → we render 4 corner brackets and (front only)
  // subtle placeholder marks so the guest knows where the photo + text should land.
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-0" aria-hidden="true">
      <div className="relative" style={{ width: "80%", aspectRatio: "1.585 / 1" }}>
        {/* Corner brackets */}
        <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#D4A94A]/70 rounded-tl-lg" />
        <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#D4A94A]/70 rounded-tr-lg" />
        <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#D4A94A]/70 rounded-bl-lg" />
        <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#D4A94A]/70 rounded-br-lg" />
        {side === "front" && (
          <>
            {/* Photo placeholder box on the left */}
            <span className="absolute left-[6%] top-[18%] w-[24%] h-[64%] rounded-md border border-dashed border-[#0B3B5C]/25" />
            {/* Text lines on the right */}
            <span className="absolute left-[35%] top-[24%] w-[52%] h-[6%] rounded bg-[#0B3B5C]/10" />
            <span className="absolute left-[35%] top-[36%] w-[42%] h-[6%] rounded bg-[#0B3B5C]/10" />
            <span className="absolute left-[35%] top-[48%] w-[48%] h-[6%] rounded bg-[#0B3B5C]/10" />
            <span className="absolute left-[35%] top-[60%] w-[32%] h-[6%] rounded bg-[#0B3B5C]/10" />
          </>
        )}
        {side === "back" && (
          <>
            {/* Barcode-like strip */}
            <span className="absolute left-[8%] top-[22%] right-[8%] h-[10%] rounded bg-[repeating-linear-gradient(90deg,#0B3B5C22_0_2px,transparent_2px_4px)]" />
            <span className="absolute left-[8%] top-[46%] w-[80%] h-[3%] rounded bg-[#0B3B5C]/12" />
            <span className="absolute left-[8%] top-[54%] w-[70%] h-[3%] rounded bg-[#0B3B5C]/12" />
            <span className="absolute left-[8%] top-[62%] w-[55%] h-[3%] rounded bg-[#0B3B5C]/12" />
          </>
        )}
      </div>
    </div>
  );
}

function DropCard({ side, label, hint, file, previewUrl, onSelect }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith("image/")) onSelect(f);
  };
  const open = () => inputRef.current?.click();
  const clear = (e) => { e?.stopPropagation(); onSelect(null); if (inputRef.current) inputRef.current.value = ""; };

  return (
    <div
      onClick={open}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      data-testid={`license-drop-${side}`}
      className={`
        group relative rounded-2xl border-2 border-dashed bg-white cursor-pointer overflow-hidden transition-all duration-200
        ${previewUrl
          ? "border-[#059669]/60 shadow-[0_0_0_4px_#05966910]"
          : drag
            ? "border-[#D4A94A] bg-[#FFFAF0] shadow-[0_0_0_4px_#D4A94A20]"
            : "border-[#E2DBC5] hover:border-[#D4A94A] hover:shadow-md"}
      `}
      style={{ aspectRatio: "1.6/1" }}
    >
      {previewUrl ? (
        <>
          <img src={previewUrl} alt={label} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <button
            type="button"
            onClick={clear}
            data-testid={`license-clear-${side}`}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-[#0B3B5C] flex items-center justify-center shadow"
            aria-label="Remove"
          ><X className="w-4 h-4" /></button>
          <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-[#059669] text-white text-[11px] font-semibold px-2.5 py-1 shadow">
            <Check className="w-3 h-3" /> {label}
          </div>
          <div className="absolute bottom-2 left-2 right-14 text-white">
            <div className="text-[11px] font-mono truncate opacity-90">{file?.name}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-70 inline-flex items-center gap-1 mt-0.5">
              <RotateCw className="w-3 h-3" /> Tap to replace
            </div>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          {/* Guide-frame corner brackets — helps guest align their license */}
          <GuideFrame side={side} />
          <div className="relative z-10 w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F7F1DE] to-white flex items-center justify-center border border-[#EDE3C4] mb-3 group-hover:scale-110 transition-transform">
            <Camera className="w-6 h-6 text-[#D4A94A]" />
          </div>
          <div className="relative z-10 text-sm font-semibold text-[#0B3B5C]">{label}</div>
          <div className="relative z-10 text-[11px] text-[#94856A] mt-0.5">{hint}</div>
          <div className="relative z-10 mt-3 text-[11px] text-[#5F6875]">
            <span className="underline underline-offset-2 decoration-[#D4A94A]">Tap to browse</span> · or drop a photo
          </div>
          <div className="relative z-10 mt-2 text-[10px] uppercase tracking-widest text-[#94856A]">Frame inside the guide</div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid={`license-file-${side}`}
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0] || null)}
      />
    </div>
  );
}

/* ─── Status banner ─────────────────────────────────────────────── */
function StatusBanner({ status, reason, at }) {
  const map = {
    pending: {
      bg: "bg-gradient-to-br from-[#FFFBEB] to-[#FEF6D6]",
      brd: "border-[#F0D480]",
      dot: "bg-[#D4A94A]",
      title: "Under review by Rox staff",
      body: "We usually confirm within a couple of hours. You'll get an email + SMS the moment we approve it.",
      icon: <Loader2 className="w-4 h-4 animate-spin text-[#92400E]" />,
      testid: "license-status-pending",
    },
    approved: {
      bg: "bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7]",
      brd: "border-[#86EFAC]",
      dot: "bg-[#059669]",
      title: "You're all set",
      body: "Your driver's license is approved. Show up on time and enjoy the drive.",
      icon: <Check className="w-4 h-4 text-[#059669]" />,
      testid: "license-status-approved",
    },
    rejected: {
      bg: "bg-gradient-to-br from-[#FEF2F2] to-[#FEE2E2]",
      brd: "border-[#FCA5A5]",
      dot: "bg-[#B91C1C]",
      title: "Please upload again",
      body: reason || "The photo wasn't clear enough — try again with better lighting and no glare.",
      icon: <AlertTriangle className="w-4 h-4 text-[#B91C1C]" />,
      testid: "license-status-rejected",
    },
  };
  const s = map[status]; if (!s) return null;
  return (
    <div className={`rounded-2xl border ${s.brd} ${s.bg} p-5 flex items-start gap-3`} data-testid={s.testid}>
      <div className="mt-0.5">{s.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[#0B3B5C] font-semibold">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
          {s.title}
        </div>
        <p className="text-[13px] text-[#5F6875] mt-1">{s.body}</p>
        {at && <div className="text-[11px] text-[#94856A] mt-1.5">Uploaded {timeAgo(at)}</div>}
      </div>
    </div>
  );
}

/* ─── Small bits ────────────────────────────────────────────────── */
function Trust({ icon, title, body }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-white/60 backdrop-blur border border-[#EAE4D2] px-3 py-2.5">
      <div className="w-7 h-7 rounded-lg bg-[#0B3B5C] text-[#D4A94A] flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="leading-tight">
        <div className="text-[12px] font-semibold text-[#0B3B5C]">{title}</div>
        <div className="text-[11px] text-[#5F6875]">{body}</div>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, testid }) {
  return (
    <label className="block">
      <div className="text-[10px] tracking-[0.22em] uppercase text-[#94856A] font-semibold">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testid}
        className="mt-1 w-full rounded-xl border border-[#E2DBC5] bg-white px-3 py-2.5 text-sm text-[#0B3B5C] placeholder:text-[#B7AB8E] focus:border-[#D4A94A] focus:outline-none focus:shadow-[0_0_0_4px_#D4A94A20] transition"
      />
    </label>
  );
}

function LoadingState() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <ShieldCheck className="w-8 h-8 text-[#D4A94A] mx-auto animate-pulse" />
      <div className="serif text-2xl text-[#0B3B5C] mt-3">Loading your booking…</div>
      <div className="text-sm text-[#5F6875] mt-1">Just a moment</div>
    </div>
  );
}

function ErrorCard({ message }) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center" data-testid="upload-license-error">
      <div className="w-14 h-14 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto">
        <AlertTriangle className="w-6 h-6 text-[#B91C1C]" />
      </div>
      <h2 className="serif text-3xl text-[#0B3B5C] mt-4">Link not valid</h2>
      <p className="text-sm text-[#5F6875] mt-2">{message}</p>
      <p className="text-xs text-[#94856A] mt-6">
        If you think this is a mistake, WhatsApp us at{" "}
        <a className="text-[#0B3B5C] font-semibold underline decoration-[#D4A94A]" href="https://wa.me/12424322587">+1 (242) 432-2587</a>.
      </p>
    </div>
  );
}

/* ─── helpers ────────────────────────────────────────────────────── */
function firstName(n) {
  if (!n) return "there";
  return String(n).trim().split(/\s+/)[0];
}
function formatDate(iso) {
  if (!iso) return "your pickup date";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch { return iso; }
}
function timeAgo(iso) {
  try {
    const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    return `${Math.floor(diff / 86400)} d ago`;
  } catch { return ""; }
}
