import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Facebook, Phone, MapPin, Waves, Car, ShipWheel, MapPinned, Home as HomeIcon, Search, Ticket, MessageCircle, Info, Heart, ChevronDown, User as UserIcon } from "lucide-react";
import { useAuth } from "../lib/auth";

const BOOK_OPTIONS = [
  { to: "/taxi", label: "Taxi & Transfers", sub: "Airport · City · Hourly", Icon: Car, color: "#E86A3C" },
  { to: "/tours", label: "Tours & Excursions", sub: "Blue Lagoon · Atlantis · more", Icon: ShipWheel, color: "#0B3B5C" },
  { to: "/rentals", label: "Car Rentals", sub: "Compact to Mini-Van", Icon: MapPinned, color: "#D4A94A" },
];
import { api } from "../lib/api";
import ChatWidget from "./ChatWidget";
import { WhatsAppIcon, TripAdvisorIcon } from "./BrandIcons";

const NAV = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/taxi", label: "Taxi", icon: Car },
  { to: "/tours", label: "Tours", icon: ShipWheel },
  { to: "/rentals", label: "Rentals", icon: MapPinned },
  { to: "/groups", label: "Groups", icon: Heart },
  { to: "/track", label: "Track", icon: Search },
  { to: "/about", label: "About", icon: Info },
  { to: "/contact", label: "Contact", icon: MessageCircle },
];

