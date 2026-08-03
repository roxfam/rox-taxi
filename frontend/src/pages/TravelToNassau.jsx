import { Link } from "react-router-dom";
import { Plane, Ship, Car, MapPin, Sun, DollarSign, Languages, ShieldCheck, ChevronRight, Sparkles, Clock, Users } from "lucide-react";
import Seo from "../components/Seo";

/**
 * TravelToNassau — long-form SEO landing page targeting the "travel to Nassau"
 * cluster of search terms. Written to genuinely help a first-time visitor plan
 * their trip; naturally weaves in taxi, tours and car-rental keywords with
 * internal links back to the transactional pages.
 *
 * Structure (all H2s so Google can pull a jump-to-section carousel):
 *   1. Why travel to Nassau
 *   2. Getting to Nassau (LPIA / cruise / private)
 *   3. Getting around Nassau (taxi / rental / walking / ferry)
 *   4. Where to stay (Atlantis, Baha Mar, Cable Beach, Paradise Island, Downtown)
 *   5. Best things to do
 *   6. Nassau travel tips (weather, currency, tipping, driving, safety, language)
 *   7. Cruise stopover — 1-day itinerary
 *   8. FAQ (schema.org FAQPage)
 *
 * Word count ~1,400 — well above Google's "thin content" threshold.
 */

const SECTIONS = [
  { id: "why-nassau",  label: "Why travel to Nassau" },
  { id: "getting-here",label: "Getting to Nassau" },
  { id: "getting-around", label: "Getting around" },
  { id: "where-to-stay",  label: "Where to stay" },
  { id: "things-to-do",   label: "Best things to do" },
  { id: "travel-tips",    label: "Travel tips" },
  { id: "cruise-day",     label: "Cruise stopover — 1-day itinerary" },
  { id: "faq",            label: "FAQ" },
];

const FAQ = [
  {
    q: "What's the best month to travel to Nassau, Bahamas?",
    a: "December through April is peak season with sunny 75–82°F days, low rainfall and the calmest seas. If you want the cheapest flights and hotel rates, travel in May, June or November — you'll still get 82°F water and shorter queues at Atlantis and Blue Lagoon. Hurricane season peaks August–October; storms are usually forecast 5+ days out so travel insurance and a flexible ticket are worth it."
  },
  {
    q: "How do I get from LPIA airport to my Nassau hotel?",
    a: "Every arrival hall at Lynden Pindling International (LPIA) has a licensed taxi rank. Fixed Nassau-tariff fares are $32 to Cable Beach / Baha Mar, $32 to Downtown Nassau, and $45 to Paradise Island / Atlantis for up to two passengers (extra $4/person). Rox Taxi meets you at arrivals with a name sign and includes the Paradise Island bridge toll — book online or WhatsApp so a driver is waiting when your flight lands."
  },
  {
    q: "Do I need a rental car in Nassau?",
    a: "Not for most trips. If you're staying on Paradise Island (Atlantis) or in Cable Beach (Baha Mar) you can walk the resort and taxi elsewhere for under $20 a ride. Rent a car if you want to explore the whole island in a week — beach hopping to Love Beach, Adelaide, Cabbage Beach and Coral Harbour is easier by car. Bahamians drive on the LEFT, most rentals are left-hand-drive US cars, and you must be 25+ with a valid licence."
  },
  {
    q: "How much cash should I bring to Nassau?",
    a: "The Bahamian dollar is pegged 1:1 to the US dollar and US dollars are accepted everywhere. Credit cards work at all resorts, restaurants and taxis (including Rox Taxi). Bring $50–$100 cash for straw-market shopping and small tips. ATMs are plentiful downtown, on Bay Street and at LPIA — but the smallest denomination at ATMs is often $20, so plan for that."
  },
  {
    q: "Is Nassau safe to travel to?",
    a: "The tourist zones — Paradise Island, Baha Mar, Cable Beach, Bay Street cruise-port area, Junkanoo Beach — are policed 24/7 and safe day and night. Avoid the Over-the-Hill neighbourhoods south of downtown after dark, don't leave valuables on the beach, and use licensed taxis at night. Rox Taxi drivers all wear a Bahamas Ministry of Tourism ID lanyard so you always know you're in a legal cab."
  },
  {
    q: "What's the tipping etiquette in Nassau?",
    a: "Most resort restaurants add a 15% service charge automatically — check the bill before tipping extra. Otherwise, tip your taxi driver 15–20%, bellhops $1–$2 per bag, tour guides $5–$10 per person for a half-day trip, and housekeeping $3–$5 per night. Tips in USD are welcome everywhere."
  },
  {
    q: "Do I need a visa to travel to Nassau, Bahamas?",
    a: "US, Canadian, UK, EU and most Caribbean citizens do NOT need a visa for stays under 90 days — just a passport valid for the length of stay and a return ticket. You'll fill out an electronic Bahamas Travel Health card online (free) before you fly. Everyone else should check the Bahamas immigration website for their nationality."
  },
];

