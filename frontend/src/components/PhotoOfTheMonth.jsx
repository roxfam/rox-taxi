import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { api } from "../lib/api";
import { PhotoWatermark } from "./PhotoWatermark";

const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u}`);
const monthLabel = (m) => new Date(`${m}-01T12:00:00`).toLocaleString("en-US", { month: "long", year: "numeric" });

// Featured guest photo chosen by the admin each month.
export const PhotoOfTheMonth = () => {
  const [p, setP] = useState(null);
  useEffect(() => {
    api.get("/gallery/photo-of-month").then(({ data }) => setP(data || null)).catch(() => setP(null));
  }, []);
  if (!p) return null;
  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 mb-8" data-testid="photo-of-month">
      <div className="grid md:grid-cols-[1.3fr_1fr] rounded-3xl overflow-hidden bg-[#0B192C] text-white shadow-[0_20px_50px_rgba(11,25,44,0.25)]">
        <div className="relative aspect-[4/3] md:aspect-auto md:min-h-[320px] overflow-hidden">
          <img src={resolveUrl(p.url)} alt={p.caption || "Photo of the Month"} className="w-full h-full object-cover" data-testid="photo-of-month-image" />
          <PhotoWatermark size="lg" />
        </div>
        <div className="p-8 flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-black text-[#D4A94A]"><Award className="w-4 h-4" /> Photo of the Month</div>
          <div className="text-xs text-white/60 mt-2" data-testid="photo-of-month-label">{monthLabel(p.month)}</div>
          {p.caption && <p className="serif italic text-2xl mt-4 leading-snug" data-testid="photo-of-month-caption">&ldquo;{p.caption}&rdquo;</p>}
          {p.submitter && <p className="text-sm text-white/80 mt-4" data-testid="photo-of-month-submitter">Shared by {p.submitter}</p>}
        </div>
      </div>
    </div>
  );
};
