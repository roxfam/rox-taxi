import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, Send, RotateCw, ArrowLeft, Paperclip, X, Check, CheckCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { API, BACKEND_URL } from "../lib/api";

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
  const typingTimerRef = useRef(0);
  const [messages, setMessages] = useState([]);
  const [meta, setMeta] = useState(null);
  const [dispatchReadAt, setDispatchReadAt] = useState(null);
  const [dispatchTypingAt, setDispatchTypingAt] = useState(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

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
      setDispatchReadAt(d.last_read_dispatch_at || null);
      setDispatchTypingAt(d.typing_dispatch_at || null);
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
    if (!text && !pendingImage) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/chat/${id}?t=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, image_url: pendingImage?.url || undefined }),
      });
      if (!r.ok) throw new Error("send failed");
      setBody("");
      setPendingImage(null);
      load();
    } catch (e) {
      toast.error("Message didn't go through. Please try again.");
    } finally { setSending(false); }
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/chat/${id}/upload?t=${encodeURIComponent(token)}`, {
        method: "POST", body: fd,
      });
      if (!r.ok) throw new Error("upload failed");
      const d = await r.json();
      setPendingImage({ url: d.image_url, name: file.name });
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
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
            const seen = mine && dispatchReadAt && new Date(m.created_at).getTime() <= new Date(dispatchReadAt).getTime();
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`guest-chat-msg-${m.id}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? "bg-[#E86A3C] text-white" : "bg-white border border-[#E2E8F0] text-[#0B3B5C]"}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${mine ? "text-white/80" : "text-[#64748B]"}`}>
                    {m.author_name} · {timeAgo(m.created_at)}
                  </div>
                  {m.body && <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</div>}
                  {m.image_url && (
                    <a href={`${BACKEND_URL}${m.image_url}`} target="_blank" rel="noreferrer">
                      <img src={`${BACKEND_URL}${m.image_url}`} alt="" className="mt-2 rounded-lg max-h-56 object-cover border border-black/10" data-testid={`guest-chat-img-${m.id}`} />
                    </a>
                  )}
                  {mine && (
                    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80" data-testid={`guest-chat-receipt-${m.id}`}>
                      {seen ? (
                        <><CheckCheck className="w-3 h-3" /><span className="font-bold">Seen by dispatch</span></>
                      ) : (
                        <><Check className="w-3 h-3" /><span>Sent</span></>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {dispatchTypingAt && (Date.now() - new Date(dispatchTypingAt).getTime()) < 5000 && (
            <div className="flex justify-start" data-testid="guest-chat-typing-indicator">
              <div className="bg-white border border-[#E2E8F0] rounded-2xl px-4 py-2 inline-flex items-center gap-1.5 text-[#64748B]">
                <span className="w-1.5 h-1.5 bg-[#D4A94A] rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-[#D4A94A] rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                <span className="w-1.5 h-1.5 bg-[#D4A94A] rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                <span className="text-[11px] font-semibold ml-1">Dispatch is typing…</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#E2E8F0] bg-white">
          {pendingImage && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] pl-2 pr-1 py-1" data-testid="guest-chat-pending-image">
              <img src={`${BACKEND_URL}${pendingImage.url}`} alt="" className="w-6 h-6 rounded object-cover" />
              <span className="text-[11px] text-[#0B3B5C]">{pendingImage.name}</span>
              <button
                onClick={() => setPendingImage(null)}
                className="w-5 h-5 rounded-full hover:bg-red-50 text-[#64748B] hover:text-red-600"
                data-testid="guest-chat-pending-image-clear"
              >
                <X className="w-3 h-3 mx-auto" />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickImage}
              className="hidden"
              data-testid="guest-chat-file"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="h-10 px-2.5 rounded-xl border border-[#E2E8F0] text-[#64748B] hover:border-[#D4A94A] hover:text-[#D4A94A] disabled:opacity-50"
              data-testid="guest-chat-attach"
              title="Attach image (≤5 MB)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
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
              disabled={sending || (!body.trim() && !pendingImage)}
              className="inline-flex items-center gap-1 rounded-full bg-[#E86A3C] text-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#d55a30] active:scale-95 disabled:opacity-50"
              data-testid="guest-chat-send"
            >
              <Send className="w-3.5 h-3.5" /> {sending ? "…" : uploading ? "Uploading…" : "Send"}
            </button>
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-[#94A3B8] mt-4">
        Secure link · unique to your booking. Don't share this URL.
      </p>
    </div>
  );
}
