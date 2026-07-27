import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Waves } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();
  const { refresh } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = loc.hash || window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    const sessionId = m ? m[1] : null;
    if (!sessionId) { nav("/"); return; }

    (async () => {
      try {
        const r = await fetch(`${API}/auth/session`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Session-ID": sessionId },
        });
        if (!r.ok) throw new Error("auth failed");
        await refresh();
        // strip hash and go to bookings
        window.history.replaceState(null, "", "/my-bookings");
        nav("/my-bookings", { replace: true });
      } catch {
        nav("/");
      }
    })();
  }, [loc.hash, nav, refresh]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FBF7EF]">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-[#D4A94A] flex items-center justify-center mb-4 animate-pulse">
          <Waves className="w-6 h-6 text-white" />
        </div>
        <p className="text-[#0B3B5C]">Signing you in…</p>
      </div>
    </div>
  );
}
