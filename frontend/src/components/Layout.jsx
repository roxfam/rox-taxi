import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Facebook, Phone, MapPin, Car, ShipWheel, MapPinned, Home as HomeIcon, Search, Ticket, MessageCircle, Info, Heart, ChevronDown, User as UserIcon, Images, Users, History } from "lucide-react";
import { useAuth } from "../lib/auth";

const BOOK_OPTIONS = [
  { to: "/taxi", label: "Taxi & Transfers", sub: "Airport · City · Hourly", Icon: Car, color: "#E86A3C" },
  { to: "/tours", label: "Tours & Excursions", sub: "Blue Lagoon · Atlantis · more", Icon: ShipWheel, color: "#0B3B5C" },
  { to: "/rentals", label: "Car Rentals", sub: "Compact to Luxury Vehicle", Icon: MapPinned, color: "#D4A94A" },
];
import { api } from "../lib/api";
import ChatWidget from "./ChatWidget";
import PromoBanner from "./PromoBanner";
import LanguageSwitcher from "./LanguageSwitcher";
import LiveStatsBadge from "./LiveStatsBadge"; // eslint-disable-line no-unused-vars
import { WhatsAppIcon, TripAdvisorIcon } from "./BrandIcons";

const NAV = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/taxi", label: "Taxi", icon: Car },
  { to: "/tours", label: "Tours", icon: ShipWheel },
  { to: "/rentals", label: "Car Rentals", icon: MapPinned },
  { to: "/gallery", label: "Gallery", icon: Images },
  { to: "/groups", label: "Groups", icon: Heart },
  { to: "/track", label: "Track", icon: Search },
  { to: "/about", label: "About", icon: Info },
  { to: "/contact", label: "Contact", icon: MessageCircle },
];

// The three "booking" nav rows (Taxi / Tours / Car Rentals) get a
// native <select> picker rendered inline on the parent row so mobile
// users can pick one option directly and land inside its booking
// modal. Populated at runtime from the live catalog; falls back to a
// plain nav link if the fetch fails.
const BOOKING_NAV_ROUTES = new Set(["/taxi", "/tours", "/rentals"]);

// ─── Recently-picked cache (per-section, browser-local) ───────────────
// The nav quick-pick dropdown remembers the last 3 services a returning
// guest chose so those pin to the top on their next visit — turning the
// dropdown into a lightly-personalised shortcut. Stored in localStorage
// under `rox.recent.<section>` as an ordered [{id, name, price,
// priceSuffix, ts}] list. Never leaves the browser, no PII involved.
const RECENT_MAX = 3;
const RECENT_STORAGE_KEY = (section) => `rox.recent.${section.replace(/^\//, "") || "root"}`;

function readRecentPicks(section) {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY(section));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

function pushRecentPick(section, pick) {
  try {
    if (!pick || !pick.id) return;
    const list = readRecentPicks(section);
    const deduped = list.filter((x) => x.id !== pick.id);
    deduped.unshift({ ...pick, ts: Date.now() });
    localStorage.setItem(RECENT_STORAGE_KEY(section), JSON.stringify(deduped.slice(0, RECENT_MAX)));
  } catch { /* ignore quota / SSR */ }
}

