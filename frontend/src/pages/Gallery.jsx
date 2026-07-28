import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Images, X, MapPin, Car, ShipWheel, MapPinned } from "lucide-react";

// Filter chips mirror the site's primary IA (Nassau/Home = "the place",
// then Tours / Rentals / Taxi = the three service pillars). Icons repeat
// the header nav so the mental model is consistent.
const FILTERS = [
  { key: "all",     label: "All",       Icon: Images },
  { key: "nassau",  label: "Nassau",    Icon: MapPin },
  { key: "tours",   label: "Tours",     Icon: ShipWheel },
  { key: "rentals", label: "Rentals",   Icon: MapPinned },
  { key: "taxi",    label: "Taxi",      Icon: Car },
];

export default function Gallery() {
  const [photos, setPhotos] = useState([]);
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState(null);

  useEffect(() => {
    api.get("/gallery").then(({ data }) => setPhotos(data)).catch(() => setPhotos([]));
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? photos : photos.filter((p) => p.category === filter)),
    [photos, filter],
  );

  // Close lightbox on Escape without wiring up a ref/portal — cheap DX win.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => e.key === "Escape" && setActive(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div className="min-h-[80vh] bg-[#F7F5EF]" data-testid="gallery-page">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0B3B5C] via-[#0B192C] to-[#0B192C] text-white py-20 lg:py-28">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,rgba(212,169,74,0.4),transparent_50%),radial-gradient(circle_at_80%_60%,rgba(232,106,60,0.35),transparent_45%)]" />
        <div className="relative max-w-5xl mx-auto px-6 lg:px-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur px-3 py-1 text-[11px] tracking-[0.28em] uppercase mb-4">
            <Images className="w-3.5 h-3.5 text-[#D4A94A]" /> Photo Gallery
          </div>
          <h1 className="serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Nassau, Paradise Island<br />
            <span className="text-[#D4A94A]">& our island rides.</span>
          </h1>
          <p className="mt-5 text-white/70 text-base max-w-2xl">
            A hand-picked look at the tours, taxis and rentals you can book on this site — plus
            the Bahamian coastlines they'll take you to.
          </p>
        </div>
      </section>

      {/* Filter chips */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-8">
        <div className="flex items-center gap-2 flex-wrap" data-testid="gallery-filters">
          {FILTERS.map(({ key, label, Icon }) => {
            const count = key === "all" ? photos.length : photos.filter((p) => p.category === key).length;
            const on = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                data-testid={`gallery-filter-${key}`}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition-all ${
                  on
                    ? "bg-[#0B3B5C] text-white border-[#0B3B5C] shadow-[0_6px_18px_rgba(11,59,92,0.35)]"
                    : "bg-white text-[#0B3B5C] border-[#E2E8F0] hover:border-[#D4A94A] hover:text-[#0B192C]"
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
                <span className={`text-[10px] font-bold ml-1 px-1.5 py-0.5 rounded-full ${on ? "bg-white/20 text-white" : "bg-[#F1F5F9] text-[#64748B]"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Masonry grid — CSS columns so each tile keeps its native aspect */}
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
        {filtered.length === 0 ? (
          <div className="text-center text-[#64748B] py-20" data-testid="gallery-empty">
            No photos yet in this category.
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 [column-fill:_balance]" data-testid="gallery-grid">
            {filtered.map((p, i) => (
              <button
                key={p.url + i}
                type="button"
                onClick={() => setActive(p)}
                data-testid={`gallery-tile-${i}`}
                className="group mb-5 block w-full break-inside-avoid overflow-hidden rounded-2xl bg-white border border-[#E2E8F0] shadow-[0_10px_30px_rgba(11,25,44,0.06)] hover:shadow-[0_18px_45px_rgba(11,25,44,0.18)] transition-shadow"
              >
                <div className="relative overflow-hidden">
                  <img
                    src={p.url}
                    alt={p.title || "Gallery photo"}
                    loading="lazy"
                    className="w-full h-auto object-cover group-hover:scale-[1.04] transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 text-white translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-[#D4A94A] mb-1">{p.category}</div>
                    <div className="text-sm font-semibold leading-tight">{p.title}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Lightbox */}
      {active && (
        <div
          className="fixed inset-0 z-[100] bg-[#0B192C]/95 backdrop-blur-sm flex items-center justify-center p-4 lg:p-10"
          onClick={() => setActive(null)}
          data-testid="gallery-lightbox"
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            onClick={() => setActive(null)}
            data-testid="gallery-lightbox-close"
          >
            <X className="w-5 h-5" />
          </button>
          <figure className="max-w-6xl w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={active.url}
              alt={active.title || "Photo"}
              className="w-full max-h-[80vh] object-contain rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            />
            <figcaption className="mt-4 text-center text-white/80">
              <span className="text-[10px] tracking-[0.28em] uppercase text-[#D4A94A] block mb-1">{active.category}</span>
              <span className="text-lg serif">{active.title}</span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
