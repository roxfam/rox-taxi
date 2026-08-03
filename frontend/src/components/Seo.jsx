import { useEffect } from "react";

/**
 * Seo — per-route <title>, meta description, canonical, Open Graph and
 * JSON-LD injector for a React SPA.
 *
 * The site's base index.html already ships homepage-level SEO (title,
 * description, LocalBusiness schema, FAQ, reviews). This component overrides
 * those tags on client-side navigation so /taxi, /tours, /rentals and future
 * pages each rank on their own primary keyword.
 *
 * Why not react-helmet? react-helmet-async has been abandoned and adds ~15 kB
 * for what is 40 lines of vanilla DOM. We update the head tags directly.
 *
 * Usage:
 *   <Seo
 *     title="Nassau Taxi Service Bahamas | LPIA & Atlantis 24/7"
 *     description="…"
 *     canonical="https://roxtaxi.com/taxi"
 *     jsonLd={{ "@context":"https://schema.org", "@type":"TaxiService", … }}
 *   />
 */
function setMeta(name, content, useProperty = false) {
  if (!content) return;
  const attr = useProperty ? "property" : "name";
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel, href) {
  if (!href) return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function Seo({
  title,
  description,
  canonical,
  keywords,
  ogImage,
  jsonLd,
}) {
  useEffect(() => {
    if (title) document.title = title;
    setMeta("description", description);
    if (keywords) setMeta("keywords", keywords);
    setLink("canonical", canonical);

    // Open Graph + Twitter — Facebook, LinkedIn, Slack, iMessage, X preview cards.
    setMeta("og:title", title, true);
    setMeta("og:description", description, true);
    setMeta("og:url", canonical, true);
    if (ogImage) setMeta("og:image", ogImage, true);
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    if (ogImage) setMeta("twitter:image", ogImage);

    // Page-scoped JSON-LD. We tag the script with a data attr so we can
    // remove exactly this page's node on unmount without touching the
    // homepage LocalBusiness/FAQ graph in index.html.
    let ldEl;
    if (jsonLd) {
      ldEl = document.createElement("script");
      ldEl.setAttribute("type", "application/ld+json");
      ldEl.setAttribute("data-seo-route", canonical || title || "route");
      ldEl.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(ldEl);
    }
    return () => {
      if (ldEl && ldEl.parentNode) ldEl.parentNode.removeChild(ldEl);
    };
  }, [title, description, canonical, keywords, ogImage, jsonLd]);

  return null;
}
