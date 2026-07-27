import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Facebook, Phone, MapPin, Waves, Car, ShipWheel, MapPinned, Home as HomeIcon, Search, Ticket, MessageCircle } from "lucide-react";
import { api } from "../lib/api";
import ChatWidget from "./ChatWidget";

const NAV = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/taxi", label: "Taxi", icon: Car },
  { to: "/tours", label: "Tours", icon: ShipWheel },
  { to: "/rentals", label: "Rentals", icon: MapPinned },
  { to: "/track", label: "Track", icon: Search },
  { to: "/contact", label: "Contact", icon: MessageCircle },
];

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [config, setConfig] = useState({ facebook_url: "https://www.facebook.com/roxtaxiservice/" });
  const { pathname } = useLocation();

  useEffect(() => {
    api.get("/site-config").then((r) => setConfig(r.data)).catch(() => {});
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF7EF]">
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "glass shadow-[0_4px_20px_rgba(11,25,44,0.06)]" : "bg-transparent"}`}
        data-testid="site-header"
      >
        <div className="max-w-7xl mx-auto px-5 lg:px-10 flex items-center justify-between h-20">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-3 group" data-testid="brand-logo">
            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-[#D4A94A] to-[#A88235] flex items-center justify-center text-white shadow-[0_8px_20px_rgba(212,169,74,0.4)] group-hover:rotate-6 transition-transform duration-300">
              <Waves className="w-5 h-5" />
              <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-[#E86A3C] ring-2 ring-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="serif text-xl text-[#0B3B5C] tracking-tight">Rox Taxi</span>
              <span className="text-[10px] tracking-[0.3em] uppercase text-[#64748B]">Nassau · Paradise Is.</span>
            </div>
          </Link>

          {/* Desktop nav — pill with sliding indicator */}
          <nav className="hidden lg:flex items-center gap-1 rounded-full bg-white/60 backdrop-blur-md border border-white/70 p-1.5 shadow-[0_10px_30px_rgba(11,25,44,0.05)]">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={`nav-${n.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `relative px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                    isActive ? "text-white" : "text-[#0B3B5C] hover:text-[#D4A94A]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-active-pill"
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-[#0B3B5C] to-[#0B192C] shadow-[0_6px_16px_rgba(11,25,44,0.25)]"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative flex items-center gap-1.5">{n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <a
              href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex w-10 h-10 rounded-full bg-white/60 border border-white/70 items-center justify-center hover:bg-[#0B3B5C] hover:text-white text-[#0B3B5C] transition-colors"
              data-testid="header-facebook-link"
              title="Facebook"
            >
              <Facebook className="w-4 h-4" />
            </a>
            <Link
              to="/taxi"
              data-testid="header-book-now-btn"
              className="hidden md:inline-flex btn-shine rounded-full bg-[#E86A3C] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#d55a30] active:scale-95 items-center gap-1.5 shadow-[0_10px_25px_rgba(232,106,60,0.35)]"
            >
              Book Now
            </Link>

            {/* Modern animated hamburger */}
            <button
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden relative w-11 h-11 rounded-full bg-white/70 border border-white/80 shadow-[0_6px_20px_rgba(11,25,44,0.08)] flex items-center justify-center hover:bg-white active:scale-95 transition-transform"
              data-testid="mobile-menu-toggle"
              aria-label="Menu"
              aria-expanded={open}
            >
              <span className="sr-only">Toggle menu</span>
              <span className="relative w-5 h-5">
                <span
                  className={`absolute left-0 top-1/2 h-[2px] w-5 bg-[#0B3B5C] rounded-full transition-all duration-300 ${
                    open ? "rotate-45" : "-translate-y-1.5"
                  }`}
                />
                <span
                  className={`absolute left-0 top-1/2 h-[2px] w-5 bg-[#0B3B5C] rounded-full transition-all duration-300 ${
                    open ? "opacity-0 scale-x-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute left-0 top-1/2 h-[2px] w-5 bg-[#0B3B5C] rounded-full transition-all duration-300 ${
                    open ? "-rotate-45" : "translate-y-1.5"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile slide-in drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-[#0B192C]/60 backdrop-blur-sm lg:hidden"
              data-testid="mobile-menu-backdrop"
            />
            <motion.aside
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed top-0 right-0 bottom-0 w-[88vw] max-w-[380px] z-[70] bg-white shadow-[-30px_0_60px_rgba(11,25,44,0.15)] lg:hidden flex flex-col"
              data-testid="mobile-menu-drawer"
            >
              <div className="p-6 flex items-center justify-between border-b border-[#F1F5F9]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#D4A94A] to-[#A88235] flex items-center justify-center text-white">
                    <Waves className="w-4 h-4" />
                  </div>
                  <div className="leading-none">
                    <div className="serif text-lg text-[#0B3B5C]">Rox Taxi</div>
                    <div className="text-[10px] tracking-[0.3em] uppercase text-[#64748B]">Nassau · PI</div>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-9 h-9 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-center"
                  data-testid="mobile-menu-close"
                >
                  <X className="w-4 h-4 text-[#0B3B5C]" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-4">
                <ul className="flex flex-col gap-1.5">
                  {NAV.map((n, idx) => (
                    <motion.li
                      key={n.to}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + idx * 0.05 }}
                    >
                      <NavLink
                        to={n.to}
                        end={n.to === "/"}
                        data-testid={`mobile-nav-${n.label.toLowerCase()}`}
                        className={({ isActive }) =>
                          `flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-colors ${
                            isActive
                              ? "bg-gradient-to-br from-[#0B3B5C] to-[#0B192C] text-white shadow-[0_10px_25px_rgba(11,25,44,0.15)]"
                              : "text-[#0B3B5C] hover:bg-[#F1F5F9]"
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? "bg-white/15" : "bg-[#F1F5F9]"}`}>
                              <n.icon className="w-4 h-4" />
                            </span>
                            <span className="font-semibold">{n.label}</span>
                            {isActive && <span className="ml-auto text-xs opacity-70">Now</span>}
                          </>
                        )}
                      </NavLink>
                    </motion.li>
                  ))}
                </ul>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="mt-6"
                >
                  <Link
                    to="/my-bookings"
                    data-testid="mobile-my-bookings"
                    className="flex items-center gap-3 rounded-2xl bg-[#D4A94A]/10 border border-[#D4A94A]/20 text-[#D4A94A] px-4 py-3"
                  >
                    <Ticket className="w-4 h-4" /> <span className="font-semibold text-sm">My Bookings</span>
                  </Link>
                </motion.div>
              </nav>

              <div className="p-6 border-t border-[#F1F5F9] space-y-3">
                <Link
                  to="/taxi"
                  data-testid="mobile-book-now-btn"
                  className="btn-shine block text-center rounded-full bg-[#E86A3C] text-white px-5 py-3.5 text-sm font-semibold hover:bg-[#d55a30] shadow-[0_10px_25px_rgba(232,106,60,0.35)]"
                >
                  Book Now
                </Link>
                <div className="flex gap-2">
                  <a href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 rounded-full border border-[#E2E8F0] py-2.5 text-sm hover:border-[#1877F2] hover:text-[#1877F2]">
                    <Facebook className="w-4 h-4" /> Facebook
                  </a>
                  <a href="tel:+12420000000" className="flex-1 flex items-center justify-center gap-2 rounded-full border border-[#E2E8F0] py-2.5 text-sm hover:border-[#D4A94A] hover:text-[#D4A94A]">
                    <Phone className="w-4 h-4" /> Call
                  </a>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1">{children}</main>

      <footer className="bg-[#0B192C] text-white/80 mt-24" data-testid="site-footer">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 grid md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#D4A94A] to-[#A88235] flex items-center justify-center">
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
              <li><Link to="/taxi" className="hover:text-[#D4A94A]">Airport & City Taxi</Link></li>
              <li><Link to="/tours" className="hover:text-[#D4A94A]">Tours & Excursions</Link></li>
              <li><Link to="/rentals" className="hover:text-[#D4A94A]">Car Rentals</Link></li>
              <li><Link to="/track" className="hover:text-[#D4A94A]">Track a Booking</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs tracking-[0.3em] uppercase text-white/50 mb-4">Contact</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2"><Phone className="w-4 h-4 mt-0.5 text-[#D4A94A]" /> +1 (242) 000-0000</li>
              <li className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-[#D4A94A]" /> Nassau, New Providence, Bahamas</li>
              <li>
                <a href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"} target="_blank" rel="noreferrer" data-testid="footer-facebook-link" className="inline-flex items-center gap-2 hover:text-[#D4A94A]">
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
            <Link to="/admin/login" className="text-xs text-white/40 hover:text-[#D4A94A] mt-4 inline-block" data-testid="footer-admin-link">
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
