import AttractionLanding from "../../components/AttractionLanding";

const BAHA_MAR_CONFIG = {
  slug: "baha-mar",
  kicker: "Cable Beach mega-resort",
  name: "Baha Mar Resort",
  tagline: "$4.2 billion of Cable Beach beachfront — casino, Rosewood, Grand Hyatt, SLS, and a Jack Nicklaus signature golf course, all on one 1,000-acre property.",
  hero_image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1920&q=80&auto=format&fit=crop",
  description: [
    "Baha Mar is the Bahamas' newest luxury resort complex — 1,000 acres of Cable Beach beachfront housing three flagship hotels (Grand Hyatt, SLS, and the ultra-luxe Rosewood), the largest casino in the Caribbean, a Jack Nicklaus signature golf course, an ESPA spa, and 40+ restaurants and bars.",
    "Even if you're not staying overnight, Baha Mar is worth a visit for dinner at Katsuya, a casino night, or the SLS Fi'lia rooftop for sunset cocktails. Cable Beach itself is 3½ miles of powder-soft sand right outside the doors.",
    "LPIA airport is just 15 minutes east — one of the closest resort transfers in Nassau.",
  ],
  address: "Cable Beach, Nassau, The Bahamas",
  hours: [
    { day: "Resort access",  time: "24 / 7 (hotel guests)" },
    { day: "Casino",         time: "10:00 am – 4:00 am daily" },
    { day: "Restaurants",    time: "Varies — check each venue" },
  ],
  admission_note: "Non-guests welcome for the casino, restaurants, spa, and golf course — some venues require reservations.",
  external_url: "https://www.bahamar.com/",
  external_label: "Book at Baha Mar",
  taxi_route_ids: ["airport-bahamar", "bahamar-downtown", "port-bahamar", "bahamar-atlantis"],
  features: [
    { title: "Baha Mar Casino",       text: "Largest in the Caribbean — over 100 table games and 1,000 slots." },
    { title: "Rosewood Baha Mar",     text: "Five-star flagship with private beach villas and pool suites." },
    { title: "Royal Blue Golf",       text: "Jack Nicklaus signature 18-hole course — book tee times ahead." },
    { title: "40+ restaurants & bars", text: "From Katsuya to Costa to Fi'lia — day-visitors welcome." },
  ],
};

export default function BahaMar() {
  return <AttractionLanding config={BAHA_MAR_CONFIG} />;
}
