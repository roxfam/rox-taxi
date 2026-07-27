import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

const SLIDES = [
  {
    name: "Paradise Island · Atlantis",
    tag: "Iconic resort",
    img: "https://images.pexels.com/photos/9887784/pexels-photo-9887784.jpeg?auto=compress&cs=tinysrgb&w=1920",
  },
  {
    name: "Blue Lagoon Island",
    tag: "Ferry from Nassau",
    img: "https://images.pexels.com/photos/1287460/pexels-photo-1287460.jpeg?auto=compress&cs=tinysrgb&w=1920",
  },
  {
    name: "Bay Street · Downtown Nassau",
    tag: "Shopping & straw market",
    img: "https://images.pexels.com/photos/2907578/pexels-photo-2907578.jpeg?auto=compress&cs=tinysrgb&w=1920",
  },
  {
    name: "Cable Beach",
    tag: "West of Nassau",
    img: "https://images.pexels.com/photos/1450353/pexels-photo-1450353.jpeg?auto=compress&cs=tinysrgb&w=1920",
  },
  {
    name: "Junkanoo Beach",
    tag: "Downtown Nassau",
    img: "https://images.pexels.com/photos/3155666/pexels-photo-3155666.jpeg?auto=compress&cs=tinysrgb&w=1920",
  },
  {
    name: "Queen's Staircase",
    tag: "Nassau historic",
    img: "https://images.pexels.com/photos/2422915/pexels-photo-2422915.jpeg?auto=compress&cs=tinysrgb&w=1920",
  },
  {
    name: "Rose Island Reef",
    tag: "Off Paradise Island",
    img: "https://images.pexels.com/photos/3601456/pexels-photo-3601456.jpeg?auto=compress&cs=tinysrgb&w=1920",
  },
];

export default function BahamasSlider() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 4500);
    return () => clearInterval(t);
  }, [paused]);

  const go = (n) => setI(((n % SLIDES.length) + SLIDES.length) % SLIDES.length);
  const cur = SLIDES[i];

  return (
    <section
      className="relative bg-[#0B192C] text-white overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="bahamas-slider"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 pt-24 pb-8 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Postcards from</span>
          <h2 className="serif text-5xl sm:text-6xl mt-3 leading-none">The <em className="italic">Bahamas</em>.</h2>
        </div>
        <p className="text-white/60 max-w-md leading-relaxed">
          These are the stops our taxis, tours and rentals reach every day. Tap a card — we'll take you there.
        </p>
      </div>

      <div className="relative h-[520px] sm:h-[600px]" data-testid="slider-stage">
        <AnimatePresence mode="sync">
          <motion.div
            key={cur.name}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${cur.img})` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B192C] via-[#0B192C]/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 max-w-7xl mx-auto px-6 lg:px-10 pb-16">
              <motion.div
                key={"caption-" + cur.name}
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.15 }}
                className="max-w-2xl"
              >
                <div className="inline-flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-[#D4A94A]">
                  <MapPin className="w-3 h-3" /> {cur.tag}
                </div>
                <h3 className="serif text-4xl sm:text-6xl mt-3 leading-none">{cur.name}</h3>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>

        <button
          onClick={() => go(i - 1)}
          data-testid="slider-prev"
          className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full glass-dark text-white flex items-center justify-center hover:bg-white/10"
          aria-label="Previous"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => go(i + 1)}
          data-testid="slider-next"
          className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full glass-dark text-white flex items-center justify-center hover:bg-white/10"
          aria-label="Next"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Progress dots */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => go(idx)}
              data-testid={`slider-dot-${idx}`}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-8 bg-[#D4A94A]" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Thumbs strip */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10 pb-16 -mt-6 relative z-10">
        <div className="flex gap-3 overflow-x-auto pb-2" data-testid="slider-thumbs">
          {SLIDES.map((s, idx) => (
            <button
              key={s.name}
              onClick={() => go(idx)}
              data-testid={`slider-thumb-${idx}`}
              className={`shrink-0 w-40 sm:w-48 h-24 rounded-xl overflow-hidden relative group transition-transform ${idx === i ? "ring-2 ring-[#D4A94A]" : "opacity-70 hover:opacity-100"}`}
            >
              <img src={s.img} alt={s.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-2 left-2 right-2 text-left">
                <div className="text-[10px] tracking-widest uppercase text-[#D4A94A] leading-none">{s.tag}</div>
                <div className="text-xs font-semibold leading-tight mt-1 line-clamp-1">{s.name}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
