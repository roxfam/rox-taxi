import Seo from "../components/Seo";

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Car, MapPinned, KeyRound, ArrowRight, Search } from "lucide-react";

const OPTIONS = [
  { to: "/taxi?quote=1", icon: Car, title: "Taxi transfer", text: "Airport, cruise port, hotel and island rides." },
  { to: "/tours?quote=1", icon: MapPinned, title: "Tour or beach day", text: "Excursions, Cable Beach days and island adventures." },
  { to: "/rentals?quote=1", icon: KeyRound, title: "Car rental", text: "Explore Nassau at your own pace." },
];

export default function QuoteStart() {
  const [code, setCode] = useState("");
  const nav = useNavigate();
  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-10 py-20" data-testid="quote-start-page">
      <Seo
        title="Free Nassau Taxi, Tour & Car Rental Quote | Rox Taxi Bahamas"
        description="Get a free, itemised quote for Nassau taxi transfers, Bahamas tours and car rentals. Download or print it as a PDF, valid for 48 hours, and book with one click."
        canonical="https://roxtaxi.com/quote"
        keywords="Nassau taxi quote, Bahamas taxi price, LPIA airport taxi cost, Nassau tour price, Nassau car rental quote"
      />
      <div className="text-[10px] tracking-[0.35em] uppercase font-bold text-[#A88235]">Free · no booking · valid 48 hours</div>
      <h1 className="serif text-5xl sm:text-6xl text-[#0B3B5C] mt-3 leading-[0.95]">Get a <em className="italic text-[#D4A94A]">quote</em>.</h1>
      <p className="mt-4 text-[#64748B] max-w-2xl">Pick a service and fill in your trip details exactly as you would for a booking. You'll get a professional, itemised quote you can download as a PDF or print. Nothing is booked or charged until you press <b>Book this quote</b>.</p>
      <div className="mt-10 grid md:grid-cols-3 gap-5">
        {OPTIONS.map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} data-testid={`quote-start-${title.split(" ")[0].toLowerCase()}`}
            className="group rounded-3xl border border-[#EFE7D5] bg-white p-7 hover:-translate-y-1 hover:shadow-xl transition-transform">
            <div className="w-12 h-12 rounded-2xl bg-[#0B3B5C] text-[#D4A94A] flex items-center justify-center"><Icon className="w-6 h-6" /></div>
            <div className="serif text-2xl text-[#0B3B5C] mt-5">{title}</div>
            <p className="text-sm text-[#64748B] mt-1">{text}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#E86A3C]">Start quote <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
          </Link>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) nav(`/quote/${code.trim().toUpperCase()}`); }} className="mt-12 flex flex-wrap items-center gap-3 rounded-2xl bg-[#FBF7EF] border border-[#EFE7D5] p-4" data-testid="quote-lookup-form">
        <Search className="w-4 h-4 text-[#A88235]" />
        <span className="text-sm text-[#0B3B5C] font-semibold">Already have a quote?</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Q-XXXXXX" className="mono flex-1 min-w-[140px] rounded-lg border border-[#EFE7D5] bg-white px-3 py-2 text-sm" data-testid="quote-lookup-input" />
        <button className="rounded-full bg-[#0B3B5C] text-white px-5 py-2 text-sm font-semibold hover:bg-[#0B192C] transition-colors" data-testid="quote-lookup-btn">Open</button>
      </form>
    </div>
  );
}
