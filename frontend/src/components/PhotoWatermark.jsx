// Small credit mark laid over guest photos (shows in screenshots too).
export const PhotoWatermark = ({ size = "sm" }) => (
  <span
    aria-hidden="true"
    className={`pointer-events-none select-none absolute bottom-2 right-2 rounded-full bg-black/35 backdrop-blur-[2px] text-white/90 font-semibold tracking-wide ${size === "lg" ? "text-xs px-3 py-1" : "text-[9px] px-2 py-0.5"}`}
    data-testid="photo-watermark"
  >
    Rox Taxi &amp; Tours
  </span>
);
