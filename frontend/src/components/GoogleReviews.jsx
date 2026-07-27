import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { api } from "../lib/api";

export default function GoogleReviews() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/reviews").then((r) => setData(r.data)).catch(() => {});
  }, []);
  if (!data) return null;

  return (
    <section className="bg-[#FBF7EF] py-24" data-testid="google-reviews-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-2 gap-10 items-end mb-12">
          <div>
            <div className="flex items-center gap-3">
              <GoogleG />
              <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Google Reviews</span>
            </div>
            <h2 className="serif text-5xl sm:text-6xl mt-3 leading-none text-[#0B3B5C]">Reviews from <em className="italic text-[#D4A94A]">real riders</em>.</h2>
          </div>
          <div className="md:justify-self-end flex items-center gap-5">
            <div className="text-right">
              <div className="serif text-5xl text-[#0B3B5C] leading-none">{data.rating.toFixed(1)}</div>
              <div className="mt-1 flex items-center gap-0.5 justify-end">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < Math.round(data.rating) ? "text-[#FBBF24] fill-[#FBBF24]" : "text-[#E2E8F0]"}`} />
                ))}
              </div>
              <div className="text-xs text-[#64748B] mt-1">{data.total}+ reviews on Google</div>
            </div>
            <div className="w-14 h-14 rounded-full bg-white border border-[#E2E8F0] flex items-center justify-center shadow-sm">
              <GoogleG size={26} />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.reviews.map((r, i) => (
            <motion.article
              key={r.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
              data-testid={`google-review-${r.id}`}
              className="bg-white rounded-2xl border border-[#E2E8F0] p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(212,169,74,0.08)] transition-transform"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={r.profile_photo_url} alt={r.author_name} className="w-10 h-10 rounded-full border border-[#E2E8F0]" />
                  <div>
                    <div className="text-sm font-semibold text-[#0B3B5C]">{r.author_name}</div>
                    <div className="text-xs text-[#64748B]">{r.relative_time}</div>
                  </div>
                </div>
                <GoogleG size={18} />
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

        <div className="mt-10 text-center">
          <a
            href="https://www.google.com/search?q=Rox+Taxi+Bahamas+reviews"
            target="_blank"
            rel="noreferrer"
            data-testid="google-reviews-see-all"
            className="inline-flex items-center gap-2 rounded-full bg-white border border-[#E2E8F0] px-6 py-3 text-sm font-semibold hover:border-[#D4A94A] active:scale-95"
          >
            <GoogleG size={16} /> See all reviews on Google
          </a>
        </div>
      </div>
    </section>
  );
}

function GoogleG({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.1 29.2 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.9 29 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.6 19 13 24 13c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.9 29 5 24 5 16.3 5 9.7 9.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 43c5 0 9.4-1.9 12.8-5l-5.9-5c-2 1.4-4.4 2.2-6.9 2.2-5.2 0-9.6-3.4-11.2-8L6.4 32.4C9.7 38.4 16.3 43 24 43z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l5.9 5c-.4.4 6.1-4.5 6.1-14.7 0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
