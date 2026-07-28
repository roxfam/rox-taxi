import { Tag } from "lucide-react";
import { money } from "../lib/api";

// Renders a price. When the backend annotates `promo.is_promo === true` (i.e.
// the latest price-history reason contains 'promo'/'sale'/'discount' AND the
// change was a decrease) we show the original price struck through next to
// the sale price + a small SALE badge to drive urgency on public cards.
export function PromoPrice({ price, promo, size = "lg", className = "" }) {
  // Attention-grabbing sizing: prices are the #1 conversion driver on a
  // catalog card, so lg -> text-2xl / font-black with a soft orange glow.
  // Base variant still fits inline next to /day / hr suffixes without
  // breaking layout because we anchor with `items-baseline` in callers.
  const sizeCls = size === "lg" ? "text-2xl leading-none" : "text-lg leading-none";
  const priceCls = `mono ${sizeCls} text-[#E86A3C] font-black tracking-tight drop-shadow-[0_2px_8px_rgba(232,106,60,0.25)]`;
  if (!promo?.is_promo) {
    return <span className={`${priceCls} ${className}`} data-testid="price">{money(price)}</span>;
  }
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`} data-testid="promo-price">
      <span className="mono text-sm text-[#94a3b8] line-through decoration-2 font-semibold" data-testid="promo-original">{money(promo.original_price)}</span>
      <span className={priceCls} data-testid="promo-current">{money(price)}</span>
      <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wider bg-[#E86A3C] text-white px-2 py-0.5 rounded-full shadow-[0_4px_10px_rgba(232,106,60,0.4)]" data-testid="promo-badge">
        <Tag className="w-2.5 h-2.5" /> Sale
      </span>
    </span>
  );
}

export default PromoPrice;
