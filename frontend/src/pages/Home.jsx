import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Car, MapPinned, ShipWheel, Star, ShieldCheck, Clock, Users } from "lucide-react";
import { api, money } from "../lib/api";
import NassauCarousel from "../components/NassauCarousel";
import GoogleReviews from "../components/GoogleReviews";
import HomeHeroCarousel from "../components/HomeHeroCarousel";
import QuickBookWidget from "../components/QuickBookWidget";
import PackagesStrip from "../components/PackagesStrip";

export default function Home() {
  const [tours, setTours] = useState([]);
  useEffect(() => {
    api.get("/tours").then((r) => setTours(r.data.slice(0, 4))).catch(() => {});
  }, []);

  return (
    <div data-testid="home-page">
      {/* HERO — dynamic Bahamas carousel (admin-managed via /admin/manage → Home Slides) */}
      <HomeHeroCarousel>
        {({ slide }) => (
          <div className="max-w-7xl mx-auto px-6 lg:px-10 pt-32 pb-24 grid lg:grid-cols-12 gap-10">
            <motion.div
              key={slide.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="lg:col-span-7 text-white"
            >
              <span className="inline-block text-xs tracking-[0.3em] uppercase text-white/80 mb-6" data-testid="hero-tagline">
                Nassau · Paradise Island
              </span>
              <h1 className="serif text-6xl sm:text-7xl lg:text-8xl leading-[0.9] tracking-tight" data-testid="hero-title">
                {slide.title.includes(".") ? (
                  <>
                    {slide.title.split(".").slice(0, -1).join(".")}. <em className="italic text-[#F5E1A4]">On your terms.</em>
                  </>
                ) : (
                  <>{slide.title} <em className="italic text-[#F5E1A4]">On your terms.</em></>
                )}
              </h1>
              <p className="mt-8 max-w-xl text-lg text-white/85 leading-relaxed" data-testid="hero-subtitle">
                {slide.subtitle || "Booked in sixty seconds. Pay with card, PayPal or Zelle — then follow your driver live, door to door across Nassau & Paradise Island."}
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  to="/taxi"
                  data-testid="hero-book-taxi-btn"
                  className="btn-shine rounded-full bg-[#E86A3C] text-white px-7 py-4 text-sm font-semibold hover:bg-[#d55a30] active:scale-95 flex items-center gap-2"
                >
                  Book a Taxi <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/tours"
                  data-testid="hero-explore-tours-btn"
                  className="rounded-full glass text-[#0B192C] px-7 py-4 text-sm font-semibold hover:bg-white active:scale-95"
                >
                  Explore Excursions
                </Link>
                {slide.link_url && (
                  <a
                    href={slide.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`hero-slide-link-${slide.id}`}
                    className="rounded-full bg-[#D4A94A] text-[#0B192C] px-7 py-4 text-sm font-bold hover:bg-[#c99b3d] active:scale-95 flex items-center gap-2 shadow-[0_10px_30px_rgba(212,169,74,0.35)]"
                  >
                    {slide.link_label || `Book at ${slide.title.replace(/\.$/, "")}`}
                    <ArrowRight className="w-4 h-4" />
                  </a>
                )}
              </div>

              <div className="mt-14 flex flex-wrap gap-8 text-sm text-white/80">
                <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#D4A94A]" /> Licensed local drivers</div>
                <div className="flex items-center gap-2"><Star className="w-4 h-4 text-[#F5E1A4]" /> 4.9 avg guest rating</div>
                <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-[#D4A94A]" /> 24/7 dispatch</div>
              </div>
            </motion.div>

          {/* Floating booking widget — modern segmented tabs with rich per-service panels */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="lg:col-span-5 lg:pt-10"
          >
            <QuickBookWidget />
          </motion.div>
          </div>
        )}
      </HomeHeroCarousel>

      {/* NASSAU · PARADISE ISLAND CAROUSEL */}
      <NassauCarousel />

      {/* PACKAGE DEALS — bundle & save strip (auto-hides if no active packages) */}
      <PackagesStrip variant="home" />

      {/* FEATURED TOURS */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24" data-testid="featured-tours">
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Handpicked</span>
            <h2 className="serif text-5xl sm:text-6xl tracking-tight text-[#0B3B5C] mt-2">Signature <em className="italic text-[#D4A94A]">excursions</em>.</h2>
          </div>
          <Link to="/tours" className="hidden md:inline text-sm font-semibold text-[#D4A94A] hover:underline">See all tours →</Link>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tours.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-2xl bg-white border border-[#E2E8F0] hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(212,169,74,0.15)] transition-transform"
              data-testid={`featured-tour-${t.id}`}
            >
              <div className="aspect-[4/5] overflow-hidden">
                <img src={t.image_url} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="p-5">
                <h3 className="serif text-xl text-[#0B3B5C] leading-snug">{t.name}</h3>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-[#64748B] flex items-center gap-1"><Clock className="w-3 h-3" /> {t.duration}</span>
                  <span className="mono font-semibold text-[#E86A3C]">{money(t.price)}<span className="text-[10px] text-[#64748B]"> /pp</span></span>
                </div>
                <Link
                  to={`/tours?book=${t.id}`}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#0B3B5C] hover:text-[#D4A94A]"
                  data-testid={`featured-tour-book-${t.id}`}
                >
                  Book <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* GROUP & WEDDING CTA */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24" data-testid="home-groups-cta">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B3B5C] via-[#0B3B5C] to-[#0B192C] px-8 sm:px-14 py-16 text-white">
          <div className="absolute -top-24 -right-16 w-96 h-96 rounded-full bg-[#D4A94A]/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 w-96 h-96 rounded-full bg-[#E86A3C]/15 blur-3xl" />
          <div className="relative grid md:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Weddings · Groups · Corporate</span>
              <h2 className="serif text-5xl sm:text-6xl mt-4 leading-[0.9]">Planning something <em className="italic text-[#F5E1A4]">bigger</em>?</h2>
              <p className="mt-5 text-white/70 max-w-md leading-relaxed">
                Weddings, cruise groups, bachelor weekends, corporate retreats — tell us what you're planning and our concierge team returns a custom quote within two hours.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/wedding-builder"
                  data-testid="home-wedding-builder-btn"
                  className="btn-shine inline-flex items-center gap-2 rounded-full bg-[#D4A94A] text-[#0B192C] px-7 py-4 text-sm font-semibold hover:bg-[#e0b856] active:scale-95 shadow-[0_10px_25px_rgba(212,169,74,0.4)]"
                >
                  Build a wedding package <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/groups"
                  data-testid="home-groups-cta-btn"
                  className="rounded-full border border-white/20 text-white px-7 py-4 text-sm font-semibold hover:bg-white/5"
                >
                  Group inquiry form
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { n: "20+", l: "Weddings / year" },
                { n: "8.4k", l: "Group guests" },
                { n: "2h", l: "Quote turnaround" },
                { n: "8+", l: "Volume discount from" },
                { n: "24/7", l: "Concierge line" },
                { n: "12yr", l: "In business" },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="serif text-3xl text-[#D4A94A]">{s.n}</div>
                  <div className="text-[10px] tracking-widest uppercase text-white/60 mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-[#0B192C] text-white py-24" data-testid="how-it-works">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid md:grid-cols-2 gap-14 items-center">
          <div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">How it works</span>
            <h2 className="serif text-5xl sm:text-6xl mt-3">Book. Pay. Track. <em className="italic text-[#E86A3C]">Ride.</em></h2>
            <p className="mt-6 text-white/70 max-w-lg leading-relaxed">
              No app to download. Reserve in your browser, get an instant confirmation code, then watch your booking move through every step in real time.
            </p>
          </div>
          <div className="grid gap-4">
            {[
              { n: "01", t: "Choose your ride or tour", d: "Airport pickup, hourly charter, snorkel day, or car rental." },
              { n: "02", t: "Pay securely", d: "Credit card & PayPal via Stripe, or send us a Zelle transfer." },
              { n: "03", t: "Track your booking", d: "Confirmed → Driver Assigned → En Route → Arrived → Completed." },
            ].map((s) => (
              <div key={s.n} className="glass-dark rounded-2xl p-6 flex gap-5">
                <div className="serif text-4xl text-[#E86A3C] leading-none">{s.n}</div>
                <div>
                  <div className="font-semibold text-lg">{s.t}</div>
                  <p className="text-sm text-white/70 mt-1">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GOOGLE REVIEWS */}
      <GoogleReviews />

      {/* FEATURED GUEST WALL — pinned guest photos surfaced site-wide */}
      <FeaturedGuestWall />
    </div>
  );
}

function FeaturedGuestWall() {
  const [pinned, setPinned] = useState([]);
  useEffect(() => {
    api.get("/gallery")
      .then(({ data }) => {
        if (!Array.isArray(data)) return;
        setPinned(data.filter((p) => p.is_pinned).slice(0, 6));
      })
      .catch(() => setPinned([]));
  }, []);
  if (pinned.length === 0) return null;
  const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u}`);
  return (
    <section className="bg-[#FBF7EF] border-t border-[#E2E8F0]" data-testid="home-featured-guest-wall">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] font-bold">Featured guests</div>
            <h2 className="serif text-4xl sm:text-5xl text-[#0B3B5C] mt-2 leading-tight">Real moments, hand-picked.</h2>
          </div>
          <Link
            to="/gallery"
            className="text-sm font-bold text-[#0B3B5C] hover:text-[#D4A94A] transition-colors inline-flex items-center gap-1"
            data-testid="home-featured-wall-see-all"
          >
            See full gallery <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {pinned.map((p, i) => (
            <div
              key={p.url + i}
              data-testid={`home-featured-tile-${i}`}
              className="relative aspect-square rounded-2xl overflow-hidden border-2 border-[#D4A94A] bg-white shadow-[0_6px_18px_rgba(11,25,44,0.1)] group"
            >
              <img
                src={resolveUrl(p.url)}
                alt={p.title || "Featured guest photo"}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 left-0 right-0 p-2 text-white translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                <div className="text-[9px] uppercase tracking-[0.25em] text-[#D4A94A]">Guest</div>
                <div className="text-[11px] font-semibold leading-tight line-clamp-2">{p.title}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
