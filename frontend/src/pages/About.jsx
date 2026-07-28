import { motion } from "framer-motion";
import { Award, MapPin, ShieldCheck, Heart, Star, Clock, Sparkles, PhoneCall, RefreshCw, Baby, Wifi, DollarSign, Quote } from "lucide-react";
import { Link } from "react-router-dom";

const STATS = [
  { n: "12+", l: "Years serving Nassau" },
  { n: "40k", l: "Rides completed" },
  { n: "187", l: "5-star Google reviews" },
  { n: "24/7", l: "Dispatch line" },
];

const VALUES = [
  { icon: ShieldCheck, t: "Licensed & Insured", d: "Every driver holds a Bahamas government licence; every vehicle passes weekly safety checks." },
  { icon: Heart, t: "Local, Family Run", d: "Rox Taxi Service is family-owned in Nassau. When you book with us, you support Bahamian workers directly." },
  { icon: MapPin, t: "Nassau & Paradise Island Experts", d: "We live here. We know the shortcut around Bay Street, the best time to hit Cable Beach, and the calmest days to sail." },
  { icon: Award, t: "Rated 4.9 on Google", d: "From cruise-port pickups to Blue Lagoon excursions — riders love us because we listen and show up on time." },
];

const GUARANTEES = [
  { icon: DollarSign, t: "Fixed Bahamian Tariff", d: "Every route uses the government-posted rate. No surge, no meter tricks, ever." },
  { icon: Clock,      t: "On-Time or Free Wait",  d: "If we're late for a pre-booked airport pickup, your first 15 minutes of wait time is on us." },
  { icon: MapPin,     t: "Live GPS Tracking",     d: "Watch your driver approach in real time on the Track page — no more guessing where the taxi is." },
  { icon: RefreshCw,  t: "Transparent Cancel Policy", d: "Cancel any booking any time — we retain a flat 15% cancellation fee. No surprise charges, no scripts, refund back to your original payment method." },
  { icon: Baby,       t: "Kids Ride Included",    d: "Children under 12 count as free-of-charge passengers up to your car's seat capacity." },
  { icon: Wifi,       t: "AC + Wi-Fi Fleet",      d: "Every vehicle: air-conditioning, phone chargers, and free onboard Wi-Fi as standard." },
];

