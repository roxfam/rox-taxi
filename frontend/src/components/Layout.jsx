import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Menu, X, Facebook, Phone, MapPin, Waves } from "lucide-react";
import { api } from "../lib/api";
import ChatWidget from "./ChatWidget";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/taxi", label: "Taxi" },
  { to: "/tours", label: "Tours" },
  { to: "/rentals", label: "Car Rentals" },
  { to: "/track", label: "Track Booking" },
  { to: "/contact", label: "Contact" },
];

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState({ facebook_url: "https://www.facebook.com/roxtaxiservice/" });
  const { pathname } = useLocation();

  useEffect(() => {
    api.get("/site-config").then((r) => setConfig(r.data)).catch(() => {});
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6]">
      <header className="sticky top-0 z-50 glass" data-testid="site-header">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 flex items-center justify-between h-20">
          <Link to="/" className="flex items-center gap-3" data-testid="brand-logo">
            <div className="w-10 h-10 rounded-full bg-[#00B4D8] flex items-center justify-center text-white">
              <Waves className="w-5 h-5" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="serif text-xl text-[#1A365D] tracking-tight">Rox Taxi</span>
              <span className="text-[10px] tracking-[0.3em] uppercase text-[#64748B]">Bahamas</span>
            </div>
          </Link>
          <nav className="hidden lg:flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-full text-sm transition-colors duration-200 ${
                    isActive ? "bg-[#1A365D] text-white" : "text-[#1A365D] hover:bg-white/60"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <a
              href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"}
              target="_blank"
              rel="noreferrer"
              className="ml-2 w-9 h-9 rounded-full border border-[#1A365D]/20 flex items-center justify-center hover:bg-[#1A365D] hover:text-white transition-colors"
              data-testid="header-facebook-link"
              title="Facebook"
            >
              <Facebook className="w-4 h-4" />
            </a>
            <Link
              to="/taxi"
              data-testid="header-book-now-btn"
              className="ml-3 btn-shine rounded-full bg-[#FF7F50] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#ff6a34] active:scale-95 transition-colors"
            >
              Book Now
            </Link>
          </nav>
          <button
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden p-2 rounded-full border border-[#1A365D]/20"
            data-testid="mobile-menu-toggle"
            aria-label="Menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {open && (
          <div className="lg:hidden border-t border-white/40 bg-white/80 backdrop-blur-xl">
            <div className="px-6 py-4 flex flex-col gap-2">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  data-testid={`mobile-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                  className={({ isActive }) =>
                    `py-2 px-3 rounded-lg text-sm ${isActive ? "bg-[#1A365D] text-white" : "text-[#1A365D]"}`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
              <Link
                to="/taxi"
                data-testid="mobile-book-now-btn"
                className="mt-2 rounded-full bg-[#FF7F50] text-white px-5 py-2.5 text-sm font-semibold text-center"
              >
                Book Now
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-[#0B192C] text-white/80 mt-24" data-testid="site-footer">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 grid md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-full bg-[#00B4D8] flex items-center justify-center">
                <Waves className="w-4 h-4 text-white" />
              </div>
              <span className="serif text-xl text-white">Rox Taxi & Tours</span>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              Your trusted ride and adventure partner across Nassau, Paradise Island, and the Out Islands of The Bahamas.
            </p>
          </div>
          <div>
            <h4 className="text-xs tracking-[0.3em] uppercase text-white/50 mb-4">Services</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/taxi" className="hover:text-[#00B4D8]">Airport & City Taxi</Link></li>
              <li><Link to="/tours" className="hover:text-[#00B4D8]">Tours & Excursions</Link></li>
              <li><Link to="/rentals" className="hover:text-[#00B4D8]">Car Rentals</Link></li>
              <li><Link to="/track" className="hover:text-[#00B4D8]">Track a Booking</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs tracking-[0.3em] uppercase text-white/50 mb-4">Contact</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2"><Phone className="w-4 h-4 mt-0.5 text-[#00B4D8]" /> +1 (242) 000-0000</li>
              <li className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-[#00B4D8]" /> Nassau, New Providence, Bahamas</li>
              <li>
                <a
                  href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="footer-facebook-link"
                  className="inline-flex items-center gap-2 hover:text-[#00B4D8]"
                >
                  <Facebook className="w-4 h-4" /> facebook.com/roxtaxiservice
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs tracking-[0.3em] uppercase text-white/50 mb-4">Payments</h4>
            <p className="text-sm text-white/60 leading-relaxed">
              Credit Card, PayPal via Stripe, and Zelle accepted. All online payments are secured.
            </p>
            <Link to="/admin/login" className="text-xs text-white/40 hover:text-[#00B4D8] mt-4 inline-block" data-testid="footer-admin-link">
              Admin
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10 py-6 text-center text-xs text-white/40">
          &copy; {new Date().getFullYear()} Rox Taxi & Tours Bahamas. All rights reserved.
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}
