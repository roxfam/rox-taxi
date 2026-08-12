import { useEffect, useRef, useState } from "react";
import { X, Send, MessagesSquare, ExternalLink, Copy, Check, Gift } from "lucide-react";
import { api, BACKEND_URL } from "../lib/api";

const SUGGESTIONS = [
  "How much is an airport taxi?",
  "Book the Swimming Pigs tour",
  "Do you rent SUVs?",
  "How do I pay with Zelle?",
];

// Rotating hover/idle tooltips — each one hints at a real capability of the
// assistant. Kept short so the bubble stays elegant against the FAB.
const HOVER_TIPS = [
  "Chat with us — ask anything!",
  "Need airport pickup? Ask Roxi 🌴",
  "Curious about tours? We'll help you pick",
  "Live prices · Instant answers",
  "Talk to a real human on WhatsApp",
];

function getSessionId() {
  let s = localStorage.getItem("rox_chat_session");
  if (!s) {
    s = "sess-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now();
    localStorage.setItem("rox_chat_session", s);
  }
  return s;
}

/**
 * Warm-lead session counter — bumps ONCE per browser tab session (guarded
 * by sessionStorage). Returns the visitor's lifetime count. 3+ signals a
 * proven returning visitor at their peak intent moment; the chat widget
 * uses it to trigger a subtle amber glow and a warmer greeting.
 */
function getVisitCount() {
  if (typeof window === "undefined") return 1;
  try {
    if (sessionStorage.getItem("rox_visit_counted") !== "1") {
      const prev = parseInt(localStorage.getItem("rox_visit_count") || "0", 10) || 0;
      const next = prev + 1;
      localStorage.setItem("rox_visit_count", String(next));
      sessionStorage.setItem("rox_visit_counted", "1");
      return next;
    }
    return parseInt(localStorage.getItem("rox_visit_count") || "1", 10) || 1;
  } catch {
    return 1;
  }
}

const WARM_LEAD_THRESHOLD = 3;
const WARM_LEAD_COPY = "Back again? Ask us anything — returning visitors get priority booking help";

