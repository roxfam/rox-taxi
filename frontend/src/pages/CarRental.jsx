import { useEffect, useState } from "react";
import { api, money } from "../lib/api";
import BookingModal, { Field } from "./BookingFlow";
import { Users, ArrowRight } from "lucide-react";

export default function CarRental() {
  const [rentals, setRentals] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get("/rentals").then((r) => setRentals(r.data)).catch(() => {});
  }, []);

  return (
    <div data-testid="rentals-page">
      <section className="relative py-24 bg-[#FAF9F6]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid md:grid-cols-12 gap-8 items-end">
          <div className="md:col-span-7">
            <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Drive the islands</span>
            <h1 className="serif text-5xl sm:text-6xl mt-3 leading-none text-[#1A365D]">Car rentals, from beach cruiser to boardroom.</h1>
          </div>
          <div className="md:col-span-5 text-[#64748B] leading-relaxed">
            Pay online with credit card, PayPal or Zelle. Unlimited mileage, full insurance available, and free
            delivery to Nassau airport (LPIA) or your hotel.
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {rentals.map((r) => (
          <div key={r.id} className="group rounded-2xl overflow-hidden bg-white border border-[#E2E8F0] hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,180,216,0.15)] transition-transform" data-testid={`rental-card-${r.id}`}>
            <div className="aspect-[16/10] overflow-hidden relative bg-[#0B192C]">
              <img src={r.image_url} alt={r.name} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute top-3 left-3 glass rounded-full px-3 py-1 text-xs text-[#1A365D] font-semibold uppercase tracking-widest">
                {r.category}
              </div>
            </div>
            <div className="p-6">
              <h3 className="serif text-2xl text-[#1A365D] leading-tight">{r.name}</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{r.description}</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-[#64748B]"><Users className="w-4 h-4" /> Seats {r.seats}</div>
              <div className="mt-6 flex items-center justify-between">
                <div>
                  <span className="mono text-lg text-[#FF7F50] font-semibold">{money(r.price)}</span>
                  <span className="text-sm text-[#64748B]"> / day</span>
                </div>
                <button
                  onClick={() => setSelected(r)}
                  data-testid={`rental-book-btn-${r.id}`}
                  className="btn-shine inline-flex items-center gap-1 rounded-full bg-[#FF7F50] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#ff6a34] active:scale-95"
                >
                  Reserve <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {selected && (
        <BookingModal
          item={selected}
          serviceType="rental"
          defaultDays={3}
          onClose={() => setSelected(null)}
          extraFields={(form, setForm) => (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Delivery location" val={form.pickup_location} on={(e) => setForm({ ...form, pickup_location: e.target.value })} testid="rental-pickup" />
              <Field label="Number of days" type="number" val={form.days} on={(e) => setForm({ ...form, days: e.target.value })} testid="rental-days" />
            </div>
          )}
        />
      )}
    </div>
  );
}
