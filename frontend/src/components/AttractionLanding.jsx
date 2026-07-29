import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, MapPin, ArrowRight, ExternalLink, Ticket, Info, Phone, Star } from "lucide-react";
import { api, money } from "../lib/api";

/**
 * AttractionLanding — reusable landing page for a single Nassau attraction.
 * Feeds off two data sources:
 *   1. `config` prop (static content: name, description, address, hours, marches, external_url, gallery)
 *   2. Live GET /api/taxi-services for the taxi route price cards (matched by config.taxi_route_ids)
 *
 * Renders: full-bleed hero → info card (hours + marches) → taxi CTA strip → gallery → external booking CTA.
 * The design mirrors the site's premium serif + gold accent aesthetic already in use on / and /fleet.
 */
export default function AttractionLanding({ config }) {
  const {
    slug, kicker, name, tagline, hero_image, description,
    address, hours = [], marches = [],
    features = [], gallery = [],
    external_url, external_label,
    taxi_route_ids = [],
    admission_note,
  } = config;

  const [taxiRoutes, setTaxiRoutes] = useState([]);

  useEffect(() => {
    if (taxi_route_ids.length === 0) return;
    api.get("/taxi-services")
      .then(({ data }) => {
        const map = new Map((data || []).map((s) => [s.id, s]));
        setTaxiRoutes(taxi_route_ids.map((id) => map.get(id)).filter(Boolean));
      })
      .catch(() => {});
  }, [taxi_route_ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-[#F7F5EF] min-h-screen" data-testid={`attraction-${slug}`}>
      {/* HERO */}
      <section className="relative h-[70vh] min-h-[520px] overflow-hidden" data-testid="attraction-hero">
        <img
          src={hero_image}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: "brightness(1.05) contrast(1.10) saturate(1.10)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B192C] via-[#0B192C]/50 to-transparent" />
        <div className="relative h-full max-w-6xl mx-auto px-6 lg:px-10 flex flex-col justify-end pb-14">
          <span className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-bold drop-shadow" data-testid="attraction-kicker">
            <Star className="w-3.5 h-3.5" /> {kicker || "Nassau Attraction"}
          </span>
          <h1
            className="serif text-white text-5xl sm:text-6xl lg:text-7xl mt-4 leading-[0.95] tracking-tight max-w-3xl"
            data-testid="attraction-title"
            style={{ textShadow: "0 6px 30px rgba(0,0,0,0.55)" }}
          >
            {name}
          </h1>
          {tagline && (
            <p className="text-white/85 text-lg mt-4 max-w-2xl leading-relaxed" data-testid="attraction-tagline">
              {tagline}
            </p>
          )}
        </div>
      </section>

      {/* INFO GRID: description + hours/marches */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-16 grid lg:grid-cols-3 gap-8" data-testid="attraction-info">
        <div className="lg:col-span-2 space-y-6">
          {description.map((p, i) => (
            <p key={i} className="text-[#334155] text-base lg:text-lg leading-relaxed">{p}</p>
          ))}
          {features.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 pt-4" data-testid="attraction-features">
              {features.map((f, i) => (
                <div key={i} className="flex items-start gap-3 rounded-2xl bg-white border border-[#E2E8F0] p-4">
                  <span className="w-8 h-8 rounded-full bg-[#D4A94A]/12 flex items-center justify-center shrink-0 mt-0.5">
                    <Star className="w-4 h-4 text-[#D4A94A]" />
                  </span>
                  <div>
                    <div className="font-semibold text-[#0B3B5C] text-sm">{f.title}</div>
                    {f.text && <div className="text-xs text-[#64748B] mt-0.5">{f.text}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-3xl bg-white border border-[#E2E8F0] p-6 h-fit sticky top-24" data-testid="attraction-sidebar">
          {address && (
            <div className="flex items-start gap-3 pb-4 border-b border-[#F1F5F9]">
              <MapPin className="w-5 h-5 text-[#D4A94A] shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#64748B] font-bold">Address</div>
                <div className="text-sm text-[#0B3B5C] mt-1">{address}</div>
              </div>
            </div>
          )}
          {hours.length > 0 && (
            <div className="py-4 border-b border-[#F1F5F9]" data-testid="attraction-hours">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-[#D4A94A]" />
                <div className="text-[10px] uppercase tracking-widest text-[#64748B] font-bold">Hours</div>
              </div>
              <ul className="space-y-1">
                {hours.map((h, i) => (
                  <li key={i} className="text-sm text-[#0B3B5C] flex items-center justify-between">
                    <span>{h.day}</span>
                    <span className="mono text-xs text-[#64748B]">{h.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {marches.length > 0 && (
            <div className="py-4 border-b border-[#F1F5F9]" data-testid="attraction-marches">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="w-4 h-4 text-[#E86A3C]" />
                <div className="text-[10px] uppercase tracking-widest text-[#E86A3C] font-bold">Don't miss</div>
              </div>
              <div className="text-sm font-semibold text-[#0B3B5C] mb-2">Flamingo marches</div>
              <div className="flex gap-2 flex-wrap">
                {marches.map((t, i) => (
                  <span key={i} className="mono text-xs font-bold text-[#0B3B5C] bg-[#D4A94A]/12 rounded-full px-3 py-1">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {admission_note && (
            <div className="pt-4 flex items-start gap-2">
              <Info className="w-4 h-4 text-[#64748B] shrink-0 mt-0.5" />
              <p className="text-xs text-[#64748B] leading-relaxed">{admission_note}</p>
            </div>
          )}
          {external_url && (
            <a
              href={external_url}
              target="_blank" rel="noreferrer"
              className="mt-5 w-full btn-shine rounded-full bg-[#0B3B5C] hover:bg-black text-white text-sm font-semibold py-2.5 inline-flex items-center justify-center gap-1.5 active:scale-95"
              data-testid="attraction-external-cta"
            >
              {external_label || "Visit official site"} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </aside>
      </section>

      {/* TAXI ROUTES */}
      {taxiRoutes.length > 0 && (
        <section className="bg-white border-y border-[#E2E8F0]" data-testid="attraction-taxi-routes">
          <div className="max-w-6xl mx-auto px-6 lg:px-10 py-16">
            <div className="mb-8">
              <span className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-bold">
                <MapPin className="w-3.5 h-3.5" /> Get here by Rox Taxi
              </span>
              <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-2 tracking-tight">
                Fixed fare, <em className="italic font-black text-[#D4A94A]">no meter, no surge</em>.
              </h2>
              <p className="text-[#64748B] mt-3 max-w-xl">
                Bahamian tariff: up to 2 passengers included. +$5 per extra passenger. Bridge tolls & standard luggage included.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              {taxiRoutes.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                  className="rounded-3xl bg-[#F7F5EF] border border-[#E2E8F0] p-6 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(11,25,44,0.10)] transition-all flex flex-col gap-4"
                  data-testid={`attraction-taxi-${r.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[#D4A94A] font-black">{r.route}</div>
                      <div className="serif text-xl text-[#0B3B5C] leading-tight mt-1">{r.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="mono text-3xl text-[#E86A3C] font-black leading-none">{money(r.price)}</div>
                      <div className="text-[10px] tracking-widest uppercase text-[#64748B] mt-1">from</div>
                    </div>
                  </div>
                  {r.description && (
                    <p className="text-sm text-[#64748B] leading-relaxed line-clamp-3">
                      {r.description.replace(/^Official Bahamian tariff[^.]*\.\s*/, "")}
                    </p>
                  )}
                  <Link
                    to={`/taxi#${r.id}`}
                    className="mt-auto btn-shine rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white text-sm font-semibold py-2.5 inline-flex items-center justify-center gap-1.5 active:scale-95"
                    data-testid={`attraction-taxi-book-${r.id}`}
                  >
                    Book this ride <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* GALLERY */}
      {gallery.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 lg:px-10 py-16" data-testid="attraction-gallery">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="aspect-square rounded-2xl overflow-hidden bg-[#0B192C]">
                <img
                  src={src}
                  alt={`${name} photo ${i + 1}`}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  style={{ filter: "brightness(1.05) contrast(1.10) saturate(1.10)" }}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* BOTTOM CTA */}
      <section className="max-w-3xl mx-auto px-6 lg:px-10 py-16 text-center" data-testid="attraction-bottom-cta">
        <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] tracking-tight">
          Ride there today.
        </h2>
        <p className="text-[#64748B] mt-4 max-w-lg mx-auto">
          Book the taxi first — we'll have you at the gate in {slug === "ardastra" ? "under 15 minutes from downtown" : "a heartbeat"}.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link
            to="/taxi"
            className="btn-shine rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white px-6 py-3 font-semibold inline-flex items-center gap-2 active:scale-95"
            data-testid="attraction-cta-taxi"
          >
            Pick your route <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="tel:+12424322587"
            className="rounded-full bg-white border border-[#E2E8F0] hover:border-[#D4A94A] text-[#0B3B5C] px-6 py-3 font-semibold inline-flex items-center gap-2 active:scale-95"
            data-testid="attraction-cta-call"
          >
            <Phone className="w-4 h-4" /> +1 (242) 432-2587
          </a>
        </div>
      </section>
    </div>
  );
}
