import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import ProfileFields, { EMPTY_PROFILE, profileMissing } from "./ProfileFields";

// Asks signed-in customers (e.g. Google sign-ups) for contact details once; also reused as the edit dialog.
export default function CompleteProfileModal({ open: forced, onClose }) {
  const { user, refresh } = useAuth();
  const [p, setP] = useState(EMPTY_PROFILE);
  const [busy, setBusy] = useState(false);
  const [later, setLater] = useState(() => sessionStorage.getItem("rox_profile_later") === "1");
  useEffect(() => { if (user) setP({ ...EMPTY_PROFILE, ...(user.profile || {}), phone: user.profile?.phone || user.phone || "" }); }, [user]);
  const { pathname } = useLocation();
  const auto = !!user && !user.profile_completed && !later && !pathname.startsWith("/signup") && !pathname.startsWith("/admin");
  if (!user || !(forced || auto)) return null;
  const close = () => { if (forced) onClose?.(); else { sessionStorage.setItem("rox_profile_later", "1"); setLater(true); } };
  const save = async (e) => {
    e.preventDefault();
    if (profileMissing(p).length) return toast.error("Please fill in phone, address, city and country");
    setBusy(true);
    try {
      await api.put("/my/profile", p);
      await refresh();
      toast.success("Profile saved");
      onClose?.();
    } catch (ex) {
      toast.error(ex?.response?.data?.detail?.[0]?.msg || ex?.response?.data?.detail || "Could not save profile");
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[130] bg-[#0B192C]/60 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={save} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[28px] bg-white p-7 shadow-2xl" data-testid="complete-profile-modal">
        <button type="button" onClick={close} className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-[#F1F5F9] flex items-center justify-center" aria-label="Close" data-testid="complete-profile-close"><X className="w-4 h-4" /></button>
        <div className="text-[10px] tracking-[0.35em] uppercase font-bold text-[#A88235]">{forced ? "Your details" : "One last step"}</div>
        <h2 className="serif text-3xl text-[#0B3B5C] mt-2">{forced ? "Edit your profile" : `Welcome, ${(user.name || "").split(" ")[0] || "traveller"}.`}</h2>
        <p className="text-sm text-[#64748B] mt-1 mb-6">Add your contact details so drivers can reach you and bookings fill in automatically.</p>
        <ProfileFields value={p} onChange={setP} />
        <button type="submit" disabled={busy} className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#E86A3C] via-[#D4A94A] to-[#A88235] text-white px-6 py-3.5 text-sm font-bold disabled:opacity-60" data-testid="complete-profile-save">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save details
        </button>
      </form>
    </div>
  );
}
