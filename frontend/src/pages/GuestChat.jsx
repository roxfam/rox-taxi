import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, Send, RotateCw, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { API } from "../lib/api";

/**
 * GuestChat — token-authed group chat page.
 *
 * No login required. The HMAC `?t=` query param is the auth; same
 * pattern as /pay-balance. Lead planners open this from the email we
 * send after confirmation and can message dispatch directly.
 */
function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!t) return iso;
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function GuestChat() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const [messages, setMessages] = useState([]);
  const [meta, setMeta] = useState(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/chat/${id}?t=${encodeURIComponent(token)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.detail || `Chat unavailable (${r.status})`);
        return;
      }
      const d = await r.json();
      setMessages(d.messages || []);
      setMeta({ item_name: d.item_name, booking_date: d.booking_date });
    } catch (e) {
      setError("Could not reach the server. Try again in a moment.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const h = setInterval(load, 10000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/chat/${id}?t=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!r.ok) throw new Error("send failed");
      setBody("");
      load();
    } catch (e) {
      toast.error("Message didn't go through. Please try again.");
    } finally { setSending(false); }
  };

  if (!token) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center" data-testid="guest-chat-no-token">
        <h1 className="serif text-2xl text-[#0B3B5C]">This link needs the token from your email.</h1>
        <p className="text-sm text-[#64748B] mt-3">Open the chat link we sent you from your inbox and the thread will load automatically.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center" data-testid="guest-chat-error">
        <h1 className="serif text-2xl text-[#0B3B5C]">We can't open this chat.</h1>
        <p className="text-sm text-[#64748B] mt-3">{error}</p>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-[#D4A94A] mt-5 hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Rox
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10" data-testid="guest-chat-page">
      <div className="rounded-3xl overflow-hidden border border-[#E2E8F0] bg-white shadow-[0_20px_60px_rgba(11,59,92,0.08)]">
        <header className="p-6 bg-gradient-to-br from-[#0B3B5C] to-[#132a4a] text-white">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">Private planner chat</div>
          <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
            <h1 className="serif text-2xl flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#D4A94A]" />
              Booking {id}
            </h1>
            <button onClick={load} className="p-2 rounded-lg hover:bg-white/10" data-testid="guest-chat-refresh">
              <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          {meta?.item_name && (
            <div className="text-[13px] text-white/70 mt-1">
              {meta.item_name}{meta.booking_date ? ` · ${new Date(meta.booking_date).toLocaleString()}` : ""}
            </div>
          )}
        </header>

        <div
          ref={scrollRef}
          className="max-h-[55vh] overflow-y-auto p-5 space-y-3 bg-[#FAF9F6]"
          data-testid="guest-chat-messages"
        >
          {messages.length === 0 ? (
            <div className="text-center text-[#94A3B8] text-sm py-10">
              No messages yet. Send a hello and dispatch will reply shortly — we check this thread round-the-clock.
            </div>
          ) : messages.map((m) => {
            const mine = m.author === "guest";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`guest-chat-msg-${m.id}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? "bg-[#E86A3C] text-white" : "bg-white border border-[#E2E8F0] text-[#0B3B5C]"}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${mine ? "text-white/80" : "text-[#64748B]"}`}>
                    {m.author_name} · {timeAgo(m.created_at)}
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-[#E2E8F0] flex gap-2 items-end bg-white">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            maxLength={2000}
            placeholder="Message dispatch · Enter to send"
            className="flex-1 resize-none text-sm bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 focus:outline-none focus:border-[#D4A94A]"
            data-testid="guest-chat-input"
          />
          <button
            onClick={send}
            disabled={sending || !body.trim()}
            className="inline-flex items-center gap-1 rounded-full bg-[#E86A3C] text-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#d55a30] active:scale-95 disabled:opacity-50"
            data-testid="guest-chat-send"
          >
            <Send className="w-3.5 h-3.5" /> {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
      <p className="text-center text-[11px] text-[#94A3B8] mt-4">
        Secure link · unique to your booking. Don't share this URL.
      </p>
    </div>
  );
}