export default function TravelToNassau() {
  const canonical = "https://roxtaxi.com/travel-to-nassau";
  return (
    <div data-testid="travel-guide-page" className="bg-[#FBF7EF] min-h-screen">
      <Seo
        title="Travel to Nassau, Bahamas — 2026 Guide | Airport, Hotels, Tours & Getting Around"
        description="Planning to travel to Nassau, Bahamas? Complete 2026 guide — LPIA airport arrival tips, best neighbourhoods (Atlantis, Baha Mar, Cable Beach, Paradise Island), taxi fares, car rental, cruise-port day plan, weather, currency & safety tips."
        canonical={canonical}
        keywords="travel to Nassau, travel to Nassau Bahamas, Nassau travel guide, visit Nassau, Nassau tourism, Nassau vacation, plan trip to Nassau, Nassau itinerary, Nassau things to do, how to get around Nassau, Nassau airport arrival, LPIA to Atlantis, LPIA to Baha Mar, Nassau cruise stopover, one day in Nassau, Nassau day trip, Nassau layover, Nassau weather, Nassau currency, Nassau safety, Nassau tipping, Nassau family vacation, Nassau honeymoon, Bahamas vacation planning, best time to visit Nassau, where to stay Nassau, Nassau neighborhoods, Nassau hotels guide, Paradise Island travel, Atlantis travel guide, Baha Mar travel guide"
        ogImage="https://roxtaxi.com/og-cover.jpg"
        jsonLd={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "TravelGuide",
              "@id": `${canonical}#guide`,
              "name": "Travel to Nassau, Bahamas — 2026 Guide",
              "url": canonical,
              "inLanguage": "en",
              "about": { "@type": "City", "name": "Nassau", "containedInPlace": { "@type": "Country", "name": "Bahamas" } },
              "author": { "@id": "https://roxtaxi.com/#business" },
              "publisher": { "@id": "https://roxtaxi.com/#business" },
              "datePublished": "2026-02-01",
              "dateModified": "2026-02-03",
              "image": "https://roxtaxi.com/og-cover.jpg"
            },
            {
              "@type": "FAQPage",
              "@id": `${canonical}#faq`,
              "mainEntity": FAQ.map(({ q, a }) => ({
                "@type": "Question",
                "name": q,
                "acceptedAnswer": { "@type": "Answer", "text": a }
              }))
            },
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://roxtaxi.com/" },
                { "@type": "ListItem", "position": 2, "name": "Travel to Nassau", "item": canonical }
              ]
            }
          ]
        }}
      />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#0B192C] via-[#0B3B5C] to-[#0B192C] text-white py-24 overflow-hidden">
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{ background: "radial-gradient(circle at 15% 20%, rgba(212,169,74,0.5), transparent 55%)" }}
        />
        <div className="relative max-w-6xl mx-auto px-6 lg:px-10">
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Complete 2026 Guide
          </div>
          <h1 className="serif text-5xl sm:text-6xl lg:text-7xl mt-3 leading-[0.95]">
            Travel to <em className="italic text-[#F5E1A4]">Nassau</em>,<br />Bahamas
          </h1>
          <p className="mt-6 text-white/85 max-w-2xl leading-relaxed text-lg">
            Everything a first-time visitor needs to know — from clearing LPIA
            arrivals to choosing between Atlantis and Baha Mar, finding the
            cheapest taxi from the cruise port, and squeezing the perfect
            8-hour stopover into your Nassau day.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/taxi"
              data-testid="hero-taxi-cta"
              className="inline-flex items-center gap-2 bg-[#D4A94A] hover:bg-[#E5BC5A] text-[#0B192C] font-bold text-sm tracking-wide px-5 py-3 rounded-full transition-colors"
            >
              Book Airport Taxi <ChevronRight className="w-4 h-4" />
            </Link>
            <Link
              to="/tours"
              data-testid="hero-tours-cta"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-sm tracking-wide px-5 py-3 rounded-full transition-colors"
            >
              Browse Tours <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Body — sticky TOC + prose */}
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-16 grid lg:grid-cols-[220px_1fr] gap-14">
        {/* Sticky table of contents (desktop only) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="text-xs tracking-[0.2em] uppercase text-[#94a3b8] font-bold mb-3">On this page</div>
            <nav className="space-y-2 text-sm">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block text-[#475569] hover:text-[#0B3B5C] hover:pl-2 transition-all border-l-2 border-transparent hover:border-[#D4A94A] pl-3"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <article className="prose prose-slate max-w-none">
          {/* 1 · Why Nassau */}
          <Section id="why-nassau" title="Why travel to Nassau">
            <p>
              Nassau sits on New Providence — the flagship island of a 700-island
              chain that fans out across 100,000 square miles of the western
              Atlantic. It's the political capital, the cruise capital
              (welcoming over 4 million passengers a year), and the launchpad
              for almost every Bahamas holiday: honeymoons at Atlantis Paradise
              Island, family beach breaks at Baha Mar, one-day cruise stopovers
              at Prince George Wharf, Junkanoo festivals in December, jet-ski
              runs from Cabbage Beach, and quiet snorkel trips to Rose Island
              reefs.
            </p>
            <p>
              English is the official language, the currency is pegged 1:1 to
              the US dollar, the flights from Miami are 45 minutes, and the
              average temperature never dips below 68°F. It's the closest, most
              hassle-free tropical escape from the US East Coast — which is
              exactly why 200,000+ vacationers pass through LPIA every month.
            </p>
          </Section>

          {/* 2 · Getting here */}
          <Section id="getting-here" title="Getting to Nassau">
            <div className="grid md:grid-cols-3 gap-5 not-prose my-6">
              <TravelCard Icon={Plane} title="By air (LPIA)" body="Lynden Pindling International (LPIA / NAS) sits on the western side of New Providence. Non-stop flights from Miami (45 min), Fort Lauderdale (50 min), Atlanta (2h), New York (3h), Toronto (3h), London (9h) and Frankfurt (10h)." />
              <TravelCard Icon={Ship} title="By cruise" body="Prince George Wharf downtown handles up to 6 mega-ships at once. Royal Caribbean, Carnival, MSC, Disney and NCL all stop here. It's a 10-minute walk to Bay Street and a $18 taxi to Atlantis." />
              <TravelCard Icon={Car} title="By private charter" body="Odyssey Aviation and Jet Aviation run private FBOs at LPIA with 24/7 US Customs preclearance. Also popular: 3-hour hop from Fort Lauderdale by Southern Air Charter (small aircraft, ~$400/pax)." />
            </div>
            <p>
              <strong>LPIA arrival tip:</strong> after immigration and baggage
              claim, follow the signs to <em>Ground Transportation</em>.
              Bahamian law forbids ride-share apps like Uber and Lyft on the
              island — every legal ride to your hotel is a licensed taxi.
              Fares are set by the government tariff, not the driver, and are
              posted on the wall of the taxi rank. See our full{" "}
              <Link to="/taxi" className="text-[#0B3B5C] font-semibold underline underline-offset-2 decoration-[#D4A94A]">
                Nassau airport taxi guide
              </Link>{" "}
              for the up-to-the-minute prices.
            </p>
          </Section>

          {/* 3 · Getting around */}
          <Section id="getting-around" title="Getting around Nassau">
            <p>
              Nassau is compact — you can drive from LPIA on the west to the
              east end of Paradise Island in about 40 minutes if traffic is
              light. Four ways locals and visitors get around:
            </p>
            <ul>
              <li>
                <strong>Licensed taxis</strong> — every hotel lobby, cruise
                port and airport has a taxi rank. Fares are fixed by
                government tariff, not metered. See our{" "}
                <Link to="/taxi" className="text-[#0B3B5C] font-semibold underline underline-offset-2 decoration-[#D4A94A]">
                  Nassau taxi service
                </Link>{" "}
                for a full price list.
              </li>
              <li>
                <strong>Rental cars</strong> — Bahamians drive on the LEFT
                using US-style left-hand-drive vehicles (adjust quickly!).
                Roads are paved and signposted; downtown parking is scarce but
                free at every hotel. Free delivery from{" "}
                <Link to="/rentals" className="text-[#0B3B5C] font-semibold underline underline-offset-2 decoration-[#D4A94A]">
                  Rox Car Rentals
                </Link>{" "}
                to LPIA and any Nassau or Paradise Island hotel.
              </li>
              <li>
                <strong>Walking</strong> — Bay Street, Junkanoo Beach and the
                straw market are all within 15 min of Prince George Wharf.
                Atlantis and Baha Mar are self-contained resort walkable.
              </li>
              <li>
                <strong>Jitney buses</strong> — the local $1.25 fixed-route
                buses. Slow, colourful, and only recommended if you're not on
                a schedule.
              </li>
            </ul>
          </Section>

          {/* 4 · Where to stay */}
          <Section id="where-to-stay" title="Where to stay in Nassau">
            <div className="grid md:grid-cols-2 gap-5 not-prose my-6">
              <StayCard title="Paradise Island (Atlantis)" body="The megaresort — Aquaventure water park, marine habitats, celebrity restaurants, casino. Best for families and honeymooners who don't want to leave the property." best="Families · Honeymooners" />
              <StayCard title="Cable Beach (Baha Mar)" body="4-mile beach strip anchored by SLS, Grand Hyatt and Rosewood. Golf course, ESPA spa, Jack Nicklaus signature course. Feels newer and less crowded than Atlantis." best="Couples · Golfers" />
              <StayCard title="Downtown Nassau" body="Boutique hotels near Bay Street. Best for cruise-line pre/post nights, budget travellers and history buffs wanting Fort Fincastle + Queen's Staircase within walking distance." best="Budget · Cruisers" />
              <StayCard title="Coral Harbour / Adelaide" body="Quiet residential south coast with vacation rentals and small boutique inns. Best for repeat visitors wanting local pace over resort buffets." best="Repeat visitors" />
            </div>
          </Section>

          {/* 5 · Things to do */}
          <Section id="things-to-do" title="Best things to do in Nassau">
            <p>
              A perfect Nassau week hits three categories: at least one beach
              day, one adventure experience, and one historic / cultural stop.
              Our{" "}
              <Link to="/tours" className="text-[#0B3B5C] font-semibold underline underline-offset-2 decoration-[#D4A94A]">
                Nassau tours page
              </Link>{" "}
              has bookable versions of everything below.
            </p>
            <ul>
              <li><strong>Blue Lagoon Island</strong> — 3 miles offshore, all-day beach, private cove, kayaks, snorkelling and (if you want) a swim with dolphins. Ferry from Paradise Island.</li>
              <li><strong>Atlantis Aquaventure day pass</strong> — 141-acre water park with 20 slides, a lazy river through shark tanks, and 11 pools. Available even if you're not a hotel guest.</li>
              <li><strong>Rose Island snorkel</strong> — smaller reefs, fewer crowds, perfect turquoise water. Half-day catamaran trips from downtown.</li>
              <li><strong>Cabbage Beach jet ski</strong> — 1-hour rides at Paradise Island's public beach.</li>
              <li><strong>ATV Tour of Nassau</strong> — 4-hour off-road route through fishing villages, historical forts and secret beaches. Includes lunch.</li>
              <li><strong>Junkanoo Party Bus</strong> — evening open-air bus tour with a live rake-and-scrape band; the most Bahamian night out you can book.</li>
              <li><strong>Queen's Staircase &amp; Fort Fincastle</strong> — 66 limestone steps carved by enslaved labourers in the 1790s. Free to visit, sobering to reflect on.</li>
              <li><strong>Straw Market on Bay Street</strong> — leather goods, handwoven bags, sarongs. Haggling expected — start at 60% of the sticker price.</li>
            </ul>
          </Section>

          {/* 6 · Travel tips */}
          <Section id="travel-tips" title="Nassau travel tips">
            <div className="not-prose grid md:grid-cols-2 gap-5 my-6">
              <TipCard Icon={Sun} title="Weather" body="Best months are December–April (75–82°F, low rainfall). Hurricane season is Jun–Nov but big storms are rare and always forecast 5+ days out. Water is 82°F year-round." />
              <TipCard Icon={DollarSign} title="Currency &amp; payments" body="Bahamian dollar is pegged 1:1 to USD. Cards accepted everywhere. Bring $50–$100 cash for straw markets and small tips. ATMs plentiful downtown and at LPIA." />
              <TipCard Icon={ShieldCheck} title="Safety" body="Tourist zones (Paradise Island, Baha Mar, Cable Beach, Bay Street, Junkanoo Beach) are safe day and night. Avoid Over-the-Hill after dark. Use licensed taxis — every Rox Taxi driver wears a Ministry of Tourism ID." />
              <TipCard Icon={Languages} title="Language" body="English is official. Bahamian Creole is spoken at home. Most Rox Taxi drivers speak English + French + Haitian Creole." />
              <TipCard Icon={Car} title="Driving" body="Drive on the LEFT. Left-hand-drive rentals with US-style dashboards. Rentals: 25+ only, valid licence required, $150 refundable deposit." />
              <TipCard Icon={Clock} title="Time zone" body="Eastern Time (ET), observes daylight saving. Same clock as New York and Miami — no jet lag." />
            </div>
          </Section>

          {/* 7 · Cruise stopover */}
          <Section id="cruise-day" title="Cruise stopover — the perfect 1-day Nassau itinerary">
            <p>
              If you're a cruise passenger with 6–8 hours between "all-aboard"
              times, don't waste them shopping on Bay Street. Here's a
              battle-tested day plan:
            </p>
            <ol>
              <li><strong>8:00 AM</strong> — Disembark at Prince George Wharf. Book Rox Taxi in advance so you skip the queue.</li>
              <li><strong>8:20 AM</strong> — Taxi to Cabbage Beach on Paradise Island (~$18 for two). Ocean-side lounger, walk to the far end for the emptiest sand.</li>
              <li><strong>10:00 AM</strong> — Jet ski or Blue Lagoon ferry (book in advance on our{" "}
                <Link to="/tours" className="text-[#0B3B5C] font-semibold underline underline-offset-2 decoration-[#D4A94A]">tours page</Link>).</li>
              <li><strong>1:00 PM</strong> — Lunch at The Poop Deck (local seafood, Bay Street) or Fish Fry at Arawak Cay (cheap and lively).</li>
              <li><strong>2:30 PM</strong> — Queen's Staircase → Fort Fincastle → straw market walk-through.</li>
              <li><strong>4:00 PM</strong> — Rum-cake tasting at Tortuga Rum Company, then Junkanoo Beach for a final swim.</li>
              <li><strong>5:00 PM</strong> — Rox Taxi back to Prince George Wharf. Board with 30 min to spare.</li>
            </ol>
          </Section>

          {/* 8 · FAQ */}
          <Section id="faq" title="FAQ — Travel to Nassau, Bahamas">
            <div className="not-prose space-y-4">
              {FAQ.map(({ q, a }, i) => (
                <details
                  key={i}
                  className="group rounded-2xl border border-[#E2E8F0] bg-white p-5 open:shadow-[0_8px_24px_rgba(11,25,44,0.08)] transition-shadow"
                >
                  <summary className="cursor-pointer font-semibold text-[#0B3B5C] flex items-start gap-3 list-none">
                    <ChevronRight className="w-4 h-4 mt-0.5 text-[#D4A94A] shrink-0 group-open:rotate-90 transition-transform" />
                    <span>{q}</span>
                  </summary>
                  <p className="mt-3 text-[#475569] leading-relaxed pl-7">{a}</p>
                </details>
              ))}
            </div>
          </Section>

          {/* Final CTA */}
          <div className="mt-14 rounded-3xl bg-gradient-to-br from-[#0B192C] to-[#0B3B5C] text-white p-8 md:p-12 shadow-[0_30px_80px_-30px_rgba(11,25,44,0.55)]">
            <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" /> Ready when you are
            </div>
            <h2 className="serif text-3xl md:text-4xl mt-3">Book your Nassau ride in 60 seconds.</h2>
            <p className="text-white/80 mt-3 max-w-xl">
              Licensed drivers, fixed Bahamian tariff, live GPS tracking, and
              a real human on WhatsApp if plans change mid-trip.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link
                to="/taxi"
                data-testid="footer-taxi-cta"
                className="inline-flex items-center gap-2 bg-[#D4A94A] hover:bg-[#E5BC5A] text-[#0B192C] font-bold text-sm px-5 py-3 rounded-full transition-colors"
              >
                Book Nassau Taxi <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                to="/tours"
                data-testid="footer-tours-cta"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-sm px-5 py-3 rounded-full transition-colors"
              >
                Browse Tours <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                to="/rentals"
                data-testid="footer-rentals-cta"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-sm px-5 py-3 rounded-full transition-colors"
              >
                Rent a Car <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