const NAV_DESKTOP = NAV.filter(n => n.label !== "About");

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [config, setConfig] = useState({ facebook_url: "https://www.facebook.com/roxtaxiservice/" });
  // Live catalog for the mobile drawer dropdowns — populated after mount
  // so the sub-menu rows show real service names + current prices
  // instead of static hash placeholders. Falls back to NAV_SUB_FALLBACK
  // if any fetch fails so the menu never renders empty.
  const [navCatalog, setNavCatalog] = useState({ taxi: null, tours: null, rentals: null });
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

  // Pull taxi / tours / rentals once for the mobile drawer dropdowns.
  // Failures are silent — NAV_SUB_FALLBACK covers rendering.
  useEffect(() => {
    Promise.all([
      api.get("/taxi-services").catch(() => ({ data: null })),
      api.get("/tours").catch(() => ({ data: null })),
      api.get("/rentals").catch(() => ({ data: null })),
    ]).then(([t, o, r]) => {
      setNavCatalog({ taxi: t.data, tours: o.data, rentals: r.data });
    });
  }, []);

  // Turn the raw catalog rows into flat picker options { id, name,
  // price, priceSuffix }. Featured items surface first so the OS
  // picker wheel starts with the most popular routes. Rentals show
  // "/day" suffix; tours + taxi are per-item flat.
  const pickerOptions = useMemo(() => {
    const build = (rows, priceSuffix = "") => {
      if (!Array.isArray(rows) || rows.length === 0) return [];
      const active = rows.filter((r) => r.active !== false);
      const featured = active.filter((r) => r.featured);
      const rest = active.filter((r) => !r.featured);
      return [...featured, ...rest].map((r) => ({
        id: r.id,
        name: r.name || r.title || r.id,
        price: typeof r.price === "number" ? r.price : Number(r.price || 0),
        priceSuffix,
      }));
    };
    return {
      "/taxi":    build(navCatalog.taxi),
      "/tours":   build(navCatalog.tours),
      "/rentals": build(navCatalog.rentals, "/day"),
    };
  }, [navCatalog]);

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
      <PromoBanner />
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
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const num = (config.whatsapp_number || "+12424322587").replace(/[^\d]/g, "");
                    window.open(`https://wa.me/${num}?text=${encodeURIComponent("Hi Rox — I saw you're live. Quick question:")}`, "_blank", "noopener");
                  }}
                  title="Available 24/7 — WhatsApp us"
                  data-testid="brand-live-dot"
                  className="relative inline-flex w-2.5 h-2.5 rounded-full bg-[#D4A94A] shadow-[0_0_10px_rgba(212,169,74,0.7)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/60"
                  aria-label="Available 24/7 — WhatsApp us"
                >
                  <span className="absolute inset-0 rounded-full bg-[#D4A94A] animate-ping opacity-75" />
                </span>
              </span>
            </div>
          </Link>

          {/* Desktop nav — pill with sliding indicator. Booking rows
              (/taxi, /tours, /rentals) get an additional hover-menu
              dropdown next to the label so returning guests can pick
              a service and jump straight into the booking modal. */}
          <nav className="hidden lg:flex items-center gap-1 rounded-full bg-white/60 backdrop-blur-md border border-white/70 p-1.5 shadow-[0_10px_30px_rgba(11,25,44,0.05)]">
            {NAV.map((n) => {
              const options = pickerOptions[n.to];
              const hasPicker = BOOKING_NAV_ROUTES.has(n.to) && Array.isArray(options) && options.length > 0;
              return hasPicker ? (
                <DesktopNavPicker key={n.to} item={n} options={options} />
              ) : (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === "/"}
                  data-testid={`nav-${n.label.toLowerCase()}`}
                  className={({ isActive }) =>
                    `relative px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
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
              );
            })}
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

            {/* Mobile login button — visible below md so mobile users
                don't have to open the drawer just to sign in. Icon-only
                for space; the drawer still has the full "Sign in" pill. */}
            {user ? (
              <Link
                to="/my-bookings"
                data-testid="mobile-header-account-btn"
                title={user.name || user.email}
                className="md:hidden w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 flex items-center justify-center text-[#D4A94A] hover:bg-[#D4A94A] hover:text-white transition-all shadow-[0_4px_12px_rgba(212,169,74,0.15)] overflow-hidden"
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
                data-testid="mobile-header-login-btn"
                title="Sign in"
                aria-label="Sign in"
                className="md:hidden w-11 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 flex items-center justify-center text-[#0B3B5C] hover:bg-[#0B3B5C] hover:text-white transition-all shadow-[0_4px_12px_rgba(11,59,92,0.08)]"
              >
                <UserIcon className="w-[18px] h-[18px]" />
              </Link>
            )}

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
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const num = (config.whatsapp_number || "+12424322587").replace(/[^\d]/g, "");
                          window.open(`https://wa.me/${num}?text=${encodeURIComponent("Hi Rox — I saw you're live. Quick question:")}`, "_blank", "noopener");
                        }}
                        title="Available 24/7 — WhatsApp us"
                        data-testid="brand-live-dot-mobile"
                        className="relative inline-flex w-2 h-2 rounded-full bg-[#D4A94A] shadow-[0_0_8px_rgba(212,169,74,0.7)] cursor-pointer"
                        aria-label="Available 24/7 — WhatsApp us"
                      >
                        <span className="absolute inset-0 rounded-full bg-[#D4A94A] animate-ping opacity-75" />
                      </span>
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
                  {NAV.map((n, idx) => {
                    const options = pickerOptions[n.to];
                    const showPicker = BOOKING_NAV_ROUTES.has(n.to) && options && options.length > 0;
                    return (
                      <motion.li
                        key={n.to}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 + idx * 0.05 }}
                      >
                        {showPicker ? (
                          <MobileNavCategory item={n} options={options} onNavigate={() => setOpen(false)} />
                        ) : (
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
                        )}
                      </motion.li>
                    );
                  })}
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
                <li><Link to="/gallery" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors" data-testid="footer-gallery-link"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Island Gallery</Link></li>
                <li><Link to="/travel-to-nassau" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Travel to Nassau Guide</Link></li>
                <li><Link to="/cruise-groups-nassau" className="group inline-flex items-center gap-2 text-white/60 hover:text-[#D4A94A] transition-colors"><span className="w-0 group-hover:w-4 h-[1px] bg-[#D4A94A] transition-all" />Cruise Groups (10% off)</Link></li>
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
      <StickyMobileBookNow open={open} pathname={pathname} />
    </div>
  );
}

