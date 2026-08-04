import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Download, Share2, Copy, Camera, Sparkles, ArrowRight, RefreshCw, Instagram, Palette, Sun, Waves, PartyPopper, Facebook, MessageCircle, Twitter } from "lucide-react";
import { api } from "../lib/api";

// Theme presets — each drives the exportable strip's colours. Kept as plain
// hex + inline styles (not Tailwind arbitrary values) so html-to-image
// serialises them reliably at 2× pixel ratio without CSS-var resolution
// gotchas. Every colour surface a viewer touches — background gradient,
// pill, accent text, tile ring, footer accents — pulls from this object.
const THEMES = {
  classic: {
    id: "classic", label: "Classic",  Icon: Palette,
    gradient: "linear-gradient(180deg, #0B3B5C 0%, #0B192C 100%)",
    accent:  "#D4A94A", accentSoft: "rgba(212,169,74,0.15)", accentRing: "rgba(212,169,74,0.35)",
    headerText: "#FFFFFF", subText: "rgba(255,255,255,0.72)",
    tagLabel: "Nassau moments", tagline1: "Real trips.", tagline2: "Real Rox guests.",
    pillBg: "rgba(212,169,74,0.15)", pillBorder: "rgba(212,169,74,0.4)",
  },
  sunset: {
    id: "sunset", label: "Sunset", Icon: Sun,
    gradient: "linear-gradient(180deg, #F97316 0%, #EA580C 45%, #7C2D12 100%)",
    accent:  "#FFE082", accentSoft: "rgba(255,224,130,0.2)", accentRing: "rgba(255,224,130,0.45)",
    headerText: "#FFF7ED", subText: "rgba(255,247,237,0.78)",
    tagLabel: "Sunset in Nassau", tagline1: "Golden hour.", tagline2: "Rox Taxi kind of day.",
    pillBg: "rgba(255,255,255,0.15)", pillBorder: "rgba(255,224,130,0.6)",
  },
  ocean: {
    id: "ocean", label: "Ocean", Icon: Waves,
    gradient: "linear-gradient(180deg, #0891B2 0%, #0369A1 50%, #082F49 100%)",
    accent:  "#67E8F9", accentSoft: "rgba(103,232,249,0.18)", accentRing: "rgba(103,232,249,0.4)",
    headerText: "#F0F9FF", subText: "rgba(240,249,255,0.75)",
    tagLabel: "Bahamian blues", tagline1: "Salt, sun,", tagline2: "and Rox rides.",
    pillBg: "rgba(103,232,249,0.15)", pillBorder: "rgba(103,232,249,0.5)",
  },
  party: {
    id: "party", label: "Party", Icon: PartyPopper,
    gradient: "linear-gradient(180deg, #7C3AED 0%, #C026D3 55%, #EC4899 100%)",
    accent:  "#FDE047", accentSoft: "rgba(253,224,71,0.18)", accentRing: "rgba(253,224,71,0.45)",
    headerText: "#FFFFFF", subText: "rgba(255,255,255,0.85)",
    tagLabel: "Nassau nights", tagline1: "Bookings by day.", tagline2: "Vibes all night.",
    pillBg: "rgba(253,224,71,0.2)", pillBorder: "rgba(253,224,71,0.55)",
  },
};

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
  const [themeId, setThemeId] = useState("classic");
  const [caption, setCaption] = useState("");
  const [showSocial, setShowSocial] = useState(false);
  const theme = THEMES[themeId] || THEMES.classic;
  const stripRef = useRef(null);
  const CAPTION_MAX = 60;

  // One-tap caption chips — theme-aware so "Sunset with the crew" only shows
  // up on the Sunset preset, "Ocean day" on Ocean, etc. Guests can still
  // type freely, but the chips remove the empty-state paralysis and give
  // us a chance to slip subtle brand copy into their shares.
  const captionPresets = useMemo(() => ({
    classic: ["Nassau, done right", "Rox got us there", "Best day of the trip", "Book yours next"],
    sunset:  ["Sunset with the crew", "Golden hour, Bahamas", "Rox took us straight to it", "Chasing the light"],
    ocean:   ["Bahamian blues 🌊", "Ocean day, no regrets", "Salt in our hair", "Rox to the beach"],
    party:   ["Nassau nights 🍹", "The crew went off", "Rum, sand, repeat", "Book the party bus"],
  }[themeId] || []), [themeId]);

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
  const shareText = caption ? `${caption} — Nassau moments · Rox Taxi` : "Real Nassau moments from the Rox Taxi guest wall. Book yours 👉";

  // Platform-specific share URLs. Instagram has no direct URL API (they
  // deliberately don't allow it), so we surface a "Save image → then IG
  // Story" hint instead.
  const socialTargets = useMemo(() => {
    const u = encodeURIComponent(shareUrl);
    const t = encodeURIComponent(shareText);
    return [
      { id: "facebook",  label: "Facebook",  color: "#1877F2", Icon: Facebook,      url: `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}` },
      { id: "whatsapp",  label: "WhatsApp",  color: "#25D366", Icon: MessageCircle, url: `https://wa.me/?text=${t}%20${u}` },
      { id: "twitter",   label: "X",         color: "#000000", Icon: Twitter,       url: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
      { id: "messenger", label: "Messenger", color: "#0084FF", Icon: MessageCircle, url: `https://www.facebook.com/dialog/send?link=${u}&app_id=140586622674265&redirect_uri=${u}` },
    ];
  }, [shareUrl, shareText]);

  const openSocial = (target) => {
    // window.open with a name so mobile browsers respect popup behaviour
    window.open(target.url, "_blank", "noopener,noreferrer,width=680,height=680");
  };

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
        // Fallback solid so the PNG never has a transparent edge if the
        // gradient stops don't fully cover a rounded corner.
        backgroundColor: "#0B192C",
        style: { margin: "0" },
      });
      const link = document.createElement("a");
      link.download = `rox-taxi-${theme.id}-moments-${Date.now()}.png`;
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
              onClick={() => setShowSocial((v) => !v)}
              data-testid="wall-share-to-social"
              aria-expanded={showSocial}
              className="inline-flex items-center gap-2 rounded-full bg-[#D4A94A]/15 border border-[#D4A94A]/40 text-[#D4A94A] font-bold text-sm px-4 py-3 hover:bg-[#D4A94A]/25 active:scale-95 backdrop-blur"
            >
              <Share2 className="w-4 h-4" /> Share to Social
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

          {/* Social platform tray — expands under the CTAs when guests hit
              "Share to Social". Each button opens the platform's official
              share dialog in a popup. Instagram gets a helper hint since
              they don't offer a public share-URL API. */}
          {showSocial && (
            <div
              data-testid="wall-social-tray"
              className="mt-4 mx-auto max-w-md rounded-2xl bg-white/8 border border-white/20 backdrop-blur px-4 py-4"
            >
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/70 font-black mb-3">Share to</div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {socialTargets.map((s) => {
                  const Ico = s.Icon;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openSocial(s)}
                      data-testid={`wall-social-${s.id}`}
                      className="inline-flex items-center gap-2 rounded-full text-white font-bold text-sm px-4 py-2.5 hover:opacity-90 active:scale-95 transition-all"
                      style={{ background: s.color }}
                    >
                      <Ico className="w-4 h-4" /> {s.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => { savePNG(); toast("Save the image, then paste it into a new IG Story."); }}
                  data-testid="wall-social-instagram"
                  className="inline-flex items-center gap-2 rounded-full text-white font-bold text-sm px-4 py-2.5 hover:opacity-90 active:scale-95 transition-all"
                  style={{ background: "linear-gradient(135deg, #F58529 0%, #DD2A7B 50%, #8134AF 100%)" }}
                >
                  <Instagram className="w-4 h-4" /> Instagram
                </button>
              </div>
              <div className="mt-3 text-[10px] text-white/60 text-center leading-relaxed">
                Instagram doesn't support direct sharing — hit the button to save the image, then drop it into a new Story.
              </div>
            </div>
          )}
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
            {/* Theme picker — sits ABOVE the exportable strip so guests can
                preview their pick without it leaking into the PNG. */}
            <div className="mb-5" data-testid="wall-theme-picker">
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/60 font-black mb-2 text-center">
                Pick a vibe
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {Object.values(THEMES).map((t) => {
                  const on = t.id === themeId;
                  const Ico = t.Icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setThemeId(t.id)}
                      data-testid={`wall-theme-${t.id}`}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                        on
                          ? "text-[#0B192C] shadow-[0_8px_20px_rgba(0,0,0,0.3)] scale-105"
                          : "bg-white/10 border border-white/20 text-white hover:bg-white/20"
                      }`}
                      style={on ? { background: t.accent } : {}}
                    >
                      <Ico className="w-3.5 h-3.5" /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom caption input — lands under the strip's tagline before
                export. Max 60 chars so the layout stays balanced. */}
            <div className="mb-5" data-testid="wall-caption-block">
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/60 font-black mb-2 text-center">
                Add your caption (optional)
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
                  placeholder="e.g. Sunset with the crew · Ally, Marco & Jess"
                  maxLength={CAPTION_MAX}
                  data-testid="wall-caption-input"
                  className="w-full rounded-full bg-white/10 border border-white/20 text-white placeholder-white/40 text-sm px-4 py-2.5 pr-14 focus:outline-none focus:border-[#D4A94A] focus:bg-white/15 transition-colors"
                />
                <span
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums font-bold ${caption.length >= CAPTION_MAX - 5 ? "text-[#F97316]" : "text-white/40"}`}
                  data-testid="wall-caption-counter"
                >
                  {caption.length}/{CAPTION_MAX}
                </span>
              </div>
              {/* One-tap caption presets — theme-aware. Clicking swaps the
                  caption; clicking the already-active preset clears it. */}
              {captionPresets.length > 0 && (
                <div className="mt-2 flex items-center justify-center gap-1.5 flex-wrap" data-testid="wall-caption-presets">
                  {captionPresets.map((preset) => {
                    const on = caption === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCaption(on ? "" : preset)}
                        data-testid={`wall-caption-preset-${preset.slice(0, 12).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                        aria-pressed={on}
                        className={`text-[10px] font-bold rounded-full px-2.5 py-1 transition-all active:scale-95 ${
                          on
                            ? "bg-[#D4A94A] text-[#0B192C] shadow-[0_4px_12px_rgba(212,169,74,0.4)]"
                            : "bg-white/8 border border-white/20 text-white/80 hover:bg-white/15"
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              ref={stripRef}
              data-testid="wall-strip"
              className="rounded-[28px] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.5)] transition-[background] duration-500"
              style={{ aspectRatio: "9 / 16", background: theme.gradient }}
            >
              <StripHeader theme={theme} caption={caption} />
              <StripMosaic photos={photos} resolveUrl={resolveUrl} theme={theme} />
              <StripFooter theme={theme} />
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


function StripHeader({ theme, caption }) {
  return (
    <div className="px-5 pt-6 pb-4 text-center">
      <div
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] tracking-[0.32em] uppercase font-black"
        style={{ background: theme.pillBg, border: `1px solid ${theme.pillBorder}`, color: theme.accent }}
      >
        <Sparkles className="w-2.5 h-2.5" /> {theme.tagLabel}
      </div>
      <div className="serif text-[26px] leading-[1.1] mt-3" style={{ color: theme.headerText }}>
        {theme.tagline1}<br /><span style={{ color: theme.accent }}>{theme.tagline2}</span>
      </div>
      {caption && (
        <div
          data-testid="wall-strip-caption"
          className="mt-2 text-[12px] italic font-medium leading-snug px-2"
          style={{ color: theme.subText }}
        >
          &ldquo;{caption}&rdquo;
        </div>
      )}
    </div>
  );
}


function StripMosaic({ photos, resolveUrl, theme }) {
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
