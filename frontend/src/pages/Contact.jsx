import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Facebook, Phone, Mail, MapPin } from "lucide-react";

export default function Contact() {
  const [cfg, setCfg] = useState({ facebook_url: "https://www.facebook.com/roxtaxiservice/" });
  useEffect(() => {
    api.get("/site-config").then((r) => setCfg(r.data)).catch(() => {});
  }, []);
  return (
    <div data-testid="contact-page" className="max-w-5xl mx-auto px-6 lg:px-10 py-24">
      <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Get in touch</span>
      <h1 className="serif text-5xl sm:text-6xl text-[#1A365D] mt-3">Say hello.</h1>
      <p className="mt-5 max-w-2xl text-[#64748B] leading-relaxed">
        Have a special group booking, a corporate charter, or a question about your trip? Reach us on Facebook, WhatsApp,
        email or phone — we typically respond in under an hour, 24/7.
      </p>

      <div className="mt-12 grid sm:grid-cols-2 gap-5">
        <a href={cfg.facebook_url} target="_blank" rel="noreferrer" data-testid="contact-facebook" className="rounded-2xl border border-[#E2E8F0] bg-white p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,180,216,0.12)] transition-transform">
          <div className="w-11 h-11 rounded-xl bg-[#1877F2]/10 flex items-center justify-center text-[#1877F2]"><Facebook className="w-5 h-5" /></div>
          <div className="serif text-2xl text-[#1A365D] mt-4">Facebook</div>
          <div className="text-sm text-[#64748B] mt-1">facebook.com/roxtaxiservice</div>
        </a>
        <a href="tel:+12420000000" data-testid="contact-phone" className="rounded-2xl border border-[#E2E8F0] bg-white p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,180,216,0.12)] transition-transform">
          <div className="w-11 h-11 rounded-xl bg-[#00B4D8]/10 flex items-center justify-center text-[#00B4D8]"><Phone className="w-5 h-5" /></div>
          <div className="serif text-2xl text-[#1A365D] mt-4">Call</div>
          <div className="text-sm text-[#64748B] mt-1">+1 (242) 000-0000</div>
        </a>
        <a href="mailto:hello@roxtaxi.com" data-testid="contact-email" className="rounded-2xl border border-[#E2E8F0] bg-white p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,180,216,0.12)] transition-transform">
          <div className="w-11 h-11 rounded-xl bg-[#FF7F50]/10 flex items-center justify-center text-[#FF7F50]"><Mail className="w-5 h-5" /></div>
          <div className="serif text-2xl text-[#1A365D] mt-4">Email</div>
          <div className="text-sm text-[#64748B] mt-1">hello@roxtaxi.com</div>
        </a>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <div className="w-11 h-11 rounded-xl bg-[#1A365D]/10 flex items-center justify-center text-[#1A365D]"><MapPin className="w-5 h-5" /></div>
          <div className="serif text-2xl text-[#1A365D] mt-4">Base of operations</div>
          <div className="text-sm text-[#64748B] mt-1">Nassau, New Providence, The Bahamas</div>
        </div>
      </div>
    </div>
  );
}
