import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { cdn } from "../lib/img";

const FALLBACK = [
  {
    id: "fallback-nassau",
    title: "Unlock Nassau.",
    subtitle: "Book a taxi, tour or rental in sixty seconds.",
    image_url: "https://images.unsplash.com/photo-1723567017685-86060d4861c7?crop=entropy&cs=srgb&fm=jpg&q=85&w=2400",
  },
];

// Full-bleed rotating hero. Backend supplies the slides — this component
// picks a random starting index (so returning visitors don't always see the
// same photo first), auto-advances every 6s, and exposes prev/next + dot
// controls. Children compose inside the tinted overlay so the existing hero
// headline/CTA layout stays untouched.
export default function HomeHeroCarousel({ children, className = "", intervalMs = 10000 }) {
  const [slides, setSlides] = useState(FALLBACK);
  const [i, setI] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.get("/home-slides").then((r) => {
      if (!alive) return;
      if (Array.isArray(r.data) && r.data.length) {
        setSlides(r.data);
        setI(Math.floor(Math.random() * r.data.length));
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    timerRef.current = setInterval(() => setI((v) => (v + 1) % slides.length), intervalMs);
    return () => clearInterval(timerRef.current);
  }, [slides.length, intervalMs]);

  // Preload the NEXT slide's image so the crossfade lands on a warm bitmap
  // and there's no visible "pop" from decode/network latency on slower links.
  useEffect(() => {
    if (slides.length <= 1) return;
    const nextIdx = (i + 1) % slides.length;
    const img = new Image();
    // Preload the WebP variant that the actual slide will render, so the
    // decoded frame is cache-hot when the crossfade lands.
    img.src = cdn(slides[nextIdx]?.image_url || "", { w: 1600 });
  }, [i, slides]);

  const pause = () => { if (timerRef.current) clearInterval(timerRef.current); };
  const resume = () => {
    if (slides.length > 1) timerRef.current = setInterval(() => setI((v) => (v + 1) % slides.length), intervalMs);
  };

  const slide = slides[i] || slides[0];
  const prev = () => setI((v) => (v - 1 + slides.length) % slides.length);
  const next = () => setI((v) => (v + 1) % slides.length);

  return (
    <section
      className={`relative min-h-[92vh] overflow-hidden ${className}`}
      data-testid="hero-section"
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      <AnimatePresence mode="sync">
        {/*
         * Ken Burns pop: 0.4s snap zoom from 1.0 → 1.06 when the slide appears,
         * then holds. Crossfade opacity in over 1.2s in parallel. The next
         * slide's image is preloaded (see the effect above) so this transition
         * never waits on decode. `transformOrigin` alternates so consecutive
         * slides don't push toward the same corner.
         */}
        <motion.div
          key={slide.id}
          initial={{ opacity: 0, scale: 1.0 }}
          animate={{ opacity: 1, scale: (slide.id === "hero-fort-charlotte" || slide.id === "hero-junkanoo") ? 1.0 : 1.06 }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 1.2, ease: "easeOut" },
            scale: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
          }}
          style={{
            backgroundImage: `url(${cdn(slide.image_url, { w: 1600 })})`,
            transformOrigin: i % 2 === 0 ? "center 40%" : "60% 55%",
            filter: "brightness(1.14) contrast(1.22) saturate(1.20)",
            backgroundSize: slide.id === "hero-ardastra" ? "contain" : "cover",
            backgroundRepeat: "no-repeat",
            backgroundColor: slide.id === "hero-ardastra" ? "#0B192C" : undefined,
            backgroundPosition: slide.id === "hero-fort-charlotte" ? "center 30%" : slide.id === "hero-junkanoo" ? "center 35%" : "center",
          }}
          className="absolute inset-0 will-change-transform"
          data-testid={`hero-slide-${slide.id}`}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B192C]/50 via-[#0B192C]/15 to-[#0B192C]/80" />

      <div className="relative">
        {typeof children === "function" ? children({ slide, index: i }) : children}
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous slide"
            data-testid="hero-prev-btn"
            className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/15 hover:bg-white/35 backdrop-blur-md text-white flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next slide"
            data-testid="hero-next-btn"
            className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/15 hover:bg-white/35 backdrop-blur-md text-white flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2" data-testid="hero-dots">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setI(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                data-testid={`hero-dot-${idx}`}
                className={`transition-all rounded-full ${idx === i ? "w-8 h-2 bg-[#D4A94A]" : "w-2 h-2 bg-white/50 hover:bg-white/80"}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
