import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RotateCw, ExternalLink } from "lucide-react";
import { api } from "../../lib/api";

/**
 * StripeLiveCheckCard — tells the owner, at a glance, whether their
 * deployed backend is still routing through the Emergent sandbox proxy
 * (sk_test_emergent — the "it says sandbox on my live site" case) or
 * through a real sk_live_ key.
 *
 * Reads /api/admin/stripe-live-check which inspects the pod's env.
 * Auto-hides the yellow "action needed" state when live mode is OK.
 */
export default function StripeLiveCheckCard() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/stripe-live-check");
      setState(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not check Stripe mode");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (!state) return null;

  const isLive = state.is_live;
  const isSandbox = state.is_sandbox_proxy;
  const tone = isLive && state.webhook_secret_set
    ? { bg: "from-[#059669]/10 to-white", border: "border-[#059669]/30", icon: "text-[#059669]", chip: "bg-[#059669]/15 text-[#065F46]" }
    : isSandbox
      ? { bg: "from-red-50 to-white", border: "border-red-300", icon: "text-red-600", chip: "bg-red-100 text-red-700" }
      : { bg: "from-amber-50 to-white", border: "border-amber-300", icon: "text-amber-600", chip: "bg-amber-100 text-amber-800" };

  const label = isLive ? "LIVE" : isSandbox ? "SANDBOX" : "TEST";

  return (
    <section
      className={`mt-6 rounded-2xl border ${tone.border} bg-gradient-to-r ${tone.bg} p-5`}
      data-testid="stripe-live-check-card"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 flex-1 min-w-[260px]">
          <div className={`w-11 h-11 rounded-xl bg-white/60 flex items-center justify-center ${tone.icon}`}>
            {isLive && state.webhook_secret_set
              ? <CheckCircle2 className="w-5 h-5" />
              : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-[#0B3B5C]">Stripe payment mode</span>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.chip}`} data-testid="stripe-mode-chip">
                {label}
              </span>
              {!state.webhook_secret_set && (
                <span className="inline-flex rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                  WEBHOOK SECRET MISSING
                </span>
              )}
            </div>
            <div className="text-xs text-[#64748B] mt-1.5 mono">
              Key prefix: <span className="text-[#0B3B5C] font-bold">{state.key_prefix || "(none)"}</span>
              {state.last_session_prefix && (
                <> · Last session: <span className="text-[#0B3B5C] font-bold">{state.last_session_prefix}</span></>
              )}
            </div>
            {state.suggestions && state.suggestions.length > 0 && (
              <ul className="mt-2 text-xs text-[#334155] space-y-1">
                {state.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[#64748B] shrink-0">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSandbox && (
            <a
              href="https://dashboard.stripe.com/apikeys"
              target="_blank"
              rel="noreferrer"
              data-testid="stripe-dashboard-link"
              className="inline-flex items-center gap-1 rounded-full bg-[#0B3B5C] text-white px-3 py-2 text-xs font-bold hover:bg-[#132a4a]"
            >
              <ExternalLink className="w-3 h-3" /> Get live key
            </a>
          )}
          <button
            onClick={load}
            className="p-2 rounded-md hover:bg-white/60"
            data-testid="stripe-live-check-refresh"
          >
            <RotateCw className={`w-4 h-4 text-[#64748B] ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </section>
  );
}
