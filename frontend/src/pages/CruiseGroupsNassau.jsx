import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ship, Users, DollarSign, MapPin, Clock, ChevronRight, Sparkles, ShieldCheck, PhoneCall, Camera } from "lucide-react";
import Seo from "../components/Seo";
import { api, BACKEND_URL } from "../lib/api";

/**
 * CruiseGroupsNassau — long-form landing page targeting the "nassau cruise
 * excursions group discount" cluster. Complements the "Groups of 6+ save 10%"
 * hero on /tours by giving cruise directors and group organizers everything
 * they need to book confidently: math, logistics, port pickup, itineraries.
 *
 * Word count ~850 — comfortably past Google's thin-content bar. Includes a
 * FAQ block with schema.org FAQPage JSON-LD so it earns the "People also ask"
 * carousel for group-related cruise queries.
 */

const FAQ = [
  {
    q: "How does the 10% group discount work?",
    a: "Any per-person Nassau tour (like our Nassau City Tour at $45/adult) automatically discounts 10% off the passenger subtotal the moment you have 6 or more paying passengers in the same booking. Adults and kids ages 4-12 count as paying; toddlers under 3 ride free and don't count toward the 6-pax minimum. The discount is applied before the 3% processing fee, and it stacks with our summer SUMMER10 promo when eligible."
  },
  {
    q: "Can you pick our group up right at Prince George Wharf?",
    a: "Yes — this is the single most common pickup for group tours. We meet you at the arrivals plaza with a Rox Taxi & Tours sign held up above head height, guide you the 4-minute walk to our staging area at Rawson Square (the Junkanoo bus lot), and load you into private vans. Total time from ship gangway to first tour stop: 12 minutes. For groups over 20 we recommend booking the van transfer 48 hours in advance so we can pre-position drivers."
  },
  {
    q: "How large a group can you handle?",
    a: "Up to 60 passengers on a single itinerary — that's 4 vans of 15 each, running in convoy. We've done cruise-charter groups of 120 (2 back-to-back convoys) and family reunions of 40. If your group is over 60 or you need a dedicated tour leader speaking a specific language, WhatsApp us with your ship name and date and we'll build a custom quote in under an hour."
  },
  {
    q: "What's included in the Nassau City Tour for cruise groups?",
    a: "Our signature 2.5-hour City Tour hits everything a first-timer wants to see: House of Assembly, Bahamas Rum Cake Factory (samples included), Atlantis Paradise Island photo stop, Paradise Island drive-through, Montague Beach + Fort Montague, Queen's Staircase, Graycliff estate (wine cellar, chocolate, cigar, moonshine and tea factories), Fish Fry at Arawak Cay for optional lunch, drive-bys of the American Embassy, Governor's House, Fort Fincastle, the Water Tower and Fort Charlotte. Ends wherever the group chooses — most cruise groups end at Junkanoo Beach for a swim, then straight back to the wharf."
  },
  {
    q: "How much time before all-aboard should we book?",
    a: "For a 2.5-hour City Tour, we recommend booking a slot at least 4 hours before your ship's all-aboard time. That gives you a full tour plus a 60-minute buffer for stops, photos, and any straw-market shopping. We track live cruise-line schedules and ALWAYS have you back at the wharf 45 minutes before all-aboard — no exceptions. Missed-ship insurance is included."
  },
  {
    q: "Do you handle the cruise excursion desk or do we book direct?",
    a: "Direct booking is 30-40% cheaper than through your cruise line's excursion desk, and quality is identical (same vans, same routes, same drivers — the cruise lines use us as their sub-contractor). Book at roxtaxi.com/tours, WhatsApp +1 (242) 432-2587, or email roxfam2509@gmail.com. Group coordinators get a dedicated point of contact from confirmation through disembark."
  }
];

