import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import BookingModal, { Field } from "./BookingFlow";
import { Clock, ArrowRight, ExternalLink, Car, ArrowUpDown } from "lucide-react";
import { PromoPrice } from "../components/PromoPrice";

const SORTS = [
  { key: "featured", label: "Featured", cmp: (a, b) => (b.featured === true) - (a.featured === true) },
  { key: "price-asc", label: "Price ↑", cmp: (a, b) => a.price - b.price },
  { key: "price-desc", label: "Price ↓", cmp: (a, b) => b.price - a.price },
  { key: "duration", label: "Shortest first", cmp: (a, b) => (parseFloat(a.duration) || 99) - (parseFloat(b.duration) || 99) },
];

export default function Tours() {
  const [tours, setTours] = useState([]);
  const [selected, setSelected] = useState(null);
  const [params] = useSearchParams();
  const [sortKey, setSortKey] = useState("featured");

  useEffect(() => {
    api.get("/tours").then((r) => {
      setTours(r.data);
      const bookId = params.get("book");
      if (bookId) {
        const t = r.data.find((x) => x.id === bookId);
        if (t) setSelected(t);
      }
    }).catch(() => {});
  }, [params]);

  // Sort client-side so the network trip stays a single /tours call. Featured
  // is the default because it lifts the highest-margin curated excursions.
  const sortedTours = useMemo(() => {
    const cmp = SORTS.find((s) => s.key === sortKey)?.cmp;
    return cmp ? [...tours].sort(cmp) : tours;
  }, [tours, sortKey]);

  return (
    <div data-testid="tours-page">
      <section className="bg-gradient-to-br from-[#D4A94A] to-[#A88235] text-white py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 relative z-10">
          <span className="text-xs tracking-[0.3em] uppercase text-white/80">Bahamas Excursions</span>
          <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9] max-w-4xl">Tours that feel like a <em className="italic">movie scene</em>.</h1>
          <p className="mt-6 text-white/85 max-w-xl leading-relaxed">
            From swimming with pigs in Exuma to snorkeling reef gardens off Rose Island, our excursions are curated by
            local captains and priced up-front.
          </p>
        </div>
      </section>

      {/* Add-on transfer banner — every excursion can be paired with Rox taxi pickup/dropoff. */}
      <div className="bg-[#0B3B5C] text-white" data-testid="tours-transfer-banner">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#D4A94A] text-[#0B192C] flex items-center justify-center">
              <Car className="w-4 h-4" />
            </div>
            <div className="text-sm">
              <span className="font-semibold">Add Rox taxi pickup &amp; dropoff to any excursion</span>
              <span className="text-white/70"> — hotel, LPIA, cruise port. Booked & tracked in one flow.</span>
            </div>
          </div>
          <a
            href="/taxi"
            data-testid="tours-transfer-cta"
            className="text-xs font-semibold text-[#D4A94A] hover:text-white underline decoration-dotted underline-offset-4"
          >
            See taxi rates →
          </a>
        </div>
      </div>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pt-14 pb-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-[#64748B]" data-testid="tours-count">
            <span className="font-semibold text-[#0B3B5C]">{sortedTours.length}</span> excursion{sortedTours.length === 1 ? "" : "s"}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white p-1 text-xs" data-testid="tours-sort">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#64748B] ml-2" />
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSortKey(s.key)}
                data-testid={`tours-sort-${s.key}`}
                className={`px-3 py-1.5 rounded-full font-semibold transition-colors ${sortKey === s.key ? "bg-[#0B3B5C] text-white" : "text-[#0B3B5C] hover:bg-[#F1F5F9]"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {sortedTours.map((t) => (
          <div key={t.id} className="group rounded-2xl overflow-hidden bg-white border border-[#E2E8F0] hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(212,169,74,0.15)] transition-transform" data-testid={`tour-card-${t.id}`}>
            <div className="aspect-[4/3] overflow-hidden relative">
              <img src={t.image_url} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute bottom-3 left-3 glass rounded-full px-3 py-1 text-xs text-[#0B3B5C] font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" /> {t.duration}
              </div>
            </div>
            <div className="p-6">
              <h3 className="serif text-2xl text-[#0B3B5C] leading-tight">{t.name}</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{t.description}</p>
              <div className="mt-6 flex items-center justify-between">
                <PromoPrice price={t.price} promo={t.promo} />
                <button
                  onClick={() => setSelected(t)}
                  data-testid={`tour-book-btn-${t.id}`}
                  className="btn-shine inline-flex items-center gap-1 rounded-full bg-[#0B3B5C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#132a4a] active:scale-95"
                >
                  Book <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              {t.external_booking_url && (
                <a
                  href={t.external_booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`tour-external-btn-${t.id}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0B3B5C]/70 hover:text-[#D4A94A] transition-colors group/ext"
                  title="Book directly on the official operator site"
                >
                  <span className="underline decoration-dotted underline-offset-4">Or book on official operator site</span>
                  <ExternalLink className="w-3 h-3 group-hover/ext:translate-x-0.5 transition-transform" />
                </a>
              )}
              <div
                className="mt-3 pt-3 border-t border-dashed border-[#E2E8F0] flex items-center gap-1.5 text-[11px] text-[#64748B]"
                data-testid={`tour-transfer-note-${t.id}`}
              >
                <Car className="w-3.5 h-3.5 text-[#D4A94A]" />
                <span>
                  <span className="font-semibold text-[#0B3B5C]">Add taxi pickup &amp; dropoff</span> — from $20 each way. Select at checkout.
                </span>
              </div>
            </div>
          </div>
        ))}
      </section>

      {selected && (
        <BookingModal
          item={selected}
          serviceType="tour"
          onClose={() => setSelected(null)}
          extraFields={(form, setForm) => (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Hotel / Pickup location" val={form.pickup_location} on={(e) => setForm({ ...form, pickup_location: e.target.value })} testid="tour-pickup" />
            </div>
          )}
        />
      )}
    </div>
  );
}
