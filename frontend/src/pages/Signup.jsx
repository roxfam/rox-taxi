import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { UserPlus, Waves, Mail, Lock, User as UserIcon, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function Signup() {
  const { user, loading, login: googleLogin, register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) nav("/my-bookings", { replace: true }); }, [user, loading, nav]);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (form.password.length < 6) return setErr("Password must be at least 6 characters.");
    if (form.password !== form.confirm) return setErr("Passwords don't match.");
    setBusy(true);
    try {
      await register(form.name.trim(), form.email.trim().toLowerCase(), form.password, (form.referral_code || "").trim().toUpperCase() || null);
      nav("/my-bookings", { replace: true });
    } catch (ex) {
      setErr(ex.message || "Signup failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden" data-testid="signup-page">
      <div className="absolute inset-0 -z-10" style={{
        background: "radial-gradient(ellipse at 20% 10%, rgba(212,169,74,0.18), transparent 55%), radial-gradient(ellipse at 90% 90%, rgba(11,59,92,0.22), transparent 60%), linear-gradient(180deg, #FBF7EF 0%, #F1E8D3 100%)",
      }} />

      <div className="max-w-md mx-auto px-6 py-16 lg:py-24">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="flex items-center gap-3 mb-8">
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#D4A94A] to-[#A88235] text-white flex items-center justify-center shadow-[0_10px_25px_rgba(212,169,74,0.4)]">
              <Waves className="w-5 h-5" />
            </span>
            <div>
              <div className="serif text-xl text-[#0B3B5C]">Rox Taxi</div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#64748B]">Create account</div>
            </div>
          </div>

          <div className="relative rounded-[24px] bg-white/85 backdrop-blur-xl border border-white/90 shadow-[0_30px_80px_rgba(11,25,44,0.14)] p-8">
            <h1 className="serif text-3xl text-[#0B3B5C] leading-tight">
              Create your <em className="italic text-[#D4A94A]">account</em>.
            </h1>
            <p className="text-sm text-[#64748B] mt-2">Save trips, track rides live, and view your booking history in one place.</p>

            <form onSubmit={submit} className="mt-6 space-y-4" data-testid="signup-form">
              <Field icon={<UserIcon className="w-4 h-4" />} label="Full name">
                <input required autoComplete="name" value={form.name} onChange={update("name")} placeholder="Your name" data-testid="signup-name" className="input-line" />
              </Field>
              <Field icon={<Mail className="w-4 h-4" />} label="Email">
                <input required type="email" autoComplete="email" value={form.email} onChange={update("email")} placeholder="you@example.com" data-testid="signup-email" className="input-line" />
              </Field>
              <Field icon={<Lock className="w-4 h-4" />} label="Password (min 6 chars)">
                <input required type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={update("password")} placeholder="••••••••" data-testid="signup-password" className="input-line" />
              </Field>
              <Field icon={<Lock className="w-4 h-4" />} label="Confirm password">
                <input required type="password" autoComplete="new-password" value={form.confirm} onChange={update("confirm")} placeholder="••••••••" data-testid="signup-confirm" className="input-line" />
              </Field>
              <Field icon={<UserPlus className="w-4 h-4" />} label="Referral code (optional)">
                <input
                  type="text" maxLength={20} autoComplete="off"
                  value={form.referral_code}
                  onChange={(e) => setForm({ ...form, referral_code: e.target.value.toUpperCase() })}
                  placeholder="ROX-XXXXXX"
                  data-testid="signup-referral"
                  className="input-line mono"
                />
              </Field>

              {err && (
                <div className="flex items-start gap-2 text-sm text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3 py-2" data-testid="signup-error">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{err}</span>
                </div>
              )}

              <button type="submit" disabled={busy} data-testid="signup-submit" className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white px-6 py-3.5 text-sm font-semibold shadow-[0_10px_25px_rgba(232,106,60,0.35)] disabled:opacity-60 transition">
                <UserPlus className="w-4 h-4" /> {busy ? "Creating…" : "Create account"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-4">
              <span className="flex-1 h-px bg-[#E2E8F0]" />
              <span className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-semibold">Or</span>
              <span className="flex-1 h-px bg-[#E2E8F0]" />
            </div>

            <button onClick={googleLogin} data-testid="signup-google-btn" className="w-full inline-flex items-center justify-center gap-3 rounded-full bg-white border border-[#E2E8F0] px-6 py-3.5 text-sm font-semibold text-[#0B3B5C] hover:border-[#D4A94A] transition-all">
              <GoogleIcon /> Continue with Google
            </button>

            <p className="text-xs text-[#64748B] mt-6 text-center">
              Already have an account? <Link to="/login" className="text-[#D4A94A] font-semibold hover:underline" data-testid="signup-goto-login">Sign in</Link>
            </p>
          </div>
        </motion.div>
      </div>

      <style>{`.input-line{width:100%;background:transparent;border:0;border-bottom:1.5px solid #E2E8F0;padding:8px 0;font-size:15px;color:#0B3B5C;outline:none;transition:border-color .2s}.input-line:focus{border-color:#D4A94A}`}</style>
    </div>
  );
}

function Field({ icon, label, children }) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold flex items-center gap-2 mb-1">
        <span className="text-[#D4A94A]">{icon}</span>{label}
      </span>
      {children}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.1 29.2 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.9 29 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.6 19 13 24 13c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.9 29 5 24 5 16.3 5 9.7 9.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 43c5 0 9.4-1.9 12.8-5l-5.9-5c-2 1.4-4.4 2.2-6.9 2.2-5.2 0-9.6-3.4-11.2-8L6.4 32.4C9.7 38.4 16.3 43 24 43z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l5.9 5c-.4.4 6.1-4.5 6.1-14.7 0-1.2-.1-2.3-.4-3.5z"/></svg>
  );
}
