import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Star, Copy, ExternalLink, Sparkles, RefreshCw, Send, CheckCircle2, Trophy, Inbox, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

/**
 * ReviewsInboxCard — the "unread thank-yous" landing card on /admin.
 * Fetches every 5★ Google review that hasn't been replied to on Google
 * yet, shows author + snippet + AI-drafted reply, and gives the owner a
 * one-tap Copy / Post-to-Google button per row. Collapsible so it
 * doesn't dominate the dashboard when the queue is empty.
 */
export default function ReviewsInboxCard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [gbpConnected, setGbpConnected] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [inbox, gbp] = await Promise.all([
        api.get("/admin/reviews/inbox"),
        api.get("/admin/gbp/status").catch(() => ({ data: { connected: false } })),
      ]);
      setData(inbox.data);
      setGbpConnected(!!gbp.data?.connected);
    } catch { /* silent — card just stays empty */ }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  const count = data?.count || 0;
  if (!data) {
    // Initial load — render a minimal skeleton so the dashboard doesn't
    // crash trying to iterate `data.reviews` before the fetch resolves.
    return null;
  }
  if (count === 0) return null; // hide entirely when inbox is clear

  return (
    <div
      className="rounded-2xl bg-gradient-to-br from-[#FBF7EF] via-white to-white border border-[#D4A94A]/40 p-5 mt-6 shadow-[0_10px_30px_rgba(212,169,74,0.1)]"
      data-testid="reviews-inbox-card"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#D4A94A] to-[#c99738] flex items-center justify-center text-white shadow-[0_6px_16px_rgba(212,169,74,0.35)]">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] tracking-[0.28em] uppercase text-[#D4A94A] font-black">
              Reviews inbox · un-replied
            </div>
            <div className="serif text-2xl text-[#0B3B5C] leading-tight mt-0.5">
              {count} thank-you{count === 1 ? "" : "s"} waiting
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={busy}
            data-testid="reviews-inbox-reload"
            className="w-9 h-9 rounded-full bg-white border border-[#EFE7D5] hover:border-[#D4A94A] flex items-center justify-center text-[#64748B] disabled:opacity-40"
            aria-label="Reload"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            data-testid="reviews-inbox-collapse"
            className="w-9 h-9 rounded-full bg-white border border-[#EFE7D5] hover:border-[#D4A94A] flex items-center justify-center text-[#64748B]"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-3">
          {(data.reviews || []).map((r) => (
            <InboxRow key={r.id} review={r} gbpConnected={gbpConnected} onDone={load} />
          ))}
          {!gbpConnected && (
            <div className="text-[11px] text-[#64748B] italic px-1">
              Tip: connect Google Business under <Link to="/admin/manage?tab=reviews" className="underline text-[#D4A94A] font-semibold">Manage → Reviews</Link> to enable 1-tap posting.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InboxRow({ review, gbpConnected, onDone }) {
  const [draft, setDraft] = useState(review.owner_reply_draft || "");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const firstName = (review.author_name || "there").split(" ")[0];
  const tags = Array.isArray(review.driver_tags) ? review.driver_tags : [];

  const draftReply = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/reviews/${review.id}/reply-draft/regenerate`);
      setDraft(data?.owner_reply_draft || "");
      setExpanded(true);
      toast.success("Fresh draft ready");
    } catch { toast.error("Draft failed — LLM key may be unset"); }
    finally { setBusy(false); }
  };

  const copy = () => {
    if (!draft) return;
    navigator.clipboard.writeText(draft).then(
      () => toast.success("Reply copied — paste it on Google!"),
      () => toast.error("Copy failed"),
    );
  };

  const post = async () => {
    if (!draft?.trim()) return toast.error("Draft is empty");
    if (!window.confirm(`Post this reply publicly on Google for ${firstName}? It replaces any existing owner reply.`)) return;
    setBusy(true);
    try {
      await api.post(`/admin/reviews/${review.id}/post-to-google`, { comment: draft });
      toast.success(`Reply posted for ${firstName}`);
      onDone?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Post failed");
    } finally { setBusy(false); }
  };

  return (
    <div
      className="rounded-xl bg-white border border-[#EFE7D5] p-4 hover:border-[#D4A94A]/60 transition-colors"
      data-testid={`reviews-inbox-row-${review.id}`}
    >
      <div className="flex items-start gap-3">
        <img
          src={review.profile_photo_url}
          alt={review.author_name}
          className="w-10 h-10 rounded-full border border-[#E2E8F0] shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#0B3B5C]">{review.author_name}</span>
            <span className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`w-3 h-3 ${i < review.rating ? "text-[#FBBF24] fill-[#FBBF24]" : "text-[#E2E8F0]"}`} />
              ))}
            </span>
            {review.relative_time && (
              <span className="text-xs text-[#94a3b8]">· {review.relative_time}</span>
            )}
            {tags.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-black text-white bg-gradient-to-r from-[#D4A94A] to-[#c99738] px-2 py-0.5 rounded-full">
                <Trophy className="w-2.5 h-2.5" /> {tags.join(" · ")}
              </span>
            )}
          </div>
          <p className="text-sm text-[#334155] leading-relaxed mt-1.5 line-clamp-2">
            "{review.text}"
          </p>
        </div>
      </div>

      {!draft && !expanded && (
        <button
          type="button"
          onClick={draftReply}
          disabled={busy}
          data-testid={`reviews-inbox-draft-${review.id}`}
          className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-black text-[#D4A94A] hover:text-[#c99738] disabled:opacity-40"
        >
          <Sparkles className="w-3 h-3" /> {busy ? "Drafting…" : `Draft a thank-you for ${firstName}`}
        </button>
      )}

      {(draft || expanded) && (
        <div className="mt-3 rounded-lg border border-[#EFE7D5] bg-gradient-to-br from-[#FBF7EF] to-white p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            data-testid={`reviews-inbox-textarea-${review.id}`}
            placeholder="Thank the reviewer here…"
            className="w-full rounded-md border border-[#EFE7D5] bg-white px-3 py-2 text-sm text-[#0B3B5C] outline-none focus:border-[#D4A94A] min-h-[70px] leading-relaxed"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {gbpConnected ? (
              <button
                type="button"
                onClick={post}
                disabled={busy || !draft.trim()}
                data-testid={`reviews-inbox-post-${review.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#D4A94A] to-[#c99738] text-white text-[11px] font-bold px-3 py-1.5 hover:shadow-[0_6px_14px_rgba(212,169,74,0.4)] disabled:opacity-40"
              >
                <Send className={`w-3 h-3 ${busy ? "animate-pulse" : ""}`} />
                {busy ? "Posting…" : "Post to Google"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={copy}
                  disabled={busy || !draft.trim()}
                  data-testid={`reviews-inbox-copy-${review.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-[#0B3B5C] text-white text-[11px] font-bold px-3 py-1.5 hover:bg-[#132a4a] disabled:opacity-40"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
                <a
                  href="https://business.google.com/reviews"
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`reviews-inbox-open-google-${review.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-white border border-[#E2E8F0] text-[#0B3B5C] text-[11px] font-bold px-3 py-1.5 hover:border-[#D4A94A]"
                >
                  <ExternalLink className="w-3 h-3" /> Open on Google
                </a>
              </>
            )}
            <button
              type="button"
              onClick={draftReply}
              disabled={busy}
              data-testid={`reviews-inbox-redraft-${review.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-white border border-[#EFE7D5] text-[#0B3B5C] text-[11px] font-bold px-3 py-1.5 hover:border-[#D4A94A] disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} /> Re-draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
