import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Check, X, ShieldCheck, ExternalLink, Copy, Loader2, RefreshCw } from "lucide-react";

const FILTERS = [
  { key: "pending",      label: "Pending review" },
  { key: "approved",     label: "Approved" },
  { key: "rejected",     label: "Rejected" },
  { key: "not_uploaded", label: "Not uploaded" },
];

/**
 * Admin: driver's-license review queue for car-rental bookings.
 * - Filter by status
 * - Approve / reject with reason
 * - Copy the guest's upload link (for a re-upload nudge)
 */
export default function LicensesPanel() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/licenses?status=${tab}`);
      setRows(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't load licenses");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const approve = async (b) => {
    setBusyId(b.id);
    try {
      await api.post(`/admin/bookings/${b.id}/license/approve`);
      toast.success("License approved — guest notified.");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Approve failed"); }
    finally { setBusyId(""); }
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await api.post(`/admin/bookings/${rejecting.id}/license/reject`, { reason });
      toast.success("Rejected — re-upload link sent to guest.");
      setRejecting(null); setReason(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Reject failed"); }
    finally { setBusyId(""); }
  };

  const copyLink = (b) => {
    const link = `${window.location.origin}/upload-license/${b.id}?t=${encodeURIComponent(b.license_upload_token || "")}`;
    navigator.clipboard.writeText(link);
    toast.success("Upload link copied to clipboard");
  };

  return (
    <div className="space-y-5" data-testid="licenses-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setTab(f.key)}
              data-testid={`licenses-tab-${f.key}`}
              className={`px-3 py-1.5 rounded-full text-sm border ${tab === f.key ? "bg-[#0B3B5C] text-white border-[#0B3B5C]" : "bg-white text-[#0B3B5C] border-[#E2E8F0] hover:border-[#0B3B5C]"}`}
            >{f.label}</button>
          ))}
        </div>
        <button onClick={load} className="text-xs text-[#64748B] hover:text-[#0B3B5C] inline-flex items-center gap-1" data-testid="licenses-reload">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center text-[#64748B]"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E2E8F0] rounded-2xl p-10 text-center text-sm text-[#64748B]">
          No licenses in the <strong>{tab}</strong> queue.
        </div>
      ) : (
        <div className="grid gap-4">
          {rows.map((b) => {
            const lic = b.license || {};
            return (
              <div key={b.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5" data-testid={`license-row-${b.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mono text-sm text-[#0B3B5C]">{b.id}</div>
                    <div className="text-sm font-semibold text-[#0B3B5C] mt-0.5">{b.customer_name} <span className="text-[#64748B] font-normal">· {b.item_name}</span></div>
                    <div className="text-xs text-[#64748B]">Pickup {b.booking_date} · {b.days || 1} day{b.days === 1 ? "" : "s"}</div>
                    <div className="text-xs text-[#64748B]">📧 {b.customer_email} · 📱 {b.customer_phone}</div>
                    {lic.name_on_license && <div className="text-xs text-[#0B3B5C] mt-1">Name: <strong>{lic.name_on_license}</strong></div>}
                    {lic.license_number && <div className="text-xs text-[#0B3B5C]">Number: <span className="mono">{lic.license_number}</span></div>}
                    {lic.expiry_date && (
                      <div className={`text-xs mt-0.5 ${b.license_expires_before_pickup ? "text-[#B91C1C] font-semibold" : "text-[#0B3B5C]"}`}>
                        Expires: {lic.expiry_date}{b.license_expires_before_pickup && " · before pickup ⚠"}
                      </div>
                    )}
                    {lic.purged_at && <div className="text-[11px] text-[#94856A] mt-1">Files purged {lic.purged_at.slice(0,10)} (retention)</div>}
                    {lic.rejection_reason && <div className="text-xs text-[#B91C1C] mt-1">Last rejection: {lic.rejection_reason}</div>}
                    {lic.ai_analyzed_at && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {typeof lic.ai_selfie_match === "number" && lic.selfie_url && (
                          <span
                            data-testid={`license-match-chip-${b.id}`}
                            className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                              lic.ai_selfie_match >= 75 ? "bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]"
                              : lic.ai_selfie_match >= 60 ? "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]"
                              : "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]"
                            }`}
                            title="Claude Sonnet 4.5 selfie ↔ license face-match"
                          >
                            Match {lic.ai_selfie_match}%
                          </span>
                        )}
                        {lic.ai_state_or_country && (
                          <span className="text-[10px] uppercase tracking-widest text-[#5F6875] bg-[#F1EFE7] px-2 py-0.5 rounded-full">
                            {lic.ai_state_or_country}
                          </span>
                        )}
                        {lic.ai_notes && (
                          <span className="text-[10px] text-[#B91C1C] italic">⚠ {lic.ai_notes}</span>
                        )}
                        {lic.from_wallet && (
                          <span data-testid={`license-wallet-badge-${b.id}`} className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]">
                            ♻ Guest wallet
                          </span>
                        )}
                        {lic.from_trusted_tier && (
                          <span data-testid={`license-trusted-badge-${b.id}`} className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#B45309] border border-[#D4A94A]">
                            ★ Rox Trusted
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusChip status={lic.status || "not_uploaded"} />
                    {b.license_expires_before_pickup && (
                      <span data-testid={`license-expired-badge-${b.id}`} className="text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]">
                        Expires before pickup
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <ImageCell label="Front"  url={lic.front_url}  testid={`license-front-${b.id}`} />
                  <ImageCell label="Back"   url={lic.back_url}   testid={`license-back-${b.id}`} />
                  <ImageCell label="Selfie" url={lic.selfie_url} testid={`license-selfie-${b.id}`} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(lic.status === "pending" || lic.status === "rejected") && (
                    <button
                      onClick={() => approve(b)}
                      disabled={busyId === b.id}
                      data-testid={`license-approve-${b.id}`}
                      className="rounded-full bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold px-4 py-1.5 inline-flex items-center gap-1"
                    >
                      {busyId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                    </button>
                  )}
                  {(lic.status === "pending" || lic.status === "approved") && (
                    <button
                      onClick={() => { setRejecting(b); setReason(""); }}
                      data-testid={`license-reject-${b.id}`}
                      className="rounded-full bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold px-4 py-1.5 inline-flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Reject
                    </button>
                  )}
                  <button onClick={() => copyLink(b)} data-testid={`license-copy-link-${b.id}`} className="rounded-full border border-[#E2E8F0] text-[#0B3B5C] text-xs font-semibold px-4 py-1.5 inline-flex items-center gap-1 hover:border-[#D4A94A]">
                    <Copy className="w-3 h-3" /> Copy upload link
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-4" data-testid="license-reject-modal">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#B91C1C]" />
              <h3 className="serif text-xl text-[#0B3B5C]">Reject license · {rejecting.id}</h3>
            </div>
            <p className="text-xs text-[#64748B] mt-1">The guest gets an email + SMS with the reason and a fresh upload link.</p>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (e.g. image blurry, expired, name doesn't match booking)"
              data-testid="license-reject-reason"
              className="mt-3 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#D4A94A] focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setRejecting(null); setReason(""); }} className="rounded-full border border-[#E2E8F0] px-4 py-1.5 text-sm text-[#0B3B5C]" data-testid="license-reject-cancel">Cancel</button>
              <button onClick={reject} disabled={busyId === rejecting.id} className="rounded-full bg-[#B91C1C] hover:bg-[#991B1B] text-white text-sm font-semibold px-4 py-1.5" data-testid="license-reject-confirm">
                {busyId === rejecting.id ? "Rejecting…" : "Send rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    pending:      { bg: "bg-[#FFFBEB]", tx: "text-[#92400E]", brd: "border-[#FDE68A]", label: "Pending" },
    approved:     { bg: "bg-[#F0FDF4]", tx: "text-[#166534]", brd: "border-[#BBF7D0]", label: "Approved" },
    rejected:     { bg: "bg-[#FEF2F2]", tx: "text-[#991B1B]", brd: "border-[#FECACA]", label: "Rejected" },
    not_uploaded: { bg: "bg-white",      tx: "text-[#64748B]", brd: "border-[#E2E8F0]", label: "Not uploaded" },
  };
  const s = map[status] || map.not_uploaded;
  return <span className={`text-[11px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border ${s.bg} ${s.tx} ${s.brd}`}>{s.label}</span>;
}

function ImageCell({ label, url, testid }) {
  if (!url) return (
    <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center text-xs text-[#94a3b8]" data-testid={testid}>
      {label} — not uploaded
    </div>
  );
  return (
    <a href={url} target="_blank" rel="noreferrer" data-testid={testid} className="block rounded-xl overflow-hidden border border-[#E2E8F0] bg-[#F1F5F9] group relative">
      <img src={url} alt={label} className="w-full h-40 object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
        <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open full size
      </div>
      <div className="absolute top-1.5 left-1.5 text-[10px] uppercase tracking-widest font-bold text-white/95 bg-[#0B3B5C]/80 rounded-full px-2 py-0.5">{label}</div>
    </a>
  );
}

/**
 * Inline OCR-correction row — lets admin fix a wrong AI read in one keystroke
 * and save via PATCH /admin/bookings/{id}/license/fields.
 */
function OcrFields({ booking, onSaved }) {
  const lic = booking.license || {};
  const [name, setName] = useState(lic.name_on_license || lic.ai_name || "");
  const [num,  setNum]  = useState(lic.license_number || lic.ai_license_number || "");
  const [exp,  setExp]  = useState(lic.expiry_date || lic.ai_expiry_date || "");
  const [state, setState] = useState(lic.state_or_country || lic.ai_state_or_country || "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyFn = (setter) => (v) => { setter(v); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/bookings/${booking.id}/license/fields`, {
        name_on_license: name, license_number: num, expiry_date: exp, state_or_country: state,
      });
      toast.success("License fields updated");
      setDirty(false); onSaved?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-4 rounded-xl border border-[#EAE4D2] bg-[#FAF7EF] p-3" data-testid={`license-ocr-${booking.id}`}>
      <div className="text-[10px] tracking-[0.22em] uppercase text-[#94856A] font-semibold mb-2 flex items-center justify-between gap-2">
        <span>OCR fields (edit to fix)</span>
        {lic.ai_analyzed_at && <span className="normal-case tracking-normal text-[10px] text-[#94856A]">AI-read {lic.ai_analyzed_at.slice(0,10)}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <MiniField label="Name"   value={name}  onChange={dirtyFn(setName)}   testid={`ocr-name-${booking.id}`} />
        <MiniField label="Number" value={num}   onChange={dirtyFn(setNum)}    testid={`ocr-number-${booking.id}`} />
        <MiniField label="Expiry" value={exp}   onChange={dirtyFn(setExp)}    testid={`ocr-expiry-${booking.id}`} />
        <MiniField label="Region" value={state} onChange={dirtyFn(setState)}  testid={`ocr-state-${booking.id}`} />
      </div>
      {dirty && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            data-testid={`ocr-save-${booking.id}`}
            className="rounded-full bg-[#0B3B5C] hover:bg-[#0B192C] disabled:opacity-60 text-white text-xs font-semibold px-4 py-1.5"
          >{saving ? "Saving…" : "Save fields"}</button>
        </div>
      )}
    </div>
  );
}

function MiniField({ label, value, onChange, testid }) {
  return (
    <label className="block">
      <div className="text-[10px] tracking-[0.18em] uppercase text-[#94856A]">{label}</div>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="mt-1 w-full rounded-lg border border-[#E2DBC5] bg-white px-2.5 py-1.5 text-xs text-[#0B3B5C] focus:border-[#D4A94A] focus:outline-none"
      />
    </label>
  );
}
