import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo";
import { api } from "../lib/api";
import { LOCALES, SITE, alternatesFor, LOCALE_ROUTES } from "../lib/seoLocales";

const CLUSTER = { "": "home", taxi: "taxi", tours: "tours" };

function goBook(gt, to) {
  if (gt) {
    document.cookie = `googtrans=/en/${gt}; path=/`;
    window.location.href = to;
  }
}

function BookLink({ gt, to, className, children, testid }) {
  return (
    <Link to={to} className={className} data-testid={testid}
      onClick={(e) => { if (gt) { e.preventDefault(); goBook(gt, to); } }}>
      {children}
    </Link>
  );
}

function jsonLd(loc, p, url) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "TaxiService", name: "Rox Taxi Service & Tours", url, inLanguage: loc.lang, description: p.description,
        provider: { "@type": "LocalBusiness", name: "Rox Taxi Service & Tours", telephone: "+12424322587",
          address: { "@type": "PostalAddress", addressLocality: "Nassau", addressRegion: "New Providence", addressCountry: "BS" } },
        areaServed: { "@type": "City", name: "Nassau" } },
      { "@type": "FAQPage", inLanguage: loc.lang,
        mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
}

function OtherLocales({ current }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="locale-links">
      <Link to="/" className="px-3 py-1.5 rounded-full border border-[#0B3B5C]/20 text-xs hover:bg-[#0B3B5C] hover:text-white transition-colors" data-testid="locale-link-en">English</Link>
      {LOCALE_ROUTES.filter((r) => r.pk === "" && r.lk !== current).map((r) => (
        <Link key={r.lk} to={r.path} hrefLang={LOCALES[r.lk].hreflang} data-testid={`locale-link-${r.lk}`}
          className="px-3 py-1.5 rounded-full border border-[#0B3B5C]/20 text-xs hover:bg-[#0B3B5C] hover:text-white transition-colors">
          {LOCALES[r.lk].label}
        </Link>
      ))}
    </div>
  );
}

function LiveFare({ serviceId, label }) {
  const [price, setPrice] = useState(null);
  useEffect(() => {
    api.get("/taxi-services").then((r) => {
      const s = (r.data || []).find((x) => x.id === serviceId);
      if (s) setPrice(Number(s.price));
    }).catch(() => {});
  }, [serviceId]);
  if (price == null) return null;
  return (
    <div className="mt-8 inline-flex items-baseline gap-3 rounded-2xl bg-white/10 px-5 py-3" data-testid="locale-live-fare">
      <span className="text-xs uppercase tracking-[0.2em] text-white/60">{label}</span>
      <span className="mono text-3xl font-black text-[#D4A94A]">${price.toFixed(0)}</span>
    </div>
  );
}

function Popular({ items }) {
  return (
    <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-12" data-testid="locale-popular">
      <div className="flex flex-wrap gap-2">
        {items.map((c) => (
          <BookLink key={c.to} gt={null} to={c.to} testid={`locale-popular-${c.to.split("/").pop()}`}
            className="rounded-full border border-[#0B3B5C]/20 bg-white px-4 py-2 text-sm text-[#0B3B5C] hover:border-[#D4A94A] transition-colors">
            {c.title} <b className="mono ml-1 text-[#E86A3C]">{c.body}</b>
          </BookLink>
        ))}
      </div>
    </section>
  );
}

export default function LocalLanding({ lk, pk }) {
  const loc = LOCALES[lk];
  const p = loc.pages[pk];
  const url = `${SITE}/${lk}${pk ? "/" + pk : ""}`;
  const primaryTo = p.ctaTo || (pk === "tours" ? "/tours" : "/taxi");
  const secondTo = p.cta2To || "/tours";
  return (
    <div lang={loc.lang} className="notranslate" translate="no" data-testid={`locale-page-${lk}-${pk || "home"}`}>
      <Seo title={p.title} description={p.description} canonical={url} keywords={p.keywords} ogImage={`${SITE}/og-cover.jpg`}
        lang={loc.lang} ogLocale={loc.ogLocale} alternates={alternatesFor(p.cluster || CLUSTER[pk])} jsonLd={jsonLd(loc, p, url)} />
      <section className="bg-[#0B3B5C] text-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-20 lg:py-28">
          <div className="text-[11px] tracking-[0.3em] uppercase text-[#D4A94A] font-bold mb-5" data-testid="locale-eyebrow">{p.eyebrow}</div>
          <h1 className="serif text-4xl sm:text-5xl lg:text-6xl leading-tight max-w-3xl" data-testid="locale-h1">{p.h1}</h1>
          <p className="mt-6 text-base md:text-lg text-white/75 max-w-2xl">{p.intro}</p>
          {p.serviceId && <div><LiveFare serviceId={p.serviceId} label={p.priceLabel} /></div>}
          <div className="mt-10 flex flex-wrap gap-3">
            <BookLink gt={loc.gt} to={primaryTo} testid="locale-cta-primary"
              className="rounded-full bg-[#E86A3C] px-7 py-3.5 font-bold hover:-translate-y-0.5 transition-transform">{p.cta}</BookLink>
            <BookLink gt={loc.gt} to={secondTo} testid="locale-cta-secondary"
              className="rounded-full border border-white/30 px-7 py-3.5 font-semibold hover:bg-white/10 transition-colors">{p.cta2}</BookLink>
          </div>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-16 grid md:grid-cols-3 gap-5">
        {p.cards.map((c, i) => (
          <BookLink key={c.title} gt={loc.gt} to={c.to} testid={`locale-card-${i}`}
            className="group block bg-white rounded-2xl border border-[#E2E8F0] p-6 hover:border-[#D4A94A] hover:-translate-y-1 transition-transform">
            <h2 className="text-base md:text-lg font-semibold text-[#0B3B5C]">{c.title}</h2>
            <p className="mt-2 text-sm text-[#475569]">{c.body}</p>
            <span className="mt-4 inline-block text-[#E86A3C] text-sm font-bold group-hover:translate-x-1 transition-transform">→</span>
          </BookLink>
        ))}
      </section>
      {p.popular && <Popular items={p.popular} />}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-16 grid lg:grid-cols-2 gap-10">
        <div>
          <h2 className="text-base md:text-lg font-semibold text-[#0B3B5C] mb-4">{p.stepsTitle}</h2>
          <ol className="space-y-3">
            {p.steps.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm text-[#334155]"><span className="mono font-bold text-[#D4A94A]">0{i + 1}</span>{s}</li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-[#64748B] bg-[#F8FAFC] border rounded-lg p-4" data-testid="locale-note">{p.note}</p>
        </div>
        <div data-testid="locale-faq">
          <h2 className="text-base md:text-lg font-semibold text-[#0B3B5C] mb-4">FAQ</h2>
          {p.faq.map((f) => (
            <details key={f.q} className="border-b py-3">
              <summary className="cursor-pointer text-sm font-semibold text-[#0B3B5C]">{f.q}</summary>
              <p className="mt-2 text-sm text-[#475569]">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-8"><OtherLocales current={lk} /></section>
    </div>
  );
}