const NAV_DESKTOP = NAV.filter(n => n.label !== "About");

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [config, setConfig] = useState({ facebook_url: "https://www.facebook.com/roxtaxiservice/" });
  const bookRef = useRef(null);
  const { pathname } = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!bookOpen) return;
    const onDocClick = (e) => {
      if (bookRef.current && !bookRef.current.contains(e.target)) setBookOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setBookOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [bookOpen]);

  useEffect(() => setBookOpen(false), [pathname]);

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
            {config.logo_url ? (
              <img
                src={config.logo_url.startsWith("http") ? config.logo_url : `${process.env.REACT_APP_BACKEND_URL}${config.logo_url}`}
                alt="Rox Taxi Service and Tours"
                className="h-12 w-auto max-w-[180px] object-contain group-hover:scale-105 transition-transform"
              />
            ) : (
              <>
                <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-[#D4A94A] to-[#A88235] flex items-center justify-center text-white shadow-[0_8px_20px_rgba(212,169,74,0.4)] group-hover:rotate-6 transition-transform duration-300">
                  <Waves className="w-5 h-5" />
                  <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-[#E86A3C] ring-2 ring-white" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="serif text-xl text-[#0B3B5C] tracking-tight">Rox Taxi</span>
                  <span className="text-[10px] tracking-[0.25em] uppercase text-[#64748B]">Service &amp; Tours</span>
                </div>
              </>
            )}
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
          <div className="flex items-center gap-1.5">
            {/* Elegant social/contact chips — desktop */}
            <a
              href={`https://wa.me/${(config.whatsapp_number || "+12420000000").replace(/[^\d]/g, "")}`}
              target="_blank" rel="noreferrer"
              className="hidden sm:flex group relative w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 items-center justify-center hover:bg-[#25D366] hover:border-[#25D366] hover:scale-110 text-[#25D366] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(37,211,102,0.12)] hover:shadow-[0_10px_25px_rgba(37,211,102,0.4)]"
              data-testid="header-whatsapp"
              title="WhatsApp us"
            >
              <WhatsAppIcon className="w-[18px] h-[18px]" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] tracking-widest uppercase text-[#25D366] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-semibold">WhatsApp</span>
            </a>
            <a
              href={`tel:${(config.phone || "+12420000000").replace(/[^+\d]/g, "")}`}
              className="hidden sm:flex group relative w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 items-center justify-center hover:bg-[#0B3B5C] hover:border-[#0B3B5C] hover:scale-110 text-[#0B3B5C] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(11,59,92,0.12)] hover:shadow-[0_10px_25px_rgba(11,59,92,0.35)]"
              data-testid="header-phone"
              title="Call us"
            >
              <Phone className="w-[18px] h-[18px]" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] tracking-widest uppercase text-[#0B3B5C] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-semibold">Call</span>
            </a>
            <a
              href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"}
              target="_blank" rel="noreferrer"
              className="hidden sm:flex group relative w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 items-center justify-center hover:bg-[#1877F2] hover:border-[#1877F2] hover:scale-110 text-[#1877F2] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(24,119,242,0.12)] hover:shadow-[0_10px_25px_rgba(24,119,242,0.4)]"
              data-testid="header-facebook-link"
              title="Facebook"
            >
              <Facebook className="w-[18px] h-[18px]" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] tracking-widest uppercase text-[#1877F2] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-semibold">Facebook</span>
            </a>
            <a
              href={config.tripadvisor_url || "https://www.tripadvisor.com/Search?q=Rox+Taxi+Bahamas"}
              target="_blank" rel="noreferrer"
              className="hidden md:flex group relative w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 items-center justify-center hover:bg-[#00AF87] hover:border-[#00AF87] hover:scale-110 text-[#00AF87] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(0,175,135,0.12)] hover:shadow-[0_10px_25px_rgba(0,175,135,0.4)]"
              data-testid="header-tripadvisor"
              title="TripAdvisor"
            >
              <TripAdvisorIcon className="w-[22px] h-[22px]" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] tracking-widest uppercase text-[#00AF87] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-semibold">TripAdvisor</span>
            </a>
            {user ? (
              <Link
                to="/my-bookings"
                data-testid="header-account-link"
                title={user.name || user.email}
                className="hidden md:inline-flex group relative w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 items-center justify-center hover:bg-[#D4A94A] hover:border-[#D4A94A] hover:scale-110 text-[#D4A94A] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(212,169,74,0.12)] hover:shadow-[0_10px_25px_rgba(212,169,74,0.4)] overflow-hidden"
              >
                {user.picture ? (
                  <img src={user.picture} alt={user.name || "You"} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-[18px] h-[18px]" />
                )}
              </Link>
            ) : (
              <Link
                to="/login"
                data-testid="header-login-link"
                title="Sign in"
                className="hidden md:inline-flex group relative items-center gap-2 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 px-4 text-sm font-semibold text-[#0B3B5C] hover:bg-[#0B3B5C] hover:border-[#0B3B5C] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(11,59,92,0.08)] hover:shadow-[0_10px_25px_rgba(11,59,92,0.35)] whitespace-nowrap"
              >
                <UserIcon className="w-4 h-4" /> Sign in
              </Link>
            )}
            <div ref={bookRef} className="hidden md:block relative ml-1">
              <button
                type="button"
                onClick={() => setBookOpen((v) => !v)}
                data-testid="header-book-now-btn"
                aria-haspopup="menu"
                aria-expanded={bookOpen}
                className="btn-shine rounded-full bg-[#E86A3C] text-white pl-5 pr-4 py-2.5 text-sm font-semibold hover:bg-[#d55a30] active:scale-95 inline-flex items-center gap-1.5 shadow-[0_10px_25px_rgba(232,106,60,0.35)]"
              >
                Book Now
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${bookOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {bookOpen && (
                  <motion.div
                    key="book-menu"
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                    role="menu"
                    data-testid="header-book-menu"
                    className="absolute right-0 mt-3 w-[320px] rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 shadow-[0_25px_60px_rgba(11,25,44,0.18)] overflow-hidden"
                  >
                    <div className="px-5 py-3 border-b border-[#F1F5F9]">
                      <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-semibold">Choose a service</div>
                    </div>
                    <ul className="p-2">
                      {BOOK_OPTIONS.map((opt, i) => (
                        <motion.li
                          key={opt.to}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.04 + i * 0.05 }}
                        >
                          <Link
                            to={opt.to}
                            role="menuitem"
                            onClick={() => setBookOpen(false)}
                            data-testid={`book-menu-${opt.to.replace("/", "")}`}
                            className="group flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#FBF7EF] transition-colors"
                          >
                            <span
                              className="w-11 h-11 rounded-xl flex items-center justify-center text-white transition-transform group-hover:scale-110"
                              style={{ background: `linear-gradient(135deg, ${opt.color}, ${opt.color}cc)` }}
                            >
                              <opt.Icon className="w-5 h-5" />
                            </span>
                            <span className="flex-1">
                              <span className="block text-sm font-semibold text-[#0B3B5C]">{opt.label}</span>
                              <span className="block text-xs text-[#64748B]">{opt.sub}</span>
                            </span>
                            <ChevronDown className="w-4 h-4 -rotate-90 text-[#94a3b8] group-hover:text-[#0B3B5C] group-hover:translate-x-1 transition-all" />
                          </Link>
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
                  className="mt-6 grid grid-cols-2 gap-2"
                >
                  <Link
                    to="/my-bookings"
                    data-testid="mobile-my-bookings"
                    className="flex items-center gap-3 rounded-2xl bg-[#D4A94A]/10 border border-[#D4A94A]/20 text-[#D4A94A] px-4 py-3"
                  >
                    <Ticket className="w-4 h-4" /> <span className="font-semibold text-sm">My Bookings</span>
                  </Link>
                  <Link
                    to={user ? "/my-bookings" : "/login"}
                    data-testid="mobile-login-link"
                    className="flex items-center gap-3 rounded-2xl bg-[#0B3B5C]/5 border border-[#0B3B5C]/15 text-[#0B3B5C] px-4 py-3"
                  >
                    {user && user.picture ? (
                      <img src={user.picture} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <UserIcon className="w-4 h-4" />
                    )}
                    <span className="font-semibold text-sm truncate">{user ? (user.name?.split(" ")[0] || "Account") : "Sign in"}</span>
                  </Link>
                </motion.div>
              </nav>

              <div className="p-6 border-t border-[#F1F5F9] space-y-4">
                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-semibold mb-2 text-center" data-testid="mobile-book-now-label">Book Now</div>
                  <div className="grid grid-cols-1 gap-2">
                    {BOOK_OPTIONS.map((opt) => (
                      <Link
                        key={opt.to}
                        to={opt.to}
                        onClick={() => setOpen(false)}
                        data-testid={`mobile-book-${opt.to.replace("/", "")}`}
                        className="group flex items-center gap-3 rounded-2xl border border-[#EFE7D5] bg-white hover:bg-[#FBF7EF] transition-all px-4 py-3 hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(11,25,44,0.08)]"
                      >
                        <span
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                          style={{ background: `linear-gradient(135deg, ${opt.color}, ${opt.color}cc)` }}
                        >
                          <opt.Icon className="w-5 h-5" />
                        </span>
                        <span className="flex-1">
                          <span className="block text-sm font-semibold text-[#0B3B5C]">{opt.label}</span>
                          <span className="block text-[11px] text-[#64748B]">{opt.sub}</span>
                        </span>
                        <ChevronDown className="w-4 h-4 -rotate-90 text-[#94a3b8] group-hover:text-[#0B3B5C] group-hover:translate-x-1 transition-all" />
                      </Link>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-semibold mb-3 text-center">Reach us instantly</div>
                  <div className="grid grid-cols-4 gap-2">
                    <a
                      href={`https://wa.me/${(config.whatsapp_number || "+12420000000").replace(/[^\d]/g,"")}`}
                      target="_blank" rel="noreferrer"
                      data-testid="mobile-whatsapp"
                      className="group flex flex-col items-center gap-2 py-3 rounded-2xl border border-[#EFE7D5] bg-white hover:border-[#25D366] hover:bg-[#25D366] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(37,211,102,0.35)]"
                    >
                      <span className="w-11 h-11 rounded-full bg-[#25D366]/10 group-hover:bg-white/20 flex items-center justify-center text-[#25D366] group-hover:text-white transition-colors">
                        <WhatsAppIcon className="w-5 h-5" />
                      </span>
                      <span className="text-[10px] font-semibold text-[#0B3B5C] group-hover:text-white uppercase tracking-wider">WhatsApp</span>
                    </a>
                    <a
                      href={`tel:${(config.phone || "+12420000000").replace(/[^+\d]/g,"")}`}
                      data-testid="mobile-phone"
                      className="group flex flex-col items-center gap-2 py-3 rounded-2xl border border-[#EFE7D5] bg-white hover:border-[#D4A94A] hover:bg-[#D4A94A] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(212,169,74,0.35)]"
                    >
                      <span className="w-11 h-11 rounded-full bg-[#D4A94A]/10 group-hover:bg-white/20 flex items-center justify-center text-[#D4A94A] group-hover:text-white transition-colors">
                        <Phone className="w-5 h-5" />
                      </span>
                      <span className="text-[10px] font-semibold text-[#0B3B5C] group-hover:text-white uppercase tracking-wider">Call</span>
                    </a>
                    <a
                      href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"}
                      target="_blank" rel="noreferrer"
                      data-testid="mobile-facebook"
                      className="group flex flex-col items-center gap-2 py-3 rounded-2xl border border-[#EFE7D5] bg-white hover:border-[#1877F2] hover:bg-[#1877F2] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(24,119,242,0.35)]"
                    >
                      <span className="w-11 h-11 rounded-full bg-[#1877F2]/10 group-hover:bg-white/20 flex items-center justify-center text-[#1877F2] group-hover:text-white transition-colors">
                        <Facebook className="w-5 h-5" />
                      </span>
                      <span className="text-[10px] font-semibold text-[#0B3B5C] group-hover:text-white uppercase tracking-wider">Facebook</span>
                    </a>
                    <a
                      href={config.tripadvisor_url || "https://www.tripadvisor.com/Search?q=Rox+Taxi+Bahamas"}
                      target="_blank" rel="noreferrer"
                      data-testid="mobile-tripadvisor"
                      className="group flex flex-col items-center gap-2 py-3 rounded-2xl border border-[#EFE7D5] bg-white hover:border-[#00AF87] hover:bg-[#00AF87] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(0,175,135,0.35)]"
                    >
                      <span className="w-11 h-11 rounded-full bg-[#00AF87]/10 group-hover:bg-white/20 flex items-center justify-center text-[#00AF87] group-hover:text-white transition-colors">
                        <TripAdvisorIcon className="w-6 h-6" />
                      </span>
                      <span className="text-[10px] font-semibold text-[#0B3B5C] group-hover:text-white uppercase tracking-wider">TripAdvisor</span>
                    </a>
                  </div>
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
              <span className="serif text-xl text-white">Rox Taxi Service and Tours</span>
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
            <h4 className="text-xs tracking-[0.3em] uppercase text-white/50 mb-4">Follow us</h4>
            <div className="flex flex-wrap gap-2">
              <a href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"} target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-white/10 hover:bg-[#1877F2] hover:scale-110 flex items-center justify-center transition-all duration-300 hover:shadow-[0_10px_25px_rgba(24,119,242,0.5)]" data-testid="footer-facebook-link" title="Facebook"><Facebook className="w-5 h-5" /></a>
              <a href={`https://wa.me/${(config.whatsapp_number || "+12420000000").replace(/[^\d]/g,"")}`} target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-white/10 hover:bg-[#25D366] hover:scale-110 flex items-center justify-center transition-all duration-300 hover:shadow-[0_10px_25px_rgba(37,211,102,0.5)]" data-testid="footer-whatsapp" title="WhatsApp"><WhatsAppIcon className="w-5 h-5" /></a>
              <a href={config.tripadvisor_url || "https://www.tripadvisor.com/Search?q=Rox+Taxi+Bahamas"} target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-white/10 hover:bg-[#00AF87] hover:scale-110 flex items-center justify-center transition-all duration-300 hover:shadow-[0_10px_25px_rgba(0,175,135,0.5)]" data-testid="footer-tripadvisor" title="TripAdvisor"><TripAdvisorIcon className="w-6 h-6" /></a>
              <a href={`tel:${(config.phone || "+12420000000").replace(/[^+\d]/g,"")}`} className="w-11 h-11 rounded-full bg-white/10 hover:bg-[#D4A94A] hover:scale-110 flex items-center justify-center transition-all duration-300 hover:shadow-[0_10px_25px_rgba(212,169,74,0.5)]" data-testid="footer-phone" title="Call"><Phone className="w-5 h-5" /></a>
            </div>
            <p className="text-sm text-white/60 leading-relaxed mt-6">
              Credit Card, PayPal via Stripe, direct PayPal.me, and Zelle accepted.
            </p>
            <Link to="/admin/login" className="text-xs text-white/40 hover:text-[#D4A94A] mt-4 inline-block" data-testid="footer-admin-link">
              Admin
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10 py-6 text-center text-xs text-white/40">
          &copy; {new Date().getFullYear()} Rox Taxi Service and Tours Bahamas. All rights reserved.
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}
