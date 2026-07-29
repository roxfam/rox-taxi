import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Send, MapPin, ArrowLeft, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";

const CITY_META = {
  freeport: {
    name: "Freeport", island: "Grand Bahama",
    tagline: "Beach-town gateway — Lucaya Marketplace, Gold Rock Beach, Port Lucaya cruise pier.",
    hero_image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format&fit=crop",
    tint: "#0B7A75",
  },
  exuma: {
    name: "Exuma", island: "Great Exuma",
    tagline: "Swimming pigs. Sandbars. Iguana beach. The Instagram-famous private-yacht cays.",
    hero_image: "https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=1920&q=80&auto=format&fit=crop",
    tint: "#D4A94A",
  },
  andros: {
    name: "Andros", island: "Andros Island",
    tagline: "The Bahamas' largest island — Andros Barrier Reef, blue holes, bonefishing flats.",
    hero_image: "https://images.unsplash.com/photo-1548574505-5e239809ee19?w=1920&q=80&auto=format&fit=crop",
    tint: "#0B3B5C",
  },
};

export default function ComingSoon() {
  const { slug = "" } = useParams();
  const meta = CITY_META[slug];
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!meta) {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center" data-testid="coming-soon-unknown">
        <h1 className="serif text-3xl text-[#0B3B5C]">City not found</h1>
        <p className="text-[#64748B] mt-2">We don't recognise that destination yet.</p>
        <Link to="/" className="mt-4 inline-flex items-center gap-1 text-sm text-[#D4A94A] hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Nassau
        </Link>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/waitlist", { email: email.trim().toLowerCase(), city: slug, name: name.trim() || null });
      toast.success(data.message || "You're on the wait-list.");
      setJoined(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't join the wait-list");
    } finally { setBusy(false); }
  };

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden" data-testid={`coming-soon-${slug}`}>
      <div className="absolute inset-0 -z-10">
        <img src={meta.hero_image} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B192C]/85 via-[#0B192C]/60 to-transparent" />
      </div>
      <div className="max-w-3xl mx-auto px-6 py-24 lg:py-32 text-white">
        <Link to="/" className="inline-flex items-center gap-1 text-xs tracking-[0.3em] uppercase text-[#D4A94A] hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Nassau
        </Link>
        <span className="mt-6 inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-white/70">
          <MapPin className="w-3 h-3 text-[#D4A94A]" /> {meta.island} · Coming soon
        </span>
        <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9] max-w-3xl" style={{ textShadow: "0 6px 30px rgba(0,0,0,0.6)" }}>
          {meta.name}, <em className="italic text-[#D4A94A]">soon</em>.
        </h1>
        <p className="mt-5 text-white/85 text-lg max-w-2xl leading-relaxed">{meta.tagline}</p>
        <p className="mt-2 text-white/60 text-sm max-w-xl">
          Rox is expanding beyond Nassau. Drop your email and we'll message you the day we're live in {meta.name} —
          first-week bookings get a founding-member discount.
        </p>

        {joined ? (
          <div className="mt-8 max-w-md flex items-start gap-3 rounded-2xl bg-white/95 text-[#0B3B5C] p-5" data-testid="coming-soon-joined">
            <CheckCircle2 className="w-6 h-6 text-[#059669] shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">You're on the {meta.name} wait-list.</div>
              <p className="text-sm text-[#64748B] mt-1">Check your email — we'll say hi when we're a few weeks out from launch.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 max-w-md bg-white/95 rounded-2xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]" data-testid="coming-soon-form">
            <div className="text-xs tracking-[0.3em] uppercase text-[#64748B] font-semibold flex items-center gap-1"><Mail className="w-3 h-3 text-[#D4A94A]" /> Join the wait-list</div>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              data-testid="coming-soon-name"
              className="mt-3 w-full rounded-lg border border-[#E2E8F0] px-3 py-2.5 text-sm text-[#0B3B5C] focus:border-[#D4A94A] focus:outline-none"
            />
            <input
              required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              data-testid="coming-soon-email"
              className="mt-2 w-full rounded-lg border border-[#E2E8F0] px-3 py-2.5 text-sm text-[#0B3B5C] focus:border-[#D4A94A] focus:outline-none"
            />
            <button
              type="submit" disabled={busy || !email}
              data-testid="coming-soon-submit"
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-60"
              style={{ background: meta.tint }}
            >
              <Send className="w-4 h-4" /> {busy ? "Adding…" : "Notify me at launch"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
