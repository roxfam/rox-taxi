import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Tag } from "lucide-react";
import { api, money } from "../lib/api";

/**
 * PackagesStrip — presents curated multi-service bundles (backend
 * /api/packages). Each card shows the items included, subtotal → package
 * price, and dollar savings. Renders nothing when no active packages
 * exist. Designed for embedding on the Home page and inside the booking
 * flow (right after service-type selection) as an upsell.
 */
export default function PackagesStrip({ variant = "home" }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/packages")
      .then(({ data }) => setPackages(Array.isArray(data) ? data : []))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || packages.length === 0) return null;

  const featured = packages.filter((p) => p.featured).length > 0
    ? packages.filter((p) => p.featured)
    : packages;

  const compact = variant === "booking";

  return (
    <section
      className={compact ? "py-8" : "max-w-7xl mx-auto px-6 lg:px-10 py-20"}
      data-testid="packages-strip"
    >
      {!compact && (
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <span className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-bold">
              <Sparkles className="w-3.5 h-3.5" /> Bundle & save
            </span>
            <h2 className="serif text-4xl sm:text-5xl tracking-tight text-[#0B3B5C] mt-2">
              Curated <em className="italic text-[#D4A94A]">package deals</em>.
            </h2>
            <p className="text-[#64748B] mt-3 max-w-xl">
              Bundle your airport transfer, tour and return trip in one booking — cheaper than the sum of the parts.
            </p>
          </div>
        </div>
      )}
      {compact && (
        <div className="mb-5 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#D4A94A]" />
          <span className="text-xs uppercase tracking-[0.28em] text-[#0B3B5C] font-bold">Save with a bundle</span>
        </div>
      )}

      <div className={`grid ${compact ? "sm:grid-cols-2" : "md:grid-cols-2"} gap-6`} data-testid="packages-strip-grid">
        {featured.slice(0, 2).map((p, i) => {
          const percent = p.subtotal ? Math.round((p.savings / p.subtotal) * 100) : 0;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative rounded-3xl overflow-hidden bg-white border border-[#E2E8F0] hover:-translate-y-1 hover:shadow-[0_25px_60px_rgba(11,25,44,0.12)] transition-all"
              data-testid={`package-card-${p.id}`}
            >
              {p.image_url && (
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {p.kicker && (
                    <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 text-[#0B3B5C] text-[10px] tracking-widest uppercase font-bold px-3 py-1.5">
                      {p.kicker}
                    </span>
                  )}
                  {p.savings > 0 && (
                    <span className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-[#E86A3C] text-white text-xs font-bold px-3 py-1.5 shadow-[0_6px_18px_rgba(232,106,60,0.45)]" data-testid={`package-savings-${p.id}`}>
                      <Tag className="w-3 h-3" /> Save {money(p.savings)}{percent ? ` · ${percent}% off` : ""}
                    </span>
                  )}
                </div>
              )}
              <div className="p-6">
                <h3 className="serif text-2xl text-[#0B3B5C] leading-snug">{p.name}</h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{p.description}</p>

                <ul className="mt-4 space-y-1.5" data-testid={`package-items-${p.id}`}>
                  {(p.items || []).map((it, idx) => (
                    <li key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-[#0B3B5C] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D4A94A]" />
                        {it.item_name}
                      </span>
                      {typeof it.price === "number" && (
                        <span className="mono text-[#64748B] text-xs">{money(it.price)}</span>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-5 pt-5 border-t border-[#F1F5F9] flex items-end justify-between gap-4">
                  <div>
                    {p.savings > 0 && (
                      <div className="text-[11px] text-[#94a3b8] line-through mono">{money(p.subtotal)}</div>
                    )}
                    <div className="mono text-2xl text-[#E86A3C] font-black leading-none">{money(p.package_price)}</div>
                    <div className="text-[10px] tracking-widest uppercase text-[#64748B] mt-1">Package total</div>
                  </div>
                  <Link
                    to={`/contact?package=${encodeURIComponent(p.id)}`}
                    className="btn-shine rounded-full bg-[#0B3B5C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#0B192C] active:scale-95 inline-flex items-center gap-1.5"
                    data-testid={`package-book-${p.id}`}
                  >
                    Book bundle <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
