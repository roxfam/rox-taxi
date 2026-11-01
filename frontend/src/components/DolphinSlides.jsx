import { useEffect, useState } from "react";

const SLIDES = [
  { src: "https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/pewidk7h_medium.jpg", alt: "Swim with dolphins at Blue Lagoon Island, Bahamas" },
  { src: "/images/dolphin/dolphin-double-jump.webp", alt: "Two dolphins leaping over a line of swimmers in Nassau" },
  { src: "/images/dolphin/dolphin-encounters-ball.webp", alt: "Dolphin leaping with a ball at Dolphin Encounters, Bahamas" },
  { src: "/images/dolphin/dolphin-family-jump.webp", alt: "Family cheering as dolphins jump beside them" },
];

export function DolphinSlides() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0" data-testid="dolphin-slides">
      {SLIDES.map((s, n) => (
        <img
          key={s.src}
          src={s.src}
          alt={s.alt}
          decoding="async"
          loading={n === 0 ? "eager" : "lazy"}
          data-testid={`dolphin-slide-${n}`}
          className={`photo-enhance absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out ${n === i ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute bottom-4 right-5 z-10 flex gap-1.5" data-testid="dolphin-slide-dots">
        {SLIDES.map((s, n) => (
          <button
            key={s.src}
            type="button"
            aria-label={`Show dolphin photo ${n + 1}`}
            onClick={() => setI(n)}
            data-testid={`dolphin-slide-dot-${n}`}
            className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${n === i ? "w-6 bg-[#D4A94A]" : "w-1.5 bg-white/50 hover:bg-white"}`}
          />
        ))}
      </div>
    </div>
  );
}
