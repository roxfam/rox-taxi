import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Camera, Check, Upload, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";

/**
 * Public driver's-license upload page for car-rental bookings.
 * URL pattern: /upload-license/:bookingId?t=<token>
 *
 * - No auth: guarded by the booking_id + `license_upload_token` in the URL
 * - Front + back images (both optional, at least one required)
 * - Shows current review status when the guest revisits the same link
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
  const [name, setName] = useState("");
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");
  const frontRef = useRef(null);
  const backRef = useRef(null);

  const API = process.env.REACT_APP_BACKEND_URL;

  useEffect(() => {
    if (!bookingId || !token) { setErr("Invalid upload link."); setLoading(false); return; }
    (async () => {
      try {
        const r = await fetch(`${API}/api/bookings/${bookingId}/license/status?t=${encodeURIComponent(token)}`);
        if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
        setStatus(await r.json());
      } catch (e) {
        setErr(e.message || "Couldn't load your booking.");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId, token, API]);

  const submit = async () => {
    if (!front && !back) { toast.error("Choose at least one photo (front or back)."); return; }
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
      toast.success("Thanks — we'll review your license.");
      // Reload status
      const r2 = await fetch(`${API}/api/bookings/${bookingId}/license/status?t=${encodeURIComponent(token)}`);
      setStatus(await r2.json());
      setFront(null); setBack(null);
      if (frontRef.current) frontRef.current.value = "";
      if (backRef.current) backRef.current.value = "";
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally { setBusy(false); }
  };

  if (loading) return <Shell><div className="flex items-center gap-2 text-[#64748B]"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div></Shell>;
  if (err) return <Shell><ErrorCard message={err} /></Shell>;

  const st = status?.status || "not_uploaded";

  return (
    <Shell>
      <div className="max-w-xl mx-auto px-4 py-10" data-testid="upload-license-page">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-full bg-[#0B3B5C] text-[#D4A94A] flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div>
          <div>
            <h1 className="serif text-3xl text-[#0B3B5C] leading-tight">Verify your driver's license</h1>
            <p className="text-sm text-[#64748B]">Rental <span className="mono">{status?.booking_id}</span> · pickup {status?.booking_date}</p>
          </div>
        </div>

        <StatusBadge status={st} reason={status?.rejection_reason} />

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 mt-6 shadow-sm">
          <p className="text-sm text-[#0B3B5C] font-semibold">Upload your license</p>
          <p className="text-xs text-[#64748B] mt-1">Front and back — both are optional. Bahamas / US / international licenses accepted. Files are private and only reviewed by Rox Taxi staff.</p>

          <FilePick label="Front of license" file={front} onChange={setFront} inputRef={frontRef} testid="front" />
          <FilePick label="Back of license"  file={back}  onChange={setBack}  inputRef={backRef}  testid="back" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <TextField label="Name on license" value={name} onChange={setName} testid="license-name" />
            <TextField label="License number"  value={num}  onChange={setNum}  testid="license-number" />
            <TextField label="Expiry (YYYY-MM-DD)" value={exp} onChange={setExp} testid="license-expiry" />
          </div>

          <button
            onClick={submit}
            disabled={busy || (!front && !back)}
            data-testid="license-submit"
            className="mt-5 w-full rounded-full bg-[#E86A3C] hover:bg-[#d55a30] disabled:opacity-60 text-white text-sm font-semibold px-5 py-3 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {busy ? "Uploading…" : "Submit for review"}
          </button>
          <p className="text-[11px] text-[#94a3b8] mt-3 text-center">Rox Taxi Service &amp; Tours — Nassau, Bahamas</p>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#F7F5EF]" data-testid="upload-license-shell">
      <header className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <img src="/logo-gold.webp" alt="Rox" className="w-8 h-8 object-contain" />
          <span className="font-semibold text-[#0B3B5C]">Rox Taxi Service <em className="text-[#D4A94A] not-italic">& Tours</em></span>
        </div>
      </header>
      {children}
    </div>
  );
}

function StatusBadge({ status, reason }) {
  if (status === "approved") return (
    <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-sm text-[#166534] flex items-center gap-2" data-testid="license-status-approved">
      <Check className="w-4 h-4" /> Your driver's license is <strong className="ml-1">approved</strong>. You're set for pickup.
    </div>
  );
  if (status === "pending") return (
    <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4 text-sm text-[#92400E] flex items-center gap-2" data-testid="license-status-pending">
      <Loader2 className="w-4 h-4 animate-spin" /> Uploaded — <strong className="ml-1">pending admin review</strong>.
    </div>
  );
  if (status === "rejected") return (
    <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]" data-testid="license-status-rejected">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="w-4 h-4" /> Not approved — please re-upload.</div>
      {reason && <div className="text-xs mt-1">Reason: {reason}</div>}
    </div>
  );
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 text-sm text-[#64748B]" data-testid="license-status-none">
      No license on file yet — upload below to verify your rental.
    </div>
  );
}

function ErrorCard({ message }) {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <AlertTriangle className="w-8 h-8 text-[#B91C1C] mx-auto" />
      <h2 className="serif text-2xl text-[#0B3B5C] mt-2">Link not valid</h2>
      <p className="text-sm text-[#64748B] mt-1">{message}</p>
      <p className="text-xs text-[#94a3b8] mt-4">If you think this is a mistake, message us on WhatsApp at <a className="underline" href="https://wa.me/12424322587">+1 (242) 432-2587</a>.</p>
    </div>
  );
}

function FilePick({ label, file, onChange, inputRef, testid }) {
  return (
    <label className="block mt-4">
      <div className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold flex items-center gap-2">
        <Camera className="w-3.5 h-3.5 text-[#D4A94A]" /> {label}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        data-testid={`license-file-${testid}`}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="mt-1 block w-full text-sm text-[#0B3B5C] file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-[#0B3B5C] file:text-white file:text-xs file:font-semibold hover:file:bg-[#0B192C] cursor-pointer"
      />
      {file && <div className="text-[11px] text-[#059669] mt-1">{file.name}</div>}
    </label>
  );
}

function TextField({ label, value, onChange, testid }) {
  return (
    <label className="block">
      <div className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#D4A94A] focus:outline-none"
      />
    </label>
  );
}
