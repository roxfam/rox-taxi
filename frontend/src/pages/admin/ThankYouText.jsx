import { useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Sparkles } from "lucide-react";
import { api } from "../../lib/api";

export default function ThankYouText({ review, testSlug }) {
  const [matches, setMatches] = useState(null);
  const [bookingId, setBookingId] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [sentAt, setSentAt] = useState(review.thank_you_sent_at);
  const [q, setQ] = useState("");

  if (sentAt) {
    return (
      <div className="mt-3 text-xs text-[#059669] font-semibold" data-testid={`review-thanks-sent-${testSlug}`}>
        Thank-you texted{review.thank_you_to ? ` to ${review.thank_you_to}` : ""} ✓
      </div>
    );
  }

  const run = async (label, fn) => {
    setBusy(label);
    try { await fn(); } catch (e) { toast.error(e?.response?.data?.detail || "Something went wrong"); }
    finally { setBusy(""); }
  };

  const draft = (id) => run("draft", async () => {
    setBookingId(id);
    const { data } = await api.post(`/admin/reviews/${review.id}/thank-you/draft`, { booking_id: id });
    setMsg(data.message || "");
  });

  const find = (query = "") => run("find", async () => {
    const { data } = await api.get(`/admin/reviews/${review.id}/thank-you/matches`, { params: query ? { q: query } : {} });
    setMatches(data.matches || []);
    if (data.matches?.length === 1) await draft(data.matches[0].id);
  });

  const send = () => run("send", async () => {
    const { data } = await api.post(`/admin/reviews/${review.id}/thank-you/send`, { booking_id: bookingId, message: msg });
    toast.success(`Thank-you texted to ${data.to}`);
    setSentAt(new Date().toISOString());
  });

  if (matches === null) {
    return (
      <button type="button" onClick={() => find()} disabled={!!busy} data-testid={`review-thanks-find-${testSlug}`}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-[#059669]/10 text-[#059669] hover:bg-[#059669] hover:text-white transition-colors disabled:opacity-60">
        <MessageSquare className="w-3.5 h-3.5" /> {busy ? "Looking for their booking…" : "Text a thank-you"}
      </button>
    );
  }

  if (!matches.length) {
    return (
      <form className="mt-3 space-y-1.5" data-testid={`review-thanks-nomatch-${testSlug}`}
        onSubmit={(e) => { e.preventDefault(); if (q.trim()) find(q.trim()); }}>
        <div className="text-xs text-[#94a3b8]">No booking matches "{review.author_name}". Search by the guest's name, phone or booking code:</div>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Melanie Brown or 242555…" data-testid={`review-thanks-search-${testSlug}`}
            className="flex-1 text-xs rounded-lg border border-[#E2E8F0] px-2 py-1.5" />
          <button type="submit" disabled={!!busy} data-testid={`review-thanks-search-btn-${testSlug}`}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#059669] text-white disabled:opacity-60">{busy ? "Searching…" : "Search"}</button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[#059669]/30 bg-[#F0FDF4] p-3 space-y-2" data-testid={`review-thanks-box-${testSlug}`}>
      <select value={bookingId} onChange={(e) => draft(e.target.value)} data-testid={`review-thanks-booking-${testSlug}`}
        className="w-full text-xs rounded-lg border border-[#E2E8F0] px-2 py-1.5 bg-white">
        <option value="" disabled>Pick the matching booking…</option>
        {matches.map((m) => (
          <option key={m.id} value={m.id}>{m.customer_name} · {m.item_name} · {(m.booking_date || "").slice(0, 10)} · {m.customer_phone}</option>
        ))}
      </select>
      {busy === "draft" && <div className="text-xs text-[#64748B] inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> Writing a personal message…</div>}
      {bookingId && busy !== "draft" && (
        <>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} maxLength={600} data-testid={`review-thanks-text-${testSlug}`}
            className="w-full text-sm rounded-lg border border-[#E2E8F0] p-2 bg-white" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={send} disabled={!!busy || !msg.trim()} data-testid={`review-thanks-send-${testSlug}`}
              className="text-xs font-bold px-4 py-1.5 rounded-full bg-[#059669] text-white hover:bg-[#047857] disabled:opacity-60 transition-colors">
              {busy === "send" ? "Sending…" : "Send text"}
            </button>
            <button type="button" onClick={() => draft(bookingId)} disabled={!!busy} data-testid={`review-thanks-rewrite-${testSlug}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-full text-[#059669] hover:bg-[#059669]/10">Rewrite</button>
            <span className="ml-auto text-[10px] text-[#94a3b8]">{msg.length}/600</span>
          </div>
        </>
      )}
    </div>
  );
}
