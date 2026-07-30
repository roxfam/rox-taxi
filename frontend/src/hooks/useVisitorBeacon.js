import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Persist a per-tab session id so we can count unique sessions server-side.
function getSessionId() {
  let sid = sessionStorage.getItem("rox_visit_sid");
  if (!sid) {
    sid = `sid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("rox_visit_sid", sid);
  }
  return sid;
}

/**
 * useVisitorBeacon — fire-and-forget POST to /api/visitors/log on every
 * React-Router path change. Uses sendBeacon when available so it never
 * blocks the next render. Skips /admin routes to avoid polluting the
 * report with our own admin activity.
 */
export function useVisitorBeacon() {
  const { pathname, search } = useLocation();
  const lastPath = useRef(null);

  useEffect(() => {
    if (!BACKEND_URL) return;
    const full = `${pathname}${search || ""}`;
    if (full === lastPath.current) return;
    if (pathname.startsWith("/admin")) return;
    lastPath.current = full;

    const body = JSON.stringify({
      path: full,
      referrer: document.referrer || "",
      session_id: getSessionId(),
    });
    const url = `${BACKEND_URL}/api/visitors/log`;

    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      // Fallback for older browsers
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }, [pathname, search]);
}
