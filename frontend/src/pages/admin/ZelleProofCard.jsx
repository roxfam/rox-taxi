import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, X, Clock, RotateCw, FileText, DollarSign, Mail, Phone, ChevronDown, ChevronUp } from "lucide-react";
import { api, money, BACKEND_URL } from "../../lib/api";

/**
 * ZelleProofCard — admin dashboard card listing bookings with a pending
 * Zelle proof upload. Shows the uploaded screenshot inline and gives
 * one-tap Approve (atomic flip to paid + fires guest confirmation +
 * owner "payment received" SMS) or Reject (texts guest the reason).
 */
export default function ZelleProofCard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({});
  const [preview, setPreview] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/zelle-proofs/pending");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load pending proofs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const approve = async (bookingId, proofId) => {
    if (!window.confirm("Approve this Zelle proof and mark the booking as paid?")) return;
    setBusy((b) => ({ ...b, [proofId]: true }));
    try {
      await api.post(`/admin/bookings/${bookingId}/zelle-proof/approve`, { proof_id: proofId });
      toast.success(`Booking ${bookingId} marked paid`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Approve failed");
    } finally {
      setBusy((b) => ({ ...b, [proofId]: false }));
    }
  };

  const reject = async (bookingId, proofId, reason) => {
    setBusy((b) => ({ ...b, [proofId]: true }));
    try {
      await api.post(`/admin/bookings/${bookingId}/zelle-proof/reject`, { proof_id: proofId, reason });
      toast.success(`Proof rejected — guest notified`);
      setRejectModal(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Reject failed");
    } finally {
      setBusy((b) => ({ ...b, [proofId]: false }));
    }
  };

  const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${BACKEND_URL}${u}`);
  const total = rows.reduce((s, r) => s + (r.proofs?.length || 0), 0);

  if (!loading && rows.length === 0) return null;

  return (
    <section
      className="mt-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm overflow-hidden"
      data-testid="admin-zelle-proof-card"
    >
      <header className="flex items-center justify-between gap-3 p-5 border-b border-[#E2E8F0] bg-gradient-to-r from-[#D4A94A]/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/15 flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#D4A94A]" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#64748B] font-black">Awaiting review</div>
            <div className="serif text-xl text-[#0B3B5C] mt-0.5" data-testid="zelle-proof-count">
              {total} Zelle {total === 1 ? "proof" : "proofs"} pending
            </div>
          </div>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-md hover:bg-[#F1F5F9]"
          data-testid="zelle-proof-refresh"
          title="Refresh"
        >
          <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""} text-[#0B3B5C]`} />
        </button>
      </header>

      <ul className="divide-y divide-[#E2E8F0]">
        {rows.map((r) => (
          r.proofs.map((p) => (
            <li
              key={`${r.id}-${p.id}`}
              className="p-5 flex flex-col sm:flex-row gap-4 hover:bg-[#F8FAFC]"
              data-testid={`zelle-proof-row-${p.id}`}
            >
              <button
                onClick={() => setPreview(p)}
                className="shrink-0 w-24 h-24 rounded-xl border border-[#E2E8F0] overflow-hidden bg-[#F1F5F9] hover:border-[#D4A94A] transition"
                data-testid={`zelle-proof-thumb-${p.id}`}
              >
                {p.filename?.endsWith(".pdf") ? (
                  <div className="w-full h-full flex items-center justify-center text-[#64748B] text-[10px] font-bold">PDF</div>
                ) : (
                  <img src={resolveUrl(p.url)} alt="Zelle proof" className="w-full h-full object-cover" loading="lazy" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="serif text-lg text-[#0B3B5C] truncate">
                      {r.customer_name || "Guest"} · {r.id}
                    </div>
                    <div className="text-xs text-[#64748B] flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                      <span className="truncate max-w-[260px]"><Mail className="inline w-3 h-3 mr-0.5" />{r.customer_email || "—"}</span>
                      <span><Phone className="inline w-3 h-3 mr-0.5" />{r.customer_phone || "—"}</span>
                      <span><Clock className="inline w-3 h-3 mr-0.5" />{p.submitted_at ? new Date(p.submitted_at).toLocaleString() : "—"}</span>
                    </div>
                    <div className="text-sm text-[#0B3B5C] mt-1.5">{r.item_name}</div>
                    {p.memo && (
                      <div className="mt-1 text-xs text-[#64748B] italic">"{p.memo.slice(0, 180)}{p.memo.length > 180 ? "…" : ""}"</div>
                    )}
                  </div>
                  <div className="mono text-xl text-[#E86A3C] font-black shrink-0">
                    {money(r.total)}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => approve(r.id, p.id)}
                    disabled={busy[p.id]}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#059669] text-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#047857] active:scale-95 disabled:opacity-60"
                    data-testid={`zelle-proof-approve-${p.id}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {busy[p.id] ? "Approving…" : "Approve & mark paid"}
                  </button>
                  <button
                    onClick={() => setRejectModal({ bookingId: r.id, proofId: p.id })}
                    disabled={busy[p.id]}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#DC2626] text-[#DC2626] px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#DC2626] hover:text-white active:scale-95 disabled:opacity-60"
                    data-testid={`zelle-proof-reject-${p.id}`}
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            </li>
          ))
        ))}
      </ul>

      {/* Lightbox preview */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
          data-testid="zelle-proof-lightbox"
        >
          <img src={resolveUrl(preview.url)} alt="Zelle proof full" className="max-w-full max-h-full rounded-xl shadow-2xl" />
        </div>
      )}

      {/* Reject reason modal */}
      {rejectModal && (
        <RejectReasonModal
          onClose={() => setRejectModal(null)}
          onSubmit={(reason) => reject(rejectModal.bookingId, rejectModal.proofId, reason)}
        />
      )}
    </section>
  );
}

function RejectReasonModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const presets = [
    "Amount doesn't match booking total",
    "Memo missing booking code",
    "Can't verify sender name",
    "Transfer screenshot is incomplete",
  ];
  return (
    <div className="fixed inset-0 z-[310] bg-[#0B192C]/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" data-testid="zelle-reject-modal">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-[#E2E8F0]">
          <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Reject proof</div>
          <h2 className="serif text-2xl text-[#0B3B5C] mt-1">Why is this proof being rejected?</h2>
          <p className="text-xs text-[#64748B] mt-2">The guest gets this reason by SMS so they know what to fix.</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setReason(p)}
                className={`text-[11px] px-3 py-1.5 rounded-full border font-semibold transition ${
                  reason === p ? "bg-[#0B3B5C] text-white border-[#0B3B5C]" : "border-[#E2E8F0] text-[#0B3B5C] hover:border-[#D4A94A]"
                }`}
                data-testid={`zelle-reject-preset-${p.slice(0,10).replace(/\s/g,"-").toLowerCase()}`}
              >
                {p}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Or type your own reason…"
            rows={3}
            className="w-full rounded-xl border border-[#E2E8F0] py-2.5 px-3 text-sm resize-none"
            data-testid="zelle-reject-reason"
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-full border border-[#E2E8F0] px-4 py-2 text-sm" data-testid="zelle-reject-cancel">Cancel</button>
            <button
              onClick={() => reason.trim().length >= 5 ? onSubmit(reason.trim()) : toast.error("Reason too short")}
              className="rounded-full bg-[#DC2626] text-white px-4 py-2 text-sm font-semibold hover:bg-[#B91C1C]"
              data-testid="zelle-reject-submit"
            >
              Reject & notify guest
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
