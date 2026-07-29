import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../lib/api";
import { Shield, Users, Car as CarIcon, Star, Award, CheckCircle2, Phone, ArrowRight, Languages, Wifi, Snowflake, MapPin } from "lucide-react";

// Public "Meet the fleet" page — driver bios + vehicle line-up. Data comes
// from GET /api/fleet (seeded in server.py, admin-editable). Renders a
// graceful empty state if the collection is missing so the page never 500s.
export default function Fleet() {
  const [fleet, setFleet] = useState({ drivers: [], vehicles: [], headline: "", subheadline: "", trust_notes: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/fleet").then(({ data }) => setFleet(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const initials = (name = "") => name.split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("").toUpperCase() || "R";

  return (
    <div className="bg-[#F7F5EF] min-h-screen" data-testid="fleet-page">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B192C] via-[#0B3B5C] to-[#0B192C]" />
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(1200px 300px at 15% 20%, rgba(212,169,74,0.55), transparent), radial-gradient(900px 300px at 85% 80%, rgba(232,106,60,0.45), transparent)" }} />
        <div className="relative max-w-6xl mx-auto px-6 lg:px-10 py-24 lg:py-32">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-bold" data-testid="fleet-kicker">
              <Shield className="w-3.5 h-3.5" /> Our people · Our vehicles
            </span>
            <h1 className="serif text-white text-5xl sm:text-6xl lg:text-7xl mt-4 leading-[0.95] tracking-tight" data-testid="fleet-headline">
              {fleet.headline || "The team behind"} <em className="italic text-[#D4A94A]">your ride</em>.
            </h1>
            <p className="text-white/75 text-lg mt-6 max-w-xl leading-relaxed" data-testid="fleet-subhead">
              {fleet.subheadline || "Bahamas-licensed. Fully insured. Twelve years of Nassau shortcuts."}
            </p>
            {fleet.trust_notes?.length > 0 && (
              <ul className="mt-8 space-y-2" data-testid="fleet-trust-notes">
                {fleet.trust_notes.map((note, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/85 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-[#D4A94A] shrink-0" /> {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* DRIVERS */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-20" data-testid="fleet-drivers-section">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <span className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-bold">
              <Users className="w-3.5 h-3.5" /> Meet the drivers
            </span>
            <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-2 tracking-tight">
              Real people. <em className="italic text-[#D4A94A]">Not gig apps.</em>
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-[#64748B] py-12">Loading…</div>
        ) : fleet.drivers.length === 0 ? (
          <div className="text-center text-[#64748B] py-16 rounded-2xl bg-white border border-[#E2E8F0]">
            Driver profiles coming soon.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="fleet-drivers-grid">
            {fleet.drivers.map((d, i) => (
              <motion.article
                key={d.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="rounded-3xl bg-white border border-[#E2E8F0] overflow-hidden hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(11,25,44,0.10)] transition-all flex flex-col"
                data-testid={`fleet-driver-${d.id}`}
              >
                <div className="aspect-square bg-gradient-to-br from-[#0B3B5C] to-[#123f66] relative overflow-hidden">
                  {d.photo_url ? (
                    <img src={d.photo_url} alt={d.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="serif text-6xl font-black text-[#D4A94A]/90 drop-shadow-[0_4px_16px_rgba(0,0,0,0.4)]" aria-hidden>
                        {initials(d.name)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="text-white serif text-xl leading-tight drop-shadow">{d.name}</div>
                    <div className="text-[#D4A94A] text-[11px] uppercase tracking-widest font-bold mt-1">{d.tagline}</div>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col gap-3">
                  <div className="flex items-center gap-3 text-[11px] text-[#64748B]">
                    {d.years_driving > 0 && (
                      <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-[#D4A94A]" /> {d.years_driving}+ yrs</span>
                    )}
                    {d.languages?.length > 0 && (
                      <span className="inline-flex items-center gap-1"><Languages className="w-3 h-3" /> {d.languages.join(" · ")}</span>
                    )}
                  </div>
                  {d.bio && <p className="text-sm text-[#334155] leading-relaxed">{d.bio}</p>}
                  {d.badges?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
                      {d.badges.map((b, j) => (
                        <span key={j} className="inline-flex items-center gap-1 rounded-full bg-[#D4A94A]/12 text-[#8b6b25] text-[10px] font-bold px-2 py-1">
                          <Award className="w-2.5 h-2.5" /> {b}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </section>

      {/* VEHICLES */}
      <section className="bg-white border-y border-[#E2E8F0]" data-testid="fleet-vehicles-section">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-20">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
            <div>
              <span className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-bold">
                <CarIcon className="w-3.5 h-3.5" /> The fleet
              </span>
              <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-2 tracking-tight">
                Every ride, <em className="italic text-[#D4A94A]">AC & Wi-Fi standard</em>.
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-[#64748B] py-12">Loading…</div>
          ) : fleet.vehicles.length === 0 ? (
            <div className="text-center text-[#64748B] py-16 rounded-2xl bg-[#F7F5EF] border border-[#E2E8F0]">
              Vehicle photos coming soon.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="fleet-vehicles-grid">
              {fleet.vehicles.map((v, i) => (
                <motion.article
                  key={v.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="rounded-3xl bg-[#F7F5EF] border border-[#E2E8F0] overflow-hidden hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(11,25,44,0.10)] transition-all flex flex-col"
                  data-testid={`fleet-vehicle-${v.id}`}
                >
                  <div className="aspect-[16/10] bg-gradient-to-br from-[#0B192C] to-[#0B3B5C] relative overflow-hidden">
                    {v.photo_url ? (
                      <img src={v.photo_url} alt={v.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <CarIcon className="w-24 h-24 text-[#D4A94A]/70" strokeWidth={1.4} />
                      </div>
                    )}
                    <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/95 text-[#0B3B5C] text-[10px] uppercase tracking-widest font-black px-2.5 py-1">
                      {v.type}
                    </span>
                    {v.year && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-[#D4A94A] text-white text-[10px] font-black px-2.5 py-1">
                        {v.year}
                      </span>
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col gap-3">
                    <div>
                      <div className="serif text-2xl text-[#0B3B5C] leading-tight">{v.name}</div>
                      {v.tagline && <div className="text-xs text-[#64748B] mt-1">{v.tagline}</div>}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-[#64748B]">
                      {v.capacity > 0 && <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {v.capacity} pax</span>}
                      {v.luggage_capacity > 0 && <span className="inline-flex items-center gap-1">🧳 {v.luggage_capacity} bags</span>}
                    </div>
                    {v.features?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
                        {v.features.slice(0, 4).map((f, j) => (
                          <span key={j} className="inline-flex items-center gap-1 rounded-full bg-white text-[#0B3B5C] text-[10px] font-semibold px-2 py-1 border border-[#E2E8F0]">
                            {f.toLowerCase().includes("wi-fi") ? <Wifi className="w-2.5 h-2.5" /> : f.toLowerCase().includes("air") ? <Snowflake className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5 text-[#059669]" />}
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 lg:px-10 py-20 text-center" data-testid="fleet-cta">
        <MapPin className="w-8 h-8 mx-auto text-[#D4A94A] mb-4" />
        <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] tracking-tight">
          Now that you've met us — <em className="italic text-[#D4A94A]">ride with us</em>.
        </h2>
        <p className="text-[#64748B] mt-4 max-w-lg mx-auto">
          Airport transfers, private tours, wedding transport, or a week-long car rental — we've got the right vehicle and driver.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link to="/taxi" className="btn-shine rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white px-6 py-3 font-semibold inline-flex items-center gap-2 active:scale-95" data-testid="fleet-cta-book">
            Book a ride <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="tel:+12424322587" className="rounded-full bg-white border border-[#E2E8F0] hover:border-[#D4A94A] text-[#0B3B5C] px-6 py-3 font-semibold inline-flex items-center gap-2 active:scale-95" data-testid="fleet-cta-call">
            <Phone className="w-4 h-4" /> +1 (242) 432-2587
          </a>
        </div>
      </section>
    </div>
  );
}
