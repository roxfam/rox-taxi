// After `craco build`: write finished HTML for every localized page (e.g. build/zh/index.html)
// so crawlers that don't run JavaScript (Baidu, Sogou, Naver) read the full text.
const fs = require("fs");
const os = require("os");
const path = require("path");

const BUILD = path.resolve(__dirname, "..", process.env.BUILD_PATH || "build");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function body(loc, p, routes, lk, LOCALES) {
  const cards = p.cards.map((c) => `<a href="${c.to}"><h2>${esc(c.title)}</h2><p>${esc(c.body)}</p></a>`).join("");
  const popular = (p.popular || []).map((c) => `<li><a href="${c.to}">${esc(c.title)} ${esc(c.body)}</a></li>`).join("");
  const steps = p.steps.map((s) => `<li>${esc(s)}</li>`).join("");
  const faq = p.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("");
  const langs = routes.filter((r) => r.pk === "" && r.lk !== lk)
    .map((r) => `<a href="${r.path}" hreflang="${LOCALES[r.lk].hreflang}">${esc(LOCALES[r.lk].label)}</a>`).join(" · ");
  return `<div lang="${loc.lang}" class="notranslate prerendered"><header><p>${esc(p.eyebrow)}</p><h1>${esc(p.h1)}</h1><p>${esc(p.intro)}</p>`
    + `<a href="${p.ctaTo || "/taxi"}">${esc(p.cta)}</a> <a href="${p.cta2To || "/tours"}">${esc(p.cta2)}</a></header>`
    + `<section>${cards}</section>${popular ? `<ul>${popular}</ul>` : ""}<section><h2>${esc(p.stepsTitle)}</h2><ol>${steps}</ol><p>${esc(p.note)}</p></section>`
    + `<section><h2>FAQ</h2>${faq}</section><nav><a href="/">English</a> · ${langs}</nav></div>`;
}

function setTag(html, re, tag) {
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", `${tag}</head>`);
}

(async () => {
  const tmp = path.join(os.tmpdir(), `seoLocales-${Date.now()}.mjs`);
  fs.copyFileSync(path.resolve(__dirname, "..", "src/lib/seoLocales.js"), tmp);
  const { LOCALES, LOCALE_ROUTES, SITE, alternatesFor } = await import(tmp);
  fs.unlinkSync(tmp);
  const CLUSTER = { "": "home", taxi: "taxi", tours: "tours" };
  const shell = fs.readFileSync(path.join(BUILD, "index.html"), "utf8");
  for (const r of LOCALE_ROUTES) {
    const loc = LOCALES[r.lk];
    const p = loc.pages[r.pk];
    const url = SITE + r.path;
    const alts = alternatesFor(p.cluster || CLUSTER[r.pk])
      .map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`).join("");
    const faqLd = { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: loc.lang,
      mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
    let h = shell.replace(/<html[^>]*>/, `<html lang="${loc.lang}">`)
      .replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>/g, "");
    h = setTag(h, /<title>[\s\S]*?<\/title>/, `<title>${esc(p.title)}</title>`);
    h = setTag(h, /<meta name="description"[^>]*>/, `<meta name="description" content="${esc(p.description)}"/>`);
    h = setTag(h, /<meta name="keywords"[^>]*>/, `<meta name="keywords" content="${esc(p.keywords)}"/>`);
    h = setTag(h, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}"/>${alts}`);
    h = setTag(h, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(p.title)}"/>`);
    h = setTag(h, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(p.description)}"/>`);
    h = setTag(h, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}"/>`);
    h = setTag(h, /<meta property="og:locale" [^>]*>/, `<meta property="og:locale" content="${loc.ogLocale}"/>`);
    h = setTag(h, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(p.title)}"/>`);
    h = setTag(h, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(p.description)}"/>`);
    h = h.replace("</head>", `<meta http-equiv="Content-Language" content="${loc.lang}"/><script type="application/ld+json">${JSON.stringify(faqLd)}</script></head>`);
    h = h.replace(/<div id="root"><\/div>/, `<div id="root">${body(loc, p, LOCALE_ROUTES, r.lk, LOCALES)}</div>`);
    const dir = path.join(BUILD, r.path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), h);
  }
  console.log(`prerendered ${LOCALE_ROUTES.length} localized pages`);
})().catch((e) => { console.error("prerender failed:", e); process.exit(1); });
