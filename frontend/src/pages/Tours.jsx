import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, money } from "../lib/api";
import BookingModal, { Field } from "./BookingFlow";
import { Clock, ArrowRight } from "lucide-react";

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
      <section className="bg-gradient-to-br from-[#00B4D8] to-[#0077B6] text-white py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 relative z-10">
          <span className="text-xs tracking-[0.3em] uppercase text-white/80">Bahamas Excursions</span>
          <h1 className="serif text-5xl sm:text-6xl mt-3 leading-none max-w-3xl">Tours that feel like a movie scene.</h1>
          <p className="mt-6 text-white/85 max-w-xl leading-relaxed">
            From swimming with pigs in Exuma to snorkeling reef gardens off Rose Island, our excursions are curated by
            local captains and priced up-front.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {tours.map((t) => (
          <div key={t.id} className="group rounded-2xl overflow-hidden bg-white border border-[#E2E8F0] hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,180,216,0.15)] transition-transform" data-testid={`tour-card-${t.id}`}>
            <div className="aspect-[4/3] overflow-hidden relative">
              <img src={t.image_url} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute bottom-3 left-3 glass rounded-full px-3 py-1 text-xs text-[#1A365D] font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" /> {t.duration}
              </div>
            </div>
            <div className="p-6">
              <h3 className="serif text-2xl text-[#1A365D] leading-tight">{t.name}</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{t.description}</p>
              <div className="mt-6 flex items-center justify-between">
                <span className="mono text-lg text-[#FF7F50] font-semibold">{money(t.price)}</span>
                <button
                  onClick={() => setSelected(t)}
                  data-testid={`tour-book-btn-${t.id}`}
                  className="btn-shine inline-flex items-center gap-1 rounded-full bg-[#1A365D] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#132a4a] active:scale-95"
                >
                  Book <ArrowRight className="w-4 h-4" />
                </button>
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
              <Field label="Number of guests" type="number" val={form.passengers} on={(e) => setForm({ ...form, passengers: e.target.value })} testid="tour-passengers" />
            </div>
          )}
        />
      )}
    </div>
  );
}
