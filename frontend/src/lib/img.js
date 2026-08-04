// Free image CDN + WebP transcoder — wsrv.nl (Weserv Images).
// No API key, no signup, ~30ms edge cache on repeat hits. Fetches the
// origin URL, transcodes to WebP, resizes to the requested width and
// serves via HTTP/2 with aggressive cache headers.
//
// Why this shaves LCP time:
//   1. WebP is ~30% smaller than JPEG at the same visual quality.
//   2. Width is capped so a phone doesn't pull a 2400px hero image.
//   3. Weserv's CDN is closer to end users than our origin server.
//   4. `srcSet` variants let the browser pick the right resolution.
//
// Usage:
//   <img src={cdn(url, { w: 800 })} srcSet={cdnSrcSet(url, [400, 800, 1200])} />
//
// Non-goals: does NOT proxy internal /api/uploads/* URLs when the
// backend URL isn't public yet — falls back to the raw URL in that case.

const WSRV = "https://wsrv.nl/";
const BACKEND = process.env.REACT_APP_BACKEND_URL || "";

const _abs = (u) => {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("/")) return `${BACKEND}${u}`;
  return u;
};

// Bail-outs where CDN transcoding either doesn't help or breaks things:
//   • data: / blob: URIs
//   • SVGs (WebP conversion loses vector fidelity)
//   • Already-CDN'd URLs (avoid double-proxy)
const _shouldBypass = (u) => {
  if (!u) return true;
  if (u.startsWith("data:") || u.startsWith("blob:")) return true;
  if (u.endsWith(".svg")) return true;
  if (u.includes("wsrv.nl")) return true;
  return false;
};

/**
 * Wrap a raw image URL with the CDN + WebP transcode.
 * @param {string} url - origin image URL (absolute or /api/uploads/... relative)
 * @param {object} opts - { w, h, q, fit }
 */
export function cdn(url, opts = {}) {
  const abs = _abs(url);
  if (_shouldBypass(abs)) return abs;
  const params = new URLSearchParams({
    url: abs.replace(/^https?:\/\//, ""),
    output: "webp",
    q: String(opts.q ?? 78),
  });
  if (opts.w) params.set("w", String(opts.w));
  if (opts.h) params.set("h", String(opts.h));
  if (opts.fit) params.set("fit", String(opts.fit));
  // `we=1` = never upscale, keeps small source images crisp.
  params.set("we", "1");
  return `${WSRV}?${params.toString()}`;
}

/**
 * Build a responsive srcSet string for the given widths.
 */
export function cdnSrcSet(url, widths = [400, 800, 1200, 1600]) {
  const abs = _abs(url);
  if (_shouldBypass(abs)) return "";
  return widths.map((w) => `${cdn(abs, { w })} ${w}w`).join(", ");
}
