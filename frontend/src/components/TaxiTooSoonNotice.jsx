import { Phone, AlertTriangle } from "lucide-react";
import { WhatsAppIcon } from "./BrandIcons";

const NUMBER = "12424322587";

// Minutes from Nassau "now" to a naive "YYYY-MM-DDTHH:mm" pickup string (both read as Nassau time).
export const minutesUntilNassau = (value) => {
  if (!value || !value.includes("T")) return null;
  const nowNassau = new Date().toLocaleString("sv-SE", { timeZone: "America/Nassau" }).replace(" ", "T");
  const pick = Date.parse(`${value.slice(0, 16)}:00Z`);
  const now = Date.parse(`${nowNassau.slice(0, 19)}Z`);
  return Number.isNaN(pick) ? null : (pick - now) / 60000;
};

export const TaxiTooSoonNotice = () => (
  <div className="rounded-xl border border-[#E86A3C]/30 bg-[#E86A3C]/10 px-4 py-4 text-sm" data-testid="taxi-too-soon-notice">
    <div className="flex items-start gap-2 text-[#7a2d10]">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-[#E86A3C]" />
      <div>
        <div className="font-semibold">Need a ride in less than an hour?</div>
        <div className="text-xs mt-0.5">We can't book pickups this soon online. Call or WhatsApp us and we'll send the nearest driver.</div>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <a href={`tel:+${NUMBER}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#0B3B5C] text-white text-xs font-bold px-4 py-2 hover:bg-[#082941] transition-colors" data-testid="taxi-too-soon-call">
        <Phone className="w-3.5 h-3.5" /> Call +1 242 432 2587
      </a>
      <a href={`https://wa.me/${NUMBER}?text=${encodeURIComponent("Hi Rox! I need a taxi now from: ")}`} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] text-white text-xs font-bold px-4 py-2 hover:bg-[#1fbe5b] transition-colors" data-testid="taxi-too-soon-whatsapp">
        <WhatsAppIcon className="w-3.5 h-3.5" /> WhatsApp us
      </a>
    </div>
  </div>
);
