import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Car, X } from "lucide-react";
import { normalizePhone } from "../../lib/phone";
import { api } from "../../lib/api";

export default function SendToDriverDialog({ booking, onClose, onDone }) {
  const [drivers, setDrivers] = useState([]);
  const [name, setName] = useState(booking.driver_name || "");
  const [phone, setPhone] = useState(booking.driver_phone || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/admin/drivers").then((r) => setDrivers(r.data || [])).catch(() => {}); }, []);

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/bookings/${booking.id}/send-to-driver`, { driver_name: name || null, driver_phone: phone || null });
      if (data.to === "driver" && !data.sent) toast.error(`Text not sent: ${data.error || "check SMS settings"}`);
      else toast.success(data.to === "driver" ? `Trip texted to ${name || "driver"}` : "No driver picked, so the trip was sent to your admin number");
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't send the trip");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" onClick={onClose} data-testid="send-driver-dialog">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-[#0369A1] font-black">Send trip to driver</div>
            <h3 className="font-[Georgia] text-xl text-[#0B3B5C] mt-1">{booking.id} · {(booking.booking_date || "").replace("T", " ")}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#64748B]" data-testid="send-driver-close"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-[#64748B]">The driver gets the guest name and phone, pickup time, tour drop-off time, route, passengers, bags, baby seats, flight and notes. Prices and payments are never included. Reminders go out the night before (8 pm), 1 hour and 15 minutes before pickup. With no driver picked, everything goes to your admin number.</p>
        {drivers.length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="send-driver-roster">
            {drivers.map((d) => (
              <button key={d.phone} type="button" onClick={() => { setName(d.name || ""); setPhone(d.phone); }}
                className={`px-3 py-1.5 rounded-full border text-xs ${phone === d.phone ? "bg-[#0B3B5C] text-white" : "border-[#E2E8F0]"}`}
                data-testid={`send-driver-pick-${d.phone}`}>{d.name || d.phone}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Driver name" className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm" data-testid="send-driver-name" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhone(normalizePhone(phone))} placeholder="Driver phone (+1242…)" className="px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm" data-testid="send-driver-phone" />
        </div>
        <button type="button" onClick={send} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0369A1] text-white py-3 text-sm font-bold disabled:opacity-60" data-testid="send-driver-submit">
          <Car className="w-4 h-4" /> {busy ? "Sending…" : phone ? "Text trip to driver" : "Send to admin number"}
        </button>
      </div>
    </div>
  );
}
