import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Ticket, ShieldCheck, MapPin, ArrowRight, Sparkles, Waves, Mail, Lock, LogIn, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth";

const BENEFITS = [
  { Icon: Ticket, title: "All your bookings", body: "Taxis, tours and rentals in one place with confirmation codes." },
  { Icon: MapPin, title: "Live tracking", body: "See ride status update in real time as your driver approaches." },
  { Icon: ShieldCheck, title: "Auto-secure sessions", body: "You're signed out automatically after 1 hour of inactivity." },
  { Icon: Sparkles, title: "Faster next time", body: "Details are remembered so re-booking is one tap away." },
];

export default function Login() {
  const { user, loading, login: googleLogin, loginEmail } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("email"); // "email" | "google"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) nav("/my-bookings", { replace: true });
  }, [user, loading, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await loginEmail(email.trim().toLowerCase(), password);
      nav("/my-bookings", { replace: true });
    } catch (ex) {
      setErr(ex.message || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden" data-testid="login-page">
      <div className="absolute inset-0 -z-10" style={{
        background: "radial-gradient(ellipse at 20% 10%, rgba(212,169,74,0.18), transparent 55%), radial-gradient(ellipse at 90% 90%, rgba(11,59,92,0.22), transparent 60%), linear-gradient(180deg, #FBF7EF 0%, #F1E8D3 100%)",
      }} />
      <div className="absolute inset-0 -z-10 grain" />

      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-16 lg:py-24 grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="lg:col-span-6">
          <span className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-semibold">
            <span className="w-8 h-[1px] bg-[#D4A94A]" /> Members portal
          </span>
          <h1 className="serif text-5xl sm:text-6xl lg:text-7xl mt-5 leading-[0.92] text-[#0B3B5C]">
            Welcome <em className="italic text-[#D4A94A]">back</em>.
            <br /> See every ride.
          </h1>
          <p className="text-[#64748B] mt-6 max-w-lg leading-relaxed text-lg">
            Sign in to access your bookings, track live rides across Nassau and Paradise Island,
            and reserve your next taxi, tour or car rental in seconds.
          </p>

          <div className="mt-10 grid sm:grid-cols-2 gap-3 max-w-lg" data-testid="login-benefits">
            {BENEFITS.map((b, i) => (
              <motion.div key={b.title} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }}
                className="flex items-start gap-3 rounded-2xl bg-white/70 backdrop-blur-md border border-white/80 px-4 py-3.5 shadow-[0_10px_24px_rgba(11,25,44,0.04)]">
                <span className="w-9 h-9 rounded-xl bg-[#D4A94A]/12 text-[#D4A94A] flex items-center justify-center shrink-0">
                  <b.Icon className="w-4 h-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[#0B3B5C] leading-tight">{b.title}</span>
                  <span className="block text-xs text-[#64748B] mt-0.5 leading-snug">{b.body}</span>
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 32, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, delay: 0.15 }} className="lg:col-span-6 lg:pl-8">
          <div className="relative rounded-[28px] bg-white/85 backdrop-blur-xl border border-white/90 shadow-[0_30px_80px_rgba(11,25,44,0.14)] p-8 sm:p-10 overflow-hidden">
            <span className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-gradient-to-br from-[#D4A94A] to-[#A88235] opacity-25 blur-2xl" />
            <span className="absolute -bottom-14 -left-14 w-40 h-40 rounded-full bg-gradient-to-br from-[#0B3B5C] to-[#0B192C] opacity-15 blur-2xl" />

            <div className="relative">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#D4A94A] to-[#A88235] text-white flex items-center justify-center shadow-[0_10px_25px_rgba(212,169,74,0.4)]">
                  <Waves className="w-5 h-5" />
                </span>
                <div className="leading-none">
                  <div className="serif text-xl text-[#0B3B5C]">Rox Taxi</div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-[#64748B]">Member sign-in</div>
                </div>
              </div>

              <h2 className="serif text-3xl sm:text-4xl text-[#0B3B5C] mt-8 leading-[0.95]">
                Sign in to view your <em className="italic text-[#D4A94A]">bookings</em>.
              </h2>

              {/* Tabs */}
              <div className="mt-6 inline-flex rounded-full bg-[#F1F5F9] p-1 text-sm font-semibold" data-testid="login-tabs">
                <button onClick={() => setTab("email")} data-testid="login-tab-email" className={`px-4 py-2 rounded-full transition ${tab === "email" ? "bg-white text-[#0B3B5C] shadow-sm" : "text-[#64748B]"}`}>Email &amp; Password</button>
                <button onClick={() => setTab("google")} data-testid="login-tab-google" className={`px-4 py-2 rounded-full transition ${tab === "google" ? "bg-white text-[#0B3B5C] shadow-sm" : "text-[#64748B]"}`}>Google</button>
              </div>

              {tab === "email" ? (
                <form onSubmit={submit} className="mt-6 space-y-4" data-testid="login-form">
                  <label className="block">
                    <span className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold flex items-center gap-2 mb-1">
                      <Mail className="w-3.5 h-3.5 text-[#D4A94A]" /> Email
                    </span>
                    <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" className="input-line" placeholder="you@example.com" />
                  </label>
                  <label className="block">
                    <span className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] font-semibold flex items-center gap-2 mb-1">
                      <Lock className="w-3.5 h-3.5 text-[#D4A94A]" /> Password
                    </span>
                    <input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" className="input-line" placeholder="••••••••" />
                  </label>

                  {err && (
                    <div className="flex items-start gap-2 text-sm text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-3 py-2" data-testid="login-error">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{err}</span>
                    </div>
                  )}

                  <button type="submit" disabled={busy} data-testid="login-submit" className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white px-6 py-3.5 text-sm font-semibold shadow-[0_10px_25px_rgba(232,106,60,0.35)] disabled:opacity-60 transition">
                    <LogIn className="w-4 h-4" /> {busy ? "Signing in…" : "Sign in"}
                  </button>

                  <p className="text-xs text-[#64748B] text-center pt-1">
                    New to Rox? <Link to="/signup" className="text-[#D4A94A] font-semibold hover:underline" data-testid="login-goto-signup">Create an account</Link>
                  </p>
                </form>
              ) : (
                <div className="mt-6">
                  <p className="text-sm text-[#64748B] mb-4">One click with Google — no passwords to remember. New here? Signing in creates your account automatically.</p>
                  <button onClick={googleLogin} disabled={loading} data-testid="login-google-btn" className="w-full inline-flex items-center justify-center gap-3 rounded-full bg-white border border-[#E2E8F0] px-6 py-4 text-sm font-semibold text-[#0B3B5C] hover:border-[#D4A94A] hover:shadow-[0_16px_40px_rgba(212,169,74,0.22)] transition disabled:opacity-60">
                    <GoogleIcon /> Continue with Google
                  </button>
                </div>
              )}

              <div className="my-8 flex items-center gap-4">
                <span className="flex-1 h-px bg-[#E2E8F0]" />
                <span className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-semibold">Or</span>
                <span className="flex-1 h-px bg-[#E2E8F0]" />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <Link to="/track" data-testid="login-guest-track" className="group flex items-center justify-between gap-2 rounded-2xl border border-[#EFE7D5] bg-white hover:border-[#D4A94A] hover:-translate-y-0.5 transition-all px-4 py-3.5">
                  <span>
                    <span className="block text-sm font-semibold text-[#0B3B5C]">Track as guest</span>
                    <span className="block text-xs text-[#64748B]">Use your booking code</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#D4A94A] group-hover:translate-x-1 transition-all" />
                </Link>
                <Link to="/taxi" data-testid="login-book-taxi" className="group flex items-center justify-between gap-2 rounded-2xl border border-[#EFE7D5] bg-white hover:border-[#E86A3C] hover:-translate-y-0.5 transition-all px-4 py-3.5">
                  <span>
                    <span className="block text-sm font-semibold text-[#0B3B5C]">Book a taxi</span>
                    <span className="block text-xs text-[#64748B]">No account needed</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#94a3b8] group-hover:text-[#E86A3C] group-hover:translate-x-1 transition-all" />
                </Link>
              </div>

              <p className="text-[11px] text-[#94a3b8] mt-8 leading-relaxed">
                Sessions expire after 1 hour of inactivity. Your Google password is never shared with us.
                <Link to="/contact" className="text-[#D4A94A] hover:underline ml-1">Need help?</Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <style>{`.input-line{width:100%;background:transparent;border:0;border-bottom:1.5px solid #E2E8F0;padding:8px 0;font-size:15px;color:#0B3B5C;outline:none;transition:border-color .2s}.input-line:focus{border-color:#D4A94A}`}</style>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.1 29.2 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.9 29 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.6 19 13 24 13c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.9 29 5 24 5 16.3 5 9.7 9.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43c5 0 9.4-1.9 12.8-5l-5.9-5c-2 1.4-4.4 2.2-6.9 2.2-5.2 0-9.6-3.4-11.2-8L6.4 32.4C9.7 38.4 16.3 43 24 43z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l5.9 5c-.4.4 6.1-4.5 6.1-14.7 0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
