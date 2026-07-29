import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, RefreshCw, Images, Mail } from "lucide-react";
import { api, BACKEND_URL } from "../../lib/api";

// Admin panel for reviewing customer-submitted gallery photos.
// Hits /api/admin/gallery/pending, /approve, /reject.
export default function GalleryPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({}); // { [id]: "approve" | "reject" }

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/gallery/pending");
      setItems(data);
    } catch {
      toast.error("Failed to load pending submissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setBusy((b) => ({ ...b, [id]: action }));
    try {
      const { data } = await api.post(`/admin/gallery/${id}/${action}`);
      if (action === "approve") {
        const fb = data?.facebook || {};
        if (fb.ok) {
          toast.success("Approved & posted to Facebook ✓");
        } else if (fb.error === "not_configured" || fb.error === "disabled") {
          toast.success("Photo approved — now live in the public gallery");
        } else {
          toast.success("Approved (Facebook post failed — photo still live on site)");
        }
      } else {
        toast.success("Photo rejected & removed");
      }
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to ${action}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  };

  const resolveUrl = (u) => (u?.startsWith("http") ? u : `${BACKEND_URL}${u}`);

  return (
    <div data-testid="admin-gallery-panel">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/15 text-[#D4A94A] flex items-center justify-center">
            <Images className="w-5 h-5" />
          </div>
          <div>
            <h2 className="serif text-xl text-[#0B3B5C]">Guest photo submissions</h2>
            <p className="text-xs text-[#64748B]">Approve to publish to the public gallery. Reject to delete.</p>
          </div>
        </div>
        <button
          onClick={load}
          className="text-sm flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-[#F1F5F9] text-[#0B3B5C]"
          data-testid="admin-gallery-refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center text-[#64748B] py-12" data-testid="admin-gallery-loading">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center text-[#64748B] py-16 rounded-2xl bg-white border border-[#E2E8F0]" data-testid="admin-gallery-empty">
          <Images className="w-8 h-8 mx-auto text-[#94a3b8] mb-2" />
          No pending submissions right now.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="admin-gallery-grid">
          {items.map((it) => {
            const b = busy[it.id];
            return (
              <div key={it.id} className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden flex flex-col" data-testid={`admin-gallery-item-${it.id}`}>
                <div className="aspect-[4/3] bg-[#F1F5F9] overflow-hidden">
                  <img
                    src={resolveUrl(it.url)}
                    alt={it.caption || "Guest submission"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#0B3B5C]">{it.submitter_name || "Anonymous guest"}</div>
                    {it.submitter_email && (
                      <a href={`mailto:${it.submitter_email}`} className="text-[11px] text-[#64748B] inline-flex items-center gap-1 hover:text-[#D4A94A]">
                        <Mail className="w-3 h-3" /> {it.submitter_email}
                      </a>
                    )}
                  </div>
                  {it.caption && <p className="text-sm text-[#334155] leading-snug">"{it.caption}"</p>}
                  <div className="text-[10px] uppercase tracking-widest text-[#94a3b8]">
                    {it.created_at && new Date(it.created_at).toLocaleString()}
                  </div>
                  <p
                    className="text-[10px] leading-snug rounded-lg bg-[#1877F2]/8 text-[#1877F2] px-2 py-1.5 inline-flex items-start gap-1.5"
                    title="On approval, this photo will auto-post to the Rox Taxi Service Facebook page. If Facebook fails, the photo still goes live on your website."
                    data-testid={`admin-gallery-fb-hint-${it.id}`}
                  >
                    <span className="mt-0.5">📣</span>
                    <span>Approving will auto-post this photo to your Facebook page.</span>
                  </p>
                  <div className="mt-auto flex gap-2 pt-2">
                    <button
                      onClick={() => act(it.id, "approve")}
                      disabled={!!b}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold py-2 disabled:opacity-60 active:scale-95"
                      data-testid={`admin-gallery-approve-${it.id}`}
                    >
                      <Check className="w-3.5 h-3.5" /> {b === "approve" ? "…" : "Approve"}
                    </button>
                    <button
                      onClick={() => act(it.id, "reject")}
                      disabled={!!b}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-white border border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626] hover:text-white text-xs font-semibold py-2 disabled:opacity-60 active:scale-95 transition-colors"
                      data-testid={`admin-gallery-reject-${it.id}`}
                    >
                      <X className="w-3.5 h-3.5" /> {b === "reject" ? "…" : "Reject"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