// ── Sticky Mobile "Book Now" pill ────────────────────────────────────
// Floating bottom-right CTA visible only on mobile. Hidden on admin,
// driver, booking-flow, checkout, and reset routes so it never covers
// primary CTAs on those flows. Fades in after 240px scroll so it
// doesn't crowd the hero on first paint.
function StickyMobileBookNow({ open, pathname }) {
  const [showBook, setShowBook] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const HIDE_PREFIXES = ["/admin", "/driver", "/reset-password", "/payment"];
  const hidden =
    open ||
    HIDE_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (hidden) return;
    const onScroll = () => setScrolled(window.scrollY > 240);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hidden]);

  useEffect(() => {
    if (!showBook) return;
    const onEsc = (e) => { if (e.key === "Escape") setShowBook(false); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [showBook]);

  if (hidden) return null;
  return (
    <>
      <AnimatePresence>
        {scrolled && (
          <motion.button
            initial={{ y: 96, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 96, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={() => setShowBook(true)}
            className="lg:hidden fixed bottom-5 right-5 z-[70] inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#E86A3C] to-[#d55a30] text-white pl-4 pr-5 py-3.5 text-sm font-bold shadow-[0_18px_40px_rgba(232,106,60,0.45)] hover:shadow-[0_20px_45px_rgba(232,106,60,0.55)] active:scale-95 transition-all"
            data-testid="mobile-sticky-book-now"
            aria-label="Book a ride now"
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-white/80 animate-ping" />
              <span className="relative w-2 h-2 rounded-full bg-white" />
            </span>
            Book Now
            <ChevronDown className="w-4 h-4 -rotate-90" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-[75] bg-[#0B192C]/60 backdrop-blur-sm flex items-end"
            onClick={() => setShowBook(false)}
            data-testid="mobile-sticky-book-sheet"
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-white rounded-t-3xl p-5 pb-8 shadow-[0_-20px_60px_rgba(11,25,44,0.35)]"
            >
              <div className="w-10 h-1.5 rounded-full bg-[#E2E8F0] mx-auto mb-4" />
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-black text-center mb-3" data-testid="mobile-sticky-book-label">
                What are you booking?
              </div>
              <div className="grid gap-2">
                {BOOK_OPTIONS.map((opt) => (
                  <Link
                    key={opt.to}
                    to={opt.to}
                    onClick={() => setShowBook(false)}
                    data-testid={`mobile-sticky-book-${opt.to.replace("/", "")}`}
                    className="group flex items-center gap-3 rounded-2xl border border-[#EFE7D5] bg-white hover:bg-[#FBF7EF] transition-all px-4 py-3.5"
                  >
                    <span
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-md"
                      style={{ background: `linear-gradient(135deg, ${opt.color}, ${opt.color}cc)` }}
                    >
                      <opt.Icon className="w-5 h-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-[#0B3B5C]">{opt.label}</span>
                      <span className="block text-[11px] text-[#64748B]">{opt.sub}</span>
                    </span>
                    <ChevronDown className="w-4 h-4 -rotate-90 text-[#94a3b8] group-hover:text-[#E86A3C] group-hover:translate-x-1 transition-all" />
                  </Link>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Desktop nav "Quick pick" dropdown ───────────────────────────────
// Wraps a booking-category NavLink (/taxi, /tours, /rentals) so that:
//  • Clicking the label still routes to the section landing page.
//  • Hovering (or keyboard-focusing) the label reveals a compact menu
//    of the top services with live prices. Picking one deep-links to
//    the section with `?book=<id>` so the target page auto-opens its
//    BookingModal — matching the mobile drawer behaviour.
// Kept CSS-driven (group + focus-within) so we don't add state juggling
// or portal complexity for what's essentially a hover popover.
function DesktopNavPicker({ item, options }) {
  const location = useLocation();
  const nav = useNavigate();
  const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  const slug = item.label.toLowerCase().replace(/\s+/g, "-");
  const [recent, setRecent] = useState(() => readRecentPicks(item.to));
  const pickerLabel = {
    "/taxi": "Quick pick a route",
    "/tours": "Quick pick a tour",
    "/rentals": "Quick pick a car",
  }[item.to] || "Quick pick";

  const formatPrice = (n, suffix = "") => {
    if (typeof n !== "number" || Number.isNaN(n) || n <= 0) return "";
    const s = n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
    return `${s}${suffix}`;
  };

  // Hydrate recents on mount + rehydrate when the tab regains focus so
  // picks made in another tab are reflected without a hard reload.
  useEffect(() => {
    const rehydrate = () => setRecent(readRecentPicks(item.to));
    window.addEventListener("focus", rehydrate);
    window.addEventListener("storage", rehydrate);
    return () => {
      window.removeEventListener("focus", rehydrate);
      window.removeEventListener("storage", rehydrate);
    };
  }, [item.to]);

  const onPick = (o) => {
    pushRecentPick(item.to, {
      id: o.id, name: o.name, price: o.price, priceSuffix: o.priceSuffix || "",
    });
    setRecent(readRecentPicks(item.to));
    nav(`${item.to}?book=${encodeURIComponent(o.id)}`);
  };

  // Merge recents on top (deduped) then the featured/all list.
  const recentIds = new Set(recent.map((r) => r.id));
  const merged = [...recent, ...options.filter((o) => !recentIds.has(o.id))];
  const top = merged.slice(0, 8);

  return (
    <div className="relative group" data-testid={`nav-desktop-picker-${slug}`}>
      <NavLink
        to={item.to}
        end={item.to === "/"}
        data-testid={`nav-${item.label.toLowerCase()}`}
        className={({ isActive: a }) =>
          `relative px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-200 inline-flex items-center gap-1 ${
            a ? "text-white" : "text-[#0B3B5C] hover:text-[#D4A94A]"
          }`
        }
      >
        {({ isActive: a }) => (
          <>
            {a && (
              <motion.span
                layoutId="nav-active-pill"
                className="absolute inset-0 rounded-full bg-gradient-to-br from-[#0B3B5C] to-[#0B192C] shadow-[0_6px_16px_rgba(11,25,44,0.25)]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative flex items-center gap-1">
              {item.label}
              <ChevronDown className="w-3.5 h-3.5 opacity-70 transition-transform duration-300 group-hover:rotate-180" />
            </span>
          </>
        )}
      </NavLink>

      {/* Hover menu — CSS-only reveal. Padded top gap keeps the pointer
          from falling into a dead zone between the label and the panel. */}
      <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 opacity-0 pointer-events-none translate-y-1 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 transition-all duration-200 ease-out z-[90]">
        <div
          role="menu"
          data-testid={`nav-desktop-picker-${slug}-menu`}
          className="w-[360px] rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 shadow-[0_25px_60px_rgba(11,25,44,0.18)] overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-[#F1F5F9] flex items-center justify-between">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-semibold">{pickerLabel}</div>
            <span className="text-[10px] font-black text-[#D4A94A] tracking-wider">LIVE</span>
          </div>
          {recent.length > 0 && (
            <div
              className="px-3 pt-2.5 pb-1 bg-gradient-to-b from-[#FBF7EF] to-transparent"
              data-testid={`nav-desktop-picker-${slug}-recent`}
            >
              <div className="flex items-center gap-1.5 px-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4A94A] shadow-[0_0_8px_rgba(212,169,74,0.6)]" />
                <span className="text-[9px] tracking-[0.28em] uppercase text-[#D4A94A] font-black">Recently viewed</span>
              </div>
              <ul>
                {recent.map((o) => (
                  <li key={`recent-${o.id}`}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onPick(o)}
                      data-testid={`nav-desktop-picker-${slug}-recent-${o.id}`}
                      className="w-full group/opt flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white transition-colors text-left"
                    >
                      <span className="w-7 h-7 rounded-full bg-[#D4A94A]/15 flex items-center justify-center text-[#D4A94A] shrink-0">
                        <History className="w-3.5 h-3.5" />
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-semibold text-[#0B3B5C] truncate">{o.name}</span>
                      {formatPrice(o.price, o.priceSuffix) && (
                        <span className="mono font-bold text-sm text-[#E86A3C] shrink-0">
                          {formatPrice(o.price, o.priceSuffix)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-1 mb-1 mx-3 h-px bg-gradient-to-r from-transparent via-[#EFE7D5] to-transparent" />
            </div>
          )}
          <ul className="p-2 max-h-[340px] overflow-y-auto">
            {top.filter((o) => !recentIds.has(o.id)).map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onPick(o)}
                  data-testid={`nav-desktop-picker-${slug}-opt-${o.id}`}
                  className="w-full group/opt flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#FBF7EF] transition-colors text-left"
                >
                  <span className="w-7 h-7 rounded-full bg-[#F1F5F9] group-hover/opt:bg-[#D4A94A]/15 flex items-center justify-center text-[11px] font-black text-[#0B3B5C] shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-[#0B3B5C] truncate">{o.name}</span>
                  </span>
                  {formatPrice(o.price, o.priceSuffix) && (
                    <span className="mono font-bold text-sm text-[#E86A3C] shrink-0">
                      {formatPrice(o.price, o.priceSuffix)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <Link
            to={item.to}
            className="block px-5 py-3 border-t border-[#F1F5F9] text-xs uppercase tracking-widest font-black text-[#D4A94A] hover:bg-[#FBF7EF] transition-colors text-center"
            data-testid={`nav-desktop-picker-${slug}-see-all`}
          >
            {`See all ${item.label.toLowerCase()} →`}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile nav category with an inline picker dropdown ───────────────
// Booking sections (Taxi / Tours / Car Rentals) render as a compact row
// with a NATIVE <select> "Pick a …" pill on the right. Tapping the
// pill opens the mobile OS's native picker with every service listed
// (name + price). Selecting one navigates to the section with
// `?book=<id>` so the target page auto-opens its BookingModal for that
// service. Native selects give the cleanest mobile UX — full-height
// scroll wheel, momentum flick, OS-consistent theming.
// Non-booking sections (Home, Gallery, About, etc.) render as a plain
// row link — no picker, no expansion.
function MobileNavCategory({ item, options, onNavigate }) {
  const location = useLocation();
  const nav = useNavigate();
  const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
  const slug = item.label.toLowerCase().replace(/\s+/g, "-");
  const Icon = item.icon;
  const [recent, setRecent] = useState(() => readRecentPicks(item.to));
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const rehydrate = () => setRecent(readRecentPicks(item.to));
    window.addEventListener("focus", rehydrate);
    window.addEventListener("storage", rehydrate);
    return () => {
      window.removeEventListener("focus", rehydrate);
      window.removeEventListener("storage", rehydrate);
    };
  }, [item.to]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onEsc = (e) => { if (e.key === "Escape") setSheetOpen(false); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [sheetOpen]);

  const formatPrice = (n, suffix = "") => {
    if (typeof n !== "number" || Number.isNaN(n) || n <= 0) return "";
    const s = n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
    return `${s}${suffix}`;
  };

  const pickerLabel = {
    "/taxi": "Pick a route",
    "/tours": "Pick a tour",
    "/rentals": "Pick a car",
  }[item.to] || "Pick";

  const onPick = (o) => {
    pushRecentPick(item.to, {
      id: o.id, name: o.name, price: o.price, priceSuffix: o.priceSuffix || "",
    });
    setSheetOpen(false);
    if (onNavigate) onNavigate();
    nav(`${item.to}?book=${encodeURIComponent(o.id)}`);
  };

  const recentIds = new Set(recent.map((r) => r.id));
  const restOptions = options.filter((o) => !recentIds.has(o.id));

  return (
    <>
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${
          isActive
            ? "bg-gradient-to-br from-[#0B3B5C] to-[#0B192C] text-white shadow-[0_10px_25px_rgba(11,25,44,0.15)]"
            : "text-[#0B3B5C] hover:bg-[#F1F5F9]"
        }`}
      >
        <Link
          to={item.to}
          onClick={onNavigate}
          data-testid={`mobile-nav-${slug}`}
          className="flex items-center gap-3 min-w-0"
        >
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? "bg-white/15" : "bg-[#F1F5F9]"}`}>
            <Icon className="w-4 h-4" />
          </span>
          <span className="font-semibold whitespace-nowrap">{item.label}</span>
        </Link>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          data-testid={`mobile-nav-${slug}-picker-pill`}
          aria-haspopup="listbox"
          aria-expanded={sheetOpen}
          aria-label={`${pickerLabel} for ${item.label}`}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold border active:scale-95 transition-all ${
            isActive
              ? "bg-white/15 border-white/25 text-white hover:bg-white/20"
              : "bg-[#FBF7EF] border-[#EFE7D5] text-[#0B3B5C] hover:border-[#D4A94A] hover:shadow-[0_4px_12px_rgba(212,169,74,0.2)]"
          }`}
        >
          {recent.length > 0 && (
            <History className="w-3 h-3 text-[#D4A94A]" />
          )}
          {pickerLabel}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sheetOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Bottom-sheet picker — matches the desktop dropdown design so
          the mobile UX carries the same visual hierarchy (Recently
          viewed → All options → See all footer). */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSheetOpen(false)}
            className="fixed inset-0 z-[100] bg-[#0B192C]/60 backdrop-blur-sm flex items-end"
            data-testid={`mobile-nav-${slug}-sheet-backdrop`}
          >
            <motion.div
              initial={{ y: 400 }}
              animate={{ y: 0 }}
              exit={{ y: 400 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-white rounded-t-3xl shadow-[0_-20px_60px_rgba(11,25,44,0.35)] max-h-[82vh] flex flex-col"
              data-testid={`mobile-nav-${slug}-sheet`}
              role="dialog"
              aria-modal="true"
            >
              <div className="pt-3 pb-2 flex justify-center shrink-0">
                <span className="w-10 h-1.5 rounded-full bg-[#E2E8F0]" />
              </div>
              <div className="px-5 pb-3 flex items-center justify-between border-b border-[#F1F5F9] shrink-0">
                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-black">{pickerLabel}</div>
                  <div className="serif text-lg text-[#0B3B5C] leading-tight mt-0.5">{item.label}</div>
                </div>
                <span className="text-[10px] font-black text-[#D4A94A] tracking-wider">LIVE</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {recent.length > 0 && (
                  <div
                    className="mb-2 rounded-2xl bg-gradient-to-b from-[#FBF7EF] to-white p-2"
                    data-testid={`mobile-nav-${slug}-sheet-recent`}
                  >
                    <div className="flex items-center gap-1.5 px-2 pt-1 pb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D4A94A] shadow-[0_0_8px_rgba(212,169,74,0.6)]" />
                      <span className="text-[9px] tracking-[0.28em] uppercase text-[#D4A94A] font-black">Recently viewed</span>
                    </div>
                    <ul>
                      {recent.map((o) => (
                        <li key={`recent-${o.id}`}>
                          <button
                            type="button"
                            onClick={() => onPick(o)}
                            data-testid={`mobile-nav-${slug}-sheet-recent-${o.id}`}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white active:bg-[#FBF7EF] transition-colors text-left"
                          >
                            <span className="w-8 h-8 rounded-full bg-[#D4A94A]/15 flex items-center justify-center text-[#D4A94A] shrink-0">
                              <History className="w-4 h-4" />
                            </span>
                            <span className="flex-1 min-w-0 text-sm font-semibold text-[#0B3B5C] truncate">{o.name}</span>
                            {formatPrice(o.price, o.priceSuffix) && (
                              <span className="mono font-bold text-sm text-[#E86A3C] shrink-0">
                                {formatPrice(o.price, o.priceSuffix)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="text-[9px] tracking-[0.28em] uppercase text-[#94a3b8] font-black px-3 pt-2 pb-2">
                  {recent.length > 0 ? "All options" : "Choose one"}
                </div>
                <ul>
                  {restOptions.map((o, i) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => onPick(o)}
                        data-testid={`mobile-nav-${slug}-sheet-opt-${o.id}`}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#FBF7EF] active:bg-[#EFE7D5] transition-colors text-left"
                      >
                        <span className="w-8 h-8 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[11px] font-black text-[#0B3B5C] shrink-0">
                          {i + 1}
                        </span>
                        <span className="flex-1 min-w-0 text-sm font-semibold text-[#0B3B5C] truncate">{o.name}</span>
                        {formatPrice(o.price, o.priceSuffix) && (
                          <span className="mono font-bold text-sm text-[#E86A3C] shrink-0">
                            {formatPrice(o.price, o.priceSuffix)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                to={item.to}
                onClick={() => { setSheetOpen(false); if (onNavigate) onNavigate(); }}
                data-testid={`mobile-nav-${slug}-sheet-see-all`}
                className="block px-5 py-4 border-t border-[#F1F5F9] text-xs uppercase tracking-widest font-black text-[#D4A94A] hover:bg-[#FBF7EF] transition-colors text-center shrink-0"
              >
                {`See all ${item.label.toLowerCase()} →`}
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
