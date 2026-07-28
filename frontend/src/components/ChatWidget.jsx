import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Waves, MessagesSquare, ExternalLink } from "lucide-react";
import { api, BACKEND_URL } from "../lib/api";

const SUGGESTIONS = [
  "How much is an airport taxi?",
  "Book the Swimming Pigs tour",
  "Do you rent SUVs?",
  "How do I pay with Zelle?",
];

function getSessionId() {
  let s = localStorage.getItem("rox_chat_session");
  if (!s) {
    s = "sess-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now();
    localStorage.setItem("rox_chat_session", s);
  }
  return s;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hey! I'm Roxi 🌊 — ask me anything about taxis, tours or car rentals in the Bahamas. If you'd rather talk to a real human, just tap 'Continue on Messenger' below." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const [messengerUrl, setMessengerUrl] = useState("");
  const scrollRef = useRef(null);
  const sessionId = useRef(getSessionId()).current;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Pull the Messenger deep-link (auto-derived from the FB page URL on the backend).
  useEffect(() => {
    api.get("/site-config").then((r) => {
      if (r?.data?.messenger_url) setMessengerUrl(r.data.messenger_url);
    }).catch(() => {});
  }, []);

  const handoffContext = () => {
    // Compose a short prefill referencing the visitor's latest question(s) so the
    // business owner has instant context when the conversation lands in their FB inbox.
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return lastUser
      ? `Hi Rox! I was just chatting on your website about: "${lastUser.text}". Can you help me finish the booking?`
      : "Hi Rox! Sending this from your website chat — can you help me?";
  };

  const openMessenger = () => {
    if (!messengerUrl) return;
    const ref = encodeURIComponent("website-chat-handoff");
    const url = `${messengerUrl}${messengerUrl.includes("?") ? "&" : "?"}ref=${ref}`;
    window.open(url, "_blank", "noopener,noreferrer");
    // Optimistic UI: log to the transcript so the visitor knows the handoff happened.
    setMessages((m) => [
      ...m,
      { role: "assistant", text: "Opened Messenger in a new tab 👋 A real human will reply as soon as they see your message. This chat stays open in case you need Roxi in the meantime." },
    ]);
    // Copy the suggested prefill to the clipboard so users can paste immediately.
    try { navigator.clipboard?.writeText(handoffContext()); } catch { /* ignore */ }
  };

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: msg }, { role: "assistant", text: "" }]);
    setBusy(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: msg }),
      });
      if (!res.ok || !res.body) throw new Error("Chat unavailable");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      // read SSE stream
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let ev = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) ev = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).replace(/^ /, "");
          }
          if (ev === "done") continue;
          if (ev === "error") {
            setMessages((m) => {
              const c = [...m];
              c[c.length - 1] = { role: "assistant", text: "Sorry — I ran into an issue. Please try again — or tap 'Continue on Messenger' to chat with a real human." };
              return c;
            });
            continue;
          }
          setMessages((m) => {
            const c = [...m];
            c[c.length - 1] = { role: "assistant", text: (c[c.length - 1].text || "") + data };
            return c;
          });
          if (!open) setUnread(true);
        }
      }
    } catch {
      setMessages((m) => {
        const c = [...m];
        c[c.length - 1] = { role: "assistant", text: messengerUrl ? "Sorry — the AI is temporarily unavailable. Tap 'Continue on Messenger' below to reach us live." : "Sorry — chat is temporarily unavailable. Please call +1 (242) 000-0000." };
        return c;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen((v) => !v); setUnread(false); }}
        data-testid="chat-fab"
        aria-label="Open live chat"
        className="fixed bottom-5 right-5 z-[85] w-16 h-16 rounded-full bg-[#E86A3C] text-white shadow-[0_16px_40px_rgba(232,106,60,0.5)] hover:bg-[#d55a30] active:scale-95 transition-transform flex items-center justify-center"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {unread && !open && (
          <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-[#D4A94A] ring-2 ring-white animate-pulse" />
        )}
      </button>

      {/* Chat panel */}
      <div
        data-testid="chat-panel"
        className={`fixed bottom-24 right-5 z-[85] w-[92vw] sm:w-[400px] max-h-[70vh] flex flex-col rounded-3xl shadow-[0_30px_80px_rgba(11,25,44,0.25)] border border-white/60 bg-white overflow-hidden origin-bottom-right transition-all duration-200 ${
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="bg-[#0B3B5C] text-white p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#D4A94A] flex items-center justify-center">
            <Waves className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="serif text-lg leading-none">Chat with Roxi</div>
            <div className="text-xs text-white/60 mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" /> Online · Instant reply
            </div>
          </div>
          {messengerUrl && (
            <button
              type="button"
              onClick={openMessenger}
              title="Continue on Facebook Messenger"
              data-testid="chat-messenger-header"
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide px-3 py-1.5 rounded-full bg-[#0084FF] hover:bg-[#0073e0] transition-colors text-white"
            >
              <MessagesSquare className="w-3.5 h-3.5" /> Messenger
            </button>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FBF7EF]" data-testid="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-[#E86A3C] text-white rounded-br-sm"
                    : "bg-white border border-[#E2E8F0] text-[#0B3B5C] rounded-bl-sm"
                }`}
                data-testid={`chat-msg-${m.role}-${i}`}
              >
                {m.text || <span className="inline-flex gap-1"><Dot /><Dot d={0.15} /><Dot d={0.3} /></span>}
              </div>
            </div>
          ))}
        </div>

        {messages.length <= 1 && (
          <div className="px-4 pb-2 flex flex-wrap gap-2" data-testid="chat-suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs bg-white border border-[#E2E8F0] rounded-full px-3 py-1.5 hover:border-[#D4A94A] hover:text-[#D4A94A] transition-colors"
                data-testid={`chat-suggestion-${s.slice(0,10).replace(/\s+/g,'-')}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messengerUrl && (
          <button
            type="button"
            onClick={openMessenger}
            data-testid="chat-messenger-cta"
            className="mx-4 mb-2 rounded-xl bg-gradient-to-r from-[#0084FF] to-[#0073e0] text-white text-xs font-semibold tracking-wide py-2.5 px-3 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <MessagesSquare className="w-4 h-4" />
            Continue on Messenger
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </button>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="p-3 border-t border-[#E2E8F0] flex gap-2 bg-white"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about pricing, tours, availability…"
            className="flex-1 rounded-full bg-[#F1F5F9] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4A94A]"
            data-testid="chat-input"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            data-testid="chat-send-btn"
            className="w-11 h-11 rounded-full bg-[#0B3B5C] text-white flex items-center justify-center hover:bg-[#132a4a] active:scale-95 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </>
  );
}

function Dot({ d = 0 }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-[#64748B] animate-bounce"
      style={{ animationDelay: `${d}s` }}
    />
  );
}
