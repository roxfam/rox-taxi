import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile CAPTCHA widget.
 *
 * Loads the Turnstile script once, renders a widget, and calls `onToken`
 * with the verification token whenever the user solves the challenge
 * (or auto-passes an invisible check).
 *
 * Props:
 *   siteKey — public Turnstile site key (falls back to REACT_APP_TURNSTILE_SITE_KEY)
 *   onToken — (token: string | "") => void
 *   theme   — "auto" | "light" | "dark" (default "light")
 *   action  — optional analytics label ("signup" | "login" | "reset")
 */
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

function loadScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve) => {
      const check = () => (window.turnstile ? resolve() : setTimeout(check, 50));
      check();
    });
  }
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

export default function TurnstileWidget({ onToken, siteKey, theme = "light", action, testid = "turnstile-widget" }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const key = siteKey || process.env.REACT_APP_TURNSTILE_SITE_KEY || "";

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    loadScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: key,
          theme,
          action,
          callback: (token) => onToken?.(token || ""),
          "error-callback": () => onToken?.(""),
          "expired-callback": () => onToken?.(""),
          "timeout-callback": () => onToken?.(""),
        });
      } catch {
        /* ignore render errors — user can retry */
      }
    });

    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch { /* noop */ }
      widgetIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, theme, action]);

  if (!key) {
    // Fail-open in dev/preview if the key was not configured. Backend
    // will still reject in production.
    return null;
  }

  return <div ref={containerRef} data-testid={testid} className="cf-turnstile flex justify-center" />;
}
