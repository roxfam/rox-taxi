import { useEffect, useState } from "react";
import { BadgeDollarSign } from "lucide-react";
import { api } from "../lib/api";

export function OnlineSaveBadge({ testid = "online-save-badge" }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    api.get("/site-config").then((r) => setCfg(r.data)).catch(() => setCfg({}));
  }, []);
  if (!cfg) return null;
  const amt = Number(cfg.online_discount_usd ?? 5);
  const min = Number(cfg.online_discount_min_usd ?? 40);
  if (cfg.online_discount_enabled === false || !(amt > 0)) return null;
  return (
    <div
      className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#059669] text-white px-4 py-2 text-sm font-bold shadow-lg shadow-black/20"
      data-testid={testid}
    >
      <BadgeDollarSign className="w-4 h-4" />
      Save ${amt % 1 ? amt.toFixed(2) : amt} when you book online
      {min > 0 && <span className="font-normal text-white/80 text-xs">· trips ${min}+</span>}
    </div>
  );
}
