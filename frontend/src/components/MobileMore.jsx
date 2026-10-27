import { useState } from "react";
import { ChevronDown } from "lucide-react";

// On phones, tuck secondary home sections behind a "See more" button (content stays in the page for search engines).
export const MobileMore = ({ label, id, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={`mobile-more-${id}`}>
      <div className={open ? "" : "hidden md:block"}>{children}</div>
      {!open && (
        <div className="md:hidden px-6 py-5 flex justify-center">
          <button type="button" onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-[#0B3B5C]/20 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0B3B5C] active:scale-95 transition-transform"
            data-testid={`mobile-more-btn-${id}`}>
            {label} <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
