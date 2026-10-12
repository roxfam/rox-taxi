import { useState } from "react";
import { toast } from "sonner";
import { Save, X } from "lucide-react";
import { api } from "../../lib/api";

const FIELDS = [
  { key: "customer_name", label: "Guest name" },
  { key: "customer_email", label: "Email", type: "email" },
  { key: "customer_phone", label: "Phone" },
  { key: "booking_date", label: "Date & time", type: "datetime-local" },
  { key: "pickup_location", label: "Pickup" },
  { key: "dropoff_location", label: "Drop-off" },
  { key: "passengers", label: "Passengers", type: "number" },
  { key: "total", label: "Total ($)", type: "number" },
];

const toLocalInput = (iso) => (iso ? String(iso).replace("Z", "").slice(0, 16) : "");

export default function BookingEditForm({ booking, onSaved, onCancel }) {
  const [form, setForm] = useState({
    customer_name: booking.customer_name || "",
    customer_email: booking.customer_email || "",
    customer_phone: booking.customer_phone || "",
    booking_date: toLocalInput(booking.booking_date),
    pickup_location: booking.pickup_location || "",
    dropoff_location: booking.dropoff_location || "",
    passengers: booking.passengers ?? "",
    total: booking.total || booking.total_price || "",
    notes: booking.notes || "",
    notify_guest: true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form };
      body.passengers = body.passengers === "" ? null : Number(body.passengers);
      body.total = body.total === "" ? null : Number(body.total);
      const { data } = await api.patch(`/admin/bookings/${booking.id}/details`, body);
      toast.success(data.updated ? `Saved: ${data.changed.join(", ")}${data.guest_notified ? " · guest notified" : ""}` : "No changes");
      onSaved?.(data.booking);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#0B3B5C]";
  return (
    <form onSubmit={save} className="rounded-2xl border border-[#D4A94A]/50 bg-[#FFFBF2] p-4 space-y-3" data-testid="booking-edit-form">
      <div className="text-[10px] tracking-[0.25em] uppercase text-[#B47F26] font-black">Edit booking</div>
      <div className="grid sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-[#64748B] font-semibold">
            {f.label}
            <input
              type={f.type || "text"}
              value={form[f.key]}
              onChange={set(f.key)}
              step={f.key === "total" ? "0.01" : undefined}
              className={`${input} mt-1`}
              data-testid={`booking-edit-${f.key}`}
            />
          </label>
        ))}
      </div>
      <label className="block text-xs text-[#64748B] font-semibold">
        Notes
        <textarea value={form.notes} onChange={set("notes")} rows={2} className={`${input} mt-1`} data-testid="booking-edit-notes" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-[#0B3B5C] font-semibold">
          <input
            type="checkbox"
            checked={form.notify_guest}
            onChange={(e) => setForm((f) => ({ ...f, notify_guest: e.target.checked }))}
            data-testid="booking-edit-notify-guest"
          />
          Text + email the guest if date, time or pickup changes
        </label>
        <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] px-4 py-2 text-xs font-bold text-[#64748B]" data-testid="booking-edit-cancel">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-[#0B3B5C] text-white px-4 py-2 text-xs font-black uppercase tracking-wider disabled:opacity-60" data-testid="booking-edit-save">
          <Save className="w-3.5 h-3.5" /> {busy ? "Saving…" : "Save changes"}
        </button>
        </div>
      </div>
    </form>
  );
}
