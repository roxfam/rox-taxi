import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export const DEFAULT_DOLPHIN_SLIDES = [
  "https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/pewidk7h_medium.jpg",
  "/images/dolphin/dolphin-double-jump.webp",
  "/images/dolphin/dolphin-encounters-ball.webp",
  "/images/dolphin/dolphin-family-jump.webp",
];

// Swipe left/right or tap the photo area of the surrounding [data-dolphin-card] to flip slides.
function useSwipe(ref, count, setI) {
  useEffect(() => {
    const card = ref.current?.closest("[data-dolphin-card]");
    if (!card || count < 2) return undefined;
    let x0 = null;
    let y0 = null;
    const start = (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; };
    const end = (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        setI((n) => (n + (dx < 0 ? 1 : count - 1)) % count);
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && !e.target.closest("a,button")) {
        setI((n) => (n + 1) % count);
      }
    };
    card.addEventListener("touchstart", start, { passive: true });
    card.addEventListener("touchend", end);
    return () => { card.removeEventListener("touchstart", start); card.removeEventListener("touchend", end); };
  }, [ref, count, setI]);
}

export function DolphinSlides() {
  const [slides, setSlides] = useState(DEFAULT_DOLPHIN_SLIDES);
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    api.get("/site-config").then((r) => {
      const list = (r.data?.dolphin_slides || []).filter(Boolean);
      if (list.length) setSlides(list);
    }).catch(() => {});
  }, []);

  const go = (fn) => { setI(fn); setTick((t) => t + 1); };
  useSwipe(ref, slides.length, go);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % slides.length), 6500);
    return () => clearInterval(t);
  }, [slides.length, tick]);

  return (
    <div ref={ref} className="absolute inset-0" data-testid="dolphin-slides">
      {slides.map((src, n) => (
        <img
          key={`${src}-${n}`}
          src={src}
          alt={`Swim with dolphins in Nassau, Bahamas — photo ${n + 1}`}
          decoding="async"
          loading={n === 0 ? "eager" : "lazy"}
          data-testid={`dolphin-slide-${n}`}
          style={{ transition: "opacity 2600ms cubic-bezier(0.4, 0, 0.2, 1), transform 9000ms ease-out", willChange: "opacity, transform" }}
          className={`photo-enhance absolute inset-0 w-full h-full object-cover ${n === i % slides.length ? "opacity-100 scale-[1.06]" : "opacity-0 scale-100"}`}
        />
      ))}
      <div className="absolute bottom-4 right-5 flex gap-1.5" data-testid="dolphin-slide-dots">
        {slides.map((src, n) => (
          <span
            key={`${src}-${n}`}
            className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${n === i % slides.length ? "w-6 bg-[#D4A94A]" : "w-1.5 bg-white/50"}`}
          />
        ))}
      </div>
    </div>
  );
}
