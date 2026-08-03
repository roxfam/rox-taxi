import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../lib/api";

/**
 * FacebookPixel — loads the Meta Pixel snippet using the ID stored in
 * site_config.secrets.FB_PIXEL_ID (surfaced by /api/site-config).
 *
 * - Loads the fbevents.js library exactly once per document.
 * - Fires the initial PageView after `fbq('init', <id>)`.
 * - Re-fires PageView on client-side route changes so SPA navigations
 *   still show up in Meta Events Manager as separate events.
 * - Skips on /admin (no need to burn ad budget tracking the owner).
 * - Silently no-ops if the admin hasn't configured a Pixel ID yet, so
 *   this component is safe to mount unconditionally.
 */
export default function FacebookPixel() {
  const location = useLocation();
  const pixelId = useRef(null);
  const loaded = useRef(false);

  // Fetch the pixel ID from site-config on mount (once).
  useEffect(() => {
    let cancelled = false;
    api.get("/site-config").then((r) => {
      const id = (r.data?.fb_pixel_id || "").toString().trim();
      if (!id || cancelled) return;
      // Basic guard — Meta Pixel IDs are numeric strings, 15-16 digits.
      if (!/^\d{6,20}$/.test(id)) return;
      pixelId.current = id;
      injectPixel(id);
      loaded.current = true;
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Fire PageView on every client-side route change (after initial load).
  useEffect(() => {
    if (!loaded.current || !window.fbq) return;
    if (location.pathname.startsWith("/admin")) return;
    window.fbq("track", "PageView");
  }, [location.pathname]);

  return null;
}

function injectPixel(id) {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/admin")) return;
  if (window.fbq) return; // already loaded (e.g. hot-reload)

  // Standard Meta Pixel base code, translated from the JS snippet Facebook
  // ships in Events Manager. Injected once, then we call fbq() directly.
  /* eslint-disable */
  (function(f,b,e,v,n,t,s){
    if(f.fbq)return; n=f.fbq=function(){
      n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments);
    };
    if(!f._fbq) f._fbq = n;
    n.push=n; n.loaded=!0; n.version='2.0'; n.queue=[];
    t=b.createElement(e); t.async=!0; t.src=v;
    s=b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t,s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  window.fbq("init", id);
  window.fbq("track", "PageView");

  // <noscript> fallback pixel — ~1% of visitors block JS, this still counts them.
  const noscript = document.createElement("noscript");
  const img = document.createElement("img");
  img.height = 1;
  img.width = 1;
  img.style.display = "none";
  img.src = `https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`;
  img.alt = "";
  noscript.appendChild(img);
  document.head.appendChild(noscript);
}
