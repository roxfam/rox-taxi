import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Download, Share2, Copy, Camera, Sparkles, ArrowRight, RefreshCw, Instagram } from "lucide-react";
import { api } from "../lib/api";

// "Wall of Nassau moments" — a portrait 9:16 mosaic of the admin-pinned
// guest photos, rendered for screenshotting and Instagram/WhatsApp story
// sharing. Deliberately laid out as a single tall composition (not a
// horizontal grid) so a phone screenshot captures the whole thing.
//
// Actions:
//   • Save PNG  — html-to-image serializes the strip into a 1080x1920 PNG
//                 the guest can save straight to Camera Roll → IG Story.
//   • Share     — Web Share API (falls back to Clipboard copy of the URL).
//   • Copy link — Explicit clipboard action for desktop users.
//
// Every visible element (photo tile count, attribution) lives inside the
// `wall-strip` node so the exported PNG matches exactly what the user sees.
export default function Wall() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const stripRef = useRef(null);

  useEffect(() => {
    api.get("/gallery")
      .then(({ data }) => {
        const pinned = Array.isArray(data) ? data.filter((p) => p.is_pinned) : [];
        // Fall back to the newest approved photos if no pinned yet so the
        // Wall never looks empty (still branded + shareable).
        const source = pinned.length >= 3 ? pinned : (Array.isArray(data) ? data.slice(0, 6) : []);
        setPhotos(source.slice(0, 6));
      })
      .catch(() => setPhotos([]))
      .finally(() => setLoading(false));
  }, []);

  const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u}`);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/wall` : "https://roxtaxi.com/wall";
  const shareText = "Real Nassau moments from the Rox Taxi guest wall. Book yours 👉";

  const savePNG = async () => {
    if (!stripRef.current || saving) return;
    setSaving(true);
    try {
      // Force fresh <img> loads with crossOrigin so canvas isn't tainted.
      // We can't retroactively add crossorigin to already-mounted images,
      // so the workaround is to bake the images into <img> tags with the
      // attribute at render time (see WallTile below).
      const dataUrl = await toPng(stripRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0B192C",
        style: {
          // Kill the outer page padding so the export is edge-to-edge
          margin: "0",
        },
      });
      const link = document.createElement("a");
      link.download = `rox-taxi-nassau-moments-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Wall saved to your device 📸");
    } catch (e) {
      toast.error("Couldn't save the image — try screenshotting the strip below instead.");
    } finally {
      setSaving(false);
    }
  };

  const shareNative = async () => {
    const payload = { title: "Nassau moments — Rox Taxi", text: shareText, url: shareUrl };
    if (navigator.share) {
      try {
        await navigator.share(payload);
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied — paste it into any DM or story.");
    } catch {
      toast.error("Couldn't copy — long-press the URL bar to grab it.");
    }
  };

  return (
    <div className="min-h-[100vh] bg-[#0B192C] text-white" data-testid="wall-page">
      {/* Hero — sits outside the exported strip */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0B3B5C] via-[#0B192C] to-[#0B192C]">
        <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_15%_20%,rgba(212,169,74,0.4),transparent_50%),radial-gradient(circle_at_85%_70%,rgba(232,106,60,0.35),transparent_45%)]" />
        <div className="relative max-w-5xl mx-auto px-6 lg:px-10 pt-14 pb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur px-3 py-1 text-[10px] tracking-[0.32em] uppercase mb-5">
            <Sparkles className="w-3.5 h-3.5 text-[#D4A94A]" /> Wall of moments
          </div>
          <h1 className="serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Nassau moments, <span className="text-[#D4A94A]">unfiltered</span>.
          </h1>
          <p className="max-w-2xl mx-auto mt-4 text-white/70 text-sm sm:text-base">
            Screenshot the strip below — or hit Save — and drop it into your Instagram story to show your crew where they're going next.
          </p>

          {/* Share actions */}
          <div className="mt-7 flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={savePNG}
              disabled={saving || loading || photos.length === 0}
              data-testid="wall-save-png"
              className="inline-flex items-center gap-2 rounded-full bg-[#D4A94A] text-[#0B192C] font-black text-sm px-5 py-3 hover:bg-[#E5BC5A] active:scale-95 disabled:opacity-60 shadow-[0_10px_30px_rgba(212,169,74,0.35)]"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {saving ? "Rendering…" : "Save as image"}
            </button>
            <button
              onClick={shareNative}
              data-testid="wall-share"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/25 text-white font-bold text-sm px-4 py-3 hover:bg-white/20 active:scale-95 backdrop-blur"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button
              onClick={copyLink}
              data-testid="wall-copy-link"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/25 text-white font-bold text-sm px-4 py-3 hover:bg-white/20 active:scale-95 backdrop-blur"
            >
              <Copy className="w-4 h-4" /> Copy link
            </button>
          </div>
        </div>
      </section>

      {/* Exportable strip — everything inside stripRef ends up in the PNG */}
      <section className="px-4 sm:px-6 py-10 flex justify-center">
        {loading ? (
          <div className="text-white/60 py-16" data-testid="wall-loading">Loading the wall…</div>
        ) : photos.length === 0 ? (
          <EmptyWall />
        ) : (
          <div className="w-full max-w-[420px]">
            <div
              ref={stripRef}
              data-testid="wall-strip"
              className="rounded-[28px] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.5)] bg-gradient-to-b from-[#0B3B5C] to-[#0B192C]"
              style={{ aspectRatio: "9 / 16" }}
            >
              <StripHeader />
              <StripMosaic photos={photos} resolveUrl={resolveUrl} />
              <StripFooter />
            </div>
            <p className="text-center text-[11px] text-white/50 mt-4">
              Tip: on iPhone, tap Save as image → open Photos → share to Instagram Story.
            </p>
          </div>
        )}
      </section>

      {/* Secondary CTA — recruit more submissions */}
      <section className="border-t border-white/10 bg-[#0B192C]">
        <div className="max-w-3xl mx-auto px-6 py-14 text-center">
          <Camera className="w-8 h-8 mx-auto text-[#D4A94A] mb-3" />
          <h2 className="serif text-2xl sm:text-3xl text-white">Been on a Rox trip? Get on the wall.</h2>
          <p className="text-white/60 text-sm mt-2 mb-6">
            Send in your best shot — approved photos land here and get shared on our socials.
          </p>
          <Link
            to="/gallery#submit"
            data-testid="wall-submit-cta"
            className="inline-flex items-center gap-2 rounded-full bg-[#D4A94A] text-[#0B192C] font-black text-sm px-5 py-3 hover:bg-[#E5BC5A] active:scale-95"
          >
            Add your photo <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}


function StripHeader() {
  return (
    <div className="px-5 pt-6 pb-4 text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-[#D4A94A]/15 border border-[#D4A94A]/40 text-[#D4A94A] px-2.5 py-1 text-[9px] tracking-[0.32em] uppercase font-black">
        <Sparkles className="w-2.5 h-2.5" /> Nassau moments
      </div>
      <div className="serif text-white text-[26px] leading-[1.1] mt-3">
        Real trips.<br /><span className="text-[#D4A94A]">Real Rox guests.</span>
      </div>
    </div>
  );
}


function StripMosaic({ photos, resolveUrl }) {
  // Fixed 6-slot asymmetric mosaic. If we have fewer photos, we pad by
  // repeating so the layout never has empty holes in the export.
  const slots = useMemo(() => {
    const filled = [];
    for (let i = 0; i < 6; i++) filled.push(photos[i % photos.length]);
    return filled;
  }, [photos]);

  return (
    <div className="px-4 grid grid-cols-6 grid-rows-6 gap-2" style={{ aspectRatio: "9 / 12" }}>
      {/* Slot 1 — hero, spans 4 cols x 3 rows */}
      <WallTile p={slots[0]} resolveUrl={resolveUrl} className="col-span-4 row-span-3" showAttrib />
      {/* Slot 2 — tall right, 2 cols x 3 rows */}
      <WallTile p={slots[1]} resolveUrl={resolveUrl} className="col-span-2 row-span-3" />
      {/* Slot 3 — square, 2 cols x 2 rows */}
      <WallTile p={slots[2]} resolveUrl={resolveUrl} className="col-span-2 row-span-2" />
      {/* Slot 4 — mid, 2 cols x 2 rows */}
      <WallTile p={slots[3]} resolveUrl={resolveUrl} className="col-span-2 row-span-2" showAttrib />
      {/* Slot 5 — mid right, 2 cols x 2 rows */}
      <WallTile p={slots[4]} resolveUrl={resolveUrl} className="col-span-2 row-span-2" />
      {/* Slot 6 — bottom wide, 6 cols x 1 row */}
      <WallTile p={slots[5]} resolveUrl={resolveUrl} className="col-span-6 row-span-1" small />
    </div>
  );
}


function WallTile({ p, resolveUrl, className = "", showAttrib = false, small = false }) {
  if (!p) return <div className={`bg-white/5 rounded-xl ${className}`} />;
  const first = (p.submitter || "").trim().split(" ")[0];
  return (
    <div className={`relative rounded-xl overflow-hidden ring-1 ring-[#D4A94A]/30 ${className}`}>
      <img
        src={resolveUrl(p.url)}
        crossOrigin="anonymous"
        alt={p.title || "Nassau moment"}
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      {showAttrib && first && !small && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2">
          <div className="text-[8px] tracking-[0.28em] uppercase text-[#D4A94A] font-bold">Guest</div>
          <div className="text-[11px] font-bold text-white leading-tight">{first}</div>
        </div>
      )}
    </div>
  );
}


