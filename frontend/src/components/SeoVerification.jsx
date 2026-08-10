import { useEffect } from "react";
import { api } from "../lib/api";

/**
 * SeoVerification — reads site-config from /api/site-config on mount and
 * injects search-engine verification meta tags into <head>. Runs once
 * per page load; the owner pastes their codes in Admin → Site Config
 * and search engines pick them up on the next crawl.
 *
 * Verification tags supported:
 *   - Google Search Console  (google-site-verification)
 *   - Bing Webmaster Tools   (msvalidate.01)
 *   - Yandex Webmaster       (yandex-verification)
 *   - Pinterest              (p:domain_verify)
 *   - Facebook Domain Verify (facebook-domain-verification)
 *   - Norton Safe Web        (norton-safeweb-site-verification)
 *
 * Idempotent: only creates a meta tag the first time; subsequent renders
 * update the existing tag in place. This keeps the DOM clean when other
 * routes re-mount the app.
 */
function upsertMeta(name, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export default function SeoVerification() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/site-config");
        if (cancelled || !data) return;
        upsertMeta("google-site-verification", data.google_verification);
        upsertMeta("msvalidate.01", data.bing_verification);
        upsertMeta("yandex-verification", data.yandex_verification);
        upsertMeta("p:domain_verify", data.pinterest_verification);
        upsertMeta("facebook-domain-verification", data.facebook_verification);
        upsertMeta("norton-safeweb-site-verification", data.norton_verification);
      } catch { /* silent — site still works if config endpoint hiccups */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
