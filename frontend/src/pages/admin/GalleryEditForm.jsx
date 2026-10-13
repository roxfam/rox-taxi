import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";

// Inline editor for a guest photo's caption and display name.
export const GalleryEditForm = ({ item, onSaved, onCancel }) => {
  const [name, setName] = useState(item.submitter_name || "");
  const [caption, setCaption] = useState(item.caption || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/admin/gallery/${item.id}`, { submitter_name: name, caption });
      toast.success("Photo details updated");
      onSaved(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
      setSaving(false);
    }
  };
  const cls = "w-full rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm focus:border-[#D4A94A] focus:outline-none";
  return (
    <div className="space-y-2" data-testid={`admin-gallery-edit-form-${item.id}`}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name" maxLength={100} className={cls} data-testid="admin-gallery-edit-name" />
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption" rows={2} maxLength={500} className={cls} data-testid="admin-gallery-edit-caption" />
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="flex-1 rounded-full bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold py-1.5 disabled:opacity-60" data-testid="admin-gallery-edit-save">{saving ? "Saving…" : "Save"}</button>
        <button onClick={onCancel} className="flex-1 rounded-full border border-[#E2E8F0] text-[#64748B] text-xs font-semibold py-1.5" data-testid="admin-gallery-edit-cancel">Cancel</button>
      </div>
    </div>
  );
};
