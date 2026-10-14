import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u}`);

// Full-screen view of a tapped guest photo with caption and guest name.
export const GuestPhotoLightbox = ({ photo, onClose }) => (
  <Dialog open={!!photo} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="max-w-none w-screen h-[100dvh] sm:w-[92vw] sm:h-auto sm:max-w-4xl p-0 border-0 bg-[#0B192C] text-white rounded-none sm:rounded-2xl overflow-hidden flex flex-col [&>button]:text-white [&>button]:opacity-90" data-testid="guest-photo-lightbox">
      {photo && (
        <>
          <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
            <img src={resolveUrl(photo.url)} alt={photo.caption || "Guest photo"} className="max-w-full max-h-[80dvh] object-contain" data-testid="guest-photo-lightbox-image" />
          </div>
          <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <DialogTitle className="serif italic text-xl leading-snug" data-testid="guest-photo-lightbox-caption">
              {photo.caption ? `\u201C${photo.caption}\u201D` : "Guest moment"}
            </DialogTitle>
            <DialogDescription className="text-sm text-white/70 mt-1" data-testid="guest-photo-lightbox-name">
              Shared by {photo.submitter || "a Rox guest"}
            </DialogDescription>
          </div>
        </>
      )}
    </DialogContent>
  </Dialog>
);