const STORIES = [
  { quote: "Rox Taxi Service was tracking our cruise arrival — the driver was waving at the dock before I even called. Best $18 we spent in Nassau.", who: "Jessica & Mark", from: "Miami · Carnival Sunrise, Feb 2026" },
  { quote: "Booked the ATV tour and the jet skis for our anniversary. Rox Taxi Service coordinated pickup at Baha Mar and had cold water ready. First-class.", who: "Priya S.", from: "London · Baha Mar guest" },
  { quote: "We rented the Silverado for a week — delivered to our Airbnb, spotless, full tank. When the AC hiccupped, Rox Taxi Service swapped the car in 40 minutes.", who: "The Anderson family", from: "Ontario · Paradise Island villa" },
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
              Family-run. <em className="italic text-[#F5E1A4]">Nassau-born.</em>
            </h1>
            <p className="mt-6 text-white/80 max-w-xl leading-relaxed">
              Rox Taxi Service &amp; Tours is a Nassau-based, family-owned operator. Since 2013 we've helped tens of thousands of guests travel Nassau, Paradise Island and Cable Beach at fixed, transparent rates — with the warm island touch that only locals can bring.
            </p>
          </motion.div>
        </div>
      </section>

      {/* STATS */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 -mt-16 relative z-10" data-testid="about-stats">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <div key={s.l} className="rounded-2xl bg-white border border-[#EFE7D5] p-6 text-center shadow-[0_20px_40px_rgba(11,59,92,0.08)]">
              <div className="mono text-3xl text-[#0B3B5C] font-black">{s.n}</div>
              <div className="text-xs tracking-[0.2em] uppercase text-[#64748B] mt-2 font-semibold">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* STORY */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-24 grid md:grid-cols-2 gap-14 items-center" data-testid="about-story">
        <div>
          <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Our story</span>
          <h2 className="serif text-5xl text-[#0B3B5C] mt-3 leading-[0.9]">Twelve years, <em className="italic text-[#D4A94A]">one promise</em>.</h2>
          <p className="mt-6 text-[#64748B] leading-relaxed">
            Rox Taxi Service started with a single taxi and a promise: no hidden fees, no long waits, no bad attitude. Twelve years later we're a full fleet of taxis, mini-vans, SUVs and pickups, plus a curated shelf of Bahamas excursions — but that first promise still runs the shop.
          </p>
        </div>
        <div className="rounded-3xl overflow-hidden shadow-[0_30px_60px_rgba(11,59,92,0.15)]">
          <img src="https://images.pexels.com/photos/1450341/pexels-photo-1450341.jpeg?auto=compress&cs=tinysrgb&w=1200" alt="Nassau harbour at sunset" className="w-full h-full object-cover" />
        </div>
      </section>

      {/* VALUES */}
      <section className="bg-white py-24 border-y border-[#EFE7D5]" data-testid="about-values">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Our values</span>
          <h2 className="serif text-5xl text-[#0B3B5C] mt-3 leading-[0.9]">Why riders <em className="italic text-[#D4A94A]">choose Rox Taxi Service</em>.</h2>
          <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {VALUES.map((v) => (
              <div key={v.t} className="rounded-2xl bg-[#FBF7EF] p-6 border border-[#EFE7D5]" data-testid={`about-value-${v.t.toLowerCase().replace(/\s+/g,'-')}`}>
                <div className="w-11 h-11 rounded-xl bg-[#D4A94A]/10 flex items-center justify-center text-[#D4A94A]">
                  <v.icon className="w-5 h-5" />
                </div>
                <h3 className="serif text-2xl text-[#0B3B5C] mt-4 leading-tight">{v.t}</h3>
                <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GUARANTEES */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24" data-testid="about-guarantees">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
          <div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Why guests pick Rox Taxi Service</span>
            <h2 className="serif text-5xl text-[#0B3B5C] mt-3 leading-[0.9]">Six promises, <em className="italic text-[#D4A94A]">every ride</em>.</h2>
          </div>
          <Link to="/track" className="hidden md:inline-flex text-sm font-black text-[#0B3B5C] hover:text-[#D4A94A] items-center gap-1">See these in action → <span className="underline">Track a live ride</span></Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {GUARANTEES.map((g, i) => {
            const Icon = g.icon;
            return (
              <motion.div key={g.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }} className="group rounded-3xl bg-white border border-[#EFE7D5] p-6 hover:-translate-y-1 hover:border-[#D4A94A] hover:shadow-[0_20px_40px_rgba(212,169,74,0.15)] transition-all" data-testid={`about-guarantee-${g.t.toLowerCase().replace(/\s+/g,'-')}`}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#D4A94A]/12 text-[#D4A94A] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="serif text-xl text-[#0B3B5C] leading-tight">{g.t}</h3>
                </div>
                <p className="text-sm text-[#64748B] mt-3 leading-relaxed">{g.d}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* STORIES */}
      <section className="bg-white py-24 border-y border-[#EFE7D5]" data-testid="about-stories">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="text-center mb-14">
            <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Guest stories</span>
            <h2 className="serif text-5xl text-[#0B3B5C] mt-3 leading-[0.9]">The proof is <em className="italic text-[#D4A94A]">in the ride</em>.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STORIES.map((s, i) => (
              <motion.figure key={s.who} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }} className="relative rounded-3xl bg-[#FBF7EF] border border-[#EFE7D5] p-7 pt-14" data-testid={`about-story-${i}`}>
                <Quote className="absolute top-5 left-6 w-8 h-8 text-[#D4A94A]/50" />
                <blockquote className="serif text-lg leading-relaxed text-[#0B3B5C] italic">"{s.quote}"</blockquote>
                <figcaption className="mt-5 pt-4 border-t border-[#EFE7D5]">
                  <div className="font-black text-[#0B3B5C]">{s.who}</div>
                  <div className="text-xs text-[#64748B] tracking-wide mt-1">{s.from}</div>
                  <div className="mt-2 flex gap-0.5 text-[#D4A94A]">
                    {[0,1,2,3,4].map((k) => <Star key={k} className="w-3.5 h-3.5 fill-current" />)}
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* VS */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24" data-testid="about-vs">
        <div className="rounded-3xl bg-gradient-to-br from-[#0B3B5C] via-[#0B192C] to-[#0B192C] text-white p-10 lg:p-14 relative overflow-hidden">
          <div className="absolute -top-24 -right-16 w-96 h-96 rounded-full bg-[#D4A94A]/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-[#E86A3C]/15 blur-3xl" />
          <div className="relative">
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Rox Taxi Service vs. a street cab</span>
            <h2 className="serif text-5xl mt-3 leading-[0.9]">A booking, <em className="italic text-[#F5E1A4]">not a gamble</em>.</h2>
            <div className="mt-10 grid md:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-6" data-testid="about-vs-rox">
                <div className="text-xs tracking-[0.28em] uppercase font-black text-[#D4A94A] mb-4">With Rox Taxi Service</div>
                <ul className="space-y-2.5 text-sm">
                  {["Fare locked in the moment you book","Live driver GPS shared to your phone","Meet & greet with your name at LPIA","Card, PayPal, Zelle — no cash needed","One dispatcher on WhatsApp 24/7"].map((x) => (
                    <li key={x} className="flex items-start gap-2"><Sparkles className="w-4 h-4 text-[#D4A94A] mt-0.5 shrink-0" /> {x}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-6" data-testid="about-vs-street">
                <div className="text-xs tracking-[0.28em] uppercase font-black text-white/50 mb-4">Random street cab</div>
                <ul className="space-y-2.5 text-sm text-white/60">
                  {["Fare quoted at the door — cash surcharge","No tracking; you wait, they wander","No name-board pickup at arrivals","Cash-only, ATM detours","No one to call if something goes wrong"].map((x) => (
                    <li key={x} className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-white/30 shrink-0" /> {x}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a href="tel:+12424322587" className="btn-shine inline-flex items-center gap-2 rounded-full bg-[#D4A94A] text-[#0B192C] px-6 py-3.5 text-sm font-black hover:bg-[#e0b856]" data-testid="about-vs-call">
                <PhoneCall className="w-4 h-4" /> Call +1 (242) 432-2587
              </a>
              <a href="https://wa.me/12424322587" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white px-6 py-3.5 text-sm font-black hover:bg-[#1EBE5D]" data-testid="about-vs-wa">
                💬 WhatsApp us live
              </a>
            </div>
          </div>
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
