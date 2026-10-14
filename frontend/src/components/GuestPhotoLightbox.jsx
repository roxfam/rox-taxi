import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u}`);

const sharePhoto = async (p) => {
  const url = p.id ? `https://roxtaxi.com/api/og/photo/${p.id}` : "https://roxtaxi.com/gallery";
  const text = `${p.submitter ? `${p.submitter}'s` : "A"} Nassau moment with Rox Taxi & Tours`;
  try {
    if (navigator.share) return await navigator.share({ title: "Rox guest photo", text, url });
    await navigator.clipboard.writeText(url);
    toast.success("Link copied, paste it anywhere to share");
  } catch (e) {
    if (e?.name !== "AbortError") toast.error("Couldn't share right now");
  }
};

// Full-screen guest photo viewer: swipe/arrows to browse, share a link (no download).
export const GuestPhotoLightbox = ({ photos, index, onIndex, onClose }) => {
  const startX = useRef(null);
  const photo = index === null ? null : photos[index];
  const go = (d) => onIndex((index + d + photos.length) % photos.length);
  useEffect(() => {
    if (index === null) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); };
  });
  const onTouchEnd = (e) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };
  const nav = "absolute top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors";
  return (
    <Dialog open={!!photo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-none w-screen h-[100dvh] sm:w-[92vw] sm:h-auto sm:max-w-4xl p-0 border-0 bg-[#0B192C] text-white rounded-none sm:rounded-2xl overflow-hidden flex flex-col [&>button]:text-white [&>button]:opacity-90" data-testid="guest-photo-lightbox">
        {photo && (
          <>
            <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black select-none"
              onTouchStart={(e) => { startX.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd} data-testid="guest-photo-lightbox-stage">
              <img src={resolveUrl(photo.url)} alt={photo.caption || "Guest photo"} draggable={false} className="max-w-full max-h-[80dvh] object-contain pointer-events-none" data-testid="guest-photo-lightbox-image" />
              <div className="absolute inset-0" aria-hidden="true" />
              {photos.length > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} className={`${nav} left-3`} aria-label="Previous photo" data-testid="guest-photo-lightbox-prev"><ChevronLeft className="w-5 h-5" /></button>
                  <button type="button" onClick={() => go(1)} className={`${nav} right-3`} aria-label="Next photo" data-testid="guest-photo-lightbox-next"><ChevronRight className="w-5 h-5" /></button>
                </>
              )}
            </div>
            <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex items-end justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="serif italic text-xl leading-snug" data-testid="guest-photo-lightbox-caption">
                  {photo.caption ? `\u201C${photo.caption}\u201D` : "Guest moment"}
                </DialogTitle>
                <DialogDescription className="text-sm text-white/70 mt-1" data-testid="guest-photo-lightbox-name">
                  Shared by {photo.submitter || "a Rox guest"} · {index + 1} / {photos.length}
                </DialogDescription>
              </div>
              <button type="button" onClick={() => sharePhoto(photo)} className="shrink-0 inline-flex items-center gap-2 rounded-full bg-[#D4A94A] hover:bg-[#E5BC5A] text-[#0B192C] px-4 py-2.5 text-sm font-semibold transition-colors" data-testid="guest-photo-lightbox-share">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
