import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { FolderOpen, Save, X, CalendarRange, Trash2, Info, Check, Pencil } from "lucide-react";
import { Calendar } from "../../components/ui/calendar";
import { api } from "../../lib/api";
import { F, resolveUrl } from "./shared";
import ImagePickerModal from "./ImagePickerModal";

// Helpers used by BlackoutRangePicker + shortcut chips
const iso = (d) => d.toISOString().slice(0, 10);
function enumerateRange(from, to) {
  if (!from) return [];
  const start = new Date(from);
  const end = to ? new Date(to) : new Date(from);
  const out = [];
  const cur = new Date(start);
  while (cur <= end) { out.push(iso(cur)); cur.setDate(cur.getDate() + 1); }
  return out;
}

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
    taxi_addon_ab_enabled: !!initial.taxi_addon_ab_enabled,
    taxi_addon_label_b: initial.taxi_addon_label_b || "",
  });
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [newBlackout, setNewBlackout] = useState("");
  // Inline reason editor — set to the ISO date being edited, or null when
  // no chip is in edit mode. `reasonDraft` holds the in-flight input value.
  const [editingReasonFor, setEditingReasonFor] = useState(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [reasonSaving, setReasonSaving] = useState(false);
  // Preset reasons — fetched once and passed to every inline editor as a
  // <datalist>. Falls back to an in-file default if the config never loads.
  const [reasonPresets, setReasonPresets] = useState([
    "Hurricane", "Maintenance", "Insurance renewal", "Sold", "Detailing", "Rented offline",
  ]);
  useEffect(() => {
    api.get("/site-config").then(({ data }) => {
      if (Array.isArray(data.blackout_reason_presets) && data.blackout_reason_presets.length) {
        setReasonPresets(data.blackout_reason_presets);
      }
    }).catch(() => {});
  }, []);

  // Refetch the item fresh on mount so any bulk-blackout operations that
  // ran while the catalog list was already loaded (or hot-reloads of
  // reasons via /admin/rentals/bulk-blackout) surface immediately without
  // the admin needing a full page refresh. Only re-fetches for existing
  // items — new-items skip this cheap round-trip.
  useEffect(() => {
    if (initial.new || !initial.id) return;
    let alive = true;
    api.get(`/admin/${kind}`)
      .then(({ data }) => {
        if (!alive) return;
        const fresh = (Array.isArray(data) ? data : []).find((x) => x.id === initial.id);
        if (fresh) {
          setForm((f) => ({
            ...f,
            blackout_dates: Array.isArray(fresh.blackout_dates) ? [...fresh.blackout_dates] : f.blackout_dates,
            blackout_reasons: (fresh.blackout_reasons && typeof fresh.blackout_reasons === "object") ? { ...fresh.blackout_reasons } : f.blackout_reasons,
          }));
        }
      })
      .catch(() => { /* silent — form still works with stale data */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, kind]);

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
          taxi_addon_ab_enabled: !!form.taxi_addon_ab_enabled,
          taxi_addon_label_b: (form.taxi_addon_label_b || "").trim(),
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
                <div className="rounded-lg bg-[#0B3B5C]/5 border border-[#0B3B5C]/10 p-3 space-y-2 mt-2" data-testid="edit-taxi-addon-ab">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!form.taxi_addon_ab_enabled}
                      onChange={(e) => setForm({ ...form, taxi_addon_ab_enabled: e.target.checked })}
                      data-testid="edit-taxi-addon-ab-enabled"
                    />
                    <span className="font-semibold text-[#0B3B5C]">A/B test the checkbox label</span>
                  </label>
                  {form.taxi_addon_ab_enabled ? (
                    <>
                      <div className="text-[11px] text-[#64748B] leading-relaxed pl-6">
                        Each guest sees either label above (variant A) or the one below (variant B), randomly. Attach rate per variant shows in the admin dashboard.
                      </div>
                      <div className="pl-6">
                        <F l='Variant B label (e.g. "Skip the bus — private taxi both ways")' v={form.taxi_addon_label_b} on={(v) => setForm({ ...form, taxi_addon_label_b: v })} testid="edit-taxi-addon-label-b" />
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-[#94a3b8] pl-6">Off — every guest sees the same label above.</div>
                  )}
                </div>
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
            <div className="flex items-center gap-2 mb-3 flex-wrap">
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
              <div className="w-px h-5 bg-[#E2E8F0] mx-1" />
              <span className="text-[10px] uppercase tracking-widest text-[#94a3b8] font-bold">Block next</span>
              {[30, 90, 365].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    const next = new Set(form.blackout_dates);
                    for (let i = 0; i < n; i++) {
                      const d = new Date(today);
                      d.setDate(today.getDate() + i);
                      next.add(d.toISOString().slice(0, 10));
                    }
                    const added = next.size - form.blackout_dates.length;
                    setForm({ ...form, blackout_dates: [...next].sort() });
                    toast.success(`Blocked next ${n} days · +${added} new`);
                  }}
                  data-testid={`edit-blackout-block-${n}`}
                  className="rounded-full border border-[#E86A3C]/40 bg-[#E86A3C]/8 text-[#E86A3C] hover:bg-[#E86A3C] hover:text-white px-2.5 py-1 text-xs font-bold transition-colors"
                  title={`Add every day from today through ${n} days out to the blackout list`}
                >
                  {n}d
                </button>
              ))}
              {form.blackout_dates.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Remove all ${form.blackout_dates.length} blackout date(s)? The vehicle will become bookable on every open day.`)) return;
                    setForm({ ...form, blackout_dates: [] });
                    toast.success("All blackouts cleared — remember to Save");
                  }}
                  data-testid="edit-blackout-clear-all"
                  className="ml-auto rounded-full border border-[#059669]/40 bg-white text-[#059669] hover:bg-[#059669] hover:text-white px-3 py-1 text-xs font-bold transition-colors"
                  title="Wipe the entire blackout list — makes the vehicle bookable on every open day"
                >
                  Clear all ({form.blackout_dates.length})
                </button>
              )}
            </div>

            <BlackoutRangePicker
              blackouts={form.blackout_dates}
              onChange={(next) => setForm({ ...form, blackout_dates: next })}
            />
            {form.blackout_dates.length === 0 ? (
              <div className="text-xs text-[#94a3b8]" data-testid="edit-blackout-empty">No blackouts — the car is bookable on every open day.</div>
            ) : (
              <BlackoutGroupList
                blackoutDates={form.blackout_dates}
                blackoutReasons={form.blackout_reasons || {}}
                reasonPresets={reasonPresets}
                editingReasonFor={editingReasonFor}
                reasonDraft={reasonDraft}
                reasonSaving={reasonSaving}
                onStartEdit={(key, existingReason) => { setEditingReasonFor(key); setReasonDraft(existingReason || ""); }}
                onCancelEdit={() => setEditingReasonFor(null)}
                onDraftChange={setReasonDraft}
                onSaveGroupReason={async (dates, newReason) => {
                  if (reasonSaving) return;
                  setReasonSaving(true);
                  try {
                    await api.post(`/admin/${kind}/${initial.id}/blackout-reasons-bulk`, {
                      dates,
                      reason: newReason,
                    });
                    setForm((f) => {
                      const map = { ...(f.blackout_reasons || {}) };
                      if (newReason) dates.forEach((d) => { map[d] = newReason; });
                      else dates.forEach((d) => { delete map[d]; });
                      return { ...f, blackout_reasons: map };
                    });
                    setEditingReasonFor(null);
                    toast.success(newReason
                      ? `Reason updated on ${dates.length} day${dates.length === 1 ? "" : "s"}`
                      : `Reason cleared on ${dates.length} day${dates.length === 1 ? "" : "s"}`,
                    );
                  } catch (e) {
                    toast.error(e?.response?.data?.detail || "Update failed");
                  } finally { setReasonSaving(false); }
                }}
                onRemoveGroup={(dates) => {
                  const label = dates.length === 1 ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]} (${dates.length} days)`;
                  if (!window.confirm(`Unblock ${label}? The vehicle will become bookable on ${dates.length === 1 ? "that day" : "those days"}.`)) return;
                  const remove = new Set(dates);
                  setForm((f) => ({
                    ...f,
                    blackout_dates: f.blackout_dates.filter((x) => !remove.has(x)),
                    blackout_reasons: Object.fromEntries(
                      Object.entries(f.blackout_reasons || {}).filter(([k]) => !remove.has(k)),
                    ),
                  }));
                  toast.success(`Cleared ${dates.length} blackout${dates.length === 1 ? "" : "s"} — remember to Save`);
                }}
              />
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

