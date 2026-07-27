import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Lock } from "lucide-react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("admin_token", data.token);
      localStorage.setItem("admin_email", data.email);
      toast.success("Welcome back");
      nav("/admin");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-24" data-testid="admin-login-page">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[#E2E8F0] bg-white p-10 shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
        <div className="w-12 h-12 rounded-xl bg-[#0B3B5C] text-white flex items-center justify-center mb-6"><Lock className="w-5 h-5" /></div>
        <h1 className="serif text-3xl text-[#0B3B5C]">Admin sign-in</h1>
        <p className="text-sm text-[#64748B] mt-2">Manage bookings, statuses and revenue for Rox Taxi Service and Tours.</p>

        <div className="mt-8 space-y-4">
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required data-testid="admin-email-input"
              className="w-full rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20" />
          </div>
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required data-testid="admin-password-input"
              className="w-full rounded-xl border border-[#E2E8F0] px-4 py-3 text-sm focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20" />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          data-testid="admin-login-submit"
          className="btn-shine mt-8 w-full rounded-full bg-[#0B3B5C] text-white py-3 text-sm font-semibold hover:bg-[#132a4a] active:scale-95 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
