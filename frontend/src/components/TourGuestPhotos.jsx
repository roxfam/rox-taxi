import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Camera } from "lucide-react";
import { api } from "../lib/api";
import { GuestPhotoLightbox } from "./GuestPhotoLightbox";

const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u}`);

// Real guest photos tagged to (or booked on) the given tours. Renders nothing when there are none.
export const TourGuestPhotos = ({ tourIds = [], title = "Moments from guests on this trip" }) => {
  const [photos, setPhotos] = useState([]);
  const [open, setOpen] = useState(null);
  const key = tourIds.join(",");
  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    api.get("/gallery").then(({ data }) => {
      setPhotos((Array.isArray(data) ? data : []).filter((p) => p.category === "guests" && ids.includes(p.trip_id)));
    }).catch(() => setPhotos([]));
  }, [key]);
  if (photos.length === 0) return null;
  return (
    <section className="max-w-6xl mx-auto px-6 lg:px-10 py-12" data-testid="tour-guest-photos">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-2"><Camera className="w-3.5 h-3.5" /> Guest photos</div>
          <h2 className="serif text-3xl text-[#0B3B5C] mt-1">{title}</h2>
        </div>
        <Link to={`/gallery?tour=${tourIds[0]}`} className="text-sm font-semibold text-[#D4A94A] hover:underline" data-testid="tour-guest-photos-all">See all in gallery →</Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
        {photos.map((p, i) => (
          <button type="button" key={p.id || p.url} onClick={() => setOpen(i)} className="snap-start shrink-0 w-56 h-56 rounded-2xl overflow-hidden border border-[#EFE7D5] bg-white cursor-zoom-in" data-testid={`tour-guest-photo-${i}`}>
            <img src={resolveUrl(p.url)} alt={p.caption || "Guest photo"} loading="lazy" className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
          </button>
        ))}
      </div>
      <GuestPhotoLightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </section>
  );
};
