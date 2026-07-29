import AttractionLanding from "../../components/AttractionLanding";

// Ardastra Gardens & Zoo — the Bahamas' only zoo, in the heart of Nassau.
// Content sourced from ardastra.com and verified in Feb 2026.
const ARDASTRA_CONFIG = {
  slug: "ardastra",
  kicker: "The Bahamas' only zoo",
  name: "Ardastra Gardens & Zoo",
  tagline: "Marching flamingoes, native wildlife, and 5 acres of tropical gardens right in the heart of Chippingham.",
  hero_image: "https://customer-assets-gfyr7b9c.emergentagent.net/job_bahamas-taxi-tours/artifacts/ouo8o6m9_47-bmot-nassau-5fb1775b59eaf-1500x643.jpg",
  description: [
    "Founded in 1937 and set on 5 acres of lush Bahamian gardens, Ardastra is the only zoo in the Bahamas — home to more than 300 mammals, birds, and reptiles including the West Indian flamingo (the national bird), Bahamian rock iguanas, capuchin monkeys, red-shouldered macaws, and lemurs.",
    "The signature attraction is the marching flamingoes — a decades-old tradition where the zoo's flamingo flock parades on cue three times a day. Kids can hand-feed lorikeets, meet the tortoises, and watch keepers care for over 100 species.",
    "Downtown Nassau is only 8 minutes away by taxi. LPIA airport is about 20 minutes. Perfect stop on a cruise day or your first afternoon after arriving.",
  ],
  address: "Chippingham Road, Nassau, The Bahamas",
  hours: [
    { day: "Monday – Saturday", time: "9:00 am – 5:00 pm" },
    { day: "Sunday",            time: "9:00 am – 4:30 pm" },
  ],
  marches: ["10:30 am", "2:15 pm", "4:15 pm"],
  admission_note: "Ticket prices and current opening days are set by Ardastra Gardens — please check their official site before you go.",
  external_url: "https://ardastra.com/",
  external_label: "Book tickets at Ardastra",
  taxi_route_ids: ["downtown-ardastra", "airport-ardastra"],
  features: [
    { title: "West Indian Flamingoes", text: "The national bird, on parade three times daily." },
    { title: "Bahamian Rock Iguanas", text: "Endangered locals you can meet up close." },
    { title: "Hand-feed lorikeets",    text: "Bring the kids — it's the highlight of the visit." },
    { title: "Tropical botanical gardens", text: "5 acres of native flowers, palms, and orchids." },
  ],
};

export default function Ardastra() {
  return <AttractionLanding config={ARDASTRA_CONFIG} />;
}
