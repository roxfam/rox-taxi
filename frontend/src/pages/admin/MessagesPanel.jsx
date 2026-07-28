import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, ExternalLink, Archive, MessageSquare } from "lucide-react";
import { api } from "../../lib/api";

// Contact-form inbox — mirrors /api/admin/contact-messages with a status filter
// (new / replied / archived) so the operator can triage without scrolling.
export default function MessagesPanel() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/contact-messages");
      setMessages(data);
    } catch { toast.error("Failed to load messages"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/admin/contact-messages/${id}/status`, { status });
      toast.success(status === "replied" ? "Marked replied" : status === "archived" ? "Archived" : "Reopened");
      load();
    } catch { toast.error("Update failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await api.delete(`/admin/contact-messages/${id}`);
      toast.success("Deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  const filtered = messages.filter((m) => filter === "all" ? true : (m.status || "new") === filter);
  const counts = {
    all: messages.length,
    new: messages.filter((m) => (m.status || "new") === "new").length,
    replied: messages.filter((m) => m.status === "replied").length,
    archived: messages.filter((m) => m.status === "archived").length,
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]" data-testid="messages-panel">
      <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="w-4 h-4 text-[#0B3B5C]" />
          <span className="text-[#64748B]">{counts.all} total ·</span>
          <span className="text-[#E86A3C] font-semibold">{counts.new} new</span>
        </div>
        <div className="inline-flex items-center rounded-md border border-[#E2E8F0] overflow-hidden text-xs" data-testid="messages-filter">
          {["all","new","replied","archived"].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 border-l first:border-l-0 border-[#E2E8F0] capitalize ${filter === k ? "bg-[#0B3B5C] text-white" : "text-[#64748B] hover:bg-[#F1F5F9]"}`}
              data-testid={`messages-filter-${k}`}
            >
              {k} <span className="opacity-60">({counts[k]})</span>
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="text-center py-16 text-[#64748B]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#64748B]">
          <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <div className="font-semibold">No {filter === "all" ? "" : filter} messages</div>
          <div className="text-xs mt-1">Contact-form submissions appear here in real time.</div>
        </div>
      ) : (
        <div className="divide-y divide-[#E2E8F0]">
          {filtered.map((m) => <MessageRow key={m.id} msg={m} onStatus={setStatus} onDelete={remove} />)}
        </div>
      )}
    </div>
  );
}

function MessageRow({ msg, onStatus, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const status = msg.status || "new";
  const statusColor = status === "new" ? "bg-[#E86A3C]/10 text-[#E86A3C]" : status === "replied" ? "bg-[#059669]/10 text-[#059669]" : "bg-[#94a3b8]/10 text-[#64748B]";
  const created = msg.created_at ? new Date(msg.created_at).toLocaleString() : "";

  return (
    <div className="p-4 hover:bg-[#FBF7EF]" data-testid={`message-row-${msg.id}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[#0B3B5C]">{msg.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold ${statusColor}`}>{status}</span>
            <span className="text-xs text-[#64748B]">· {msg.subject}</span>
            <span className="text-xs text-[#94a3b8]">· {created}</span>
          </div>
          <div className="mt-1 text-xs text-[#64748B] flex gap-3 flex-wrap">
            <a href={`mailto:${msg.email}`} className="hover:text-[#D4A94A] flex items-center gap-1" data-testid={`message-email-${msg.id}`}><Mail className="w-3 h-3" /> {msg.email}</a>
            {msg.phone && <a href={`tel:${msg.phone}`} className="hover:text-[#D4A94A]" data-testid={`message-phone-${msg.id}`}>{msg.phone}</a>}
          </div>
          <div
            className={`mt-2 text-sm text-[#0B192C] leading-relaxed ${expanded ? "" : "line-clamp-2"}`}
            data-testid={`message-body-${msg.id}`}
          >
            {msg.message}
          </div>
          {msg.message && msg.message.length > 140 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] font-semibold text-[#0B3B5C] hover:text-[#D4A94A] mt-1 uppercase tracking-wider"
              data-testid={`message-toggle-${msg.id}`}
            >
              {expanded ? "Collapse" : "Show more"}
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          <a
            href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject || "Your Rox message")} (${msg.id})&body=${encodeURIComponent(`Hi ${msg.name},\n\n\n\n— Rox Taxi Service & Tours\nRef: ${msg.id}`)}`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#0B3B5C] text-white hover:bg-[#132a4a] px-3 py-1.5 rounded transition-colors"
            data-testid={`message-reply-${msg.id}`}
          >
            <Mail className="w-3 h-3" /> Reply <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </a>
          {status !== "replied" && (
            <button onClick={() => onStatus(msg.id, "replied")} className="text-[10px] text-[#059669] hover:underline" data-testid={`message-mark-replied-${msg.id}`}>Mark replied</button>
          )}
          {status !== "archived" && (
            <button onClick={() => onStatus(msg.id, "archived")} className="text-[10px] text-[#64748B] hover:underline flex items-center gap-0.5" data-testid={`message-archive-${msg.id}`}><Archive className="w-2.5 h-2.5" /> Archive</button>
          )}
          {status !== "new" && (
            <button onClick={() => onStatus(msg.id, "new")} className="text-[10px] text-[#0B3B5C] hover:underline" data-testid={`message-reopen-${msg.id}`}>Reopen</button>
          )}
          <button onClick={() => onDelete(msg.id)} className="text-[10px] text-red-500 hover:underline" data-testid={`message-delete-${msg.id}`}>Delete</button>
        </div>
      </div>
    </div>
  );
}
