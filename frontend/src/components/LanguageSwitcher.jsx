import { useEffect, useRef, useState } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";

// English + 7 requested languages. Uses Google Translate's cookie-driven
// widget so every string on every page auto-translates without maintenance.
const LANGS = [
  { code: "en",    label: "English",        native: "English" },
  { code: "es",    label: "Spanish",        native: "Español" },
  { code: "fr",    label: "French",         native: "Français" },
  { code: "ht",    label: "Haitian Creole", native: "Kreyòl" },
  { code: "de",    label: "German",         native: "Deutsch" },
  { code: "nl",    label: "Dutch",          native: "Nederlands" },
  { code: "zh-CN", label: "Chinese",        native: "中文" },
  { code: "tr",    label: "Turkish",        native: "Türkçe" },
];

function readCurrent() {
  const m = document.cookie.match(/googtrans=\/en\/([^;]+)/);
  return (m && m[1]) || "en";
}

function applyLang(code) {
  const host = window.location.hostname;
  const parent = host.split(".").slice(-2).join(".");
  // Clear existing cookies across possible scopes
  const clear = "; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/";
  document.cookie = "googtrans=" + clear;
  document.cookie = "googtrans=" + clear + "; domain=" + host;
  document.cookie = "googtrans=" + clear + "; domain=." + parent;
  if (code && code !== "en") {
    const val = "/en/" + code;
    document.cookie = "googtrans=" + val + "; path=/";
    document.cookie = "googtrans=" + val + "; path=/; domain=" + host;
    document.cookie = "googtrans=" + val + "; path=/; domain=." + parent;
  }
  window.location.reload();
}

export default function LanguageSwitcher({ variant = "desktop" }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("en");
  const ref = useRef(null);

  useEffect(() => setCurrent(readCurrent()), []);
  useEffect(() => {
    if (!open) return;
    const on = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);

  const currentLang = LANGS.find((l) => l.code === current) || LANGS[0];

  if (variant === "mobile") {
    // Collapsed-by-default tab so the language grid doesn't dominate the
    // mobile menu footer. Tapping the header row expands the grid; state
    // resets when the drawer re-mounts, which is fine because most guests
    // only need this once per visit.
    return (
      <MobileLanguageTab
        current={current}
        currentLang={currentLang}
        applyLang={applyLang}
      />
    );
  }

  return (
    <div ref={ref} className="hidden sm:block relative notranslate" translate="no">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Language: ${currentLang.native}`}
        data-testid="lang-switcher-btn"
        className="group relative flex items-center gap-1.5 h-11 rounded-full bg-white/70 backdrop-blur-md border border-white/80 px-3 hover:bg-[#0B3B5C] hover:border-[#0B3B5C] text-[#0B3B5C] hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(11,59,92,0.08)] hover:shadow-[0_10px_25px_rgba(11,59,92,0.35)]"
      >
        <Globe className="w-[18px] h-[18px]" />
        <span className="text-[11px] font-black uppercase tracking-widest">{currentLang.code === "zh-CN" ? "ZH" : currentLang.code.toUpperCase()}</span>
      </button>

      {open && (
        <div
          role="menu"
          data-testid="lang-switcher-menu"
          className="absolute right-0 mt-3 w-56 rounded-2xl bg-white/95 backdrop-blur-xl border border-white/80 shadow-[0_25px_60px_rgba(11,25,44,0.18)] overflow-hidden z-[90]"
        >
          <div className="px-4 py-2.5 border-b border-[#F1F5F9]">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#94a3b8] font-semibold">Language</div>
          </div>
          <ul className="p-1.5 max-h-80 overflow-y-auto">
            {LANGS.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => applyLang(l.code)}
                  role="menuitem"
                  data-testid={`lang-option-${l.code}`}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left transition ${
                    current === l.code
                      ? "bg-[#D4A94A]/12 text-[#D4A94A] font-semibold"
                      : "hover:bg-[#F1F5F9] text-[#0B3B5C]"
                  }`}
                >
                  <span className="flex-1 flex items-center gap-2">
                    <span className="font-semibold">{l.native}</span>
                    <span className="text-[10px] text-[#94a3b8] uppercase tracking-widest">{l.code}</span>
                  </span>
                  {current === l.code && <Check className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2 border-t border-[#F1F5F9] text-[10px] text-[#94a3b8]">
            Translations by Google · site data unchanged.
          </div>
        </div>
      )}
    </div>
  );
}

// Collapsible mobile variant — tapping the summary row expands/collapses
// the language grid. Kept as a separate small component so the state
// (open/closed) is local and doesn't affect the desktop path.
function MobileLanguageTab({ current, currentLang, applyLang }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="notranslate" translate="no" data-testid="lang-switcher-mobile-tab">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="lang-switcher-mobile-panel"
        data-testid="lang-switcher-mobile-toggle"
        className="w-full flex items-center justify-between rounded-2xl border border-[#EFE7D5] bg-white px-4 py-3 hover:border-[#D4A94A] transition"
      >
        <span className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#FBF7EF] text-[#D4A94A]">
            <Globe className="w-4 h-4" />
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[9px] tracking-[0.28em] uppercase text-[#94a3b8] font-semibold">Language</span>
            <span className="text-sm font-semibold text-[#0B3B5C]" data-testid="lang-mobile-current-label">{currentLang.native}</span>
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-[#0B3B5C] transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id="lang-switcher-mobile-panel"
        aria-hidden={!open}
        className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 mt-0"}`}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-2 gap-2" data-testid="lang-switcher-mobile">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => applyLang(l.code)}
                data-testid={`lang-mobile-${l.code}`}
                className={`rounded-2xl border px-3 py-2.5 text-xs font-semibold transition ${
                  current === l.code
                    ? "border-[#D4A94A] bg-[#D4A94A]/12 text-[#D4A94A]"
                    : "border-[#EFE7D5] bg-white text-[#0B3B5C] hover:border-[#D4A94A]"
                }`}
              >
                {l.native}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
