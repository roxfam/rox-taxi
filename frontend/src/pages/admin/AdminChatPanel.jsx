import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Send, RotateCw, ExternalLink, Copy, Paperclip, X, Check, CheckCheck } from "lucide-react";
import { api, BACKEND_URL } from "../../lib/api";

/**
 * AdminChatPanel — compact chat thread rendered inside BookingDetailModal.
 *
 * Polls `/api/admin/chat/{bid}` every 10 s to pick up new guest replies
 * without wiring a websocket. The guest link is HMAC-signed so admins
 * can copy it into email templates or paste it directly to a planner.
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

export default function AdminChatPanel({ bookingId }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLink, setGuestLink] = useState("");
  const [guestReadAt, setGuestReadAt] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/chat/${bookingId}`);
      setMessages(r.data?.messages || []);
      setGuestLink(r.data?.guest_link || "");
      setGuestReadAt(r.data?.last_read_guest_at || null);
    } catch (e) {
      // Silent — probably a 404 for a non-group booking; parent still renders.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text && !pendingImage) return;
    setSending(true);
    try {
      await api.post(`/admin/chat/${bookingId}`, {
        body: text,
        image_url: pendingImage?.url || undefined,
      });
      setBody("");
      setPendingImage(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Send failed");
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
      const r = await api.post(`/admin/chat/${bookingId}/upload`, fd);
      setPendingImage({ url: r.data.image_url, name: file.name });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const copyGuestLink = () => {
    if (!guestLink) return;
    navigator.clipboard?.writeText(guestLink);
    toast.success("Guest chat link copied");
  };

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden" data-testid="admin-chat-panel">
      <header className="p-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#0B3B5C]/8 flex items-center justify-center text-[#0B3B5C]">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#0B3B5C]">Private chat with planner</div>
            <div className="text-[11px] text-[#64748B]">Polls every 10 s · guest reads with the emailed link</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={copyGuestLink} className="inline-flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#0B3B5C] px-2 py-1 rounded hover:bg-[#F1F5F9]" data-testid="admin-chat-copy-link" title="Copy the HMAC guest chat link">
            <Copy className="w-3 h-3" /> Copy link
          </button>
          {guestLink && (
            <a href={guestLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#0B3B5C] px-2 py-1 rounded hover:bg-[#F1F5F9]" data-testid="admin-chat-open-guest">
              <ExternalLink className="w-3 h-3" /> Open as guest
            </a>
          )}
          <button onClick={load} className="p-1.5 rounded hover:bg-[#F1F5F9]" data-testid="admin-chat-refresh">
            <RotateCw className={`w-3.5 h-3.5 text-[#64748B] ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="max-h-[320px] overflow-y-auto p-4 space-y-3 bg-[#FAF9F6]"
        data-testid="admin-chat-messages"
      >
        {messages.length === 0 ? (
          <div className="text-center text-[#94A3B8] text-xs py-8">No messages yet · say hi to kick things off.</div>
        ) : messages.map((m) => {
          const mine = m.author === "dispatch";
          const seen = mine && guestReadAt && new Date(m.created_at).getTime() <= new Date(guestReadAt).getTime();
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`admin-chat-msg-${m.id}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${mine ? "bg-[#0B3B5C] text-white" : "bg-white border border-[#E2E8F0] text-[#0B3B5C]"}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${mine ? "text-[#D4A94A]" : "text-[#64748B]"}`}>
                  {m.author_name} · {timeAgo(m.created_at)}
                </div>
                {m.body && <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.body}</div>}
                {m.image_url && (
                  <a href={`${BACKEND_URL}${m.image_url}`} target="_blank" rel="noreferrer">
                    <img
                      src={`${BACKEND_URL}${m.image_url}`}
                      alt=""
                      className="mt-2 rounded-lg max-h-48 object-cover border border-black/10"
                      data-testid={`admin-chat-img-${m.id}`}
                    />
                  </a>
                )}
                {mine && (
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80" data-testid={`admin-chat-receipt-${m.id}`}>
                    {seen ? (
                      <><CheckCheck className="w-3 h-3 text-[#34D399]" /><span className="text-[#D4A94A] font-bold">Seen</span></>
                    ) : (
                      <><Check className="w-3 h-3" /><span>Sent</span></>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-[#E2E8F0] bg-white">
        {pendingImage && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] pl-2 pr-1 py-1" data-testid="admin-chat-pending-image">
            <img src={`${BACKEND_URL}${pendingImage.url}`} alt="" className="w-6 h-6 rounded object-cover" />
            <span className="text-[11px] text-[#0B3B5C]">{pendingImage.name}</span>
            <button
              onClick={() => setPendingImage(null)}
              className="w-5 h-5 rounded-full hover:bg-red-50 text-[#64748B] hover:text-red-600"
              data-testid="admin-chat-pending-image-clear"
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
            data-testid="admin-chat-file"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="h-10 px-2.5 rounded-xl border border-[#E2E8F0] text-[#64748B] hover:border-[#D4A94A] hover:text-[#D4A94A] disabled:opacity-50"
            data-testid="admin-chat-attach"
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
            placeholder="Reply to the planner · Enter to send, Shift+Enter for newline"
            className="flex-1 resize-none text-sm bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 focus:outline-none focus:border-[#D4A94A]"
            data-testid="admin-chat-input"
          />
          <button
            onClick={send}
            disabled={sending || (!body.trim() && !pendingImage)}
            className="inline-flex items-center gap-1 rounded-full bg-[#E86A3C] text-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#d55a30] active:scale-95 disabled:opacity-50"
            data-testid="admin-chat-send"
          >
            <Send className="w-3.5 h-3.5" /> {sending ? "…" : uploading ? "Uploading…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
