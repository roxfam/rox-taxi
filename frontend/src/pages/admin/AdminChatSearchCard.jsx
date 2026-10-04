import { useState } from "react";
import { toast } from "sonner";
import { Search, MessageSquare, ArrowRight } from "lucide-react";
import { api } from "../../lib/api";

/**
 * AdminChatSearchCard — search bar across every group chat thread.
 *
 * Case-insensitive match on message body across all bookings. Useful for
 * finding references like "Baha Mar back entrance" without scrolling
 * through months of history. Clicking a result opens the booking modal
 * via the parent's `onOpenBooking` callback.
 */
function highlight(body, q) {
  if (!q) return body;
  const idx = body.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return body;
  return (
    <>
      {body.slice(0, idx)}
      <mark className="bg-[#D4A94A]/20 text-[#0B3B5C] font-bold rounded px-0.5">{body.slice(idx, idx + q.length)}</mark>
      {body.slice(idx + q.length)}
    </>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; }
}

export default function AdminChatSearchCard({ onOpenBooking }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (e) => {
    e?.preventDefault?.();
    const q = query.trim();
    if (q.length < 2) {
      toast.error("Type at least 2 characters to search");
      return;
    }
    setLoading(true);
    try {
      const r = await api.get(`/admin/chat/search?q=${encodeURIComponent(q)}`);
      setResults(r.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Search failed");
    } finally { setLoading(false); }
  };

  return (
    <section className="mt-8 rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden" data-testid="admin-chat-search">
      <header className="p-5 border-b border-[#E2E8F0] flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/12 flex items-center justify-center text-[#D4A94A]">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <div className="text-sm font-bold text-[#0B3B5C]">Chat search · all threads</div>
          <div className="text-xs text-[#64748B] mt-0.5">Jump to any planner thread by searching the message body.</div>
        </div>
      </header>

      <form onSubmit={run} className="p-5 flex gap-2 border-b border-[#E2E8F0] bg-[#FAF9F6]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search planner chats · e.g. Baha Mar back entrance"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm focus:outline-none focus:border-[#D4A94A]"
            data-testid="admin-chat-search-input"
          />
        </div>
        <button
          type="submit"
          disabled={loading || query.trim().length < 2}
          className="inline-flex items-center gap-1 rounded-xl bg-[#0B3B5C] text-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#0a2a44] disabled:opacity-50"
          data-testid="admin-chat-search-submit"
        >
          {loading ? "…" : "Search"}
        </button>
      </form>

      {results && (
        <div className="p-4" data-testid="admin-chat-search-results">
          <div className="text-[11px] text-[#64748B] mb-2">
            {results.count === 0 ? "No matches found." : `${results.count} match${results.count === 1 ? "" : "es"} across ${new Set(results.results.map(r => r.booking_id)).size} booking(s)`}
          </div>
          {results.results.map((r) => (
            <button
              key={r.message_id}
              onClick={() => onOpenBooking?.(r.booking_id)}
              className="w-full text-left rounded-xl border border-[#E2E8F0] hover:border-[#D4A94A] bg-white p-3 mb-2 transition group"
              data-testid={`admin-chat-search-result-${r.message_id}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-sm text-[#0B3B5C] truncate">{r.customer_name || r.booking_id}</span>
                  <span className="text-[10px] font-mono text-[#64748B]">{r.booking_id}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-[#64748B] group-hover:text-[#E86A3C] shrink-0" />
              </div>
              <div className="text-xs text-[#0B3B5C] leading-relaxed">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4A94A] mr-1">{r.author_name}</span>
                {highlight(r.body, results.query)}
              </div>
              <div className="text-[10px] text-[#94A3B8] mt-1">
                {r.item_name} · {fmtDate(r.created_at)}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