// Range picker — click a start day, click an end day (or the same day for a
// single-date add). Days already in the blackout list render red so the
// admin sees at a glance what's blocked. Two action buttons then either
// add or remove every day in the selected range.
function BlackoutRangePicker({ blackouts, onChange }) {
  const [range, setRange] = useState(undefined);
  const blockedSet = useMemo(() => new Set(blackouts), [blackouts]);
  const blockedDates = useMemo(
    () => (blackouts || []).map((d) => new Date(d + "T12:00:00")),
    [blackouts],
  );

  const rangeDates = useMemo(
    () => enumerateRange(range?.from, range?.to),
    [range],
  );
  const rangeCount = rangeDates.length;
  const alreadyBlocked = rangeDates.filter((d) => blockedSet.has(d)).length;
  const willAdd = rangeCount - alreadyBlocked;

  const block = () => {
    if (rangeCount === 0) return toast.error("Pick a range first");
    const next = new Set(blockedSet);
    rangeDates.forEach((d) => next.add(d));
    onChange([...next].sort());
    toast.success(`Blocked ${rangeCount} day${rangeCount === 1 ? "" : "s"} · +${willAdd} new`);
    setRange(undefined);
  };

  const unblock = () => {
    if (rangeCount === 0) return toast.error("Pick a range first");
    if (alreadyBlocked === 0) return toast.error("Nothing to unblock in that range");
    const next = new Set(blockedSet);
    rangeDates.forEach((d) => next.delete(d));
    onChange([...next].sort());
    toast.success(`Unblocked ${alreadyBlocked} day${alreadyBlocked === 1 ? "" : "s"}`);
    setRange(undefined);
  };

  return (
    <div
      className="mt-4 rounded-xl border border-[#0B3B5C]/12 bg-[#FBF7EF]/40 p-3"
      data-testid="edit-blackout-range-picker"
    >
      <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-widest text-[#0B3B5C] font-bold">
        <CalendarRange className="w-3.5 h-3.5 text-[#D4A94A]" /> Range picker
        <span className="text-[#94a3b8] font-semibold normal-case tracking-normal">
          — click a start day, then an end day. Red = already blocked.
        </span>
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="rounded-lg bg-white border border-[#E2E8F0] p-1">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={2}
            modifiers={{ blocked: blockedDates }}
            modifiersClassNames={{
              blocked: "bg-[#FEE2E2] text-[#B91C1C] font-bold hover:bg-[#FECACA]",
            }}
            className="text-[#0B3B5C]"
          />
        </div>
        <div className="flex-1 flex flex-col gap-2 min-w-[220px]">
          <div className="rounded-lg bg-white border border-[#E2E8F0] p-3 text-xs" data-testid="edit-blackout-range-summary">
            {rangeCount === 0 ? (
              <div className="text-[#94a3b8]">No range selected yet.</div>
            ) : (
              <>
                <div className="font-bold text-[#0B3B5C] mono">
                  {range.from ? iso(range.from) : ""}
                  {range.to && iso(range.to) !== iso(range.from) ? ` → ${iso(range.to)}` : ""}
                </div>
                <div className="text-[#64748B] mt-1">
                  {rangeCount} day{rangeCount === 1 ? "" : "s"} selected · <span className="text-[#B91C1C] font-semibold">{alreadyBlocked} already blocked</span> · <span className="text-[#059669] font-semibold">{willAdd} new</span>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={block}
            disabled={rangeCount === 0}
            data-testid="edit-blackout-range-block"
            className="rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white text-xs font-bold uppercase tracking-widest px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Block {rangeCount > 0 ? rangeCount : ""} day{rangeCount === 1 ? "" : "s"}
          </button>
          <button
            type="button"
            onClick={unblock}
            disabled={rangeCount === 0}
            data-testid="edit-blackout-range-unblock"
            className="rounded-full bg-white border border-[#059669] text-[#059669] hover:bg-[#059669] hover:text-white text-xs font-bold uppercase tracking-widest px-3 py-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Unblock range
          </button>
          {rangeCount > 0 && (
            <button
              type="button"
              onClick={() => setRange(undefined)}
              data-testid="edit-blackout-range-clear"
              className="text-[10px] text-[#94a3b8] hover:text-[#0B3B5C] underline decoration-dotted"
            >
              Clear selection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Group consecutive ISO YYYY-MM-DD strings that share the same reason
// into single visual "range" chips. e.g. 2027-09-10 → 09-16 · Hurricane.
// Days without a reason group by consecutive-ness too (so a maintenance
// stretch shows one grey chip instead of 30 red pills).
function groupByReasonRuns(dates, reasons) {
  const sorted = [...dates].sort();
  const groups = [];
  let cur = null;
  const dayMs = 86400000;
  for (const d of sorted) {
    const r = reasons[d] || "";
    const t = new Date(d + "T12:00:00Z").getTime();
    if (cur && cur.reason === r && (t - cur.lastT) === dayMs) {
      cur.dates.push(d);
      cur.lastT = t;
    } else {
      if (cur) groups.push(cur);
      cur = { reason: r, dates: [d], lastT: t };
    }
  }
  if (cur) groups.push(cur);
  return groups.map(({ reason, dates: ds }) => ({ reason, dates: ds }));
}

function BlackoutGroupList({
  blackoutDates, blackoutReasons, reasonPresets = [], editingReasonFor, reasonDraft, reasonSaving,
  onStartEdit, onCancelEdit, onDraftChange, onSaveGroupReason, onRemoveGroup,
}) {
  const groups = useMemo(
    () => groupByReasonRuns(blackoutDates, blackoutReasons),
    [blackoutDates, blackoutReasons],
  );
  const listId = "blackout-reason-presets";

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="edit-blackout-list">
      <datalist id={listId} data-testid="blackout-reason-datalist">
        {reasonPresets.map((p) => <option key={p} value={p} />)}
      </datalist>
      {groups.map((g) => {
        const key = g.dates[0];
        const isRange = g.dates.length > 1;
        const rangeLabel = isRange
          ? `${g.dates[0]} → ${g.dates[g.dates.length - 1].slice(5)}`
          : g.dates[0];
        const isEditing = editingReasonFor === key;
        const hasReason = !!g.reason;

        if (isEditing) {
          return (
            <span
              key={key}
              data-testid={`edit-blackout-editing-${key}`}
              className="inline-flex items-center gap-1 rounded-full bg-white border-2 border-[#0B3B5C] px-2 py-0.5"
            >
              <span className="text-[10px] mono font-bold text-[#0B3B5C]">{rangeLabel}</span>
              {isRange && <span className="text-[9px] text-[#94a3b8] font-semibold">({g.dates.length}d)</span>}
              <input
                type="text"
                autoFocus
                value={reasonDraft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onSaveGroupReason(g.dates, reasonDraft.trim()); }
                  if (e.key === "Escape") { e.preventDefault(); onCancelEdit(); }
                }}
                placeholder="Add a reason…"
                list={listId}
                data-testid={`edit-blackout-reason-input-${key}`}
                className="px-1 py-0.5 text-[11px] outline-none min-w-[180px] max-w-[300px]"
              />
              <button
                type="button"
                onClick={() => onSaveGroupReason(g.dates, reasonDraft.trim())}
                disabled={reasonSaving}
                data-testid={`edit-blackout-reason-save-${key}`}
                className="rounded-full bg-[#0B3B5C] text-white p-1 hover:bg-[#132a4a] disabled:opacity-50"
                title="Save (Enter)"
              >
                <Check className="w-3 h-3" />
              </button>
              {hasReason && (
                <button
                  type="button"
                  onClick={() => onSaveGroupReason(g.dates, "")}
                  disabled={reasonSaving}
                  data-testid={`edit-blackout-reason-clear-${key}`}
                  className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] hover:text-[#B91C1C] px-1"
                  title="Clear the reason (days stay blocked)"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={reasonSaving}
                data-testid={`edit-blackout-reason-cancel-${key}`}
                className="text-[#94a3b8] hover:text-[#0B3B5C] p-0.5"
                title="Cancel (Esc)"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        }

        const bg = hasReason ? "bg-[#FEF2F2] border-[#FECACA]" : "bg-[#F8FAFC] border-[#E2E8F0]";
        const text = hasReason ? "text-[#B91C1C]" : "text-[#64748B]";
        return (
          <span
            key={key}
            data-testid={`edit-blackout-item-${key}`}
            data-range-length={g.dates.length}
            title={
              (hasReason ? `Reason: ${g.reason}` : "No reason recorded") +
              (isRange ? ` · ${g.dates.length} consecutive days` : "") +
              " · click ✎ to edit, × to unblock"
            }
            className={`inline-flex items-center gap-1 rounded-full border ${bg} ${text} text-[11px] font-semibold px-2.5 py-1`}
          >
            <span className="mono">{rangeLabel}</span>
            {isRange && (
              <span
                className="text-[9px] font-black uppercase tracking-widest opacity-70 -ml-0.5"
                data-testid={`edit-blackout-count-${key}`}
              >
                ×{g.dates.length}
              </span>
            )}
            {hasReason && (
              <span className="max-w-[200px] truncate text-[#0B3B5C] font-medium">
                · {g.reason}
              </span>
            )}
            <button
              type="button"
              onClick={() => onStartEdit(key, g.reason)}
              data-testid={`edit-blackout-reason-edit-${key}`}
              className="ml-0.5 opacity-50 hover:opacity-100"
              title={hasReason ? "Edit reason for all days in this range" : "Add reason for all days in this range"}
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onRemoveGroup(g.dates)}
              data-testid={`edit-blackout-remove-${key}`}
              className="ml-0.5 -mr-1 opacity-70 hover:opacity-100 hover:text-[#7f1d1d]"
              title={isRange ? `Unblock all ${g.dates.length} days` : "Unblock this day"}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

