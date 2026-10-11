import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Zap, Pencil, Save, X } from "lucide-react";
import { api } from "../../lib/api";

export default function QuickReplies({ firstName, onPick }) {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    api.get("/admin/guest-sms/templates")
      .then(({ data }) => setTemplates(data.templates || []))
      .catch(() => {});
  }, []);

  const fill = (t) => t.replaceAll("{first}", firstName || "there");

  const save = async () => {
    try {
      const { data } = await api.put("/admin/guest-sms/templates", {
        templates: draft.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      setTemplates(data.templates || []);
      setEditing(false);
      toast.success("Quick replies saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    }
  };

  if (editing) {
    return (
      <div className="px-3 pt-3" data-testid="sms-quick-replies-editor">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-xs"
          data-testid="sms-quick-replies-textarea"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-[#94a3b8]">One reply per line · use {"{first}"} for the guest's first name</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} className="inline-flex items-center gap-1 text-xs text-[#64748B]" data-testid="sms-quick-replies-cancel-btn"><X className="w-3 h-3" /> Cancel</button>
            <button type="button" onClick={save} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B3B5C]" data-testid="sms-quick-replies-save-btn"><Save className="w-3 h-3" /> Save</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 flex flex-wrap gap-1.5 items-center" data-testid="sms-quick-replies">
      <Zap className="w-3 h-3 text-[#D4A94A]" />
      {templates.map((t, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(fill(t))}
          className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-[#E2E8F0] bg-white text-[#0B3B5C] hover:border-[#D4A94A] hover:bg-[#D4A94A]/10 transition-colors max-w-[240px] truncate"
          title={fill(t)}
          data-testid={`sms-quick-reply-${i}`}
        >
          {fill(t)}
        </button>
      ))}
      <button
        type="button"
        onClick={() => { setDraft(templates.join("\n")); setEditing(true); }}
        className="inline-flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#0B3B5C] transition-colors"
        data-testid="sms-quick-replies-edit-btn"
      >
        <Pencil className="w-3 h-3" /> Edit
      </button>
    </div>
  );
}
