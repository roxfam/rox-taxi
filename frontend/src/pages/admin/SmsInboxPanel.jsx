import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Send, RefreshCw } from "lucide-react";
import { api } from "../../lib/api";
import QuickReplies from "./QuickReplies";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "");

function ThreadList({ threads, active, onPick }) {
  if (!threads.length) {
    return <div className="p-6 text-sm text-[#94a3b8]" data-testid="sms-inbox-empty">No guest texts yet.</div>;
  }
  return (
    <ul className="divide-y divide-[#E2E8F0]" data-testid="sms-inbox-thread-list">
      {threads.map((t) => (
        <li key={t.phone_key}>
          <button
            type="button"
            onClick={() => onPick(t)}
            className={`w-full text-left px-4 py-3 transition-colors ${active === t.phone_key ? "bg-[#0B3B5C]/5" : "hover:bg-[#F8FAFC]"}`}
            data-testid={`sms-thread-${t.phone_key}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#0B3B5C] text-sm truncate">{t.customer_name || t.phone}</span>
              {t.unread > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#E86A3C] text-white text-[10px] font-bold inline-flex items-center justify-center" data-testid={`sms-thread-unread-${t.phone_key}`}>{t.unread}</span>
              )}
            </div>
            <div className="text-xs text-[#64748B] truncate">{t.last_direction === "out" ? "You: " : ""}{t.last_body}</div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">{t.booking_id ? `${t.booking_id} · ` : ""}{fmt(t.last_at)}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Conversation({ thread, messages, onSent }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post("/admin/guest-sms/reply", { to: thread.phone, body: text });
      setText("");
      toast.success("Text sent");
      onSent();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="sms-conversation">
      <div className="px-4 py-3 border-b border-[#E2E8F0]">
        <div className="font-semibold text-[#0B3B5C]">{thread.customer_name || "Unknown guest"}</div>
        <div className="text-xs text-[#64748B] font-mono">{thread.phone}{thread.booking_id ? ` · ${thread.booking_id}` : ""}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#FAF9F6]" data-testid="sms-message-list">
        {messages.map((m, i) => {
          const out = m.direction === "out";
          return (
            <div key={i} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${out ? "bg-[#0B3B5C] text-white" : "bg-white border border-[#E2E8F0] text-[#0B3B5C]"}`}>
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`text-[10px] mt-1 ${out ? "text-white/60" : "text-[#94a3b8]"}`}>{fmt(m.received_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <QuickReplies firstName={(thread.customer_name || "").split(" ")[0]} onPick={setText} />
      <form onSubmit={send} className="p-3 border-t border-[#E2E8F0] flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a reply…"
          maxLength={1000}
          className="flex-1 px-3 py-2 border border-[#E2E8F0] rounded-full text-sm"
          data-testid="sms-reply-input"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E86A3C] text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
          data-testid="sms-reply-send-btn"
        >
          <Send className="w-4 h-4" /> {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}

export default function SmsInboxPanel() {
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);

  const loadThreads = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/guest-sms/inbox");
      setThreads(data.threads || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Inbox load failed");
    }
  }, []);

  const openThread = useCallback(async (t) => {
    setActive(t);
    try {
      const { data } = await api.get(`/admin/guest-sms/thread/${t.phone_key}`);
      setMessages(data.messages || []);
      setThreads((ts) => ts.map((x) => (x.phone_key === t.phone_key ? { ...x, unread: 0 } : x)));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Thread load failed");
    }
  }, []);

  useEffect(() => {
    loadThreads();
    const id = setInterval(loadThreads, 20000);
    return () => clearInterval(id);
  }, [loadThreads]);

  const refreshAll = () => {
    loadThreads();
    if (active) openThread(active);
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="sms-inbox-panel">
      <div className="p-5 border-b border-[#E2E8F0] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold">
            <MessageSquare className="w-3 h-3" /> Guest texts
          </div>
          <h2 className="mt-1 font-[Georgia] text-[#0B3B5C] text-2xl">Every guest reply, in one place</h2>
        </div>
        <button type="button" onClick={refreshAll} className="inline-flex items-center gap-1.5 text-sm text-[#0B3B5C] hover:text-[#E86A3C] transition-colors" data-testid="sms-inbox-refresh-btn">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>
      <div className="grid md:grid-cols-[320px_1fr] min-h-[480px]">
        <div className="border-b md:border-b-0 md:border-r border-[#E2E8F0] max-h-[560px] overflow-y-auto">
          <ThreadList threads={threads} active={active?.phone_key} onPick={openThread} />
        </div>
        <div className="h-[560px]">
          {active ? (
            <Conversation thread={active} messages={messages} onSent={refreshAll} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[#94a3b8]">Pick a conversation to read and reply.</div>
          )}
        </div>
      </div>
    </div>
  );
}
