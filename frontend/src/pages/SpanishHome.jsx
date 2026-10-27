import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plane, Ship, Car, MapPinned, ShieldCheck, Clock, CreditCard, Phone, ArrowRight } from "lucide-react";
import Seo from "../components/Seo";
import { api } from "../lib/api";
import { WhatsAppIcon } from "../components/BrandIcons";

const WA = `https://wa.me/12424322587?text=${encodeURIComponent("¡Hola Rox! Quisiera reservar: ")}`;
const $ = (n) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;

const WHY = [
  [ShieldCheck, "Conductores con licencia", "Taxis autorizados en las Bahamas, vehículos con aire acondicionado y conductores de confianza."],
  [Clock, "Servicio 24/7", "Traslados al aeropuerto de día o de noche. Seguimos tu vuelo y te esperamos en llegadas."],
  [CreditCard, "Precio fijo y pago seguro", "Tarifa clara antes de reservar. Paga con tarjeta o PayPal en línea."],
  [Ship, "Ideal para cruceros", "Excursiones y taxis desde el puerto que te regresan al barco con tiempo de sobra."],
];

const FAQ = [
  ["¿Cuánto cuesta un taxi del aeropuerto de Nassau a Atlantis?", "Consulta la tarifa exacta en la lista de abajo. Los precios son para las primeras 2 personas; cada pasajero adicional paga $5."],
  ["¿Puedo reservar un taxi desde el puerto de cruceros?", "Sí. Te recogemos en Prince George Wharf y te llevamos a playas, Paradise Island, Atlantis o al centro, y te regresamos antes de la hora de embarque."],
  ["¿Hablan español?", "Puedes escribirnos por WhatsApp en español y te ayudaremos a reservar tu viaje."],
  ["¿Cómo pago?", "En línea con tarjeta o PayPal al reservar. Se aplica un cargo por procesamiento del 5%."],
];

const useLive = () => {
  const [d, setD] = useState({ taxi: [], tours: [] });
  useEffect(() => {
    Promise.allSettled([api.get("/taxi-services"), api.get("/tours")]).then(([t, tr]) => setD({
      taxi: (t.value?.data || []).filter((x) => x.active !== false && /→|↔/.test(x.name) && /LPIA|Airport|Cruise|Port|Atlantis|Paradise/i.test(x.name)).slice(0, 10),
      tours: (tr.value?.data || []).filter((x) => x.active !== false).slice(0, 6),
    }));
  }, []);
  return d;
};

const Cta = ({ dark }) => (
  <div className="flex flex-wrap gap-3">
    <Link to="/taxi" className={`inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold text-sm transition-colors ${dark ? "bg-[#D4A94A] text-[#0B192C] hover:bg-[#F5E1A4]" : "bg-[#0B3B5C] text-white hover:bg-[#082941]"}`} data-testid="es-cta-taxi">Reservar taxi <ArrowRight className="w-4 h-4" /></Link>
    <a href={WA} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fbe5b] text-white px-6 py-3 font-bold text-sm transition-colors" data-testid="es-cta-whatsapp"><WhatsAppIcon className="w-4 h-4" /> WhatsApp</a>
    <a href="tel:+12424322587" className={`inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold text-sm border transition-colors ${dark ? "border-white/30 text-white hover:bg-white/10" : "border-[#0B3B5C]/20 text-[#0B3B5C] hover:bg-[#FBF7EF]"}`} data-testid="es-cta-call"><Phone className="w-4 h-4" /> Llamar</a>
  </div>
);

