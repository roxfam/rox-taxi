import { Link } from "react-router-dom";

const BLOCKS = [
  {
    h: "Nassau airport taxi & LPIA transfers",
    p: "Landing at Lynden Pindling International Airport (LPIA)? Book a licensed Nassau airport taxi before you fly. Your driver tracks your flight, waits at arrivals and takes you straight to Downtown Nassau, Cable Beach, Baha Mar, Paradise Island, Atlantis, Love Beach or your villa, with fixed Bahamas taxi fares and no surprises.",
    links: [["/taxi", "See Nassau taxi fares"]],
  },
  {
    h: "Paradise Island, Atlantis & Baha Mar rides",
    p: "Rox Taxi runs reliable rides around New Providence 24/7: Atlantis casino nights, Baha Mar dinners, Fish Fry at Arawak Cay, Junkanoo Beach and Bay Street shopping. Add a casino wait, a meet-with-sign greeting or a round trip in one booking.",
    links: [["/taxi", "Book a Paradise Island taxi"]],
  },
  {
    h: "Nassau cruise port taxis & shore excursions",
    p: "In port at Prince George Wharf for the day? Check which ships are in Nassau, then book a Bahamas shore excursion, island tour or beach taxi that gets you back to the ship well before all aboard.",
    links: [["/cruise-schedule", "Nassau cruise ship schedule"], ["/tours", "Nassau tours & excursions"]],
  },
  {
    h: "Bahamas tours, beach days & car rentals",
    p: "Explore the best things to do in Nassau, Bahamas: Blue Lagoon Island, dolphin swims, snorkeling, jet skis, ATV tours, the Nassau city tour and Cable Beach days. Prefer to drive yourself? Rent a car in Nassau with delivery to LPIA or your hotel.",
    links: [["/tours", "Explore Bahamas tours"], ["/rentals", "Nassau car rentals"]],
  },
];

// Keyword-rich, visible copy for Nassau / Bahamas search intent with internal links.
export const SeoContentBlock = () => (
  <section className="bg-white py-20 border-t border-[#E2E8F0]" data-testid="home-seo-content">
    <div className="max-w-7xl mx-auto px-6 lg:px-10">
      <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Nassau · Paradise Island · The Bahamas</div>
      <h2 className="serif text-3xl sm:text-4xl text-[#0B3B5C] mt-3 max-w-3xl">Trusted Nassau taxi service, tours &amp; transportation across the Bahamas</h2>
      <div className="mt-10 grid md:grid-cols-2 gap-x-12 gap-y-10">
        {BLOCKS.map((b) => (
          <article key={b.h}>
            <h3 className="text-base md:text-lg font-bold text-[#0B3B5C]">{b.h}</h3>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{b.p}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              {b.links.map(([to, l]) => (
                <Link key={to + l} to={to} className="text-sm font-semibold text-[#0B3B5C] underline decoration-[#D4A94A] underline-offset-4 hover:text-[#D4A94A] transition-colors" data-testid={`seo-link-${l.replace(/\s+/g, "-").toLowerCase()}`}>{l} →</Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
);
