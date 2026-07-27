import { useEffect, useState } from "react";
import { api, money } from "../lib/api";
import BookingModal, { Field } from "./BookingFlow";
import { Users, ArrowRight, CalendarX, Info } from "lucide-react";

export default function CarRental() {
  const [rentals, setRentals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [availability, setAvailability] = useState({});

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/rentals");
      setRentals(data);
      // fetch all availabilities in parallel
      const results = await Promise.all(
        data.map((r) => api.get(`/rentals/${r.id}/availability`).then((x) => [r.id, x.data.blackouts]).catch(() => [r.id, []])),
      );
      setAvailability(Object.fromEntries(results));
    })();
  }, []);

  return (
    <div data-testid="rentals-page">
      <section className="relative py-24 bg-[#FBF7EF]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 grid md:grid-cols-12 gap-8 items-end">
          <div className="md:col-span-7">
            <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Drive the islands</span>
            <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9] text-[#0B3B5C]">Rent a car in <em className="italic text-[#D4A94A]">Nassau</em>.</h1>
          </div>
          <div className="md:col-span-5 text-[#64748B] leading-relaxed">
            Pay online with credit card, PayPal or Zelle. Unlimited mileage, full insurance available, and free
            delivery to Nassau airport (LPIA) or your hotel. Live blackout dates shown per car.
            <div className="mt-4 inline-flex items-start gap-2 rounded-2xl border border-[#D4A94A]/30 bg-[#D4A94A]/10 px-4 py-3 text-xs text-[#0B3B5C]" data-testid="rental-deposit-banner">
              <Info className="w-4 h-4 text-[#D4A94A] shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">$150 refundable security deposit</span> is added automatically at checkout, and released back once your vehicle is returned undamaged with a full tank.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-10 pb-24 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {rentals.map((r) => (
          <div key={r.id} className="group rounded-2xl overflow-hidden bg-white border border-[#E2E8F0] hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(212,169,74,0.15)] transition-transform flex flex-col" data-testid={`rental-card-${r.id}`}>
            <div className="aspect-[16/10] overflow-hidden relative bg-[#0B192C]">
              <img src={r.image_url} alt={r.name} className="w-full h-full object-cover opacity-95 group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute top-3 left-3 glass rounded-full px-3 py-1 text-xs text-[#0B3B5C] font-semibold uppercase tracking-widest">
                {r.body || r.category}
              </div>
              {r.year && (
                <div className="absolute top-3 right-3 mono text-xs bg-[#0B192C]/70 backdrop-blur text-white rounded-full px-2 py-1">
                  {r.year}
                </div>
              )}
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="serif text-2xl text-[#0B3B5C] leading-tight">{r.name}</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">{r.description}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
                <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {r.seats} seats</span>
                {r.color && <span>· {r.color}</span>}
                {r.make && <span>· {r.make}</span>}
              </div>

              <BlackoutList blackouts={availability[r.id] || []} />

              <div className="mt-6 flex items-center justify-between">
                <div>
                  <span className="mono text-lg text-[#E86A3C] font-semibold">{money(r.price)}</span>
                  <span className="text-sm text-[#64748B]"> / day</span>
                </div>
                <button
                  onClick={() => setSelected(r)}
                  data-testid={`rental-book-btn-${r.id}`}
                  className="btn-shine inline-flex items-center gap-1 rounded-full bg-[#E86A3C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#d55a30] active:scale-95"
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

function BlackoutList({ blackouts }) {
  const upcoming = (blackouts || [])
    .filter((b) => new Date(b.end) >= new Date())
    .slice(0, 3);

  return (
    <div className="mt-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3" data-testid="rental-blackouts">
      <div className="flex items-center gap-1.5 text-xs tracking-[0.2em] uppercase text-[#64748B]">
        <CalendarX className="w-3 h-3" /> Blackout dates
      </div>
      {upcoming.length === 0 ? (
        <div className="mt-1.5 text-xs text-[#D4A94A] flex items-center gap-1">
          <Info className="w-3 h-3" /> Available now — no upcoming bookings
        </div>
      ) : (
        <ul className="mt-1.5 space-y-0.5">
          {upcoming.map((b) => (
            <li key={b.booking_id} className="text-xs mono text-[#0B3B5C]">
              {fmt(b.start)} → {fmt(b.end)} <span className="text-[#64748B]">({b.days}d)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmt(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}
