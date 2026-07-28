import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { API } from "./api";

const AuthCtx = createContext({
  user: null, loading: true,
  login: () => {}, loginEmail: async () => {}, register: async () => {},
  logout: async () => {}, refresh: async () => {},
});

// Idle timeout matches backend IDLE_TIMEOUT_MINUTES.
const IDLE_LIMIT_MS = 60 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // send at most once per minute

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef(Date.now());
  const lastHeartbeatRef = useRef(0);

  const checkAuth = useCallback(async () => {
    if (window.location.hash?.includes("session_id=")) { setLoading(false); return; }
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: "include" });
      if (r.ok) setUser(await r.json()); else setUser(null);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = () => {
    const redirectUrl = window.location.origin + "/my-bookings";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const loginEmail = useCallback(async (email, password) => {
    const r = await fetch(`${API}/auth/login-email`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
    const data = await r.json();
    setUser(data.user);
    lastActivityRef.current = Date.now();
    return data.user;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const r = await fetch(`${API}/auth/register`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const detail = err.detail;
      const msg = Array.isArray(detail) ? detail.map(e => e.msg || JSON.stringify(e)).join(" · ")
        : (typeof detail === "string" ? detail : "Signup failed");
      throw new Error(msg);
    }
    const data = await r.json();
    setUser(data.user);
    lastActivityRef.current = Date.now();
    return data.user;
  }, []);

  const logout = useCallback(async (opts = {}) => {
    try { await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" }); } catch {}
    setUser(null);
    if (opts.reason === "idle") {
      // eslint-disable-next-line no-alert
      try { window.alert("You were signed out after 1 hour of inactivity."); } catch {}
    }
    window.location.href = "/";
  }, []);

  // ── Idle-logout + heartbeat ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const mark = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, mark, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, mark));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const iv = setInterval(async () => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_LIMIT_MS) {
        clearInterval(iv);
        logout({ reason: "idle" });
        return;
      }
      // throttled heartbeat — refreshes backend last_activity_at
      const sinceHb = Date.now() - lastHeartbeatRef.current;
      if (sinceHb >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatRef.current = Date.now();
        try {
          const r = await fetch(`${API}/auth/heartbeat`, { method: "POST", credentials: "include" });
          if (r.status === 401) { clearInterval(iv); logout({ reason: "idle" }); }
        } catch {}
      }
    }, 15 * 1000);
    return () => clearInterval(iv);
  }, [user, logout]);

  return (
    <AuthCtx.Provider value={{ user, loading, login, loginEmail, register, logout, refresh: checkAuth }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
