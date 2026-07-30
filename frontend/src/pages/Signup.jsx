import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { UserPlus, Mail, Lock, User as UserIcon, AlertCircle, Sparkles, ShieldCheck, Gift } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function Signup() {
  const { user, loading, login: googleLogin, register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", referral_code: "" });
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
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden flex items-center pt-24 pb-16" data-testid="signup-page">
      {/* Layered luxury backdrop */}
      <div className="absolute inset-0 -z-10" style={{
        background: "radial-gradient(ellipse at 20% 10%, rgba(212,169,74,0.20), transparent 55%), radial-gradient(ellipse at 88% 88%, rgba(11,59,92,0.24), transparent 60%), linear-gradient(180deg, #FBF7EF 0%, #EFE3C6 100%)",
      }} />
      <div className="absolute top-24 -left-32 w-96 h-96 rounded-full bg-[#D4A94A]/25 blur-[120px] -z-10" />
      <div className="absolute bottom-16 -right-40 w-[520px] h-[520px] rounded-full bg-[#0B3B5C]/18 blur-[140px] -z-10" />

      <div className="max-w-md mx-auto px-6 w-full">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          {/* Brand tab — official gold-R monogram floats above the card */}
          <div className="relative flex justify-center mb-[-38px] z-10" data-testid="signup-brand-tab">
            <div className="relative">
              <span className="absolute -inset-2 rounded-full bg-gradient-to-br from-[#D4A94A]/45 via-[#F5E1A4]/25 to-[#E86A3C]/25 blur-2xl opacity-90" />
              <div className="relative w-[76px] h-[76px] rounded-full bg-white/95 backdrop-blur-xl ring-1 ring-[#D4A94A]/40 shadow-[0_20px_50px_rgba(212,169,74,0.35)] flex items-center justify-center overflow-hidden">
                <img
                  src="/logo-gold.webp"
                  alt="Rox Taxi Service and Tours"
                  width={64}
                  height={64}
                  className="w-16 h-16 object-contain drop-shadow-[0_4px_10px_rgba(168,130,53,0.35)]"
                  data-testid="signup-brand-logo"
                />
              </div>
            </div>
          </div>

          {/* Card */}
          <div className="relative rounded-[28px] bg-white/95 backdrop-blur-2xl border border-white/90 shadow-[0_40px_100px_rgba(11,25,44,0.18)] pt-14 pb-8 px-8">
            {/* Gold hairline accent */}
            <div className="absolute inset-x-8 top-6 h-px bg-gradient-to-r from-transparent via-[#D4A94A]/60 to-transparent" />

            <div className="text-center">
              <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.35em] uppercase font-bold text-[#A88235]">
                <span className="w-6 h-px bg-[#D4A94A]" />
                Members club
                <span className="w-6 h-px bg-[#D4A94A]" />
              </div>
              <h1 className="serif text-4xl text-[#0B3B5C] leading-[1.05] mt-3" data-testid="signup-heading">
                Create your <em className="italic bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #D4A94A 0%, #A88235 100%)" }}>account</em>.
              </h1>
              <p className="text-sm text-[#64748B] mt-2 max-w-sm mx-auto">
                Save your trips, track rides live and earn <strong className="text-[#0B3B5C]">$25 credits</strong> for every friend you refer.
              </p>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-5" data-testid="signup-form">
              <Field icon={<UserIcon className="w-4 h-4" />} label="Full name">
                <input required autoComplete="name" value={form.name} onChange={update("name")} placeholder="Your name" data-testid="signup-name" className="input-line" />
              </Field>
              <Field icon={<Mail className="w-4 h-4" />} label="Email">
                <input required type="email" autoComplete="email" value={form.email} onChange={update("email")} placeholder="you@example.com" data-testid="signup-email" className="input-line" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field icon={<Lock className="w-4 h-4" />} label="Password">
                  <input required type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={update("password")} placeholder="••••••••" data-testid="signup-password" className="input-line" />
                </Field>
                <Field icon={<ShieldCheck className="w-4 h-4" />} label="Confirm">
                  <input required type="password" autoComplete="new-password" value={form.confirm} onChange={update("confirm")} placeholder="••••••••" data-testid="signup-confirm" className="input-line" />
                </Field>
              </div>
              <Field icon={<Gift className="w-4 h-4" />} label="Referral code — optional">
                <input
                  type="text" maxLength={20} autoComplete="off"
                  value={form.referral_code}
                  onChange={(e) => setForm({ ...form, referral_code: e.target.value.toUpperCase() })}
                  placeholder="ROX-XXXXXX"
                  data-testid="signup-referral"
                  className="input-line mono tracking-widest"
                />
              </Field>

              {err && (
                <div className="flex items-start gap-2 text-sm text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3 py-2" data-testid="signup-error">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{err}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                data-testid="signup-submit"
                className="group relative w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#E86A3C] via-[#D4A94A] to-[#A88235] text-white px-6 py-3.5 text-sm font-bold tracking-wide shadow-[0_16px_35px_rgba(232,106,60,0.35)] hover:shadow-[0_20px_45px_rgba(212,169,74,0.5)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-60 disabled:hover:translate-y-0 overflow-hidden"
              >
                <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <UserPlus className="relative w-4 h-4" />
                <span className="relative">{busy ? "Creating your account…" : "Create account"}</span>
                <Sparkles className="relative w-3.5 h-3.5 opacity-80" />
              </button>
            </form>

            <div className="my-6 flex items-center gap-4">
              <span className="flex-1 h-px bg-gradient-to-r from-transparent to-[#E2E8F0]" />
              <span className="text-[10px] tracking-[0.35em] uppercase text-[#94a3b8] font-bold">Or</span>
              <span className="flex-1 h-px bg-gradient-to-l from-transparent to-[#E2E8F0]" />
            </div>

            <button
              onClick={googleLogin}
              data-testid="signup-google-btn"
              className="group w-full inline-flex items-center justify-center gap-3 rounded-full bg-white border border-[#E2E8F0] px-6 py-3.5 text-sm font-semibold text-[#0B3B5C] hover:border-[#D4A94A] hover:shadow-[0_10px_25px_rgba(212,169,74,0.15)] transition-all"
            >
              <GoogleIcon /> Continue with Google
              <span className="text-[#94a3b8] group-hover:text-[#D4A94A] transition-colors">→</span>
            </button>

            <div className="mt-7 pt-5 border-t border-[#F1F5F9] text-center">
              <p className="text-xs text-[#64748B]">
                Already have an account? <Link to="/login" className="text-[#A88235] font-bold hover:text-[#0B3B5C] hover:underline transition-colors" data-testid="signup-goto-login">Sign in →</Link>
              </p>
            </div>
          </div>

          {/* Trust chips */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[10px] tracking-[0.2em] uppercase text-[#64748B] font-semibold" data-testid="signup-trust-chips">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-[#D4A94A]" /> End-to-end encrypted</span>
            <span className="w-1 h-1 rounded-full bg-[#D4A94A]/50" />
            <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-[#D4A94A]" /> 24/7 dispatch</span>
          </div>
        </motion.div>
      </div>

      <style>{`
        .input-line{width:100%;background:transparent;border:0;border-bottom:1.5px solid #E2E8F0;padding:10px 0;font-size:15px;color:#0B3B5C;outline:none;transition:border-color .2s, transform .2s}
        .input-line::placeholder{color:#94a3b8;font-weight:400}
        .input-line:focus{border-color:#D4A94A;transform:translateY(-1px)}
      `}</style>
    </div>
  );
}

function Field({ icon, label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] tracking-[0.25em] uppercase text-[#64748B] font-bold flex items-center gap-2 mb-1">
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