const SIZES = [
  { size: 6,  price: 270, save: 27, per: 43.5, blurb: "Perfect for a family or friend group" },
  { size: 10, price: 450, save: 45, per: 40.5, blurb: "Great for a small extended-family reunion" },
  { size: 20, price: 900, save: 90, per: 40.5, blurb: "Sweet spot for cruise groups & bachelorettes" },
  { size: 40, price: 1800, save: 180, per: 40.5, blurb: "Charter-sized — 2 vans, 1 lead driver" },
];

export default function CruiseGroupsNassau() {
  const canonical = "https://roxtaxi.com/cruise-groups-nassau";
  const [recentPhotos, setRecentPhotos] = useState([]);

  // Pull the freshest 5 group-relevant shots from the public gallery feed.
  // The endpoint groups approved customer submissions under "guests" (sorted
  // newest first by approved_at); we prefer those, then top up with "tours"
  // catalog imagery so the strip never looks empty on a fresh install. The
  // very newest guest photo (approved within 30 days) gets a "New" badge.
  useEffect(() => {
    let alive = true;
    api.get("/gallery").then(({ data }) => {
      if (!alive || !Array.isArray(data)) return;
      const guests = data.filter((p) => p.category === "guests");
      const tours = data.filter((p) => p.category === "tours");
      const picked = [...guests, ...tours].slice(0, 5).map((p, idx) => {
        // Flag the top guest photo as "New" iff approved in the last 30 days
        if (idx !== 0 || p.category !== "guests" || !p.approved_at) return p;
        const ageDays = (Date.now() - new Date(p.approved_at).getTime()) / 86_400_000;
        return ageDays <= 30 ? { ...p, isFeaturedNew: true } : p;
      });
      setRecentPhotos(picked);
    }).catch(() => setRecentPhotos([]));
    return () => { alive = false; };
  }, []);

  const resolveUrl = (u) => (u && u.startsWith("http") ? u : `${BACKEND_URL}${u}`);

  return (
    <div data-testid="cruise-groups-page" className="bg-[#FBF7EF] min-h-screen">
      <Seo
        title="Nassau Cruise Excursions for Groups | Group Discount & Cruise-Port Pickups — Rox Taxi"
        description="Book Nassau cruise excursions for your group and save 10% automatically with 6+ paying passengers. Direct pickup at Prince George Wharf, licensed drivers, Nassau City Tour + Atlantis + Blue Lagoon. Groups up to 60."
        canonical={canonical}
        keywords="nassau cruise excursions, nassau cruise group discount, group tours nassau bahamas, nassau shore excursions group, cruise ship group tour nassau, prince george wharf pickup, cruise stopover nassau groups, family reunion nassau tours, bachelorette nassau group tour, cruise charter nassau, group city tour nassau, nassau tour operator groups, cheap cruise excursions nassau, direct book nassau excursions, cruise group transportation nassau"
        ogImage="https://roxtaxi.com/og-cover.jpg"
        jsonLd={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Service",
              "@id": `${canonical}#service`,
              "name": "Nassau Cruise Excursions for Groups (6+ pax)",
              "url": canonical,
              "provider": { "@id": "https://roxtaxi.com/#business" },
              "areaServed": { "@type": "City", "name": "Nassau" },
              "audience": { "@type": "Audience", "audienceType": "Cruise passengers, groups of 6 or more" },
              "offers": { "@type": "AggregateOffer", "lowPrice": "40.5", "highPrice": "45", "priceCurrency": "USD", "eligibleQuantity": { "@type": "QuantitativeValue", "minValue": 6 } }
            },
            {
              "@type": "FAQPage",
              "@id": `${canonical}#faq`,
              "mainEntity": FAQ.map(({ q, a }) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } }))
            },
            {
              "@type": "BreadcrumbList",
              "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://roxtaxi.com/" },
                { "@type": "ListItem", "position": 2, "name": "Cruise Groups Nassau", "item": canonical }
              ]
            }
          ]
        }}
      />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#0B192C] via-[#0B3B5C] to-[#0B192C] text-white py-24 overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: "radial-gradient(circle at 20% 30%, rgba(212,169,74,0.5), transparent 60%)" }} />
        <div className="relative max-w-6xl mx-auto px-6 lg:px-10">
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A] flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> For Groups &amp; Coordinators
          </div>
          <h1 className="serif text-5xl sm:text-6xl lg:text-7xl mt-3 leading-[0.95]">
            Groups <br /><em className="italic text-[#F5E1A4]">save 10% automatically</em>.
          </h1>
          <p className="mt-6 text-white/85 max-w-2xl leading-relaxed text-lg">
            Book any per-person Nassau tour with 6 or more paying passengers and we'll knock 10% off at checkout — no code, no haggle, no "we'll get back to you." Pickup direct at Prince George Wharf, drop-off wherever you like, licensed local drivers, missed-ship insurance included.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/tours" className="inline-flex items-center gap-2 bg-[#D4A94A] hover:bg-[#E5BC5A] text-[#0B192C] font-black text-sm px-5 py-3 rounded-full transition-colors" data-testid="cruise-hero-cta-book">
              Book my group <ChevronRight className="w-4 h-4" />
            </Link>
            <a href="https://wa.me/12424322587?text=Hi%20Rox%2C%20we%27re%20a%20group%20of%20" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-sm px-5 py-3 rounded-full transition-colors">
              WhatsApp the team
            </a>
          </div>
        </div>
      </section>

      {/* Group discount math — the visual "what will I actually save" table */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-16">
        <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-[#D4A94A] font-bold">
          <DollarSign className="w-3.5 h-3.5" /> Real numbers, no fine print
        </div>
        <h2 className="serif text-3xl md:text-4xl text-[#0B3B5C] mt-2">What your group will actually save</h2>
        <p className="text-[#475569] mt-3 max-w-2xl">
          Every column below is a real quote for the Nassau City Tour at $45 per adult, with the 10% group discount already applied.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {SIZES.map((s) => (
            <div key={s.size} className="rounded-2xl bg-white border border-[#E2E8F0] p-5 shadow-[0_4px_16px_rgba(11,25,44,0.06)]" data-testid={`group-price-card-${s.size}`}>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#94a3b8] font-bold">Group of</div>
              <div className="serif text-4xl text-[#0B3B5C] mt-1">{s.size === 40 ? "40+" : s.size}</div>
              <div className="mt-4 text-sm text-[#475569] leading-snug">{s.blurb}</div>
              <div className="mt-4 pt-4 border-t border-[#E2E8F0] space-y-1 text-sm">
                <div className="flex justify-between text-[#64748B]"><span>List price</span><span className="mono">${s.price}</span></div>
                <div className="flex justify-between text-[#059669] font-semibold"><span>Group save</span><span className="mono">−${s.save}</span></div>
                <div className="flex justify-between text-[#0B3B5C] font-black pt-1 border-t border-[#F1F5F9] mt-1"><span>Per person</span><span className="mono">${s.per}</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent group tours — social proof strip pulling the 5 freshest
          approved group shots from /api/gallery */}
      {recentPhotos.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-4" data-testid="recent-group-tours">
          <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-[#D4A94A] font-bold">
            <Camera className="w-3.5 h-3.5" /> Recent group tours
          </div>
          <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
            <h2 className="serif text-3xl md:text-4xl text-[#0B3B5C]">Straight from the last few van loads.</h2>
            <Link
              to="/gallery"
              className="text-sm font-bold text-[#0B3B5C] hover:text-[#D4A94A] transition-colors inline-flex items-center gap-1"
              data-testid="recent-group-tours-see-all"
            >
              See full gallery <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {recentPhotos.map((p, i) => (
              <div
                key={p.url + i}
                data-testid={`recent-group-photo-${i}`}
                className={`relative aspect-square rounded-2xl overflow-hidden border bg-white shadow-[0_6px_18px_rgba(11,25,44,0.08)] group ${p.isFeaturedNew ? "border-[#D4A94A] ring-2 ring-[#D4A94A]/40" : "border-[#E2E8F0]"}`}
              >
                {p.isFeaturedNew && (
                  <div
                    className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-[#D4A94A] text-[#0B192C] px-2.5 py-1 text-[10px] font-black tracking-[0.15em] uppercase shadow-lg"
                    data-testid="recent-group-photo-new-badge"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0B192C] animate-pulse" />
                    New
                  </div>
                )}
                <img
                  src={resolveUrl(p.url)}
                  alt={p.title || "Recent group tour"}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-3 text-white translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <div className="text-[9px] uppercase tracking-[0.25em] text-[#D4A94A]">{p.submitter ? "Guest" : p.category}</div>
                  <div className="text-xs font-semibold leading-tight line-clamp-2">{p.title}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cruise-port logistics */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 grid md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-[#D4A94A] font-bold"><MapPin className="w-3.5 h-3.5" /> Prince George Wharf</div>
            <h2 className="serif text-3xl md:text-4xl text-[#0B3B5C] mt-2 leading-tight">Ship gangway to first stop in 12 minutes.</h2>
          </div>
          <div className="md:col-span-2 text-[#475569] leading-relaxed space-y-4">
            <p>
              Nassau's cruise port handles 6+ mega-ships a day and getting a large group off the wharf and into vans is the single biggest source of shore-excursion stress. Here's how we make it painless:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Meet-and-greet at arrivals plaza.</strong> We hold a Rox Taxi &amp; Tours sign above head-height in the fenced pickup area 20 minutes before your gangway opens.</li>
              <li><strong>Rawson Square staging.</strong> 4-minute walk from the gangway to a shaded staging area with restrooms and water bottles.</li>
              <li><strong>Convoy loading.</strong> For groups over 15, we stage 2-4 vans nose-to-tail and load all pax in under 6 minutes.</li>
              <li><strong>Group WhatsApp thread.</strong> On booking, your group organizer joins a WhatsApp group with the lead driver so any last-minute change (2 more pax, allergy, delayed disembark) is handled in real-time.</li>
              <li><strong>Return no-drama.</strong> We always have you back at the gangway 45 minutes before your ship's posted all-aboard — no exceptions. Missed-ship insurance included in every group booking.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Why direct-book */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-16">
        <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-[#D4A94A] font-bold"><Sparkles className="w-3.5 h-3.5" /> Why groups book direct</div>
        <h2 className="serif text-3xl md:text-4xl text-[#0B3B5C] mt-2">Same vans. Same drivers. 30-40% cheaper.</h2>
        <p className="text-[#475569] mt-3 max-w-2xl leading-relaxed">
          Cruise-line shore-excursion desks mark up local operators like us by 30-40%. When your group of 20 pays $80 a head through the ship, we're getting paid $50. Book direct at $40.50/head after the group discount and everybody wins — you keep more of your holiday budget, and the money stays in the Bahamian economy where the drivers actually live.
        </p>
        <div className="grid md:grid-cols-3 gap-5 mt-8">
          <ReasonCard Icon={ShieldCheck} title="Licensed & insured" body="Every driver holds a current Bahamas Ministry of Tourism licence + $1M passenger liability. The cruise-desk marks up the exact same drivers." />
          <ReasonCard Icon={Clock} title="Missed-ship guarantee" body="If we're late back and you miss your ship, we cover the taxi to the next port. Included at no extra cost." />
          <ReasonCard Icon={PhoneCall} title="Real WhatsApp support" body="Direct line to a real Bahamian human 24/7 — not a call-centre in Miami reading a script." />
        </div>
      </section>

      {/* Group booking process */}
      <section className="bg-[#FBF7EF] py-16">
        <div className="max-w-6xl mx-auto px-6 lg:px-10">
          <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-[#D4A94A] font-bold"><Users className="w-3.5 h-3.5" /> Booking process</div>
          <h2 className="serif text-3xl md:text-4xl text-[#0B3B5C] mt-2">Book your group in 4 clicks.</h2>
          <ol className="mt-6 space-y-4 text-[#475569] leading-relaxed max-w-3xl">
            <Step n={1} title="Pick a tour">Head to <Link className="text-[#0B3B5C] font-semibold underline decoration-[#D4A94A]" to="/tours">the tours page</Link> and tap "Nassau City Tour" (or whichever tour fits your itinerary).</Step>
            <Step n={2} title="Enter your group size">Use the adult / child / toddler picker — the 10% discount auto-applies at 6+ paying passengers.</Step>
            <Step n={3} title="Pick pickup + date">Enter your ship's port and arrival time (or hotel for non-cruise groups). We calculate all-aboard buffer automatically.</Step>
            <Step n={4} title="Pay">Credit card, PayPal or Zelle. You get an email confirmation with driver name + phone + WhatsApp group invite within 2 minutes.</Step>
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 py-16">
        <div className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase text-[#D4A94A] font-bold">FAQ</div>
        <h2 className="serif text-3xl md:text-4xl text-[#0B3B5C] mt-2 mb-6">Group booking questions, answered.</h2>
        <div className="space-y-3">
          {FAQ.map(({ q, a }, i) => (
            <details key={i} className="group rounded-2xl border border-[#E2E8F0] bg-white p-5 open:shadow-[0_8px_24px_rgba(11,25,44,0.08)] transition-shadow">
              <summary className="cursor-pointer font-semibold text-[#0B3B5C] flex items-start gap-3 list-none">
                <ChevronRight className="w-4 h-4 mt-0.5 text-[#D4A94A] shrink-0 group-open:rotate-90 transition-transform" />
                <span>{q}</span>
              </summary>
              <p className="mt-3 text-[#475569] leading-relaxed pl-7">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-6xl mx-auto px-6 lg:px-10 pb-16">
        <div className="rounded-3xl bg-gradient-to-br from-[#0B192C] to-[#0B3B5C] text-white p-8 md:p-12 shadow-[0_30px_80px_-30px_rgba(11,25,44,0.55)]">
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Ready when you are</div>
          <h2 className="serif text-3xl md:text-4xl mt-3">Lock in your group's Nassau day.</h2>
          <p className="text-white/80 mt-3 max-w-xl">Book online in 60 seconds or WhatsApp us with your ship name + arrival date and we'll build the itinerary.</p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link to="/tours" className="inline-flex items-center gap-2 bg-[#D4A94A] hover:bg-[#E5BC5A] text-[#0B192C] font-bold text-sm px-5 py-3 rounded-full transition-colors">Book my group <ChevronRight className="w-4 h-4" /></Link>
            <a href="https://wa.me/12424322587?text=Hi%20Rox%2C%20we%27re%20a%20group%20of%20" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-sm px-5 py-3 rounded-full transition-colors">WhatsApp the team</a>
            <Link to="/travel-to-nassau" className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-sm px-5 py-3 rounded-full transition-colors">Nassau travel guide</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReasonCard({ Icon, title, body }) {
  return (
    <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5 shadow-[0_4px_12px_rgba(11,25,44,0.05)]">
      <div className="w-10 h-10 rounded-full bg-[#D4A94A]/15 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-[#0B3B5C]" />
      </div>
      <div className="font-bold text-[#0B3B5C]">{title}</div>
      <p className="text-sm text-[#475569] mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <li className="flex gap-4">
      <div className="w-10 h-10 rounded-full bg-[#D4A94A] text-[#0B192C] font-black flex items-center justify-center shrink-0">{n}</div>
      <div className="flex-1">
        <div className="font-bold text-[#0B3B5C]">{title}</div>
        <div className="text-sm mt-1">{children}</div>
      </div>
    </li>
  );
}
