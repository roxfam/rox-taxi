import { useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Save, X } from "lucide-react";
import { api } from "../../lib/api";
import { F, resolveUrl } from "./shared";
import ImagePickerModal from "./ImagePickerModal";

// Full add/edit form for tour / taxi_service / rental items. Rental adds a
// second grid of vehicle-specific fields (year/make/model/color/body/seats)
// so the admin can maintain the whole fleet without touching seed_data.py.
export default function EditModal({ kind, initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: initial.name || "",
    description: initial.description || "",
    price: initial.price ?? 0,
    duration: initial.duration || "",
    image_url: initial.image_url || "",
    category: initial.category || "",
    seats: initial.seats || 0,
    active: initial.active !== false,
    year: initial.year || "",
    make: initial.make || "",
    model: initial.model || "",
    color: initial.color || "",
    body: initial.body || "",
    route: initial.route || "",
    location: initial.location || "",
    featured: !!initial.featured,
    external_booking_url: initial.external_booking_url || "",
    blackout_dates: Array.isArray(initial.blackout_dates) ? [...initial.blackout_dates] : [],
    // Kids / per-person pricing (tours only)
    child_price: initial.child_price ?? 0,
    child_age_max: initial.child_age_max ?? 12,
    child_free_under: initial.child_free_under ?? 3,
    // Optional taxi add-on (tours only)
    taxi_addon_enabled: !!initial.taxi_addon_enabled,
    taxi_addon_price: initial.taxi_addon_price ?? 0,
    taxi_addon_price_mode: initial.taxi_addon_price_mode || "flat",
    taxi_addon_forced: !!initial.taxi_addon_forced,
    taxi_addon_label: initial.taxi_addon_label || "Round-trip taxi add-on",
  });
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [newBlackout, setNewBlackout] = useState("");

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.description.trim()) return toast.error("Description is required");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        price: parseFloat(form.price) || 0,
        image_url: form.image_url,
        category: form.category || null,
        active: form.active,
      };
      if (kind === "rentals") {
        Object.assign(payload, {
          seats: form.seats ? parseInt(form.seats) : null,
          year: form.year ? parseInt(form.year) : null,
          make: form.make || null,
          model: form.model || null,
          color: form.color || null,
          body: form.body || null,
          blackout_dates: [...(form.blackout_dates || [])].sort(),
        });
      } else if (kind === "taxi_services") {
        Object.assign(payload, { route: form.route || null, featured: !!form.featured });
      } else {
        Object.assign(payload, {
          duration: form.duration || null,
          location: form.location || null,
          featured: !!form.featured,
          // Send empty string (not null) when cleared — backend model_dump filters
          // None-valued keys, so null wouldn't wipe an existing URL. Empty string
          // is falsy on the frontend so the public "official site" link hides.
          external_booking_url: (form.external_booking_url ?? "").trim(),
          // Kids pricing (0 disables per-person mode → flat fare)
          child_price: parseFloat(form.child_price) || 0,
          child_age_max: parseInt(form.child_age_max) || 12,
          child_free_under: parseInt(form.child_free_under) || 3,
          // Optional taxi add-on
          taxi_addon_enabled: !!form.taxi_addon_enabled,
          taxi_addon_price: parseFloat(form.taxi_addon_price) || 0,
          taxi_addon_price_mode: form.taxi_addon_price_mode || "flat",
          taxi_addon_forced: !!form.taxi_addon_forced,
          taxi_addon_label: (form.taxi_addon_label || "").trim() || "Round-trip taxi add-on",
        });
      }
      if (initial.new) await api.post(`/admin/${kind}`, payload);
      else await api.put(`/admin/${kind}/${initial.id}`, payload);
      toast.success("Saved");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const isRental = kind === "rentals";
  const isTaxi = kind === "taxi_services";
  const modalTitle = initial.new ? (isRental ? "Add vehicle" : "Add item") : (isRental ? "Edit vehicle" : "Edit item");

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl p-6 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-[#0B3B5C]">{modalTitle}</h3>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[#F1F5F9]"><X className="w-4 h-4" /></button>
        </div>
        <F l="Name" v={form.name} on={(v) => setForm({ ...form, name: v })} testid="edit-name" />
        <F l="Description" v={form.description} on={(v) => setForm({ ...form, description: v })} textarea testid="edit-desc" />

        {isRental && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
            <F l="Year" type="number" v={form.year} on={(v) => setForm({ ...form, year: v })} testid="edit-year" />
            <F l="Make" v={form.make} on={(v) => setForm({ ...form, make: v })} testid="edit-make" />
            <F l="Model" v={form.model} on={(v) => setForm({ ...form, model: v })} testid="edit-model" />
            <F l="Color" v={form.color} on={(v) => setForm({ ...form, color: v })} testid="edit-color" />
            <F l="Body (Sedan, SUV…)" v={form.body} on={(v) => setForm({ ...form, body: v })} testid="edit-body" />
            <F l="Seats" type="number" v={form.seats} on={(v) => setForm({ ...form, seats: v })} testid="edit-seats" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <F l="Price / day (USD)" type="number" v={form.price} on={(v) => setForm({ ...form, price: v })} testid="edit-price" />
          <F l="Category slug" v={form.category} on={(v) => setForm({ ...form, category: v })} testid="edit-cat" />
          {!isRental && !isTaxi && <F l="Duration" v={form.duration} on={(v) => setForm({ ...form, duration: v })} testid="edit-duration" />}
          {!isRental && !isTaxi && <F l="Location / departure" v={form.location} on={(v) => setForm({ ...form, location: v })} testid="edit-location" />}
          {isTaxi && <F l="Route" v={form.route} on={(v) => setForm({ ...form, route: v })} testid="edit-route" />}
        </div>

        {!isRental && !isTaxi && (
          <F
            l="Official booking URL (link out — leave blank to hide)"
            v={form.external_booking_url}
            on={(v) => setForm({ ...form, external_booking_url: v })}
            testid="edit-external-url"
          />
        )}

        {!isRental && !isTaxi && (
          <div className="pt-3 border-t border-[#F1F5F9]" data-testid="edit-kids-pricing">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">Kids pricing</span>
              <span className="text-[10px] text-[#94a3b8]">— set child price to 0 for flat-fare tours</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <F l="Child price (USD)" type="number" v={form.child_price} on={(v) => setForm({ ...form, child_price: v })} testid="edit-child-price" />
              <F l="Free under age" type="number" v={form.child_free_under} on={(v) => setForm({ ...form, child_free_under: v })} testid="edit-child-free-under" />
              <F l="Kid max age" type="number" v={form.child_age_max} on={(v) => setForm({ ...form, child_age_max: v })} testid="edit-child-age-max" />
            </div>
          </div>
        )}

        {!isRental && !isTaxi && (
          <div className="pt-3 border-t border-[#F1F5F9]" data-testid="edit-taxi-addon">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">Optional taxi add-on</span>
              <span className="text-[10px] text-[#94a3b8]">— round-trip taxi upsell at checkout</span>
            </div>
            <label className="flex items-center gap-2 text-sm mb-3">
              <input
                type="checkbox"
                checked={!!form.taxi_addon_enabled}
                onChange={(e) => setForm({ ...form, taxi_addon_enabled: e.target.checked })}
                data-testid="edit-taxi-addon-enabled"
              />
              Offer taxi add-on for this tour
            </label>
            {form.taxi_addon_enabled && (
              <div className="space-y-3 pl-5 border-l-2 border-[#D4A94A]/30" data-testid="edit-taxi-addon-fields">
                <div className="grid grid-cols-2 gap-3">
                  <F l="Add-on price (USD)" type="number" v={form.taxi_addon_price} on={(v) => setForm({ ...form, taxi_addon_price: v })} testid="edit-taxi-addon-price" />
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-[#64748B] mb-1">Price mode</label>
                    <select
                      value={form.taxi_addon_price_mode}
                      onChange={(e) => setForm({ ...form, taxi_addon_price_mode: e.target.value })}
                      data-testid="edit-taxi-addon-mode"
                      className="w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#D4A94A] focus:outline-none bg-white"
                    >
                      <option value="flat">Flat fee per booking</option>
                      <option value="per_person">Per person × passengers</option>
                    </select>
                  </div>
                </div>
                <F l="Checkbox label shown to guest" v={form.taxi_addon_label} on={(v) => setForm({ ...form, taxi_addon_label: v })} testid="edit-taxi-addon-label" />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.taxi_addon_forced}
                    onChange={(e) => setForm({ ...form, taxi_addon_forced: e.target.checked })}
                    data-testid="edit-taxi-addon-forced"
                  />
                  <span>
                    Auto-include (no guest choice) — <span className="text-[#94a3b8]">unchecked = guest sees an opt-in checkbox at checkout</span>
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        <F l="Image URL" v={form.image_url} on={(v) => setForm({ ...form, image_url: v })} testid="edit-image" />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPicking(true)}
            data-testid="edit-image-picker-btn"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B3B5C] hover:text-[#D4A94A] transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" /> Pick from library
          </button>
          {form.image_url && (
            <img src={resolveUrl(form.image_url)} alt="preview" className="w-12 h-12 rounded-md object-cover border border-[#E2E8F0]" />
          )}
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="edit-active" /> Active
          </label>
          {!isRental && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} data-testid="edit-featured" /> Featured on home
            </label>
          )}
        </div>

        {isRental && (
          <div className="pt-3 border-t border-[#F1F5F9]" data-testid="edit-blackouts">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold">Vehicle blackout dates</span>
              <span className="text-[10px] text-[#94a3b8]">— days this specific car is unavailable</span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="date"
                value={newBlackout}
                onChange={(e) => setNewBlackout(e.target.value)}
                data-testid="edit-blackout-date-input"
                className="rounded-md border border-[#E2E8F0] px-3 py-1.5 text-sm focus:border-[#D4A94A] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newBlackout) return toast.error("Pick a date first");
                  if (form.blackout_dates.includes(newBlackout)) return toast.error("Already in list");
                  setForm({ ...form, blackout_dates: [...form.blackout_dates, newBlackout].sort() });
                  setNewBlackout("");
                }}
                data-testid="edit-blackout-add-btn"
                className="rounded-md bg-[#0B3B5C] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[#132a4a]"
              >
                Add blackout
              </button>
            </div>
            {form.blackout_dates.length === 0 ? (
              <div className="text-xs text-[#94a3b8]" data-testid="edit-blackout-empty">No blackouts — the car is bookable on every open day.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5" data-testid="edit-blackout-list">
                {form.blackout_dates.map((d) => (
                  <span
                    key={d}
                    data-testid={`edit-blackout-item-${d}`}
                    className="inline-flex items-center gap-1 rounded-full bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-[11px] font-semibold px-2.5 py-1"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, blackout_dates: form.blackout_dates.filter((x) => x !== d) })}
                      data-testid={`edit-blackout-remove-${d}`}
                      className="ml-0.5 -mr-1 hover:text-[#7f1d1d]"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-3">
          <button onClick={onClose} className="rounded-md border border-[#E2E8F0] px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} data-testid="edit-save" className="rounded-md bg-[#0B3B5C] text-white px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60">
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
      {picking && (
        <ImagePickerModal
          onClose={() => setPicking(false)}
          onPick={(url) => { setForm((f) => ({ ...f, image_url: url })); setPicking(false); toast.success("Image linked"); }}
        />
      )}
    </div>
  );
}
