import { Tag } from "lucide-react";
import { money } from "../lib/api";

// Renders a price. When the backend annotates `promo.is_promo === true` (i.e.
// the latest price-history reason contains 'promo'/'sale'/'discount' AND the
// change was a decrease) we show the original price struck through next to
// the sale price + a small SALE badge to drive urgency on public cards.
export function PromoPrice({ price, promo, size = "lg", className = "" }) {
  const sizeCls = size === "lg" ? "text-lg" : "text-base";
  if (!promo?.is_promo) {
    return <span className={`mono ${sizeCls} text-[#E86A3C] font-semibold ${className}`} data-testid="price">{money(price)}</span>;
  }
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`} data-testid="promo-price">
      <span className="mono text-xs text-[#94a3b8] line-through decoration-2" data-testid="promo-original">{money(promo.original_price)}</span>
      <span className={`mono ${sizeCls} text-[#E86A3C] font-semibold`} data-testid="promo-current">{money(price)}</span>
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#E86A3C] text-white px-1.5 py-0.5 rounded" data-testid="promo-badge">
        <Tag className="w-2.5 h-2.5" /> Sale
      </span>
    </span>
  );
}

export default PromoPrice;