export default function SpanishHome() {
  const { taxi, tours } = useLive();
  useEffect(() => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = "es";
    return () => { document.documentElement.lang = prev || "en"; };
  }, []);
  return (
    <div data-testid="es-home-page">
      <Seo title="Taxi en Nassau, Bahamas | Traslados al aeropuerto, Atlantis y excursiones | Rox Taxi"
        description="Taxi en Nassau, Bahamas 24/7: traslados del aeropuerto LPIA, puerto de cruceros, Atlantis, Paradise Island y Baha Mar, más excursiones y tours. Precio fijo, conductores con licencia, reserva en línea." />
      <section className="bg-[#0B192C] text-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-20">
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Nassau · Paradise Island · Bahamas</div>
          <h1 className="serif text-4xl sm:text-5xl lg:text-6xl mt-4 max-w-3xl">Taxi y tours en Nassau, Bahamas</h1>
          <p className="mt-5 text-white/75 max-w-2xl text-sm sm:text-base">Traslados desde el aeropuerto internacional Lynden Pindling (LPIA) y el puerto de cruceros a tu hotel, Atlantis, Paradise Island, Baha Mar y las mejores playas. Conductores con licencia, precio fijo y servicio las 24 horas.</p>
          <div className="mt-8"><Cta dark /></div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="es-why">
        {WHY.map(([Icon, h, p]) => (
          <div key={h}>
            <Icon className="w-6 h-6 text-[#D4A94A]" />
            <h2 className="mt-3 text-base md:text-lg font-bold text-[#0B3B5C]">{h}</h2>
            <p className="mt-1 text-sm text-[#64748B]">{p}</p>
          </div>
        ))}
      </section>

      <section className="bg-[#FBF7EF] py-16" data-testid="es-taxi-fares">
        <div className="max-w-6xl mx-auto px-6 lg:px-10">
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-2"><Plane className="w-4 h-4" /> Tarifas de taxi</div>
          <h2 className="serif text-3xl sm:text-4xl text-[#0B3B5C] mt-2">Aeropuerto, puerto de cruceros y Atlantis</h2>
          <p className="mt-2 text-sm text-[#64748B]">Precio para las primeras 2 personas · $5 por pasajero adicional.</p>
          <div className="mt-8 grid md:grid-cols-2 gap-3">
            {taxi.map((t) => (
              <Link key={t.id} to={`/taxi?book=${t.id}`} className="flex items-center justify-between rounded-xl bg-white border border-[#E2E8F0] px-4 py-3 hover:border-[#D4A94A] transition-colors" data-testid={`es-fare-${t.id}`}>
                <span className="text-sm text-[#0B3B5C] font-semibold inline-flex items-center gap-2"><Car className="w-4 h-4 text-[#D4A94A]" />{t.name}</span>
                <span className="font-mono font-bold text-[#0B3B5C]">{$(t.price)}</span>
              </Link>
            ))}
          </div>
          <Link to="/taxi" className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-[#0B3B5C] underline decoration-[#D4A94A] underline-offset-4" data-testid="es-all-fares">Ver todas las tarifas <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-16" data-testid="es-tours">
        <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-2"><MapPinned className="w-4 h-4" /> Excursiones</div>
        <h2 className="serif text-3xl sm:text-4xl text-[#0B3B5C] mt-2">Tours y excursiones en Nassau</h2>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tours.map((t) => (
            <Link key={t.id} to={`/tours?book=${t.id}`} className="rounded-xl border border-[#E2E8F0] p-4 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(11,59,92,0.1)] transition-[transform,box-shadow]" data-testid={`es-tour-${t.id}`}>
              <div className="font-semibold text-[#0B3B5C]">{t.name}</div>
              <div className="mt-1 text-xs text-[#64748B]">{t.duration}</div>
              <div className="mt-2 font-mono font-bold text-[#0B3B5C]">desde {$(t.price)} por persona</div>
            </Link>
          ))}
        </div>
        <div className="mt-8 rounded-2xl bg-[#0B3B5C] text-white p-6 flex flex-wrap items-center gap-4" data-testid="es-cruise">
          <Ship className="w-6 h-6 text-[#D4A94A]" />
          <div className="flex-1 min-w-[220px]">
            <div className="font-semibold">¿Llegas en crucero?</div>
            <div className="text-sm text-white/70">Mira qué barcos están en Nassau hoy y reserva una excursión que te regresa antes del embarque.</div>
          </div>
          <Link to="/cruise-schedule" className="rounded-full bg-[#D4A94A] text-[#0B192C] font-bold text-sm px-5 py-2.5" data-testid="es-cruise-link">Calendario de cruceros</Link>
        </div>
      </section>

      <section className="bg-white border-t border-[#E2E8F0] py-16" data-testid="es-faq">
        <div className="max-w-4xl mx-auto px-6 lg:px-10">
          <h2 className="serif text-3xl sm:text-4xl text-[#0B3B5C]">Preguntas frecuentes</h2>
          <div className="mt-8 space-y-5">
            {FAQ.map(([q, a]) => (
              <div key={q}>
                <h3 className="font-bold text-[#0B3B5C]">{q}</h3>
                <p className="mt-1 text-sm text-[#64748B]">{a}</p>
              </div>
            ))}
          </div>
          <div className="mt-10"><Cta /></div>
        </div>
      </section>
    </div>
  );
}