function StripFooter() {
  return (
    <div className="px-5 pt-3 pb-6 text-center">
      <div className="flex items-center justify-center gap-2 text-[#D4A94A]">
        <img src="/logo-gold.webp" alt="Rox" className="w-7 h-7 object-contain" />
        <div className="text-left">
          <div className="serif text-white text-[15px] leading-none">Rox Taxi &amp; Tours</div>
          <div className="text-[9px] tracking-[0.3em] uppercase text-white/70 mt-0.5">roxtaxi.com · Nassau</div>
        </div>
      </div>
      <div className="mt-3 text-[10px] text-white/60">
        Tap the link in bio · Book your day
      </div>
    </div>
  );
}


function EmptyWall() {
  return (
    <div className="text-center max-w-md mx-auto py-16" data-testid="wall-empty">
      <Instagram className="w-10 h-10 mx-auto text-[#D4A94A] mb-4" />
      <h3 className="serif text-2xl text-white">No moments pinned yet.</h3>
      <p className="text-white/60 text-sm mt-2 mb-6">
        Check back after your trip — approved photos land on the wall and become shareable in one tap.
      </p>
      <Link
        to="/gallery#submit"
        className="inline-flex items-center gap-2 rounded-full bg-[#D4A94A] text-[#0B192C] font-black text-sm px-5 py-3 hover:bg-[#E5BC5A]"
      >
        Send us your first photo <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
