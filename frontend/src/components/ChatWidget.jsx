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
    { role: "assistant", text: "Hey! I'm Roxi 🌊 — ask me anything about taxis, tours or car rentals in the Bahamas. If you'd rather talk to a real human, just tap 'Continue on WhatsApp' below." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const [waUrl, setWaUrl] = useState("");
  const scrollRef = useRef(null);
  const sessionId = useRef(getSessionId()).current;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Pull the WhatsApp number from site-config and build the wa.me deep-link.
  // We route ALL "talk to a human" hand-offs through WhatsApp — one channel,
  // one inbox, one owner-side app. Messenger is retired here per business ask.
  useEffect(() => {
    api.get("/site-config").then((r) => {
      const num = (r?.data?.whatsapp_number || "").replace(/[^\d]/g, "");
      if (num) setWaUrl(`https://wa.me/${num}`);
    }).catch(() => {});
  }, []);

  const handoffContext = () => {
    // Compose a short prefill referencing the visitor's latest question(s) so the
    // business owner has instant context when the conversation lands in WhatsApp.
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return lastUser
      ? `Hi Rox! I was just chatting on your website about: "${lastUser.text}". Can you help me finish the booking?`
      : "Hi Rox! Sending this from your website chat — can you help me?";
  };

  const openHandoff = () => {
    if (!waUrl) return;
    // wa.me supports ?text= to prefill the message body. This is huge — the
    // owner opens WhatsApp and sees the visitor's actual question already typed.
    const url = `${waUrl}?text=${encodeURIComponent(handoffContext())}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setMessages((m) => [
      ...m,
      { role: "assistant", text: "Opened WhatsApp in a new tab 👋 A real human will reply as soon as they see your message. This chat stays open in case you need Roxi in the meantime." },
    ]);
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
              c[c.length - 1] = { role: "assistant", text: "Sorry — I ran into an issue. Please try again — or tap 'Continue on WhatsApp' to chat with a real human." };
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
        c[c.length - 1] = { role: "assistant", text: waUrl ? "Sorry — the AI is temporarily unavailable. Tap 'Continue on WhatsApp' below to reach us live." : "Sorry — chat is temporarily unavailable. Please call +1 (242) 432-2587." };
        return c;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating button — branded, animated ring pulse when there's an unread message */}
      <button
        onClick={() => { setOpen((v) => !v); setUnread(false); }}
        data-testid="chat-fab"
        aria-label="Open live chat"
        className="fixed bottom-5 right-5 z-[85] group"
      >
        <span className={`absolute inset-0 rounded-full bg-[#D4A94A]/40 ${unread && !open ? "animate-ping" : ""}`} />
        <span className="relative w-16 h-16 rounded-full bg-gradient-to-br from-[#0B192C] via-[#0B3B5C] to-[#0B192C] ring-2 ring-[#D4A94A]/60 group-hover:ring-[#D4A94A] group-hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0_16px_40px_rgba(11,25,44,0.55)] flex items-center justify-center overflow-hidden">
          {open ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <img
              src="https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/slneek3g_Color%20logo%20-%20no%20background.webp"
              alt="Chat with Rox Taxi"
              className="w-11 h-11 object-contain drop-shadow-[0_2px_6px_rgba(212,169,74,0.5)]"
            />
          )}
          {unread && !open && (
            <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-[#E86A3C] ring-2 ring-white" />
          )}
        </span>
      </button>

      {/* Chat panel — glass-morphism card with subtle grain overlay */}
      <div
        data-testid="chat-panel"
        className={`fixed bottom-24 right-5 z-[85] w-[92vw] sm:w-[420px] max-h-[75vh] flex flex-col rounded-[28px] shadow-[0_40px_100px_rgba(11,25,44,0.4)] border border-white/70 bg-white/95 backdrop-blur-xl overflow-hidden origin-bottom-right transition-all duration-300 ease-out ${
          open ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-95 translate-y-4 pointer-events-none"
        }`}
      >
        {/* Header with radial gold glow */}
        <div className="relative bg-gradient-to-br from-[#0B192C] via-[#0B3B5C] to-[#0B192C] text-white p-5 flex items-center gap-3 overflow-hidden">
          <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: "radial-gradient(circle at 15% 20%, rgba(212,169,74,0.4), transparent 55%)" }} />
          <div className="relative w-12 h-12 rounded-full bg-white/5 ring-1 ring-[#D4A94A]/50 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
            <img
              src="https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/slneek3g_Color%20logo%20-%20no%20background.webp"
              alt="Rox Taxi Service"
              className="w-10 h-10 object-contain"
            />
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="serif text-lg leading-none">Chat with Roxi</div>
            <div className="text-[11px] text-white/70 mt-1.5 flex items-center gap-1.5">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-[#22c55e] animate-ping opacity-75" />
                <span className="relative w-2 h-2 rounded-full bg-[#22c55e]" />
              </span>
              Online · Typically replies instantly
            </div>
          </div>
          {waUrl && (
            <button
              type="button"
              onClick={openHandoff}
              title="Continue on WhatsApp"
              data-testid="chat-whatsapp-header"
              className="relative hidden sm:inline-flex items-center gap-1.5 text-[11px] font-black tracking-wide px-3 py-1.5 rounded-full bg-[#25D366] hover:bg-[#1EBE5D] active:scale-95 transition-all text-white shadow-[0_6px_15px_rgba(37,211,102,0.4)]"
            >
              <MessagesSquare className="w-3.5 h-3.5" /> WhatsApp
            </button>
          )}
        </div>

        {/* Messages area — cream background with subtle noise texture */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#FBF7EF]" data-testid="chat-messages" style={{ backgroundImage: "radial-gradient(circle at 10% 90%, rgba(212,169,74,0.06), transparent 40%)" }}>
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div
                className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-[0_4px_12px_rgba(11,25,44,0.06)] ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-[#E86A3C] to-[#d55a30] text-white rounded-[18px] rounded-br-[4px]"
                    : "bg-white border border-[#E2E8F0]/60 text-[#0B3B5C] rounded-[18px] rounded-bl-[4px]"
                }`}
                data-testid={`chat-msg-${m.role}-${i}`}
              >
                {m.text || <span className="inline-flex gap-1"><Dot /><Dot d={0.15} /><Dot d={0.3} /></span>}
              </div>
            </div>
          ))}
        </div>

        {messages.length <= 1 && (
          <div className="px-5 pb-3 flex flex-wrap gap-2" data-testid="chat-suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs bg-white border border-[#E2E8F0]/70 rounded-full px-3 py-1.5 hover:border-[#D4A94A] hover:text-[#D4A94A] hover:shadow-[0_4px_12px_rgba(212,169,74,0.15)] transition-all"
                data-testid={`chat-suggestion-${s.slice(0,10).replace(/\s+/g,'-')}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {waUrl && (
          <button
            type="button"
            onClick={openHandoff}
            data-testid="chat-whatsapp-cta"
            className="mx-5 mb-3 rounded-2xl bg-gradient-to-r from-[#25D366] to-[#1EBE5D] text-white text-xs font-black tracking-wide py-3 px-3 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_10px_25px_rgba(37,211,102,0.4)]"
          >
            <MessagesSquare className="w-4 h-4" />
            Continue on WhatsApp
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </button>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="p-3 border-t border-[#E2E8F0]/60 flex gap-2 bg-white/80 backdrop-blur"
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
