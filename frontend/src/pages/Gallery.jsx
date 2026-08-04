import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Images, X, MapPin, Car, ShipWheel, MapPinned, Camera, Upload, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

// Filter chips mirror the site's primary IA (Nassau/Home = "the place",
// then Tours / Rentals / Taxi = the three service pillars). Icons repeat
// the header nav so the mental model is consistent. "Studio" surfaces the
// admin-uploaded thumbnail library (photos not yet wired to a catalog item).
const FILTERS = [
  { key: "all",     label: "All",       Icon: Images },
  { key: "nassau",  label: "Nassau",    Icon: MapPin },
  { key: "tours",   label: "Tours",     Icon: ShipWheel },
  { key: "rentals", label: "Rentals",   Icon: MapPinned },
  { key: "taxi",    label: "Taxi",      Icon: Car },
  { key: "studio",  label: "Studio",    Icon: Camera },
];

export default function Gallery() {
  const [photos, setPhotos] = useState([]);
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState(null);
  const [params, setParams] = useSearchParams();
  const deepLinkId = params.get("photo");
  const submitRef = useRef(null);

  useEffect(() => {
    api.get("/gallery").then(({ data }) => setPhotos(data)).catch(() => setPhotos([]));
  }, []);

  // Deep-link: /gallery?photo=<id> auto-opens the lightbox on that photo
  // once /gallery has loaded. Silent fallthrough if id doesn't match.
  useEffect(() => {
    if (!deepLinkId || photos.length === 0) return;
    const match = photos.find((p) => p.id === deepLinkId);
    if (match) setActive(match);
  }, [deepLinkId, photos]);

  // Honour #submit hash — used by the post-trip photo-nudge email CTA
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#submit" && submitRef.current) {
      submitRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? photos : photos.filter((p) => p.category === filter)),
    [photos, filter],
  );

  // Drop ?photo= when the lightbox closes so back-button doesn't re-open it
  const closeLightbox = () => {
    setActive(null);
    if (params.get("photo")) {
      const next = new URLSearchParams(params);
      next.delete("photo");
      setParams(next, { replace: true });
    }
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => e.key === "Escape" && closeLightbox();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {/* Wall of Moments teaser — screenshot-and-share strip */}
        <Link
          to="/wall"
          data-testid="gallery-wall-cta"
          className="mb-6 group flex items-center gap-4 rounded-2xl border border-[#D4A94A]/40 bg-gradient-to-r from-[#0B3B5C] via-[#0B192C] to-[#0B192C] text-white px-5 py-4 hover:border-[#D4A94A] transition-all overflow-hidden"
        >
          <div className="w-11 h-11 rounded-xl bg-[#D4A94A] text-[#0B192C] flex items-center justify-center flex-shrink-0 group-hover:rotate-[8deg] transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-black">New — Wall of moments</div>
            <div className="serif text-lg leading-tight mt-0.5">
              Grab a shareable strip of our featured guests
            </div>
            <div className="text-[11px] text-white/60 mt-0.5">Save it as an image, drop it in your IG story.</div>
          </div>
          <span className="hidden sm:inline-flex text-xs font-black tracking-widest uppercase rounded-full bg-[#D4A94A] text-[#0B192C] px-4 py-2 group-hover:bg-[#E5BC5A]">
            Open →
          </span>
        </Link>

        <div className="flex items-center gap-2 flex-wrap" data-testid="gallery-filters">
          {FILTERS.map(({ key, label, Icon }) => {
            const count = key === "all" ? photos.length : photos.filter((p) => p.category === key).length;
            // Hide empty category chips so we don't advertise "0" tabs. "All"
            // always renders even when photos is still loading.
            if (key !== "all" && count === 0) return null;
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
                    src={p.url.startsWith("http") ? p.url : `${process.env.REACT_APP_BACKEND_URL}${p.url}`}
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
          onClick={closeLightbox}
          data-testid="gallery-lightbox"
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            onClick={closeLightbox}
            data-testid="gallery-lightbox-close"
          >
            <X className="w-5 h-5" />
          </button>
          <figure className="max-w-6xl w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={active.url.startsWith("http") ? active.url : `${process.env.REACT_APP_BACKEND_URL}${active.url}`}
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

      <div className="max-w-6xl mx-auto px-6 lg:px-10 pb-16" ref={submitRef}>
        <GallerySubmitCard />
      </div>
    </div>
  );
}

// Public "share your trip photo" card. Sends multipart form to
// POST /api/gallery/submit — the photo lands in the pending queue until the
// admin approves it in the Gallery panel of /admin/manage.
function GallerySubmitCard() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef(null);

  const pick = (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error("Image too large (max 8MB)"); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const reset = () => {
    setFile(null); setPreview(""); setName(""); setEmail(""); setCaption("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) { toast.error("Choose a photo first"); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("submitter_name", name);
      fd.append("submitter_email", email);
      fd.append("caption", caption);
      await api.post("/gallery/submit", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSubmitted(true);
      reset();
      toast.success("Thanks — we'll review your photo and post it soon.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-3xl border border-[#059669]/30 bg-[#059669]/5 p-8 text-center" data-testid="gallery-submit-thanks">
        <CheckCircle2 className="w-10 h-10 text-[#059669] mx-auto mb-3" />
        <h3 className="serif text-2xl text-[#0B3B5C]">Photo received</h3>
        <p className="text-sm text-[#64748B] mt-2 max-w-md mx-auto">
          Our team reviews every submission before it appears in the gallery.
          You'll see yours here within a day or two.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-5 text-sm font-semibold text-[#0B3B5C] underline underline-offset-4 hover:text-[#D4A94A]"
          data-testid="gallery-submit-another"
        >
          Share another photo
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl border border-[#E2E8F0] bg-white p-6 lg:p-8 shadow-[0_10px_30px_rgba(11,25,44,0.06)]"
      data-testid="gallery-submit-card"
    >
      <div className="flex items-start gap-4 mb-5">
        <div className="w-11 h-11 rounded-xl bg-[#D4A94A]/15 text-[#D4A94A] flex items-center justify-center shrink-0">
          <Camera className="w-5 h-5" />
        </div>
        <div>
          <h3 className="serif text-2xl text-[#0B3B5C]">Share your trip photo</h3>
          <p className="text-sm text-[#64748B] mt-1">
            Rode with us? Send us your favourite Nassau memory — approved shots appear in this gallery.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <label
          htmlFor="gallery-submit-file"
          className="group relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E2E8F0] hover:border-[#D4A94A] bg-[#F7F5EF] cursor-pointer min-h-[220px] overflow-hidden transition-colors"
          data-testid="gallery-submit-dropzone"
        >
          {preview ? (
            <img src={preview} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <>
              <Upload className="w-7 h-7 text-[#0B3B5C]/60 group-hover:text-[#D4A94A]" />
              <span className="text-sm font-semibold text-[#0B3B5C]">Tap to choose a photo</span>
              <span className="text-[11px] text-[#64748B]">JPG / PNG / WEBP · up to 8MB</span>
            </>
          )}
          <input
            id="gallery-submit-file"
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
            data-testid="gallery-submit-file"
          />
        </label>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="gallery-submit-name"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optional — so we can thank you"
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="gallery-submit-email"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="Where was this? Which tour or ride?"
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#D4A94A] resize-none"
              data-testid="gallery-submit-caption"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !file}
            className="btn-shine w-full rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
            data-testid="gallery-submit-btn"
          >
            {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>) : (<><Upload className="w-4 h-4" /> Submit for review</>)}
          </button>
          <p className="text-[11px] text-[#94a3b8] leading-relaxed">
            By submitting you grant Rox Taxi permission to feature this photo in our public gallery and marketing.
          </p>
        </div>
      </div>
    </form>
  );
}
