import { useState } from "react";

// Drag to compare the guest's original photo (left) with the edited version (right).
export const BeforeAfterSlider = ({ beforeUrl, afterUrl, id }) => {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative w-full h-full select-none" data-testid={`admin-gallery-compare-${id}`}>
      <img src={afterUrl} alt="Enhanced" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={beforeUrl} alt="Original" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      </div>
      <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.5)] pointer-events-none" style={{ left: `${pos}%` }} />
      <span className="absolute top-2 left-2 rounded-full bg-black/55 text-white text-[10px] font-bold px-2 py-0.5 pointer-events-none">Before</span>
      <span className="absolute top-2 right-2 rounded-full bg-[#D4A94A] text-[#0B192C] text-[10px] font-bold px-2 py-0.5 pointer-events-none">After</span>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after" className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" data-testid={`admin-gallery-compare-range-${id}`} />
    </div>
  );
};
