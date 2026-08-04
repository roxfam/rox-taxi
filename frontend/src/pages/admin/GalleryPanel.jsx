import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, X, RefreshCw, Images, Mail, Facebook, RotateCw, ExternalLink, AlertTriangle, Pin, PinOff, Trash2 } from "lucide-react";
import { api, BACKEND_URL } from "../../lib/api";

// Admin panel for reviewing customer-submitted gallery photos.
// Two tabs: "Pending" (approve/reject) and "Approved" (repost to Facebook, view live post).
export default function GalleryPanel() {
  const [tab, setTab] = useState("pending"); // 'pending' | 'approved'
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({}); // { [id]: 'approve'|'reject'|'repost' }

  const load = async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        api.get("/admin/gallery/pending"),
        api.get("/admin/gallery/approved"),
      ]);
      setPending(Array.isArray(p.data) ? p.data : []);
      setApproved(Array.isArray(a.data) ? a.data : []);
    } catch {
      toast.error("Failed to load gallery submissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const decide = async (id, action) => {
    setBusy((b) => ({ ...b, [id]: action }));
    try {
      const { data } = await api.post(`/admin/gallery/${id}/${action}`);
      if (action === "approve") {
        const fb = data?.facebook || {};
        if (fb.ok) toast.success("Approved & posted to Facebook ✓");
        else if (fb.error === "not_configured" || fb.error === "disabled") toast.success("Photo approved — now live in the public gallery");
        else toast.success("Approved (Facebook post failed — photo still live on site)");
      } else {
        toast.success("Photo rejected & removed");
      }
      // Move to approved bucket / drop from pending
      setPending((xs) => xs.filter((x) => x.id !== id));
      if (action === "approve") load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Failed to ${action}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  };

  const repost = async (id) => {
    setBusy((b) => ({ ...b, [id]: "repost" }));
    try {
      const { data } = await api.post(`/admin/gallery/${id}/repost-facebook`);
      const fb = data?.facebook || {};
      if (fb.ok) {
        toast.success("Re-posted to Facebook ✓");
      } else {
        toast.error(`Facebook: ${fb.error || "failed"}`);
      }
      // Refresh the approved list so the badge reflects new state
      const { data: refreshed } = await api.get("/admin/gallery/approved");
      setApproved(refreshed);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Repost failed");
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  };

  const togglePin = async (id) => {
    setBusy((b) => ({ ...b, [id]: "pin" }));
    try {
      const { data } = await api.post(`/admin/gallery/${id}/pin`);
      setApproved((xs) => xs.map((x) => (x.id === id ? { ...x, is_pinned: data.is_pinned } : x)));
      if (data.is_pinned) {
        // Undo toast — admin has `undo_window_seconds` (default 30s) to
        // reverse before the guest email + Facebook post actually fire.
        const undoSec = data.undo_window_seconds || 30;
        toast("Pinned as featured 🌟", {
          description: `Guest email + Facebook post firing in ${undoSec}s. Unpin now to cancel both.`,
          duration: Math.max(4000, undoSec * 1000 - 2000),
          action: {
            label: "Unpin",
            onClick: () => togglePin(id),
          },
        });
      } else {
        toast.success("Unpinned");
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Pin failed");
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  };

  const hardDelete = async (id, source) => {
    if (!window.confirm("Permanently delete this photo? The image file will be removed from disk. This cannot be undone.")) return;
    setBusy((b) => ({ ...b, [id]: "delete" }));
    try {
      await api.delete(`/admin/gallery/${id}`);
      if (source === "approved") setApproved((xs) => xs.filter((x) => x.id !== id));
      else setPending((xs) => xs.filter((x) => x.id !== id));
      toast.success("Photo deleted");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  };

  const resolveUrl = (u) => (u?.startsWith("http") ? u : `${BACKEND_URL}${u}`);
  const fbPostUrl = (postId) => postId ? `https://www.facebook.com/${postId.split("_")[0] || postId}/posts/${postId.split("_")[1] || postId}` : null;

  return (
    <div data-testid="admin-gallery-panel">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/15 text-[#D4A94A] flex items-center justify-center">
            <Images className="w-5 h-5" />
          </div>
          <div>
            <h2 className="serif text-xl text-[#0B3B5C]">Guest photo submissions</h2>
            <p className="text-xs text-[#64748B]">Approve to publish + auto-post to Facebook. Retry failed posts anytime.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-[#F1F5F9] p-1" role="tablist">
            <button
              onClick={() => setTab("pending")}
              className={`text-xs px-4 py-1.5 rounded-full font-semibold transition-colors ${tab === "pending" ? "bg-white text-[#0B3B5C] shadow-sm" : "text-[#64748B]"}`}
              data-testid="admin-gallery-tab-pending"
            >
              Pending {pending.length > 0 && <span className="ml-1 text-[10px] bg-[#E86A3C] text-white rounded-full px-1.5 py-0.5">{pending.length}</span>}
            </button>
            <button
              onClick={() => setTab("approved")}
              className={`text-xs px-4 py-1.5 rounded-full font-semibold transition-colors ${tab === "approved" ? "bg-white text-[#0B3B5C] shadow-sm" : "text-[#64748B]"}`}
              data-testid="admin-gallery-tab-approved"
            >
              Approved {approved.length > 0 && <span className="ml-1 text-[10px] text-[#64748B]">({approved.length})</span>}
            </button>
          </div>
          <button
            onClick={load}
            className="text-sm flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-[#F1F5F9] text-[#0B3B5C]"
            data-testid="admin-gallery-refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-[#64748B] py-12" data-testid="admin-gallery-loading">Loading…</div>
      ) : tab === "pending" ? (
        pending.length === 0 ? (
          <div className="text-center text-[#64748B] py-16 rounded-2xl bg-white border border-[#E2E8F0]" data-testid="admin-gallery-empty">
            <Images className="w-8 h-8 mx-auto text-[#94a3b8] mb-2" />
            No pending submissions right now.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="admin-gallery-grid">
            {pending.map((it) => {
              const b = busy[it.id];
              return (
                <div key={it.id} className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden flex flex-col" data-testid={`admin-gallery-item-${it.id}`}>
                  <div className="aspect-[4/3] bg-[#F1F5F9] overflow-hidden">
                    <img src={resolveUrl(it.url)} alt={it.caption || "Guest submission"} className="w-full h-full object-cover" loading="lazy" />
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
                    {it.caption && <p className="text-sm text-[#334155] leading-snug">&ldquo;{it.caption}&rdquo;</p>}
                    <div className="text-[10px] uppercase tracking-widest text-[#94a3b8]">
                      {it.created_at && new Date(it.created_at).toLocaleString()}
                    </div>
                    <p
                      className="text-[10px] leading-snug rounded-lg bg-[#1877F2]/8 text-[#1877F2] px-2 py-1.5 inline-flex items-start gap-1.5"
                      title="On approval, this photo will be center-cropped to 1200×630 and auto-posted to the Rox Taxi Service Facebook page."
                      data-testid={`admin-gallery-fb-hint-${it.id}`}
                    >
                      <Facebook className="w-3 h-3 mt-0.5" />
                      <span>Approving auto-posts a 1200×630 version to Facebook.</span>
                    </p>
                    <div className="mt-auto flex gap-2 pt-2">
                      <button
                        onClick={() => decide(it.id, "approve")}
                        disabled={!!b}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold py-2 disabled:opacity-60 active:scale-95"
                        data-testid={`admin-gallery-approve-${it.id}`}
                      >
                        <Check className="w-3.5 h-3.5" /> {b === "approve" ? "…" : "Approve"}
                      </button>
                      <button
                        onClick={() => decide(it.id, "reject")}
                        disabled={!!b}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-white border border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626] hover:text-white text-xs font-semibold py-2 disabled:opacity-60 active:scale-95 transition-colors"
                        data-testid={`admin-gallery-reject-${it.id}`}
                      >
                        <X className="w-3.5 h-3.5" /> {b === "reject" ? "…" : "Reject"}
                      </button>
                      <button
                        onClick={() => hardDelete(it.id, "pending")}
                        disabled={!!b}
                        className="inline-flex items-center justify-center rounded-full bg-white border border-[#94a3b8] text-[#64748B] hover:bg-[#DC2626] hover:text-white hover:border-[#DC2626] p-2 disabled:opacity-60 active:scale-95 transition-colors"
                        data-testid={`admin-gallery-delete-${it.id}`}
                        title="Permanently delete — removes file from disk + DB"
                      >
                        {b === "delete" ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        // ── Approved tab ───────────────────────────────────────────
        approved.length === 0 ? (
          <div className="text-center text-[#64748B] py-16 rounded-2xl bg-white border border-[#E2E8F0]" data-testid="admin-gallery-approved-empty">
            <Images className="w-8 h-8 mx-auto text-[#94a3b8] mb-2" />
            No approved photos yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="admin-gallery-approved-grid">
            {approved.map((it) => {
              const b = busy[it.id];
              const posted = it.facebook_posted === true;
              const attempted = !!it.facebook_attempted_at;
              return (
                <div key={it.id} className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden flex flex-col" data-testid={`admin-gallery-approved-item-${it.id}`}>
                  <div className="aspect-[4/3] bg-[#F1F5F9] overflow-hidden relative">
                    <img src={resolveUrl(it.url)} alt={it.caption || "Guest submission"} className="w-full h-full object-cover" loading="lazy" />
                    {it.is_pinned && (
                      <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#D4A94A] text-[#0B192C] text-[10px] font-black px-2 py-1 shadow-sm" data-testid={`admin-gallery-pinned-badge-${it.id}`}>
                        <Pin className="w-3 h-3" /> Featured
                      </span>
                    )}
                    {posted ? (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-[#1877F2] text-white text-[10px] font-bold px-2 py-1 shadow-sm" data-testid={`admin-gallery-fb-badge-${it.id}`}>
                        <Facebook className="w-3 h-3" /> Posted
                      </span>
                    ) : attempted ? (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-[#DC2626] text-white text-[10px] font-bold px-2 py-1 shadow-sm" data-testid={`admin-gallery-fb-badge-failed-${it.id}`}>
                        <AlertTriangle className="w-3 h-3" /> FB failed
                      </span>
                    ) : (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-[#94a3b8] text-white text-[10px] font-bold px-2 py-1 shadow-sm" data-testid={`admin-gallery-fb-badge-not-attempted-${it.id}`}>
                        Not sent
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[#0B3B5C]">{it.submitter_name || "Anonymous guest"}</div>
                      <div className="text-[10px] uppercase tracking-widest text-[#94a3b8]">
                        {it.approved_at && `Approved ${new Date(it.approved_at).toLocaleString()}`}
                      </div>
                    </div>
                    {it.caption && <p className="text-sm text-[#334155] leading-snug line-clamp-2">&ldquo;{it.caption}&rdquo;</p>}
                    {attempted && !posted && it.facebook_error && (
                      <p className="text-[11px] text-[#DC2626] leading-snug bg-[#DC2626]/8 rounded-md px-2 py-1.5" data-testid={`admin-gallery-fb-error-${it.id}`}>
                        {it.facebook_error}
                      </p>
                    )}
                    <div className="mt-auto flex gap-2 pt-2">
                      <button
                        onClick={() => togglePin(it.id)}
                        disabled={!!b}
                        className={`inline-flex items-center justify-center gap-1.5 rounded-full text-xs font-semibold py-2 px-3 disabled:opacity-60 active:scale-95 transition-colors ${it.is_pinned ? "bg-[#D4A94A] text-[#0B192C] hover:bg-[#E5BC5A]" : "bg-white border border-[#D4A94A] text-[#D4A94A] hover:bg-[#D4A94A]/10"}`}
                        data-testid={`admin-gallery-pin-${it.id}`}
                        title={it.is_pinned ? "Unpin from featured" : "Pin as featured — surfaces first on home + groups + gallery"}
                      >
                        {b === "pin" ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : (it.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />)}
                        {it.is_pinned ? "Pinned" : "Pin"}
                      </button>
                      <button
                        onClick={() => repost(it.id)}
                        disabled={!!b}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full text-white text-xs font-semibold py-2 disabled:opacity-60 active:scale-95 ${posted ? "bg-[#64748B] hover:bg-[#0B3B5C]" : "bg-[#1877F2] hover:bg-[#0d5fc4]"}`}
                        data-testid={`admin-gallery-repost-${it.id}`}
                        title={posted ? "Post to Facebook again — creates a second post" : "Retry posting to Facebook"}
                      >
                        {b === "repost" ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Facebook className="w-3.5 h-3.5" />}
                        {posted ? "Repost" : "Try Facebook again"}
                      </button>
                      {posted && it.facebook_post_id && (
                        <a
                          href={fbPostUrl(it.facebook_post_id)}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-full bg-white border border-[#E2E8F0] text-[#0B3B5C] hover:bg-[#F1F5F9] p-2"
                          title="Open the live post on Facebook"
                          data-testid={`admin-gallery-fb-view-${it.id}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => hardDelete(it.id, "approved")}
                        disabled={!!b}
                        className="inline-flex items-center justify-center rounded-full bg-white border border-[#94a3b8] text-[#64748B] hover:bg-[#DC2626] hover:text-white hover:border-[#DC2626] p-2 disabled:opacity-60 active:scale-95 transition-colors"
                        data-testid={`admin-gallery-delete-${it.id}`}
                        title="Permanently delete photo — removes file from disk + DB (does NOT delete the Facebook post)"
                      >
                        {b === "delete" ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
