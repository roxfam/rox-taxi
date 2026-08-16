import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, ArrowRight, Trophy, MapPin, Languages, Calendar, Phone, MessageCircle, Sparkles } from "lucide-react";
import { api } from "../lib/api";

/**
 * DriverSpotlight — public bio page for a name-tagged driver
 * (currently Reagan). Rendered at /drivers/:slug. Backend endpoint
 * `GET /api/drivers/:slug` returns bio + headshot + the driver's
 * tagged Google reviews. Guests can jump straight into the /taxi
 * booking flow with `?driver=Reagan` which auto-checks the
 * "Request Reagan" checkbox on the modal.
 */
export default function DriverSpotlight() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get(`/drivers/${slug}`)
      .then((r) => {
        if (r.data?.error) setNotFound(true);
        else setData(r.data);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6" data-testid="driver-spotlight-notfound">
        <div className="text-center">
          <div className="serif text-4xl text-[#0B3B5C]">Driver not found</div>
          <div className="text-sm text-[#64748B] mt-2">
            We don't have a spotlight page for "{slug}" yet.
          </div>
          <Link to="/taxi" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-5 py-2.5 text-sm font-bold hover:bg-[#d55a30]">
            Book any driver <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { profile, reviews, avg_rating, review_count } = data;
  const canonical = profile.canonical;

  return (
    <div className="bg-[#FBF7EF]" data-testid={`driver-spotlight-${slug}`}>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pt-16 pb-12 lg:pt-24 lg:pb-16">
        <div className="grid lg:grid-cols-[auto,1fr] gap-10 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="relative w-56 h-56 lg:w-72 lg:h-72 mx-auto lg:mx-0"
          >
            <img
              src={profile.headshot_url}
              alt={canonical}
              className="w-full h-full rounded-full object-cover border-8 border-white shadow-[0_25px_60px_rgba(11,25,44,0.25)]"
              data-testid="driver-spotlight-headshot"
            />
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#D4A94A] to-[#c99738] text-white text-[10px] uppercase tracking-widest font-black px-4 py-2 shadow-[0_10px_25px_rgba(212,169,74,0.4)] whitespace-nowrap">
              <Trophy className="w-3 h-3" /> Guest-favourite
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">
              Meet your driver
            </div>
            <h1 className="serif text-6xl lg:text-7xl text-[#0B3B5C] mt-2 leading-none">
              {canonical}
            </h1>
            {profile.tagline && (
              <p className="mt-4 text-lg text-[#334155] max-w-2xl leading-relaxed italic">
                "{profile.tagline}"
              </p>
            )}

            {review_count > 0 && (
              <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-white border border-[#EFE7D5] px-5 py-3 shadow-[0_10px_25px_rgba(212,169,74,0.1)]">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < Math.round(avg_rating) ? "text-[#FBBF24] fill-[#FBBF24]" : "text-[#E2E8F0]"}`} />
                  ))}
                </div>
                <div>
                  <div className="mono font-bold text-lg text-[#0B3B5C] leading-none">{avg_rating.toFixed(1)}</div>
                  <div className="text-[10px] uppercase tracking-widest text-[#94a3b8]">
                    {review_count} Google review{review_count === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={`/taxi?driver=${encodeURIComponent(canonical)}`}
                data-testid="driver-spotlight-request-btn"
                className="btn-shine inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-6 py-3 text-sm font-bold hover:bg-[#d55a30] active:scale-95 shadow-[0_10px_25px_rgba(232,106,60,0.35)]"
              >
                Request {canonical} on your booking <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="tel:+12421234567"
                data-testid="driver-spotlight-call-btn"
                className="inline-flex items-center gap-2 rounded-full bg-white border border-[#E2E8F0] text-[#0B3B5C] px-5 py-3 text-sm font-bold hover:border-[#D4A94A]"
              >
                <Phone className="w-4 h-4" /> Call dispatch
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Signature Tour callout — only shown for drivers with a dedicated
          Signature Tour page (currently just Reagan). Sits directly below the
          hero for maximum visibility; text + price only per brand direction. */}
      {slug === "reagan" && (
        <section className="max-w-6xl mx-auto px-6 lg:px-10 -mt-2 pb-4" data-testid="driver-spotlight-signature-callout">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B3B5C] via-[#0B3B5C] to-[#0B192C] px-6 sm:px-10 py-8 sm:py-10 text-white shadow-[0_25px_60px_rgba(11,59,92,0.25)]"
          >
            <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-[#D4A94A]/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-16 w-72 h-72 rounded-full bg-[#E86A3C]/15 blur-3xl pointer-events-none" />
            <div className="relative grid sm:grid-cols-[1fr,auto] gap-6 items-center">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#D4A94A]/15 border border-[#D4A94A]/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[#F5E1A4] font-black">
                  <Sparkles className="w-3 h-3" /> Signature Tour
                </div>
                <h2 className="serif text-3xl sm:text-4xl lg:text-5xl mt-3 leading-tight">
                  Nassau <em className="italic text-[#F5E1A4]">with Reagan</em>.
                </h2>
                <p className="mt-3 text-sm sm:text-base text-white/75 leading-relaxed max-w-xl">
                  A half-day curated by Reagan himself — beaches, forts, Fish Fry lunch, and the stops most drivers skip. Small group, one price, no upsells.
                </p>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="mono text-4xl font-black text-[#F5E1A4]">$225</span>
                  <span className="text-xs uppercase tracking-widest text-white/60">flat · up to 4 guests</span>
                </div>
              </div>
              <Link
                to="/nassau-with-reagan"
                data-testid="driver-spotlight-signature-cta"
                className="btn-shine inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-6 py-3.5 text-sm font-bold hover:bg-[#d55a30] active:scale-95 shadow-[0_15px_35px_rgba(232,106,60,0.45)] whitespace-nowrap"
              >
                See the tour <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </section>
      )}

      {/* Bio + facts */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-16">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl bg-white border border-[#EFE7D5] p-8">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-black mb-3">
              About {canonical}
            </div>
            <p className="text-base text-[#334155] leading-relaxed whitespace-pre-line" data-testid="driver-spotlight-bio">
              {profile.bio}
            </p>

            {Array.isArray(profile.specialties) && profile.specialties.length > 0 && (
              <div className="mt-8">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black mb-3">
                  Specialties
                </div>
                <ul className="space-y-2">
                  {profile.specialties.map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D4A94A] mt-2 shrink-0" />
                      <span className="text-sm text-[#334155]">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {profile.years_experience > 0 && (
              <FactCard icon={Calendar} label="Years driving" value={`${profile.years_experience}+ years`} />
            )}
            {Array.isArray(profile.languages) && profile.languages.length > 0 && (
              <FactCard icon={Languages} label="Languages" value={profile.languages.join(" · ")} />
            )}
            <FactCard icon={MapPin} label="Home base" value="Nassau, New Providence" />
          </div>
        </div>
      </section>

      {/* Pinned reviews */}
      {reviews.length > 0 && (
        <section className="bg-white py-16" data-testid="driver-spotlight-reviews">
          <div className="max-w-6xl mx-auto px-6 lg:px-10">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">
              What guests say about {canonical}
            </div>
            <h2 className="serif text-4xl lg:text-5xl text-[#0B3B5C] mt-2 leading-tight">
              Their words, not ours.
            </h2>
            <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reviews.map((r, i) => (
                <motion.article
                  key={r.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  data-testid={`driver-review-${r.id}`}
                  className="rounded-2xl bg-gradient-to-br from-[#FBF7EF] to-white border border-[#D4A94A]/40 p-6 shadow-[0_10px_25px_rgba(212,169,74,0.1)]"
                >
                  <div className="flex items-center gap-3">
                    <img src={r.profile_photo_url} alt={r.author_name} className="w-10 h-10 rounded-full border border-[#E2E8F0]" />
                    <div>
                      <div className="text-sm font-semibold text-[#0B3B5C]">{r.author_name}</div>
                      <div className="text-xs text-[#64748B]">{r.relative_time}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star key={idx} className={`w-4 h-4 ${idx < r.rating ? "text-[#FBBF24] fill-[#FBBF24]" : "text-[#E2E8F0]"}`} />
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-[#334155] leading-relaxed">"{r.text}"</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA footer */}
      <section className="max-w-4xl mx-auto px-6 lg:px-10 py-20 text-center">
        <MessageCircle className="w-10 h-10 mx-auto text-[#D4A94A]" />
        <h3 className="serif text-4xl lg:text-5xl text-[#0B3B5C] mt-4 leading-tight">
          Book {canonical}'s taxi.
        </h3>
        <p className="text-sm text-[#64748B] mt-3 max-w-lg mx-auto leading-relaxed">
          Tick "Request {canonical}" on any taxi booking. If he's available, he'll be your driver. If not, we'll match you with someone just as good — every one of our drivers is Rox-trained.
        </p>
        <Link
          to={`/taxi?driver=${encodeURIComponent(canonical)}`}
          className="btn-shine mt-8 inline-flex items-center gap-2 rounded-full bg-[#E86A3C] text-white px-8 py-4 text-base font-bold hover:bg-[#d55a30] active:scale-95 shadow-[0_15px_35px_rgba(232,106,60,0.4)]"
          data-testid="driver-spotlight-footer-cta"
        >
          Book a taxi <ArrowRight className="w-4 h-4" />
        </Link>
      </section>
    </div>
  );
}

function FactCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl bg-white border border-[#EFE7D5] p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#FBF7EF] flex items-center justify-center text-[#D4A94A] shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-[10px] tracking-[0.28em] uppercase text-[#94a3b8] font-black">{label}</div>
        <div className="text-sm font-semibold text-[#0B3B5C] mt-0.5">{value}</div>
      </div>
    </div>
  );
}
