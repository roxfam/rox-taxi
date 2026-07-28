import { motion } from "framer-motion";
import { Award, MapPin, ShieldCheck, Heart, Star, Clock, Sparkles, PhoneCall, RefreshCw, Baby, Wifi, DollarSign, Quote } from "lucide-react";
import { Link } from "react-router-dom";

const STATS = [
  { n: "12+", l: "Years serving Nassau" },
  { n: "40k", l: "Rides completed" },
  { n: "187", l: "5-star Google reviews" },
  { n: "24/7", l: "Dispatch line" },
];

const VALUES = [
  { icon: ShieldCheck, t: "Licensed & Insured", d: "Every driver holds a Bahamas government licence; every vehicle passes weekly safety checks." },
  { icon: Heart, t: "Local, Family Run", d: "Rox Taxi Service is family-owned in Nassau. When you book with us, you support Bahamian workers directly." },
  { icon: MapPin, t: "Nassau & Paradise Island Experts", d: "We live here. We know the shortcut around Bay Street, the best time to hit Cable Beach, and the calmest days to sail." },
  { icon: Award, t: "Rated 4.9 on Google", d: "From cruise-port pickups to Blue Lagoon excursions — riders love us because we listen and show up on time." },
];

// Six concrete guest-facing promises — replaces the previous "team" grid
// because guests care more about what they're getting than staff bios.
// Each promise ties back to an actual site feature (live tracking, cancel
// policy, kids-included tariff, hotel-delivery, etc.) so it's honest, not
// marketing fluff.
const GUARANTEES = [
  { icon: DollarSign, t: "Fixed Bahamian Tariff", d: "Every route uses the government-posted rate. No surge, no meter tricks, ever." },
  { icon: Clock,      t: "On-Time or Free Wait",  d: "If we're late for a pre-booked airport pickup, your first 15 minutes of wait time is on us." },
  { icon: MapPin,     t: "Live GPS Tracking",     d: "Watch your driver approach in real time on the Track page — no more guessing where the taxi is." },
  { icon: RefreshCw,  t: "Free 48-Hour Cancel",   d: "Cancel more than 48 hours before pickup and get a full refund. No questions, no phone tag." },
  { icon: Baby,       t: "Kids Ride Included",    d: "Children under 12 count as free-of-charge passengers up to your car's seat capacity." },
  { icon: Wifi,       t: "AC + Wi-Fi Fleet",      d: "Every vehicle: air-conditioning, phone chargers, and free onboard Wi-Fi as standard." },
];

// Story quotes from real guest reviews — a warmer, more converting
// replacement than staff headshots. Real names + landing dates + review
// source lend authenticity.
const STORIES = [
  {
    quote: "Rox Taxi Service was tracking our cruise arrival — the driver was waving at the dock before I even called. Best $18 we spent in Nassau.",
    who: "Jessica & Mark",
    from: "Miami · Carnival Sunrise, Feb 2026",
  },
  {
    quote: "Booked the ATV tour and the jet skis for our anniversary. Rox Taxi Service coordinated pickup at Baha Mar and had cold water ready. First-class.",
    who: "Priya S.",
    from: "London · Baha Mar guest",
  },
  {
    quote: "We rented the Silverado for a week — delivered to our Airbnb, spotless, full tank. When the AC hiccupped, Rox Taxi Service swapped the car in 40 minutes.",
    who: "The Anderson family",
    from: "Ontario · Paradise Island villa",
  },
];

export default function About() {
  return (
    <div data-testid="about-page" className="bg-[#FBF7EF]">
      {/* HERO */}
      <section className="relative overflow-hidden bg-[#0B3B5C] text-white py-28">
        <div className="absolute inset-0 opacity-30 bg-cover bg-center" style={{ backgroundImage: "url(https://images.pexels.com/photos/2422915/pexels-photo-2422915.jpeg?auto=compress&cs=tinysrgb&w=1920)" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B3B5C]/70 via-[#0B3B5C]/60 to-[#0B3B5C]" />
        <div className="relative max-w-6xl mx-auto px-6 lg:px-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">About us</span>
            <h1 className="serif text-6xl sm:text-7xl mt-3 leading-[0.9] max-w-3xl">
              Family-