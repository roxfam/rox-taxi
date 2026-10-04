import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus, Users, Trash2, Check, Clock } from "lucide-react";
import { api } from "../../lib/api";

/**
 * SecondaryContactsPanel — admin-side CC list manager for a booking.
 *
 * Lets dispatch add a maid-of-honor / hotel concierge email that'll
 * receive the same balance + paid-in-full emails as the lead planner.
 * Each contact must opt-in via emailed link before we start CCing them
 * — the panel shows "Pending" vs "Opted in" state inline.
 */
export default function SecondaryContactsPanel({ booking, onChanged }) {
  const [contacts, setContacts] = useState(booking.secondary_contacts || []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);

  // Keep local state fresh if parent re-fetches the booking
  useEffect(() => { setContacts(booking.secondary_contacts || []); }, [booking]);

  const add = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are both required.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post(`/admin/bookings/${booking.id}/secondary-contacts`, {
        name: name.trim(), email: email.trim(), role: role.trim() || undefined,
      });
      setContacts((prev) => [...prev, r.data.contact]);
      setName(""); setEmail(""); setRole("");
      toast.success(`Opt-in email sent to ${r.data.contact.email}`);
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not add that contact.");
    } finally { setBusy(false); }
  };

  const remove = async (c) => {
    if (!window.confirm(`Remove ${c.name} <${c.email}> from this booking's CC list?`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/bookings/${booking.id}/secondary-contacts/${c.id}`);
      setContacts((prev) => prev.filter((x) => x.id !== c.id));
      toast.success("Contact removed.");
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Remove failed.");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden" data-testid="secondary-contacts-panel">
      <header className="p-4 border-b border-[#E2E8F0] flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-[#D4A94A]/12 flex items-center justify-center text-[#D4A94A]">
          <Users className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-bold text-[#0B3B5C]">CC list · trusted contacts</div>
          <div className="text-[11px] text-[#64748B]">Maid-of-honor, hotel concierge, event coordinator — opt-in before CCing.</div>
        </div>
      </header>

      <div className="p-4 border-b border-[#E2E8F0] bg-[#FAF9F6]">
        <div className="grid sm:grid-cols-3 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="text-sm bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4A94A]"
            data-testid="secondary-contacts-name"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@domain.com"
            type="email"
            className="text-sm bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4A94A]"
            data-testid="secondary-contacts-email"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role (optional) · maid of honor"
            className="text-sm bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4A94A]"
            data-testid="secondary-contacts-role"
          />
        </div>
        <button
          onClick={add}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#E86A3C] text-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-[#d55a30] active:scale-95 disabled:opacity-50"
          data-testid="secondary-contacts-add"
        >
          <UserPlus className="w-3.5 h-3.5" /> {busy ? "Sending…" : "Send opt-in"}
        </button>
      </div>

      <div className="p-2">
        {contacts.length === 0 ? (
          <div className="text-center text-[#94A3B8] text-xs py-6" data-testid="secondary-contacts-empty">
            No secondary contacts yet. The lead planner can forward Rox updates to anyone they add here (after opt-in).
          </div>
        ) : contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-[#F8FAFC]" data-testid={`secondary-contacts-row-${c.id}`}>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#0B3B5C] truncate">{c.name}</div>
              <div className="text-[11px] text-[#64748B] truncate">{c.email}{c.role ? ` · ${c.role}` : ""}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {c.consent ? (
                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" data-testid={`secondary-contacts-consent-${c.id}`}>
                  <Check className="w-3 h-3" /> Opted in
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" data-testid={`secondary-contacts-pending-${c.id}`}>
                  <Clock className="w-3 h-3" /> Pending
                </span>
              )}
              <button
                onClick={() => remove(c)}
                disabled={busy}
                className="inline-flex items-center gap-1 text-xs text-[#B91C1C] border border-[#FECACA] rounded-full px-2.5 py-1 bg-white hover:bg-[#FEF2F2] disabled:opacity-50"
                data-testid={`secondary-contacts-remove-${c.id}`}
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
