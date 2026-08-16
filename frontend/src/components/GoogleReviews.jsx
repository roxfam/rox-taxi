import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star, Trophy } from "lucide-react";
import { api } from "../lib/api";

/**
 * GoogleReviews — homepage social-proof section.
 *
 * Rotation strategy: the /api/reviews backend returns the accumulated
 * pool of 4+ star Google reviews (deduped across every sync cycle).
 * We pull the widest pool available and rotate the visible window
 * on the client so guests scrolling by see a fresh slate of quotes
 * every visit *and* every ~8 seconds of dwell time. Every 5 minutes
 * we also silently refetch, so any brand-new reviews landing via the
 * hourly cron surface without a page reload.
 */
const VISIBLE_COUNT = 3;      // cards shown at once (matches lg:grid-cols-3)
const ROTATE_MS = 8000;       // dwell time per rotation
const REFETCH_MS = 5 * 60000; // silent refetch to catch new syncs

export default function GoogleReviews() {
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const hoverRef = useRef(false); // pause rotation while a card is being read

  // Initial + periodic silent refetch.
  useEffect(() => {
    const load = () =>
      api.get("/reviews?limit=60")
        .then((r) => setData(r.data))
        .catch(() => {});
    load();
    const id = setInterval(load, REFETCH_MS);
    return () => clearInterval(id);
  }, []);

  // Auto-rotate visible window (only when pool is larger than what fits).
  useEffect(() => {
    const total = data?.reviews?.length || 0;
    if (total <= VISIBLE_COUNT) return;
    const id = setInterval(() => {
      if (hoverRef.current) return; // pause while the user hovers
      setOffset((o) => (o + 1) % total);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [data?.reviews?.length]);

  const visible = useMemo(() => {
    const arr = data?.reviews || [];
    if (arr.length === 0) return [];
    const n = Math.min(VISIBLE_COUNT, arr.length);
    return Array.from({ length: n }, (_, i) => arr[(offset + i) % arr.length]);
  }, [data, offset]);

  if (!data) return null;
  const rotating = (data.reviews?.length || 0) > VISIBLE_COUNT;

  return (
    <section className="bg-[#FBF7EF] py-24" data-testid="google-reviews-section">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-2 gap-10 items-end mb-12">
          <div>
            <div className="flex items-center gap-3">
              <GoogleG />
              <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Google Reviews</span>
              {rotating && (
                <span
                  data-testid="google-reviews-live-indicator"
                  className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.25em] uppercase font-black text-[#059669]"
                  title={`Rotating through ${data.reviews.length} verified reviews`}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#059669]" />
                  </span>
                  Live
                </span>
              )}
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

        <div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          onMouseEnter={() => { hoverRef.current = true; }}
          onMouseLeave={() => { hoverRef.current = false; }}
          data-testid="google-reviews-grid"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((r) => {
              const tags = Array.isArray(r.driver_tags) ? r.driver_tags : [];
              const isTagged = tags.length > 0;
              return (
                <motion.article
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -18, scale: 0.98 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  data-testid={`google-review-${r.id}`}
                  className={`relative rounded-2xl border p-6 hover:-translate-y-1 transition-transform ${
                    isTagged
                      ? "bg-gradient-to-br from-white to-[#FBF7EF] border-[#D4A94A] shadow-[0_16px_32px_rgba(212,169,74,0.15)] hover:shadow-[0_20px_40px_rgba(212,169,74,0.25)]"
                      : "bg-white border-[#E2E8F0] hover:shadow-[0_20px_40px_rgba(212,169,74,0.08)]"
                  }`}
                >
                  {isTagged && (
                    <span
                      data-testid={`google-review-${r.id}-driver-tag`}
                      className="absolute -top-2.5 left-4 inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-black text-white bg-gradient-to-r from-[#D4A94A] to-[#c99738] px-2.5 py-1 rounded-full shadow-[0_6px_14px_rgba(212,169,74,0.4)]"
                      title={`${tags.join(", ")} was named in this review`}
                    >
                      <Trophy className="w-2.5 h-2.5" />
                      {tags.length === 1 ? `${tags[0]} drove them` : `${tags.join(" · ")} named`}
                    </span>
                  )}
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
              );
            })}
          </AnimatePresence>
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
