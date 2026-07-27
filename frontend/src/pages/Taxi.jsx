import { useEffect, useState } from "react";
import { api, money } from "../lib/api";
import BookingModal, { Field } from "./BookingFlow";
import { Car, ArrowRight } from "lucide-react";

export default function Taxi() {
  const [services, setServices] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get("/taxi-services").then((r) => setServices(r.data)).catch(() => {});
  }, []);

  return (
    <div data-testid="taxi-page">
      <section className="bg-[#1A365D] text-white py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid md:grid-cols-2 gap-10 items-end">
          <div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#00B4D8]">Airport & City Rides</span>
            <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9]">Bahamas <em className="italic text-[#FFD8B1]">taxi</em>, done right.</h1>
          </div>
          <p className="text-white/80 leading-relaxed max-w-md md:justify-self-end">
            Fixed, transparent pricing for airport transfers, hotel pickups, and hourly charters — driven by
            licensed local operators who know every road.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-24 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((s) => (
          <div key={s.id} className="rounded-2xl border border-[#E2E8F0] bg-white p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,180,216,0.12)] transition-transform" data-testid={`taxi-service-${s.id}`}>
            <div className="w-12 h-12 rounded-xl bg-[#00B4D8]/10 flex items-center justify-center text-[#00B4D8]">
              <Car className="w-5 h-5" />
            </div>
            <h3 className="serif text-2xl text-[#1A365D] mt-4 leading-tight">{s.name}</h3>
            <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{s.description}</p>
            <div className="mt-5 flex items-center justify-between">
              <span className="mono text-lg text-[#FF7F50] font-semibold">{money(s.price)}</span>
              <button
                onClick={() => setSelected(s)}
                data-testid={`taxi-book-btn-${s.id}`}
                className="btn-shine inline-flex items-center gap-1 rounded-full bg-[#FF7F50] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#ff6a34] active:scale-95"
              >
                Book <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </section>

      {selected && (
        <BookingModal
          item={selected}
          serviceType="taxi"
          onClose={() => setSelected(null)}
          extraFields={(form, setForm) => (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Pickup location" val={form.pickup_location} on={(e) => setForm({ ...form, pickup_location: e.target.value })} testid="taxi-pickup" />
              <Field label="Dropoff location" val={form.dropoff_location} on={(e) => setForm({ ...form, dropoff_location: e.target.value })} testid="taxi-dropoff" />
            </div>
          )}
        />
      )}
    </div>
  );
}
