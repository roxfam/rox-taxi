import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Facebook, Phone, MapPin, Car, ShipWheel, MapPinned, Home as HomeIcon, Search, Ticket, MessageCircle, Info, Heart, ChevronDown, User as UserIcon, Images, Users } from "lucide-react";
import { useAuth } from "../lib/auth";

const BOOK_OPTIONS = [
  { to: "/taxi", label: "Taxi & Transfers", sub: "Airport · City · Hourly", Icon: Car, color: "#E86A3C" },
  { to: "/tours", label: "Tours & Excursions", sub: "Blue Lagoon · Atlantis · more", Icon: ShipWheel, color: "#0B3B5C" },
  { to: "/rentals", label: "Car Rentals", sub: "Compact to Luxury Vehicle", Icon: MapPinned, color: "#D4A94A" },
];
import { api } from "../lib/api";
import ChatWidget from "./ChatWidget";
import LanguageSwitcher from "./LanguageSwitcher";
import LiveStatsBadge from "./LiveStatsBadge";
import { WhatsAppIcon, TripAdvisorIcon } from "./BrandIcons";

const NAV = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/taxi", label: "Taxi", icon: Car },
  { to: "/tours", label: "Tours", icon: ShipWheel },
  { to: "/rentals", label: "Rentals", icon: MapPinned },
  { to: "/fleet", label: "Fleet", icon: Users },
  { to: "/gallery", label: "Gallery", icon: Images },
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
        className={`sticky top-0 z-[80] transition-all duration-300 ${scrolled ? "glass shadow-[0_4px_20px_rgba(11,25,44,0.06)]" : "bg-transparent"}`}
        data-testid="site-header"
      >
        <div className="max-w-7xl mx-auto px-5 lg:px-10 flex items-center justify-between h-24">
          {/* Brand — official gold-R monogram on light glass header */}
          <Link to="/" className="flex items-center gap-3 sm:gap-4 group shrink-0" data-testid="brand-logo">
            <span className="relative shrink-0">
              <span className="absolute -inset-1 rounded-full bg-gradient-to-br from-[#D4A94A]/40 via-transparent to-[#E86A3C]/25 blur-xl opacity-70 group-hover:opacity-100 transition-opacity duration-500" />
              <img
                src="/logo-gold.webp"
                alt="Rox Taxi Service & Tours"
                width={92} height={92}
                className="relative h-20 lg:h-[92px] w-auto max-w-[100px] lg:max-w-[120px] object-contain group-hover:scale-[1.06] transition-transform duration-500 drop-shadow-[0_6px_14px_rgba(212,169,74,0.35)]"
                data-testid="brand-logo-img"
              />
            </span>
            <div className="hidden sm:flex flex-col leading-[0.95] whitespace-nowrap" data-testid="brand-name">
              <span
                className="serif text-[22px] xl:text-[26px] font-black tracking-tight leading-[0.9] bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(255,255,255,0.65)]"
                style={{ backgroundImage: "linear-gradient(135deg, #0B3B5C 0%, #123f66 40%, #A88235 82%, #D4A94A 100%)" }}
              >
                Rox Taxi <em className="italic font-bold" style={{ color: "#D4A94A" }}>Service</em>
              </span>
              <span className="inline-flex items-center gap-2 mt-1.5">
                <span className="w-8 h-[1px] bg-gradient-to-r from-transparent via-[#D4A94A] to-[#D4A94A]" />
                <span className="serif italic text-lg xl:text-xl tracking-[0.15em] font-bold text-[#D4A94A]">&amp; Tours</span>
              </span>
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
          <div className="flex items-center gap-1.5">
            <LiveStatsBadge />
            {/* Elegant social/contact chips — desktop */}
            <a
              href={`https://wa.me/${(config.whatsapp_number || "+12420000000").replace(/[^\d]/g, "")}`}
              target="_blank" rel="noreferrer"
              className="hidden sm:flex group relative w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 items-center justify-center hover:bg-[#25D366] hover:border-[#25D366] hover:scale-110 text-[#25D366] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(37,211,102,0.12)] hover:shadow-[0_10px_25px_rgba(37,211,102,0.4)]"
              data-testid="header-whatsapp"
              title="WhatsApp us"
            >
              <WhatsAppIcon className="w-[18px] h-[18px]" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs tracking-widest uppercase text-[#25D366] opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-black scale-90 group-hover:scale-100">WhatsApp</span>
            </a>
            <a
              href={`tel:${(config.phone || "+12420000000").replace(/[^+\d]/g, "")}`}
              className="hidden sm:flex group relative w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 items-center justify-center hover:bg-[#0B3B5C] hover:border-[#0B3B5C] hover:scale-110 text-[#0B3B5C] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(11,59,92,0.12)] hover:shadow-[0_10px_25px_rgba(11,59,92,0.35)]"
              data-testid="header-phone"
              title="Call us"
            >
              <Phone className="w-[18px] h-[18px]" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs tracking-widest uppercase text-[#0B3B5C] opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-black scale-90 group-hover:scale-100">Call</span>
            </a>
            <a
              href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"}
              target="_blank" rel="noreferrer"
              className="hidden sm:flex group relative w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 items-center justify-center hover:bg-[#1877F2] hover:border-[#1877F2] hover:scale-110 text-[#1877F2] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(24,119,242,0.12)] hover:shadow-[0_10px_25px_rgba(24,119,242,0.4)]"
              data-testid="header-facebook-link"
              title="Facebook"
            >
              <Facebook className="w-[18px] h-[18px]" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs tracking-widest uppercase text-[#1877F2] opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-black scale-90 group-hover:scale-100">Facebook</span>
            </a>
            <a
              href={config.tripadvisor_url || "https://www.tripadvisor.com/Search?q=Rox+Taxi+Bahamas"}
              target="_blank" rel="noreferrer"
              className="hidden md:flex group relative w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 items-center justify-center hover:bg-[#00AF87] hover:border-[#00AF87] hover:scale-110 text-[#00AF87] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(0,175,135,0.12)] hover:shadow-[0_10px_25px_rgba(0,175,135,0.4)]"
              data-testid="header-tripadvisor"
              title="TripAdvisor"
            >
              <TripAdvisorIcon className="w-[22px] h-[22px]" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs tracking-widest uppercase text-[#00AF87] opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap font-black scale-90 group-hover:scale-100">TripAdvisor</span>
            </a>
            <LanguageSwitcher />
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
              className="fixed inset-0 z-[95] bg-[#0B192C]/60 backdrop-blur-sm lg:hidden"
              data-testid="mobile-menu-backdrop"
            />
            <motion.aside
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed top-0 right-0 bottom-0 w-[88vw] max-w-[380px] z-[96] bg-white shadow-[-30px_0_60px_rgba(11,25,44,0.15)] lg:hidden flex flex-col"
              data-testid="mobile-menu-drawer"
            >
              <div className="p-6 flex items-center justify-between border-b border-[#F1F5F9]">
                <div className="flex items-center gap-3">
                  <span className="relative">
                    <span className="absolute -inset-1 rounded-full bg-gradient-to-br from-[#D4A94A]/40 via-transparent to-[#E86A3C]/25 blur-xl" />
                    <img
                      src="/logo-gold.webp"
                      alt="Rox Taxi Service & Tours"
                      width={56} height={56}
                      className="relative h-14 w-auto max-w-[64px] object-contain drop-shadow-[0_4px_10px_rgba(212,169,74,0.35)]"
                    />
                  </span>
                  <div className="leading-[0.95]">
                    <div
                      className="serif text-[19px] font-black tracking-tight leading-[0.9] bg-clip-text text-transparent"
                      style={{ backgroundImage: "linear-gradient(135deg, #0B3B5C 0%, #123f66 40%, #A88235 82%, #D4A94A 100%)" }}
                      data-testid="mobile-drawer-brand"
                    >
                      Rox Taxi <em className="italic font-bold" style={{ color: "#D4A94A" }}>Service</em>
                    </div>
                    <div className="inline-flex items-center gap-1.5 mt-1.5">
                      <span className="w-6 h-[1px] bg-gradient-to-r from-transparent via-[#D4A94A] to-[#D4A94A]" />
                      <span className="serif italic text-base tracking-[0.12em] font-bold text-[#D4A94A]">&amp; Tours</span>
                    </div>
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
                <LanguageSwitcher variant="mobile" />
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

      <footer className="relative bg-[#0B192C] text-white/80 mt-32 overflow-hidden" data-testid="site-footer">
        {/* Elegant top accent */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D4A94A]/60 to-transparent" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#D4A94A]/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#E86A3C]/8 blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-20 pb-10">
          {/* Wordmark row */}
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-8 pb-14 border-b border-white/10">
            <div className="max-w-xl">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-[1px] bg-[#D4A94A]" />
                <span className="text-[10px] tracking-[0.35em] uppercase text-[#D4A94A] font-bold">Est. Bahamas</span>
              </div>
              <img
                src="/logo-white.webp"
                alt="Rox Taxi Service & Tours"
                width={280} height={128}
                className="h-32 w-auto max-w-[280px] object-contain drop-shadow-[0_10px_30px_rgba(212,169,74,0.25)]"
                data-testid="footer-logo-img"
              />
              <p className="serif italic text-white/55 mt-6 text-base leading-relaxed max-w-md">
                Your trusted ride and adventure partner across Nassau, Paradise Island, and the Out Islands of The Bahamas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5" data-testid="footer-socials">
              <a href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"} target="_blank" rel="noreferrer" title="Facebook" data-testid="footer-facebook-link" className="group relative w-12 h-12 rounded-full bg-white/[0.06] border border-white/10 hover:border-[#1877F2]/60 hover:bg-[#1877F2] hover:scale-110 flex items-center justify-center transition-all duration-300 hover:shadow-[0_15px_30px_rgba(24,119,242,0.5)]">
                <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)" }} />
                <Facebook className="relative w-[18px] h-[18px]" />
              </a>
              {config.google_business_url && (
                <a href={config.google_business_url} target="_blank" rel="noreferrer" title="Rox Taxi on Google" data-testid="footer-google-link" className="group relative w-12 h-12 rounded-full bg-white/[0.06] border border-white/10 hover:border-[#4285F4]/60 hover:bg-white hover:scale-110 flex items-center justify-center transition-all duration-300 hover:shadow-[0_15px_30px_rgba(66,133,244,0.45)]">
                  <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 60%)" }} />
                  <svg viewBox="0 0 24 24" className="relative w-[18px] h-[18px]" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09A6.99 6.99 0 0 1 5.5 12c0-.73.12-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.44 1.18 4.93l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                  </svg>
                </a>
              )}
              <a href={`https://wa.me/${(config.whatsapp_number || "+12420000000").replace(/[^\d]/g,"")}`} target="_blank" rel="noreferrer" title="WhatsApp" data-testid="footer-whatsapp" className="group relative w-12 h-12 rounded-full bg-white/[0.06] border border-white/10 hover:border-[#25D366]/60 hover:bg-[#25D366] hover:scale-110 flex items-center justify-center transition-all duration-300 hover:shadow-[0_15px_30px_rgba(37,211,102,0.5)]">
                <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)" }} />
                <WhatsAppIcon className="relative w-[18px] h-[18px]" />
              </a>
              <a href={config.tripadvisor_url || "https://www.tripadvisor.com/Search?q=Rox+Taxi+Bahamas"} target="_blank" rel="noreferrer" title="TripAdvisor" data-testid="footer-tripadvisor" className="group relative w-12 h-12 rounded-full bg-white/[0.06] border border-white/10 hover:border-[#00AF87]/60 hover:bg-[#00AF87] hover:scale-110 flex items-center justify-center transition-all duration-300 hover:shadow-[0_15px_30px_rgba(0,175,135,0.5)]">
                <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)" }} />
                <TripAdvisorIcon className="relative w-[22px] h-[22px]" />
              </a>
              <a href={`tel:${(config.phone || "+12420000000").replace(/[^+\d]/g,"")}`} title="Call" data-testid="footer-phone" className="group relative w-12 h-12 rounded-full bg-white/[0.06] border border-white/10 hover:border-[#D4A94A]/60 hover:bg-[#D4A94A] hover:scale-110 flex items-center justify-center transition-all duration-300 hover:shadow-[0_15px_30px_rgba(212,169,74,0.5)]">
                <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)" }} />
                <Phone className="relative w-[18px] h-[18px]" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid md:grid-cols-4 gap-12 mt-14">
            <div className="md:col-span-1">
              <h4 className="serif text-lg text-white font-bold mb-1">Services</h4>
              <div className="w-8 h-[2px] bg-[#D4A94A] mb-5" />
              <ul className="space-y-3 text-sm">
                <li><Link to="/taxi" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Airport &amp; City Taxi</Link></li>
                <li><Link to="/tours" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Tours &amp; Excursions</Link></li>
                <li><Link to="/rentals" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Car Rentals</Link></li>
                <li><Link to="/track" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Track a Booking</Link></li>
              </ul>
            </div>
            <div className="md:col-span-1">
              <h4 className="serif text-lg text-white font-bold mb-1">Company</h4>
              <div className="w-8 h-[2px] bg-[#D4A94A] mb-5" />
              <ul className="space-y-3 text-sm">
                <li><Link to="/groups" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Groups &amp; Weddings</Link></li>
                <li><Link to="/wedding-builder" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Wedding Builder</Link></li>
                <li><Link to="/about" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />About Us</Link></li>
                <li><Link to="/contact" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Contact</Link></li>
              </ul>
            </div>
            <div className="md:col-span-1">
              <h4 className="serif text-lg text-white font-bold mb-1">Contact</h4>
              <div className="w-8 h-[2px] bg-[#D4A94A] mb-5" />
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3 text-white/60">
                  <span className="w-8 h-8 rounded-full bg-[#D4A94A]/10 border border-[#D4A94A]/20 flex items-center justify-center shrink-0 mt-0.5"><Phone className="w-3.5 h-3.5 text-[#D4A94A]" /></span>
                  <a href={`tel:${(config.phone || "+12420000000").replace(/[^+\d]/g,"")}`} className="hover:text-[#D4A94A] transition-colors">{config.phone || "+1 (242) 000-0000"}</a>
                </li>
                <li className="flex items-start gap-3 text-white/60">
                  <span className="w-8 h-8 rounded-full bg-[#D4A94A]/10 border border-[#D4A94A]/20 flex items-center justify-center shrink-0 mt-0.5"><MapPin className="w-3.5 h-3.5 text-[#D4A94A]" /></span>
                  <span>Nassau, New Providence, Bahamas</span>
                </li>
                <li className="flex items-start gap-3 text-white/60">
                  <span className="w-8 h-8 rounded-full bg-[#D4A94A]/10 border border-[#D4A94A]/20 flex items-center justify-center shrink-0 mt-0.5"><Facebook className="w-3.5 h-3.5 text-[#D4A94A]" /></span>
                  <a href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"} target="_blank" rel="noreferrer" data-testid="footer-facebook-link" className="hover:text-[#D4A94A] transition-colors">facebook.com/roxtaxiservice</a>
                </li>
              </ul>
            </div>
            <div className="md:col-span-1">
              <h4 className="serif text-lg text-white font-bold mb-1">Payments</h4>
              <div className="w-8 h-[2px] bg-[#D4A94A] mb-5" />
              <Link
                to="/pay"
                data-testid="footer-make-payment-btn"
                className="group inline-flex items-center gap-2 rounded-full bg-[#D4A94A] text-[#0B192C] px-5 py-2.5 text-sm font-black shadow-[0_10px_25px_rgba(212,169,74,0.35)] hover:bg-[#F5E1A4] hover:shadow-[0_14px_35px_rgba(245,225,164,0.5)] hover:scale-[1.03] active:scale-95 transition-all duration-200"
              >
                Make a Payment
                <span className="inline-block group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>
              <div className="flex flex-wrap gap-2 mt-5 mb-4" data-testid="footer-payment-chips">
                <Link to="/pay" title="Pay with card via Stripe" className="rounded-lg bg-white/[0.05] border border-white/10 hover:border-[#635BFF] hover:bg-[#635BFF]/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:text-white transition-all">Card</Link>
                <Link to="/pay" title="Pay with PayPal" className="rounded-lg bg-white/[0.05] border border-white/10 hover:border-[#003087] hover:bg-[#003087]/25 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:text-white transition-all">PayPal</Link>
                <Link to="/pay" title="Pay with Stripe" className="rounded-lg bg-white/[0.05] border border-white/10 hover:border-[#635BFF] hover:bg-[#635BFF]/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:text-white transition-all">Stripe</Link>
                <Link to="/pay" title="Pay with Zelle" className="rounded-lg bg-white/[0.05] border border-white/10 hover:border-[#6D1ED4] hover:bg-[#6D1ED4]/25 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:text-white transition-all">Zelle</Link>
              </div>
              <p className="serif italic text-xs text-white/45 leading-relaxed">
                All payments secured &amp; encrypted end-to-end. Refunds honored per our cancellation policy.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Find us on — marketplace directory badges ───────────
             Outbound trust links so guests can verify reviews on third-
             party platforms. All URLs driven by site_config so admin can
             swap them anytime via Site Config panel. Dashed "Coming soon"
             chips subtly invite future review-platform onboarding. */}
        <div className="relative border-t border-white/10 bg-black/20" data-testid="footer-marketplaces">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-[10px] tracking-[0.4em] uppercase font-black text-[#D4A94A]">Find us on</span>
              <span className="flex-1 h-[1px] bg-gradient-to-r from-[#D4A94A]/40 to-transparent" />
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={config.facebook_url || "https://www.facebook.com/roxtaxiservice/"} target="_blank" rel="noreferrer" data-testid="marketplace-facebook" className="group inline-flex items-center gap-2.5 rounded-full bg-white/[0.05] hover:bg-[#1877F2] hover:scale-[1.03] border border-white/10 hover:border-[#1877F2] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white/80 hover:text-white transition-all shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_10px_30px_rgba(24,119,242,0.4)]">
                <Facebook className="w-4 h-4" /> Facebook <span className="text-[9px] opacity-60 group-hover:opacity-100 normal-case">roxtaxiservice</span>
              </a>
              {config.google_business_url && (
                <a href={config.google_business_url} target="_blank" rel="noreferrer" data-testid="marketplace-google" className="group inline-flex items-center gap-2.5 rounded-full bg-white/[0.05] hover:bg-white hover:scale-[1.03] border border-white/10 hover:border-[#4285F4] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white/80 hover:text-[#0B192C] transition-all shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_10px_30px_rgba(66,133,244,0.4)]">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09A6.99 6.99 0 0 1 5.5 12c0-.73.12-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.44 1.18 4.93l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                  </svg>
                  Google Reviews <span className="text-[9px] opacity-60 group-hover:opacity-100 normal-case">★ 4.9 rated</span>
                </a>
              )}
              <a href={`https://wa.me/${(config.whatsapp_number || "+12424322587").replace(/[^\d]/g,"")}`} target="_blank" rel="noreferrer" data-testid="marketplace-whatsapp" className="group inline-flex items-center gap-2.5 rounded-full bg-white/[0.05] hover:bg-[#25D366] hover:scale-[1.03] border border-white/10 hover:border-[#25D366] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white/80 hover:text-white transition-all shadow-[0_6px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_10px_30px_rgba(37,211,102,0.4)]">
                <WhatsAppIcon className="w-4 h-4" /> WhatsApp <span className="text-[9px] opacity-60 group-hover:opacity-100 normal-case">Chat 24/7</span>
              </a>
              <span data-testid="marketplace-tripadvisor-coming" title="Getting listed on TripAdvisor soon — help us by leaving a review!" className="inline-flex items-center gap-2.5 rounded-full bg-white/[0.03] border border-dashed border-white/15 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white/35 cursor-help">
                <TripAdvisorIcon className="w-4 h-4" /> TripAdvisor <span className="text-[9px] opacity-70 normal-case">Coming soon</span>
              </span>
            </div>
          </div>
        </div>

        <div className="relative border-t border-white/10">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
            <div className="text-white/40 tracking-wide">
              &copy; {new Date().getFullYear()} <span className="serif italic text-white/60">Rox Taxi Service &amp; Tours Bahamas.</span> All rights reserved.
            </div>
            <div className="flex items-center gap-5">
              <span className="text-white/30 tracking-[0.25em] uppercase">Made with care in Nassau</span>
              <Link to="/admin/login" className="text-white/30 hover:text-[#D4A94A] tracking-[0.25em] uppercase transition-colors" data-testid="footer-admin-link">Admin</Link>
            </div>
          </div>
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}