export default function ChatWidget() {
  const visitCount = useRef(getVisitCount()).current;
  const isWarmLead = visitCount >= WARM_LEAD_THRESHOLD;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: isWarmLead
        ? `${WARM_LEAD_COPY} — I'm Roxi 🌊, and I can pull up live prices, book you in, or hand you off to a real driver on WhatsApp any time.`
        : "Hey! I'm Roxi 🌊 — ask me anything about taxis, tours or car rentals in the Bahamas. If you'd rather talk to a real human, just tap 'Continue on WhatsApp' below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  const [waUrl, setWaUrl] = useState("");
  // Warm-lead promo state — pulled from /site-config. Only rendered when
  // the admin has flipped `warm_lead_promo_enabled` AND provided a code.
  const [promo, setPromo] = useState(null); // { code, discount_pct, description }
  const [promoCopied, setPromoCopied] = useState(false);
  // Per-user promo status — mirrors /api/promo/status.
  //   has_redeemed=true  → hide the card entirely (they've already booked
  //                        with a discount code so a repeat would be a
  //                        fraud/double-dip).
  //   has_copied         → they've copied the code but haven't booked yet;
  //                        show a softer "Ready to book with your X% off?"
  //                        nudge instead of the full card.
  const [promoStatus, setPromoStatus] = useState({ has_redeemed: false, has_copied_warm_lead: false });
  const [hovered, setHovered] = useState(false);
  const [nudged, setNudged] = useState(false);  // auto-invite bubble ~5s after page load
  // Gentle amber glow on the FAB when a returning visitor lands — plays once
  // per session for 3 seconds so it catches the eye without being naggy.
  const [warmGlow, setWarmGlow] = useState(false);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * HOVER_TIPS.length));
  const scrollRef = useRef(null);
  const sessionId = useRef(getSessionId()).current;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Track chat-open events on the backend so admin analytics can compare
  // warm-lead vs first-timer engagement. Fires ONCE per session (guarded
  // by sessionStorage) — one open counts, subsequent toggles don't inflate.
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("rox_chat_opened_tracked") === "1") return;
    sessionStorage.setItem("rox_chat_opened_tracked", "1");
    api.post("/chat/track-open", { visit_count: visitCount, warm_lead: isWarmLead }).catch(() => {});
  }, [open, visitCount, isWarmLead]);

  // Pull the WhatsApp number from site-config and build the wa.me deep-link.
  // We route ALL "talk to a human" hand-offs through WhatsApp — one channel,
  // one inbox, one owner-side app. Messenger is retired here per business ask.
  useEffect(() => {
    api.get("/site-config").then((r) => {
      const d = r?.data || {};
      const num = (d.whatsapp_number || "").replace(/[^\d]/g, "");
      if (num) setWaUrl(`https://wa.me/${num}`);
      // Warm-lead promo — only surface when explicitly enabled AND a code
      // is set. Description is optional; when the discount % is non-zero
      // we auto-generate friendly fallback copy.
      const code = (d.warm_lead_promo_code || "").trim().toUpperCase();
      if (d.warm_lead_promo_enabled === true && code) {
        setPromo({
          code,
          discount_pct: Number.isFinite(d.warm_lead_promo_discount_pct) ? d.warm_lead_promo_discount_pct : null,
          description: (d.warm_lead_promo_description || "").trim(),
        });
      }
    }).catch(() => {});
    // Per-user promo state — powers both the "hide when redeemed" branch
    // and the softer "ready to book?" nudge branch below.
    api.get("/promo/status").then((r) => {
      const d = r?.data || {};
      setPromoStatus({
        has_redeemed: !!d.has_redeemed,
        has_copied_warm_lead: !!d.has_copied_warm_lead,
      });
    }).catch(() => {});
  }, []);

  // Nudge the visitor once per session ~5s after landing — the tooltip bubble
  // pops in for 8 seconds, then disappears. Skipped if they've already opened
  // the chat this session (respects the user's attention).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("rox_chat_nudged") === "1") return;
    const showT = setTimeout(() => {
      setNudged(true);
      sessionStorage.setItem("rox_chat_nudged", "1");
    }, 5000);
    const hideT = setTimeout(() => setNudged(false), 13000); // 5s wait + 8s visible
    return () => { clearTimeout(showT); clearTimeout(hideT); };
  }, []);

  // Rotate the hover copy each time the user re-enters the FAB so returning
  // visitors see fresh nudges instead of the same line.
  useEffect(() => {
    if (hovered) setTipIndex((i) => (i + 1) % HOVER_TIPS.length);
  }, [hovered]);

  // Warm-lead pulse — trigger a 3-second amber glow on the FAB the FIRST
  // time a returning visitor (3rd+ session) lands. Once per session so we
  // don't hammer them if they navigate between pages. React StrictMode
  // double-mounts in dev; we always arm the cleanup timer so state ends up
  // false regardless of whether this mount was the one that first fired.
  useEffect(() => {
    if (!isWarmLead || typeof window === "undefined") return;
    const alreadyPlayed = sessionStorage.getItem("rox_warm_glow_played") === "1";
    if (!alreadyPlayed) {
      setWarmGlow(true);
      sessionStorage.setItem("rox_warm_glow_played", "1");
    }
    const t = setTimeout(() => setWarmGlow(false), 3000);
    return () => clearTimeout(t);
  }, [isWarmLead]);

  const handoffContext = () => {
    // Compose a short prefill referencing the visitor's latest question(s) so the
    // business owner has instant context when the conversation lands in WhatsApp.
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return lastUser
      ? `Hi Rox! I was just chatting on your website about: "${lastUser.text}". Can you help me finish the booking?`
      : "Hi Rox! Sending this from your website chat — can you help me?";
  };

  const copyPromo = () => {
    if (!promo?.code) return;
    const code = promo.code;
    const done = () => {
      setPromoCopied(true);
      setTimeout(() => setPromoCopied(false), 2200);
      // Fire-and-forget tracking — admin analytics counts this as engagement.
      api.post("/chat/track-promo-copy", { code, visit_count: visitCount }).catch(() => {});
    };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(() => {
          // Fallback path for browsers/contexts without clipboard permission.
          try {
            const ta = document.createElement("textarea");
            ta.value = code;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            done();
          } catch { /* ignore */ }
        });
      } else {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      }
    } catch { /* ignore */ }
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

  const showTip = !open && (hovered || nudged);

  return (
    <>
      {/* Floating button + hover/idle tooltip container */}
      <div className="fixed bottom-5 right-5 z-[85] flex items-end gap-3">
        {/* Elegant nudge tooltip — glass card with gold-gradient border, animated
            avatar, live "online" pulse, and a subtle typing indicator. Visible on
            hover (desktop) OR once per session ~5s after landing. */}
        <div
          data-testid="chat-fab-tooltip"
          role="tooltip"
          aria-hidden={!showTip}
          className={`hidden sm:block pointer-events-none select-none mb-2 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            showTip
              ? "opacity-100 translate-x-0 scale-100"
              : "opacity-0 translate-x-4 scale-95"
          }`}
        >
          {/* Gradient border wrapper — 1px gold→navy ring that catches the eye */}
          <div
            className="relative rounded-[22px] p-[1.5px] shadow-[0_20px_50px_-15px_rgba(11,25,44,0.55),0_0_35px_-10px_rgba(212,169,74,0.45)]"
            style={{ backgroundImage: "linear-gradient(135deg, #D4A94A 0%, rgba(212,169,74,0.15) 45%, #0B3B5C 100%)" }}
          >
            <div className="relative rounded-[21px] bg-white/95 backdrop-blur-xl pl-3 pr-5 py-3 flex items-center gap-3 min-w-[248px]">
              {/* Roxi avatar with animated gold ring */}
              <div className="relative shrink-0">
                <span className="absolute inset-0 rounded-full bg-[#D4A94A]/25 animate-ping" />
                <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-[#0B192C] to-[#0B3B5C] ring-2 ring-[#D4A94A]/60 flex items-center justify-center overflow-hidden shadow-inner">
                  <img
                    src="/logo-gold.webp"
                    alt=""
                    className="w-8 h-8 object-contain drop-shadow-[0_1px_3px_rgba(212,169,74,0.6)]"
                  />
                </div>
                {/* Online dot */}
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#22c55e] ring-2 ring-white flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-[#22c55e] animate-ping opacity-70" />
                </span>
              </div>

              {/* Copy stack */}
              <div className="min-w-0 flex-1">
                <div className="serif text-[15px] text-[#0B192C] leading-tight">
                  Chat with us
                </div>
                <div
                  key={tipIndex}
                  className="text-[11.5px] text-[#475569] leading-snug mt-0.5 animate-in fade-in slide-in-from-bottom-1 duration-500"
                >
                  {HOVER_TIPS[tipIndex]}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-[#D4A94A] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1 h-1 rounded-full bg-[#D4A94A] animate-bounce" style={{ animationDelay: "120ms" }} />
                    <span className="w-1 h-1 rounded-full bg-[#D4A94A] animate-bounce" style={{ animationDelay: "240ms" }} />
                  </span>
                  <span className="text-[9.5px] uppercase tracking-[0.14em] font-bold text-[#D4A94A]">
                    Roxi · replies instantly
                  </span>
                </div>
              </div>

              {/* Arrow pointing right toward the FAB — matches the gradient border */}
              <span
                className="absolute top-1/2 -right-[7px] -translate-y-1/2 w-3.5 h-3.5 rotate-45 bg-white/95 border-r border-t"
                style={{ borderColor: "rgba(212,169,74,0.6)" }}
                aria-hidden
              />
            </div>
          </div>
        </div>

        <button
          onClick={() => { setOpen((v) => !v); setUnread(false); setNudged(false); setWarmGlow(false); }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          data-testid="chat-fab"
          data-warm-lead={isWarmLead ? "true" : "false"}
          data-visit-count={visitCount}
          aria-label={isWarmLead ? "Chat with us — welcome back" : "Chat with us"}
          title={isWarmLead ? "Welcome back — chat with us" : "Chat with us"}
          className="group relative"
        >
          <span className={`absolute inset-0 rounded-full bg-[#D4A94A]/40 ${(unread || nudged) && !open ? "animate-ping" : ""}`} />
          {/* Warm-lead amber glow — soft outer halo that fades in/out over
              3 seconds when a 3rd+ visit visitor lands. Separate layer from
              the ping ring so effects don't stack. */}
          {warmGlow && !open && (
            <span
              data-testid="chat-fab-warm-glow"
              aria-hidden
              className="absolute -inset-2 rounded-full pointer-events-none"
              style={{
                background: "radial-gradient(circle, rgba(212,169,74,0.55) 0%, rgba(212,169,74,0) 70%)",
                animation: "rox-warm-glow 3s ease-out forwards",
              }}
            />
          )}
          <span className="relative w-16 h-16 rounded-full bg-gradient-to-br from-[#0B192C] via-[#0B3B5C] to-[#0B192C] ring-2 ring-[#D4A94A]/60 group-hover:ring-[#D4A94A] group-hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0_16px_40px_rgba(11,25,44,0.55)] flex items-center justify-center overflow-hidden">
            {open ? (
              <X className="w-6 h-6 text-white" />
            ) : (
              <img
                src="/logo-gold.webp"
                alt="Chat with Rox Taxi"
                className="w-11 h-11 object-contain drop-shadow-[0_2px_6px_rgba(212,169,74,0.5)]"
              />
            )}
            {unread && !open && (
              <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-[#E86A3C] ring-2 ring-white" />
            )}
          </span>
        </button>
      </div>

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
              src="/logo-gold.webp"
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

        {/* Warm-lead promo — three states, chosen by /api/promo/status:
            1) has_redeemed=true → hide entirely (they've already booked
               with a promo; showing it again would double-dip).
            2) has_copied_warm_lead=true → they copied the code but never
               booked; render a softer "ready to book?" nudge instead of
               the full card so we don't waste real estate re-teaching them
               the code they already grabbed.
            3) Fresh warm lead → full copyable promo card with the amber
               gift badge. */}
        {isWarmLead && promo && !promoStatus.has_redeemed && (
          promoStatus.has_copied_warm_lead && !promoCopied ? (
            <div
              className="mx-5 mt-1 mb-2 rounded-2xl border border-[#D4A94A]/40 bg-gradient-to-br from-[#FEF9E7] via-white to-[#FBF7EF] px-4 py-3 shadow-[0_6px_18px_rgba(212,169,74,0.14)] animate-in fade-in slide-in-from-bottom-2 duration-500"
              data-testid="chat-warm-lead-nudge"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-[#D4A94A] to-[#b88a2d] text-white shadow-inner shrink-0">
                  <Gift className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-[#0B3B5C] leading-tight">
                    Ready to book with your {promo.discount_pct ? `${promo.discount_pct}% off` : "returning-guest"} code?
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">
                    Your code <span className="mono font-bold text-[#0B3B5C]">{promo.code}</span> is still saved — just start a booking and it'll auto-apply.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="mx-5 mt-1 mb-2 rounded-2xl border border-[#D4A94A]/50 bg-gradient-to-br from-[#FEF9E7] via-white to-[#FBF7EF] p-3 shadow-[0_10px_25px_rgba(212,169,74,0.18)] animate-in fade-in slide-in-from-bottom-2 duration-500"
              data-testid="chat-warm-lead-promo"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-[#D4A94A] to-[#b88a2d] text-white shadow-inner">
                  <Gift className="w-3.5 h-3.5" />
                </span>
                <div className="text-[10px] uppercase tracking-[0.22em] font-black text-[#D4A94A]">
                  {promo.discount_pct ? `${promo.discount_pct}% off` : "Returning-guest perk"} · Just for you
                </div>
              </div>
              <div className="text-[12px] text-[#0B3B5C] leading-snug mb-2">
                {promo.description || (promo.discount_pct
                  ? `Welcome back! Use this code at checkout for ${promo.discount_pct}% off your next booking.`
                  : "Welcome back — here's a little something. Use this code at checkout.")}
              </div>
              <button
                type="button"
                onClick={copyPromo}
                data-testid="chat-promo-copy-btn"
                aria-label={`Copy promo code ${promo.code}`}
                className={`w-full inline-flex items-center justify-between gap-2 rounded-xl border-2 border-dashed px-3 py-2 text-sm font-black tracking-widest transition-all ${
                  promoCopied
                    ? "border-[#22c55e] bg-[#DCFCE7] text-[#166534]"
                    : "border-[#D4A94A] bg-white text-[#0B3B5C] hover:bg-[#FEF9E7] active:scale-[0.98]"
                }`}
              >
                <span className="mono truncate" data-testid="chat-promo-code">{promo.code}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                  {promoCopied ? (<><Check className="w-3.5 h-3.5" /> Copied</>) : (<><Copy className="w-3.5 h-3.5" /> Tap to copy</>)}
                </span>
              </button>
            </div>
          )
        )}

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

// Global keyframes for the warm-lead amber glow. Injected once on module
// load so the CSS lives next to the component instead of leaking into a
// shared stylesheet. `forwards` lets us fade out cleanly on the last frame.
if (typeof document !== "undefined" && !document.getElementById("rox-warm-glow-style")) {
  const s = document.createElement("style");
  s.id = "rox-warm-glow-style";
  s.textContent = `
    @keyframes rox-warm-glow {
      0%   { opacity: 0;    transform: scale(0.9); }
      15%  { opacity: 0.85; transform: scale(1.05); }
      55%  { opacity: 0.75; transform: scale(1.08); }
      100% { opacity: 0;    transform: scale(1.15); }
    }
  `;
  document.head.appendChild(s);
}