// ---- helpers ---------------------------------------------------------
function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 mb-14">
      <h2 className="serif text-3xl md:text-4xl text-[#0B3B5C] leading-tight mb-4">{title}</h2>
      <div className="text-[#334155] leading-relaxed [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:space-y-2 [&_ol]:space-y-2">
        {children}
      </div>
    </section>
  );
}

function TravelCard({ Icon, title, body }) {
  return (
    <div className="rounded-2xl bg-white border border-[#E2E8F0]/60 p-5 shadow-[0_4px_12px_rgba(11,25,44,0.05)]">
      <div className="w-10 h-10 rounded-full bg-[#D4A94A]/15 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-[#0B3B5C]" />
      </div>
      <div className="font-bold text-[#0B3B5C]">{title}</div>
      <p className="text-sm text-[#475569] mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function StayCard({ title, body, best }) {
  return (
    <div className="rounded-2xl bg-white border border-[#E2E8F0]/60 p-5 shadow-[0_4px_12px_rgba(11,25,44,0.05)]">
      <div className="font-bold text-[#0B3B5C] serif text-xl">{title}</div>
      <p className="text-sm text-[#475569] mt-2 leading-relaxed">{body}</p>
      <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-[#D4A94A]">
        <Users className="w-3 h-3" /> Best for {best}
      </div>
    </div>
  );
}

function TipCard({ Icon, title, body }) {
  return (
    <div className="rounded-2xl bg-white border border-[#E2E8F0]/60 p-5 shadow-[0_4px_12px_rgba(11,25,44,0.05)]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#0B3B5C]/8 flex items-center justify-center">
          <Icon className="w-4 h-4 text-[#0B3B5C]" />
        </div>
        <div className="font-bold text-[#0B3B5C]">{title}</div>
      </div>
      <p className="text-sm text-[#475569] mt-3 leading-relaxed">{body}</p>
    </div>
  );
}
