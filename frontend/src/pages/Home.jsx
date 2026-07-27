import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Car, MapPinned, ShipWheel, Star, ShieldCheck, Clock, Users } from "lucide-react";
import { api, money } from "../lib/api";
import NassauCarousel from "../components/NassauCarousel";
import GoogleReviews from "../components/GoogleReviews";

const HERO_IMG = "https://images.unsplash.com/photo-1723567017685-86060d4861c7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxiYWhhbWFzJTIwYmVhY2glMjBjbGVhciUyMHdhdGVyfGVufDB8fHx8MTc4NTA2MjgxMXww&ixlib=rb-4.1.0&q=85";

export default function Home() {
  const [tours, setTours] = useState([]);
  useEffect(() => {
    api.get("/tours").then((r) => setTours(r.data.slice(0, 4))).catch(() => {});
  }, []);

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section className="relative min-h-[92vh] overflow-hidden" data-testid="hero-section">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HERO_IMG})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B192C]/40 via-transparent to-[#0B192C]/60" />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-32 pb-24 grid lg:grid-cols-12 gap-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="lg:col-span-7 text-white"
          >
            <span className="inline-block text-xs tracking-[0.3em] uppercase text-white/80 mb-6" data-testid="hero-tagline">
              Nassau · Paradise Island · Exuma
            </span>
            <h1 className="serif text-6xl sm:text-7xl lg:text-8xl leading-[0.9] tracking-tight">
              Nassau, on your <em className="italic text-[#F5E1A4]">terms</em>.
            </h1>
            <p className="mt-8 max-w-xl text-lg text-white/85 leading-relaxed">
              Book a taxi, tour or car rental in under a minute. Pay with card, PayPal or Zelle — then watch your ride move from confirmed to arrived, live.
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
            </div>

            <div className="mt-14 flex flex-wrap gap-8 text-sm text-white/80">
              <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#D4A94A]" /> Licensed local drivers</div>
              <div className="flex items-center gap-2"><Star className="w-4 h-4 text-[#F5E1A4]" /> 4.9 avg guest rating</div>
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-[#D4A94A]" /> 24/7 dispatch</div>
            </div>
          </motion.div>

          {/* Floating booking widget */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="lg:col-span-5 lg:pt-10"
          >
            <div className="glass rounded-3xl p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
              <h3 className="serif text-2xl text-[#0B3B5C] mb-2">Quick book</h3>
              <p className="text-sm text-[#64748B] mb-6">Pick a service and get pricing in seconds.</p>
              <div className="grid grid-cols-1 gap-3">
                <Link to="/taxi" data-testid="quickbook-taxi" className="flex items-center justify-between rounded-2xl border border-[#E2E8F0] bg-white p-4 hover:border-[#D4A94A] hover:-translate-y-0.5 transition-transform">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#D4A94A]/10 flex items-center justify-center text-[#D4A94A]"><Car className="w-5 h-5" /></div>
                    <div>
                      <div className="font-semibold text-[#0B3B5C]">Taxi & Airport Transfers</div>
                      <div className="text-xs text-[#64748B]">from $20 · Nassau + Paradise Island</div>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#0B3B5C]" />
                </Link>
                <Link to="/tours" data-testid="quickbook-tours" className="flex items-center justify-between rounded-2xl border border-[#E2E8F0] bg-white p-4 hover:border-[#D4A94A] hover:-translate-y-0.5 transition-transform">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#E86A3C]/10 flex items-center justify-center text-[#E86A3C]"><ShipWheel className="w-5 h-5" /></div>
                    <div>
                      <div className="font-semibold text-[#0B3B5C]">Tours & Excursions</div>
                      <div className="text-xs text-[#64748B]">Swimming Pigs, Blue Lagoon, more</div>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#0B3B5C]" />
                </Link>
                <Link to="/rentals" data-testid="quickbook-rentals" className="flex items-center justify-between rounded-2xl border border-[#E2E8F0] bg-white p-4 hover:border-[#D4A94A] hover:-translate-y-0.5 transition-transform">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#0B3B5C]/10 flex items-center justify-center text-[#0B3B5C]"><MapPinned className="w-5 h-5" /></div>
                    <div>
                      <div className="font-semibold text-[#0B3B5C]">Car Rentals</div>
                      <div className="text-xs text-[#64748B]">Compact to Mini-Van · from $39/day</div>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-[#0B3B5C]" />
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* NASSAU · PARADISE ISLAND CAROUSEL */}
      <NassauCarousel />

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
    </div>
  );
}
