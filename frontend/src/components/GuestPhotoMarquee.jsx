import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Camera } from "lucide-react";
import { api } from "../lib/api";
import { PhotoOfTheMonth } from "./PhotoOfTheMonth";

const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u}`);

// Approved guest photos scrolling slowly next to the reviews; links to the upload form.
export default function GuestPhotoMarquee() {
  const [photos, setPhotos] = useState([]);
  const drop = (url) => setPhotos((xs) => xs.filter((x) => x.url !== url));
  useEffect(() => {
    api.get("/gallery").then(({ data }) => setPhotos(Array.isArray(data) ? data.filter((p) => p.category === "guests").slice(0, 24) : [])).catch(() => setPhotos([]));
  }, []);
  return (
    <section className="py-12" data-testid="home-guest-photos">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Guest photos</div>
          <h2 className="serif text-3xl text-[#0B3B5C] mt-1">Moments from our guests</h2>
        </div>
        <Link to="/gallery#submit" className="inline-flex items-center gap-2 rounded-full bg-[#0B3B5C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#0B192C] transition-colors" data-testid="home-guest-photos-upload">
          <Camera className="w-4 h-4" /> Share your photo
        </Link>
      </div>
      <PhotoOfTheMonth />
      {photos.length === 0 ? (
        <p className="max-w-7xl mx-auto px-6 lg:px-10 text-sm text-[#64748B]" data-testid="home-guest-photos-empty">Be the first to share a photo from your trip. Approved photos appear here.</p>
      ) : (
        <div className="promo-marquee overflow-hidden">
          <div className="promo-marquee-track guest-photo-marquee inline-flex gap-4 px-2" style={{ animationDuration: `${Math.max(180, photos.length * 20)}s` }}>
            {[...photos, ...photos].map((p, i) => (
              <Link key={`${p.id || p.url}-${i}`} to="/gallery" aria-hidden={i >= photos.length || undefined} tabIndex={i >= photos.length ? -1 : undefined}
                className="shrink-0 w-56 h-56 rounded-2xl overflow-hidden border border-[#EFE7D5] bg-white shadow-[0_6px_18px_rgba(11,25,44,0.08)]"
                data-testid={i < photos.length ? `home-guest-photo-${i}` : undefined}>
                <img src={resolveUrl(p.url)} alt={p.title || "Guest photo from a Rox trip"} loading="lazy" onError={() => drop(p.url)} onLoad={(e) => { if (e.currentTarget.naturalWidth < 50) drop(p.url); }} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
