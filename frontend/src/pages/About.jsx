import { motion } from "framer-motion";
import { Award, Users, MapPin, ShieldCheck, Heart, Star } from "lucide-react";
import { Link } from "react-router-dom";

const STATS = [
  { n: "12+", l: "Years serving Nassau" },
  { n: "40k", l: "Rides completed" },
  { n: "187", l: "5-star Google reviews" },
  { n: "24/7", l: "Dispatch line" },
];

const VALUES = [
  { icon: ShieldCheck, t: "Licensed & Insured", d: "Every driver holds a Bahamas government licence; every vehicle passes weekly safety checks." },
  { icon: Heart, t: "Local, Family Run", d: "Rox is family-owned in Nassau. When you book with us, you support Bahamian workers directly." },
  { icon: MapPin, t: "Nassau & Paradise Island Experts", d: "We live here. We know the shortcut around Bay Street, the best time to hit Cable Beach, and the calmest days to sail." },
  { icon: Award, t: "Rated 4.9 on Google", d: "From cruise-port pickups to Blue Lagoon excursions — riders love us because we listen and show up on time." },
];

const TEAM = [
  { name: "Roxanne 'Rox' A.", role: "Founder & lead dispatcher", img: "https://i.pravatar.cc/240?img=1" },
  { name: "Marcus J.", role: "Head of tour operations", img: "https://i.pravatar.cc/240?img=15" },
  { name: "Kayla T.", role: "Concierge & customer care", img: "https://i.pravatar.cc/240?img=32" },
];

export default function About() {
  return (
    <div data-testid="about-page" className="bg-[#FBF7EF]">
      {/* HERO */}
      <section className="relative overflow-hidden bg-[#0B3B5C] text-white py-28">
        <div className="absolute inset-0 opacity-30 bg-cover bg-center" style={{ backgroundImage: "url(https://images.pexels.com/photos/2422915/pexels-photo-2422915.jpeg?auto=compress&cs=tinysrgb&w=1920)" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B3B5C]/70 via-[#0B3B5C]/60 to-[#0B3B5C]" />
        <div className="relative max-w-6xl mx-auto px-6 lg:px-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">About us</span>
            <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9] max-w-3xl">
              Family-run rides across <em className="italic text-[#F5E1A4]">The Bahamas</em>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/80 leading-relaxed">
              Rox Taxi Service and Tours is a Nassau-based, family-owned operator. Since 2013 we've helped tens of
              thousands of travelers get where they need to go — from the airport to Atlantis, from Paradise Island to
              Blue Lagoon — with fair prices, real people, and a smile.
            </p>
          </motion.div>
        </div>
      </section>

      {/* STATS */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 -mt-16 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.l}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl bg-white border border-[#EFE7D5] shadow-[0_20px_40px_rgba(11,59,92,0.06)] p-6"
              data-testid={`about-stat-${i}`}
            >
              <div className="serif text-5xl text-[#0B3B5C]">{s.n}</div>
              <div className="text-sm text-[#64748B] mt-1">{s.l}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* STORY */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24 grid md:grid-cols-2 gap-12 items-start">
        <div>
          <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Our story</span>
          <h2 className="serif text-5xl text-[#0B3B5C] mt-3 leading-[0.9]">Born on <em className="italic text-[#D4A94A]">Bay Street</em>.</h2>
        </div>
        <div className="text-[#334155] leading-relaxed space-y-4 text-lg">
          <p>
            Rox started with a single taxi and a promise: no hidden fees, no long waits, no bad attitude. Twelve years
            later we operate a fleet of taxis, tour boats and rental cars — but that promise hasn't changed.
          </p>
          <p>
            Whether you're stepping off a cruise ship for the day or moving to Nassau for a season, we treat every
            traveler like family. Because in the Bahamas, that's how we do things.
          </p>
        </div>
      </section>

      {/* VALUES */}
      <section className="bg-white border-y border-[#EFE7D5] py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">What you get</span>
          <h2 className="serif text-5xl text-[#0B3B5C] mt-3 leading-[0.9]">Why riders <em className="italic text-[#D4A94A]">choose Rox</em>.</h2>
          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map((v) => (
              <div key={v.t} className="rounded-2xl border border-[#EFE7D5] p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(212,169,74,0.15)] transition-transform" data-testid={`value-${v.t.replace(/\s+/g,'-').toLowerCase()}`}>
                <div className="w-12 h-12 rounded-2xl bg-[#D4A94A]/15 text-[#D4A94A] flex items-center justify-center">
                  <v.icon className="w-5 h-5" />
                </div>
                <h3 className="serif text-2xl text-[#0B3B5C] mt-4 leading-tight">{v.t}</h3>
                <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24">
        <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">The team</span>
        <h2 className="serif text-5xl text-[#0B3B5C] mt-3 leading-[0.9]">Real people, <em className="italic text-[#D4A94A]">on call</em>.</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-8">
          {TEAM.map((t) => (
            <div key={t.name} className="rounded-2xl overflow-hidden bg-white border border-[#EFE7D5] hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(11,59,92,0.08)] transition-transform" data-testid={`team-${t.name.split(' ')[0].toLowerCase()}`}>
              <div className="aspect-square overflow-hidden bg-[#EFE7D5]">
                <img src={t.img} alt={t.name} className="w-full h-full object-cover" />
              </div>
              <div className="p-6">
                <div className="serif text-2xl text-[#0B3B5C]">{t.name}</div>
                <div className="text-sm text-[#64748B] mt-1">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0B3B5C] text-white py-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-10 text-center">
          <Star className="w-10 h-10 text-[#D4A94A] mx-auto" />
          <h2 className="serif text-5xl sm:text-6xl mt-4 leading-none">Ready when you are.</h2>
          <p className="mt-4 text-white/70 max-w-xl mx-auto">Book online in under a minute. We'll take it from there.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/taxi" className="btn-shine rounded-full bg-[#D4A94A] text-[#0B192C] px-7 py-4 text-sm font-semibold hover:bg-[#e0b856] active:scale-95" data-testid="about-cta-taxi">Book a Taxi</Link>
            <Link to="/tours" className="rounded-full border border-white/20 text-white px-7 py-4 text-sm font-semibold hover:bg-white/5" data-testid="about-cta-tours">Browse Tours</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
