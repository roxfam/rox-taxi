import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import BookingModal, { Field } from "./BookingFlow";
import { Clock, ArrowRight, ExternalLink } from "lucide-react";
import { PromoPrice } from "../components/PromoPrice";

export default function Tours() {
  const [tours, setTours] = useState([]);
  const [selected, setSelected] = useState(null);
  const [params] = useSearchParams();

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

      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {tours.map((t) => (
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
