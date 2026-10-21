import { useEffect, useState } from "react";
import { Check, Package } from "lucide-react";
import { api, money } from "../lib/api";
import { WhatsAppIcon } from "./BrandIcons";

const waLink = (b) => `https://wa.me/12424322587?text=${encodeURIComponent(`Hi Rox! I'd like to book the "${b.name}" deal (${money(b.bundle_price)}). Date: `)}`;

const BundleCard = ({ b }) => {
  const save = Math.round(b.regular_price - b.bundle_price);
  return (
    <div className="relative rounded-2xl overflow-hidden bg-white border border-[#E2E8F0] flex flex-col hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(11,59,92,0.12)] transition-[transform,box-shadow]" data-testid={`bundle-card-${b.id}`}>
      {b.image_url && <img src={b.image_url} alt={b.name} className="h-40 w-full object-cover" loading="lazy" />}
      <span className="absolute top-3 right-3 rounded-full bg-[#E86A3C] text-white text-[11px] font-black px-2.5 py-1" data-testid={`bundle-save-${b.id}`}>Save {money(save)}</span>
      <div className="p-5 flex-1 flex flex-col">
        <div className="serif text-xl text-[#0B3B5C]">{b.name}</div>
        {b.description && <p className="text-sm text-[#64748B] mt-1">{b.description}</p>}
        <ul className="mt-3 space-y-1.5 flex-1">
          {(b.includes || []).map((i) => <li key={i} className="text-sm text-[#0B3B5C] flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />{i}</li>)}
        </ul>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-xs text-[#94a3b8] line-through">{money(b.regular_price)}</div>
            <div className="font-mono font-black text-2xl text-[#0B3B5C]" data-testid={`bundle-price-${b.id}`}>{money(b.bundle_price)}</div>
          </div>
          <a href={waLink(b)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] hover:bg-[#1fbe5b] text-white text-sm font-bold px-4 py-2.5 transition-colors" data-testid={`bundle-book-${b.id}`}>
            <WhatsAppIcon className="w-4 h-4" /> Book this deal
          </a>
        </div>
      </div>
    </div>
  );
};

export const BundleDeals = ({ className = "" }) => {
  const [list, setList] = useState([]);
  useEffect(() => {
    api.get("/bundles").then((r) => setList(r.data)).catch(() => setList([]));
  }, []);
  if (!list.length) return null;
  return (
    <section className={className} data-testid="bundle-deals">
      <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-2"><Package className="w-4 h-4" /> Bundle deals</div>
      <h2 className="serif text-3xl sm:text-4xl text-[#0B3B5C] mt-2">Combine &amp; save</h2>
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{list.map((b) => <BundleCard key={b.id} b={b} />)}</div>
    </section>
  );
};
