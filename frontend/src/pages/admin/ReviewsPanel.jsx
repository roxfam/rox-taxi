import { useEffect, useState } from "react";
/* eslint-disable react/prop-types */
import { toast } from "sonner";
import { Star, Trash2, Plus, Save, X, Info, ExternalLink, RefreshCw, Copy, Sparkles, Trophy, Link2, Unplug, Send, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import { F } from "./shared";

// Admin panel — paste real Google Business reviews so the public
// /reviews section stops showing seed data. Rating + total are
// auto-computed from what you paste; nothing to configure elsewhere.
const emptyForm = {
  author_name: "",
  author_url: "",
  profile_photo_url: "",
  rating: 5,
  text: "",
  relative_time: "",
  active: true,
};

export default function ReviewsPanel() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // review id being edited

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/reviews");
      setReviews(data || []);
    } catch { toast.error("Failed to load reviews"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.author_name.trim() || !form.text.trim()) {
      return toast.error("Author name and review text are required");
    }
    setCreating(true);
    try {
      await api.post("/admin/reviews", form);
      toast.success("Review saved. It's now live on the homepage.");
      setForm(emptyForm);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save review");
    } finally { setCreating(false); }
  };

  const update = async (id, patch) => {
    try {
      await api.put(`/admin/reviews/${id}`, patch);
      toast.success("Review updated");
      setEditing(null);
      load();
    } catch { toast.error("Update failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this review? It'll disappear from the homepage immediately.")) return;
    try {
      await api.delete(`/admin/reviews/${id}`);
      toast.success("Review deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  const avgRating = reviews.length
    ? (reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : "—";

  return (
    <div className="space-y-6 max-w-4xl" data-testid="reviews-panel">
      <div className="rounded-2xl bg-white border border-[#E2E8F0] p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[#D4A94A] font-bold">Homepage</div>
            <div className="serif text-2xl text-[#0B3B5C] mt-1 leading-tight">Google reviews</div>
            <div className="text-xs text-[#64748B] mt-2 max-w-xl leading-relaxed">
              Paste your real Google Business reviews here. The homepage rating and total will match what you paste — no more inflated seed numbers.
            </div>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-semibold">Avg rating</div>
              <div className="serif text-3xl text-[#D4A94A] leading-none mt-1" data-testid="reviews-avg-rating">{avgRating}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-semibold">Reviews</div>
              <div className="serif text-3xl text-[#0B3B5C] leading-none mt-1" data-testid="reviews-total">{reviews.length}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 inline-flex items-start gap-2 rounded-xl border border-[#0B3B5C]/25 bg-[#0B3B5C]/[0.06] px-3 py-2 text-xs text-[#0B3B5C]">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            Copy the exact wording and star rating from your{" "}
            <a
              href="https://business.google.com/reviews"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-1 font-semibold"
            >
              Google Business dashboard <ExternalLink className="w-3 h-3" />
            </a>{" "}
            — that way your homepage matches what people actually see on Google.
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <button
            type="button"
            data-testid="reviews-sync-google-now"
            onClick={async () => {
              try {
                const r = await api.post("/admin/reviews/sync-google-now", {});
                if (r.data?.accepted) toast.success("Google sync queued — refresh in ~10s to see new reviews.");
                else toast.error("Sync failed — check your API key + Place ID in Site Config");
                setTimeout(load, 10000);
              } catch { toast.error("Sync failed — check your API key + Place ID in Site Config"); }
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0B3B5C] text-white text-xs font-bold px-4 py-2 hover:bg-[#122C4B]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Sync from Google now
          </button>
          <GbpConnectButton />
          <span className="text-[10px] text-[#94a3b8]">Auto-runs every 6 hours when API key is set</span>
        </div>
      </div>

      {/* ── Paste form ────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-[#E2E8F0] p-6" data-testid="review-add-form">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4 text-[#059669]" />
          <div className="text-sm font-bold text-[#0B3B5C]">Paste a new review</div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <F l="Author name" v={form.author_name} on={(v) => setForm({ ...form, author_name: v })} testid="review-author" />
          <F l="When (e.g. '2 weeks ago')" v={form.relative_time} on={(v) => setForm({ ...form, relative_time: v })} testid="review-when" />
          <F l="Google profile URL (optional)" v={form.author_url} on={(v) => setForm({ ...form, author_url: v })} testid="review-url" />
          <F l="Profile photo URL (optional — auto-generates initial if blank)" v={form.profile_photo_url} on={(v) => setForm({ ...form, profile_photo_url: v })} testid="review-photo" />
        </div>

        <div className="mt-3">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Rating</label>
          <div className="flex items-center gap-1 mt-1" data-testid="review-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setForm({ ...form, rating: n })}
                className="p-0.5"
                data-testid={`review-star-${n}`}
              >
                <Star className={`w-6 h-6 ${n <= form.rating ? "text-[#FBBF24] fill-[#FBBF24]" : "text-[#E2E8F0]"}`} />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label className="text-[10px] uppercase tracking-widest text-[#64748B] font-semibold">Review text</label>
          <textarea
            className="w-full mt-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm text-[#0B3B5C] focus:border-[#D4A94A] outline-none min-h-[100px]"
            placeholder="e.g. Rox picked us up at LPIA on time and got us to Atlantis in 15 min. Cleanest van in Nassau — booked the return same day."
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            data-testid="review-text"
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={create}
            disabled={creating || !form.author_name.trim() || !form.text.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0B3B5C] text-white text-xs font-bold px-4 py-2 hover:bg-[#122C4B] disabled:opacity-50"
            data-testid="review-save-btn"
          >
            <Save className="w-3.5 h-3.5" /> {creating ? "Saving…" : "Publish review"}
          </button>
          {(form.author_name || form.text) && (
            <button
              type="button"
              onClick={() => setForm(emptyForm)}
              className="inline-flex items-center gap-1.5 rounded-full text-xs text-[#64748B] px-3 py-2 hover:bg-[#F1F5F9]"
              data-testid="review-clear-btn"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Existing reviews list ─────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="text-sm font-bold text-[#0B3B5C]">Published reviews</div>
          <div className="text-xs text-[#94a3b8]">{loading ? "Loading…" : `${reviews.length} total`}</div>
        </div>

        {!loading && reviews.length === 0 && (
          <div className="p-8 text-center text-sm text-[#94a3b8]" data-testid="reviews-empty">
            No reviews yet. Paste your first one above — the homepage section will hide itself until you do.
          </div>
        )}

        <div className="divide-y divide-[#F1F5F9]">
          {reviews.map((r) => (
            <ReviewRow
              key={r.id}
              review={r}
              editing={editing === r.id}
              onEdit={() => setEditing(r.id)}
              onCancel={() => setEditing(null)}
              onSave={(patch) => update(r.id, patch)}
              onDelete={() => remove(r.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ review, editing, onEdit, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState(review);
  useEffect(() => { setDraft(review); }, [review, editing]);
  const testSlug = review.id;

  if (editing) {
    return (
      <div className="p-5 bg-[#FBF7EF]/40" data-testid={`review-row-${testSlug}`}>
        <div className="grid md:grid-cols-2 gap-3">
          <F l="Author name" v={draft.author_name} on={(v) => setDraft({ ...draft, author_name: v })} testid={`review-edit-author-${testSlug}`} />
          <F l="When (e.g. '2 weeks ago')" v={draft.relative_time || ""} on={(v) => setDraft({ ...draft, relative_time: v })} testid={`review-edit-when-${testSlug}`} />
        </div>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDraft({ ...draft, rating: n })}
              className="p-0.5"
            >
              <Star className={`w-5 h-5 ${n <= draft.rating ? "text-[#FBBF24] fill-[#FBBF24]" : "text-[#E2E8F0]"}`} />
            </button>
          ))}
        </div>
        <textarea
          className="w-full mt-2 rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm text-[#0B3B5C] outline-none min-h-[80px]"
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onSave({
              author_name: draft.author_name,
              author_url: draft.author_url || "",
              profile_photo_url: draft.profile_photo_url || "",
              rating: draft.rating,
              text: draft.text,
              relative_time: draft.relative_time || "",
              active: draft.active !== false,
            })}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#059669] text-white text-xs font-bold px-4 py-2 hover:bg-[#047857]"
          >
            <Save className="w-3.5 h-3.5" /> Save changes
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-full text-xs text-[#64748B] px-3 py-2 hover:bg-[#F1F5F9]"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 flex items-start gap-4" data-testid={`review-row-${testSlug}`}>
      <img
        src={review.profile_photo_url}
        alt={review.author_name}
        className="w-10 h-10 rounded-full border border-[#E2E8F0] shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-semibold text-[#0B3B5C]">{review.author_name}</div>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`w-3 h-3 ${i < review.rating ? "text-[#FBBF24] fill-[#FBBF24]" : "text-[#E2E8F0]"}`} />
            ))}
          </div>
          {review.relative_time && <span className="text-xs text-[#94a3b8]">· {review.relative_time}</span>}
          {Array.isArray(review.driver_tags) && review.driver_tags.length > 0 && (
            <span
              data-testid={`review-driver-tag-${testSlug}`}
              className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-black text-white bg-gradient-to-r from-[#D4A94A] to-[#c99738] px-2 py-0.5 rounded-full"
              title={`Driver named in this review`}
            >
              <Trophy className="w-2.5 h-2.5" /> {review.driver_tags.join(" · ")}
            </span>
          )}
        </div>
        <p className="text-sm text-[#334155] leading-relaxed mt-1.5">"{review.text}"</p>
        {review.rating >= 5 && (
          <OwnerReplyDraft review={review} testSlug={testSlug} />
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          data-testid={`review-edit-btn-${testSlug}`}
          className="text-xs text-[#0B3B5C] hover:bg-[#F1F5F9] rounded-full px-3 py-1 font-semibold"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          data-testid={`review-delete-btn-${testSlug}`}
          className="text-xs text-[#DC2626] hover:bg-[#FEF2F2] rounded-full px-2 py-1"
          title="Delete review"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── OwnerReplyDraft ─────────────────────────────────────────────────
// Compact widget under every 5-star review. Shows the pre-generated
// owner reply, exposes 1-tap Copy, Regenerate (asks Claude again), and
// Save (persists an owner tweak). "Open on Google" jumps straight to
// the business reviews inbox so the owner pastes and posts.
function OwnerReplyDraft({ review, testSlug }) {
  const [draft, setDraft] = useState(review.owner_reply_draft || "");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(!!review.owner_reply_draft);

  const copy = () => {
    if (!draft) return;
    navigator.clipboard.writeText(draft).then(
      () => toast.success("Reply copied — paste it on Google!"),
      () => toast.error("Copy failed"),
    );
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/reviews/${review.id}/reply-draft/regenerate`);
      setDraft(data?.owner_reply_draft || "");
      setExpanded(true);
      toast.success("Fresh draft ready");
    } catch { toast.error("Draft failed — LLM key may be unset"); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/admin/reviews/${review.id}/reply-draft`, { owner_reply_draft: draft });
      toast.success("Draft saved");
    } catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={regenerate}
        disabled={busy}
        data-testid={`review-draft-generate-${testSlug}`}
        className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-black text-[#D4A94A] hover:text-[#c99738] disabled:opacity-40"
      >
        <Sparkles className="w-3 h-3" /> {busy ? "Drafting…" : "Draft a thank-you reply"}
      </button>
    );
  }

  return (
    <div
      className="mt-3 rounded-xl border border-[#EFE7D5] bg-gradient-to-br from-[#FBF7EF] to-white p-3"
      data-testid={`review-draft-${testSlug}`}
    >
      <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-widest text-[#D4A94A] font-black">
        <Sparkles className="w-3 h-3" /> Owner reply · draft
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        data-testid={`review-draft-textarea-${testSlug}`}
        className="w-full rounded-lg border border-[#EFE7D5] bg-white px-3 py-2 text-sm text-[#0B3B5C] outline-none focus:border-[#D4A94A] min-h-[80px] leading-relaxed"
        placeholder="Thank the reviewer here…"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={copy}
          disabled={busy || !draft}
          data-testid={`review-draft-copy-${testSlug}`}
          className="inline-flex items-center gap-1 rounded-full bg-[#0B3B5C] text-white text-[11px] font-bold px-3 py-1.5 hover:bg-[#132a4a] disabled:opacity-40"
        >
          <Copy className="w-3 h-3" /> Copy
        </button>
        <a
          href="https://business.google.com/reviews"
          target="_blank"
          rel="noreferrer"
          data-testid={`review-draft-open-google-${testSlug}`}
          className="inline-flex items-center gap-1 rounded-full bg-white border border-[#E2E8F0] text-[#0B3B5C] text-[11px] font-bold px-3 py-1.5 hover:border-[#D4A94A]"
        >
          <ExternalLink className="w-3 h-3" /> Open on Google
        </a>
        <PostToGoogleButton reviewId={review.id} draft={draft} testSlug={testSlug} posted={!!review.owner_reply_posted_at} />
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          data-testid={`review-draft-regen-${testSlug}`}
          className="inline-flex items-center gap-1 rounded-full bg-[#FBF7EF] border border-[#EFE7D5] text-[#0B3B5C] text-[11px] font-bold px-3 py-1.5 hover:border-[#D4A94A] disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} /> Re-draft
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          data-testid={`review-draft-save-${testSlug}`}
          className="inline-flex items-center gap-1 rounded-full bg-[#059669] text-white text-[11px] font-bold px-3 py-1.5 hover:bg-[#047857] disabled:opacity-40"
        >
          <Save className="w-3 h-3" /> Save edit
        </button>
      </div>
      {review.owner_reply_generated_at && (
        <div className="mt-1 text-[9px] text-[#94a3b8]">
          drafted {new Date(review.owner_reply_generated_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ── GbpConnectButton ────────────────────────────────────────────────
// Pill in the review-panel header showing GBP connection status and
// exposing 1-tap Connect / Disconnect. Reads /admin/gbp/status on
// mount + after every OAuth roundtrip. When `oauth_configured` is
// false, shows a helper tooltip explaining the .env variables and
// GCP approval steps rather than surfacing a broken "Connect" button.
function GbpConnectButton() {
  const [status, setStatus] = useState(null);
  const load = () => api.get("/admin/gbp/status").then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    if (q.get("gbp") === "connected") toast.success("Google Business Profile connected");
    if (q.get("gbp") === "error") toast.error(`Google connect failed: ${q.get("reason") || "unknown"}`);
  }, []);
  if (!status) return null;

  const connect = async () => {
    try {
      const { data } = await api.get("/admin/gbp/oauth/start");
      if (data?.authorize_url) window.location.href = data.authorize_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "OAuth not configured — see setup steps");
    }
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Business Profile? Existing tokens are wiped.")) return;
    try {
      await api.post("/admin/gbp/disconnect");
      toast.success("Disconnected");
      load();
    } catch { toast.error("Disconnect failed"); }
  };

  if (!status.oauth_configured) {
    return (
      <span
        title="Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REDIRECT_URI in backend/.env, then restart the backend."
        data-testid="gbp-not-configured"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] border border-[#FBBF24]/60 text-[#92400E] text-[10px] font-bold px-3 py-1.5 cursor-help"
      >
        <Info className="w-3 h-3" /> Google Business OAuth not configured
      </span>
    );
  }
  if (status.connected) {
    return (
      <span className="inline-flex items-center gap-2">
        <span
          data-testid="gbp-connected-pill"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#D1FAE5] border border-[#059669]/50 text-[#065F46] text-[10px] font-bold px-3 py-1.5"
          title={`Connected as ${status.location_label || status.account_label || "your business"}`}
        >
          <CheckCircle2 className="w-3 h-3" /> Google connected
          {status.location_label && (
            <span className="opacity-70 font-normal max-w-[140px] truncate">· {status.location_label}</span>
          )}
        </span>
        <button
          type="button"
          onClick={disconnect}
          data-testid="gbp-disconnect-btn"
          className="text-[10px] text-[#64748B] hover:text-[#DC2626] underline"
        >
          <Unplug className="w-3 h-3 inline" /> disconnect
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={connect}
      data-testid="gbp-connect-btn"
      className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#D4A94A] text-[#0B3B5C] text-xs font-bold px-4 py-2 hover:bg-[#FBF7EF]"
    >
      <Link2 className="w-3.5 h-3.5" /> Connect Google Business
    </button>
  );
}

// ── PostToGoogleButton ──────────────────────────────────────────────
// Sends the current draft to `/admin/reviews/{id}/post-to-google`.
// Hidden when OAuth isn't connected. Shows a "Posted" chip after a
// successful publish.
function PostToGoogleButton({ reviewId, draft, testSlug, posted }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/admin/gbp/status").then((r) => setStatus(r.data)).catch(() => {});
  }, []);
  if (!status?.connected) return null;
  if (posted) {
    return (
      <span
        data-testid={`review-draft-posted-${testSlug}`}
        className="inline-flex items-center gap-1 rounded-full bg-[#D1FAE5] border border-[#059669]/50 text-[#065F46] text-[11px] font-bold px-3 py-1.5"
      >
        <CheckCircle2 className="w-3 h-3" /> Posted to Google
      </span>
    );
  }
  const post = async () => {
    if (!draft?.trim()) return toast.error("Draft is empty");
    if (!window.confirm("Post this reply publicly on Google? It replaces any existing owner reply on that review.")) return;
    setBusy(true);
    try {
      await api.post(`/admin/reviews/${reviewId}/post-to-google`, { comment: draft });
      toast.success("Reply posted on Google");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Post failed");
    } finally { setBusy(false); }
  };
  return (
    <button
      type="button"
      onClick={post}
      disabled={busy}
      data-testid={`review-draft-post-google-${testSlug}`}
      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#D4A94A] to-[#c99738] text-white text-[11px] font-bold px-3 py-1.5 hover:shadow-[0_6px_14px_rgba(212,169,74,0.4)] disabled:opacity-40"
    >
      <Send className={`w-3 h-3 ${busy ? "animate-pulse" : ""}`} /> {busy ? "Posting…" : "Post to Google"}
    </button>
  );
}

