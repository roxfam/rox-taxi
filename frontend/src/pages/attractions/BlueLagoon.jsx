import AttractionLanding from "../../components/AttractionLanding";

const BLUE_LAGOON_CONFIG = {
  slug: "blue-lagoon",
  kicker: "Ferry-only island escape",
  name: "Blue Lagoon Island",
  tagline: "A 250-acre private island three miles off Paradise Island — swim with dolphins, hammocks in the coconut grove, and one of the calmest beaches in the Bahamas.",
  hero_image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80&auto=format&fit=crop",
  description: [
    "Blue Lagoon (aka Salt Cay) is a coral-fringed private island reachable only by a 30-minute catamaran ferry from Paradise Landing next to Atlantis. Once ashore you get an unlimited-beach day pass — palm-lined coves, calm turquoise water, hammocks strung between palms, kayaks, and paddleboards.",
    "Signature add-ons include Dolphin Encounter (waist-deep swim), Dolphin Swim (open-water swim with dolphins), sea-lion encounters, and stingray splash. Lunch buffet + open bar is often included with the day pass.",
    "We drop you at Paradise Landing (10 min from downtown, 20 min from LPIA) with time to spare for your ferry. Return transfers land you back around 4-5 pm.",
  ],
  address: "Blue Lagoon Island · Ferry from Paradise Landing, Paradise Island",
  hours: [
    { day: "Ferry departures", time: "9:00 am – 10:15 am daily" },
    { day: "Island access",    time: "9:30 am – 4:30 pm" },
    { day: "Return ferry",     time: "3:30 pm & 4:30 pm" },
  ],
  admission_note: "Day passes must be booked on Blue Lagoon Island's site the day before — cruise-week Saturdays fill up fastest.",
  external_url: "https://www.bluelagoonisland.com/",
  external_label: "Book day-pass at Blue Lagoon",
  taxi_route_ids: ["airport-paradise", "port-paradise", "downtown-paradise"],
  features: [
    { title: "Dolphin Encounter",    text: "Waist-deep swim with rescue dolphins — kids love it." },
    { title: "Unlimited beach access", text: "Kayaks, floats, hammocks, and a beach volleyball court included." },
    { title: "Sea-lion encounter",   text: "Meet, kiss, and pose with playful California sea lions." },
    { title: "Ferry from Paradise Landing", text: "30-minute catamaran ride each way — we'll get you to the dock." },
  ],
};

export default function BlueLagoon() {
  return <AttractionLanding config={BLUE_LAGOON_CONFIG} />;
}
