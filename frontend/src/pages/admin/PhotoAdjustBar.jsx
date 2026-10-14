import { useState } from "react";
import { toast } from "sonner";
import { Wand2, RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { api } from "../../lib/api";

const ACTIONS = [
  { key: "enhance", label: "Auto enhance", Icon: Wand2 },
  { key: "rotate_left", label: "", Icon: RotateCcw, title: "Rotate left" },
  { key: "rotate_right", label: "", Icon: RotateCw, title: "Rotate right" },
];

// Auto-enhance / rotate / undo buttons for a guest photo, used before approving.
export const PhotoAdjustBar = ({ item, onSaved }) => {
  const [busy, setBusy] = useState("");
  const edited = item.original_filename && item.original_filename !== item.filename;
  const run = async (action) => {
    setBusy(action);
    try {
      const { data } = await api.post(`/admin/gallery/${item.id}/adjust`, { action });
      onSaved(data);
      toast.success(action === "revert" ? "Original photo restored" : action === "enhance" ? "Photo enhanced" : "Photo rotated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Photo edit failed");
    } finally {
      setBusy("");
    }
  };
  const btn = "inline-flex items-center justify-center gap-1.5 rounded-full border text-xs font-semibold py-1.5 px-3 disabled:opacity-60 transition-colors";
  return (
    <div className="flex flex-wrap gap-2" data-testid={`admin-gallery-adjust-${item.id}`}>
      {ACTIONS.map(({ key, label, Icon, title }) => (
        <button key={key} type="button" onClick={() => run(key)} disabled={!!busy} title={title || label}
          className={`${btn} ${key === "enhance" ? "flex-1 border-[#D4A94A] text-[#0B3B5C] bg-[#D4A94A]/10 hover:bg-[#D4A94A]/25" : "border-[#E2E8F0] text-[#0B3B5C] hover:bg-[#F1F5F9]"}`}
          data-testid={`admin-gallery-${key.replace("_", "-")}-${item.id}`}>
          <Icon className={`w-3.5 h-3.5 ${busy === key ? "animate-spin" : ""}`} /> {label}
        </button>
      ))}
      {edited && (
        <button type="button" onClick={() => run("revert")} disabled={!!busy} className={`${btn} border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9]`} data-testid={`admin-gallery-revert-${item.id}`}>
          <Undo2 className="w-3.5 h-3.5" /> Undo edits
        </button>
      )}
    </div>
  );
};
