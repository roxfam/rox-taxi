import { WhatsAppIcon } from "./BrandIcons";

const NUMBER = "12424322587";

export const WhatsAppFloat = () => {
  const href = `https://wa.me/${NUMBER}?text=${encodeURIComponent("Hi Rox! I'd like to book: ")}`;
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="group fixed bottom-5 left-5 lg:left-6 lg:bottom-6 z-[69] inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white pl-3.5 pr-4 py-3 shadow-[0_16px_36px_rgba(37,211,102,0.45)] hover:-translate-y-0.5 hover:bg-[#1fbe5b] transition-[transform,background-color]"
      aria-label="Chat and book on WhatsApp" data-testid="whatsapp-float-btn">
      <span className="absolute inset-0 rounded-full bg-[#25D366]/40 animate-ping pointer-events-none [animation-duration:2.6s]" />
      <WhatsAppIcon className="relative w-5 h-5" />
      <span className="relative text-sm font-bold hidden sm:inline">Chat &amp; book</span>
    </a>
  );
};
