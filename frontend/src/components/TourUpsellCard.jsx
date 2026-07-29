import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money } from "../lib/api";
import { Sparkles, ArrowRight, Ship } from "lucide-react";

/**
 * Tour upsell — shown on the payment-success page. Suggests 2 popular tours
 * that the customer can book for the next 48 hours. Uses `pickup_location` /
 * `dropoff_location` to pick contextually relevant recommendations when a
 * cruise-port or airport transfer was just booked.
 */
export default function TourUpsellCard({ booking }) {
  const [tours, setTours] = useState([]);
  useEffect(() => {
    api.get("/tours").then((r) => {
      const list = (r.data || []).filter((t) => t.active !== false);
      // Rank: promo/featured first, then price ascending (approachable)
      list.sort((a, b) => {
        const pa = a.featured ? 0 : 1;
        const pb = b.featured ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (a.price || 0) - (b.price || 0);
      });
      setTours(list.slice(0, 2));
    }).catch(() => {});
  }, []);

  if (tours.length === 0) return null;

  const contextHint = (() => {
    const dropoff = (booking?.dropoff_location || booking?.item_name || "").toLowerCase();
    if (dropoff.includes("atlantis") || dropoff.includes("paradise")) return "While you're on Paradise Island…";
    if (dropoff.includes("cruise") || dropoff.includes("port")) return "Cruising Nassau? Add a day tour…";
    if (dropoff.includes("baha mar") || dropoff.includes("cable")) return "Staying at Baha Mar / Cable Beach?";
    return "Add a Bahamas moment to your trip";
  })();

  return (
    <div className="mt-8 rounded-3xl border border-[#E2E8F0] bg-gradient-to-br from-white to-[#FBF7EF] p-6 sm:p-8" data-testid="tour-upsell-card">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#D4A94A] to-[#A88235] text-white flex items-center justify-center shrink-0 shadow-[0_10px_25px_rgba(212,169,74,0.35)]">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[10px] tracking-[0.35em] uppercase font-black text-[#D4A94A]">One more thing</div>
          <div className="serif text-2xl text-[#0B3B5C] mt-1 leading-tight">{contextHint}</div>
          <p className="text-xs text-[#64748B] mt-1">Add a tour to your trip — save the WhatsApp back-and-forth and lock in today's rate.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {tours.map((t) => (
          <Link
            key={t.id}
            to={`/tours#${t.id}`}
            data-testid={`tour-upsell-item-${t.id}`}
            className="group flex flex-col rounded-2xl border border-[#EFE7D5] bg-white overflow-hidden hover:border-[#D4A94A] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(212,169,74,0.15)] transition-all"
          >
            {t.image_url && (
              <div className="relative aspect-[16/9] overflow-hidden bg-[#F1F5F9]">
                <img src={t.image_url} alt={t.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                {t.featured && (
                  <span className="absolute top-2 left-2 text-[9px] font-black tracking-[0.2em] uppercase bg-white/95 text-[#D4A94A] rounded-full px-2 py-1">Popular</span>
                )}
              </div>
            )}
            <div className="p-4 flex-1 flex flex-col">
              <div className="serif text-base text-[#0B3B5C] font-semibold leading-tight line-clamp-2">{t.name}</div>
              {t.subtitle && <div className="text-xs text-[#64748B] mt-1 line-clamp-2">{t.subtitle}</div>}
              <div className="mt-3 flex items-center justify-between">
                <span className="mono text-lg text-[#E86A3C] font-black">{money(t.price)}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-[#0B3B5C] group-hover:text-[#D4A94A] transition-colors">
                  Book <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-4 text-[11px] text-[#94a3b8] flex items-center gap-1.5">
        <Ship className="w-3.5 h-3.5" /> Best-loved by cruise passengers · 15% cancellation fee applies with ≥48h notice.
      </div>
    </div>
  );
}
