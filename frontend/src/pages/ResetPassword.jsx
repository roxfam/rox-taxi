import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, KeyRound, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { api } from "../lib/api";

/**
 * /reset-password?token=<raw>
 *
 * The user lands here from the email link. Form asks for a new password
 * twice, POSTs to /api/auth/reset-password. On success, we route them to
 * /login with a success banner.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setErr("Missing reset token. Request a new link from the sign-in page.");
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => nav("/login", { replace: true }), 1800);
    } catch (ex) {
      setErr(ex?.response?.data?.detail || "Reset failed. The link may have expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden" data-testid="reset-password-page">
      <div className="absolute inset-0 -z-10" style={{
        background: "radial-gradient(ellipse at 20% 10%, rgba(212,169,74,0.18), transparent 55%), radial-gradient(ellipse at 90% 90%, rgba(11,59,92,0.22), transparent 60%), linear-gradient(180deg, #FBF7EF 0%, #F1E8D3 100%)",
      }} />
      <div className="max-w-md mx-auto px-6 py-20">
        <Link to="/login" className="text-xs text-[#64748B] hover:text-[#0B3B5C] inline-flex items-center gap-1 mb-6" data-testid="reset-back-to-login">
          <ArrowLeft className="w-3 h-3" /> Back to sign in
        </Link>
        <div className="relative rounded-[28px] bg-white/85 backdrop-blur-xl border border-white/90 shadow-[0_30px_80px_rgba(11,25,44,0.14)] p-8 sm:p-10 overflow-hidden">
          <span className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-gradient-to-br from-[#D4A94A] to-[#A88235] opacity-25 blur-2xl" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-semibold">
              <KeyRound className="w-3.5 h-3.5" /> Account security
            </span>
            <h1 className="serif text-3xl mt-3 text-[#0B3B5C] leading-tight">Set a new password</h1>
            <p className="text-sm text-[#64748B] mt-2">Choose a strong password you don't use anywhere else.</p>

            {done ? (
              <div className="mt-8 rounded-2xl bg-[#059669]/10 border border-[#059669]/30 text-[#065f46] p-4 flex items-start gap-3" data-testid="reset-success">
                <CheckCircle2 className="w-5 h-5 mt-[1px] shrink-0" />
                <div>
                  <div className="font-bold text-sm">Password updated</div>
                  <div className="text-xs mt-0.5">Redirecting you to sign in…</div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-5" data-testid="reset-form">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-widest text-[#94a3b8] font-semibold flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> New password
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                    className="input-line"
                    required
                    data-testid="reset-password-input"
                    autoFocus
                    autoComplete="new-password"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-widest text-[#94a3b8] font-semibold flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> Confirm password
                  </span>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Type it again"
                    className="input-line"
                    required
                    data-testid="reset-confirm-input"
                    autoComplete="new-password"
                  />
                </label>

                {err && (
                  <div className="rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/30 text-[#7f1d1d] text-xs p-3 flex items-start gap-2" data-testid="reset-error">
                    <AlertCircle className="w-4 h-4 mt-[1px] shrink-0" />
                    <span>{err}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || !token}
                  data-testid="reset-submit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white px-6 py-3.5 text-sm font-semibold shadow-[0_10px_25px_rgba(232,106,60,0.35)] disabled:opacity-60 transition"
                >
                  {busy ? "Updating…" : "Update password"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      <style>{`.input-line{width:100%;background:transparent;border:0;border-bottom:1.5px solid #E2E8F0;padding:8px 0;font-size:15px;color:#0B3B5C;outline:none;transition:border-color .2s}.input-line:focus{border-color:#D4A94A}`}</style>
    </div>
  );
}
