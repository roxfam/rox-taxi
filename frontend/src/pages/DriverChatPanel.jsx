import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { MessageSquare, Lock, RotateCw } from "lucide-react";
import { API } from "../lib/api";

/**
 * DriverChatPanel — read-only chat context for the assigned driver.
 *
 * Shows the dispatch ↔ planner thread 60 min before pickup so the driver
 * can walk up with full context (e.g. "please take the Baha Mar back
 * entrance"). No posting — drivers message dispatch via SMS/WhatsApp.
 * Polls every 20 s since drivers tend to pin this screen.
 */
function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!t) return iso;
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DriverChatPanel() {
  const { booking_id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/driver/chat/${booking_id}`);
      if (r.ok) setData(await r.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const h = setInterval(load, 20000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking_id]);

  if (!data) return null;

  // Not-yet-visible state (still outside the 60-min window)
  if (!data.visible) {
    return (
      <div className="w-full max-w-md mt-3 rounded-3xl bg-white/5 border border-white/10 p-5 backdrop-blur" data-testid="driver-chat-locked">
        <div className="flex items-center gap-2 text-white/60 text-xs">
          <Lock className="w-3.5 h-3.5" />
          <span>{data.reason || "Driver chat opens 60 min before pickup."}</span>
        </div>
      </div>
    );
  }

  const messages = data.messages || [];
  return (
    <div className="w-full max-w-md mt-3 rounded-3xl bg-white/5 border border-white/10 p-5 backdrop-blur" data-testid="driver-chat-panel">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <MessageSquare className="w-4 h-4 text-[#D4A94A]" />
          Planner chat · read-only
        </div>
        <button onClick={load} className="p-1 rounded hover:bg-white/10" data-testid="driver-chat-refresh">
          <RotateCw className={`w-3.5 h-3.5 text-white/50 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>
      {messages.length === 0 ? (
        <div className="text-xs text-white/50 py-3 text-center">No messages between dispatch and the planner yet.</div>
      ) : (
        <div className="max-h-[260px] overflow-y-auto space-y-2.5" data-testid="driver-chat-messages">
          {messages.map((m) => (
            <div key={m.id} className="rounded-xl bg-white/5 border border-white/10 p-2.5" data-testid={`driver-chat-msg-${m.id}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#D4A94A]">
                {m.author_name} · {timeAgo(m.created_at)}
              </div>
              {m.body && <div className="text-xs text-white/90 mt-1 whitespace-pre-wrap">{m.body}</div>}
              {m.image_url && (
                <img
                  src={m.image_url}
                  alt=""
                  className="mt-2 rounded-lg max-h-40 object-cover border border-white/10"
                  data-testid={`driver-chat-img-${m.id}`}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
