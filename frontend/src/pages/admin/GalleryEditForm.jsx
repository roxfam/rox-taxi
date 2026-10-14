import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";

// Inline editor for a guest photo's caption, display name and tagged tour.
export const GalleryEditForm = ({ item, onSaved, onCancel }) => {
  const [name, setName] = useState(item.submitter_name || "");
  const [caption, setCaption] = useState(item.caption || "");
  const [tourId, setTourId] = useState(item.tour_id || "");
  const [tours, setTours] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get("/tours").then(({ data }) => setTours(Array.isArray(data) ? data : [])).catch(() => setTours([]));
  }, []);
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/admin/gallery/${item.id}`, { submitter_name: name, caption, tour_id: tourId });
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
      <label className="block text-[11px] text-[#64748B]">Tour in this photo (Book button opens it)
        <select value={tourId} onChange={(e) => setTourId(e.target.value)} className={`${cls} mt-1 bg-white`} data-testid="admin-gallery-edit-tour">
          <option value="">No tour (use guest's last booking)</option>
          {tours.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="flex-1 rounded-full bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold py-1.5 disabled:opacity-60" data-testid="admin-gallery-edit-save">{saving ? "Saving…" : "Save"}</button>
        <button onClick={onCancel} className="flex-1 rounded-full border border-[#E2E8F0] text-[#64748B] text-xs font-semibold py-1.5" data-testid="admin-gallery-edit-cancel">Cancel</button>
      </div>
    </div>
  );
};
