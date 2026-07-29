import AttractionLanding from "../../components/AttractionLanding";

const ATLANTIS_CONFIG = {
  slug: "atlantis",
  kicker: "Paradise Island icon",
  name: "Atlantis Paradise Island",
  tagline: "The Bahamas' legendary mega-resort — waterpark, aquarium, casino, and 11 pools spread across Paradise Island.",
  hero_image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/BHA_Nassau%2C_Paradise_Island%2C_Atlantis_Bridge_001.jpg/1920px-BHA_Nassau%2C_Paradise_Island%2C_Atlantis_Bridge_001.jpg",
  description: [
    "Atlantis is the Bahamas' most iconic resort — 141 acres of ocean-themed excess on Paradise Island. Beyond hotel guests, day-passes let you access Aquaventure Waterpark (141 acres of slides, rapids, and river rides), Marine Habitat (50,000+ sea creatures across 11 lagoons), Dolphin Cay, and the casino.",
    "Paradise Island connects to Nassau via the toll bridge from downtown ($1 bridge toll included in every Rox taxi fare). LPIA airport is a straight 20-minute shot; from the cruise port it's 10 minutes.",
    "Whether you're on a full resort vacation or a cruise day-pass, we'll have you at the marina entrance in one ride.",
  ],
  address: "1 Casino Drive, Paradise Island, Bahamas",
  hours: [
    { day: "Aquaventure Waterpark", time: "10:00 am – 6:00 pm daily" },
    { day: "Marine Habitat",         time: "10:00 am – 6:00 pm daily" },
    { day: "Casino",                 time: "24 / 7" },
  ],
  admission_note: "Day-passes vary by season and require advance booking on Atlantis's site — no walk-up sales.",
  external_url: "https://www.atlantisbahamas.com/",
  external_label: "Book day-pass at Atlantis",
  taxi_route_ids: ["airport-paradise", "port-paradise", "downtown-paradise", "cablebeach-atlantis"],
  features: [
    { title: "Aquaventure Waterpark", text: "141 acres of slides, a mile-long river ride, and the famous Leap of Faith." },
    { title: "Marine Habitat",         text: "50,000+ sea creatures across 11 lagoons and 8 million gallons of saltwater." },
    { title: "Dolphin Cay",            text: "Meet-and-swim programs with rescue dolphins and sea lions." },
    { title: "The Cove & Reef beaches",text: "Two of Paradise Island's finest stretches — day-pass access included." },
  ],
};

export default function Atlantis() {
  return <AttractionLanding config={ATLANTIS_CONFIG} />;
}
