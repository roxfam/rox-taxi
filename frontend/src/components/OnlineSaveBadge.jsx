import { BadgeDollarSign } from "lucide-react";

export function OnlineSaveBadge({ testid = "online-save-badge" }) {
  return (
    <div
      className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#059669] text-white px-4 py-2 text-sm font-bold shadow-lg shadow-black/20"
      data-testid={testid}
    >
      <BadgeDollarSign className="w-4 h-4" />
      Save $5 when you book online
      <span className="font-normal text-white/80 text-xs">· trips $40+</span>
    </div>
  );
}
