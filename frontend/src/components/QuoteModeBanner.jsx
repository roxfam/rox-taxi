import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FileText, X } from "lucide-react";

const KEY = "rox_quote_mode";
export const isQuoteMode = () => typeof window !== "undefined" && sessionStorage.getItem(KEY) === "1";
export const exitQuoteMode = () => sessionStorage.removeItem(KEY);

// Sticky banner while a guest is building a quote (entered via ?quote=1).
export default function QuoteModeBanner() {
  const { search, pathname } = useLocation();
  const [on, setOn] = useState(isQuoteMode);
  useEffect(() => {
    if (new URLSearchParams(search).get("quote") === "1") { sessionStorage.setItem(KEY, "1"); setOn(true); }
    else setOn(isQuoteMode());
  }, [search, pathname]);
  if (!on || pathname.startsWith("/quote")) return null;
  return (
    <div className="sticky top-0 z-[60] bg-[#0B3B5C] text-white text-xs sm:text-sm" data-testid="quote-mode-banner">
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center gap-3">
        <FileText className="w-4 h-4 text-[#D4A94A] shrink-0" />
        <span className="flex-1"><b>Quote mode:</b> choose your service and fill in the details, then press <b>Get my quote</b>. Nothing is booked or charged.</span>
        <Link to="/quote" className="underline opacity-80 hover:opacity-100 hidden sm:inline">Change service</Link>
        <button onClick={() => { exitQuoteMode(); setOn(false); }} className="inline-flex items-center gap-1 opacity-80 hover:opacity-100" data-testid="quote-mode-exit">
          <X className="w-4 h-4" /> Exit
        </button>
      </div>
    </div>
  );
}
