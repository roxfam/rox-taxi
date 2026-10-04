import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Clock, RefreshCw, ArrowRight, AlertTriangle } from "lucide-react";
import { api, money } from "../lib/api";

/**
 * /resume-checkout?t=TOKEN&e=EMAIL
 *
 * Lands here from the abandonment-nudge email. Fetches the stored
 * `checkout_intents` row and either:
 *   - deep-links straight to /taxi, /tours or /rentals pre-selected
 *     via query params so the modal re-opens on the right card, OR
 *   - shows a small summary with a "Finish booking" CTA when we can't
 *     resolve the right landing page (safe fallback).
 *
 * Token is single-use within a 24-hour window — backend returns 410
 * past that; we surface a friendly "quote expired" state.
 */
export default function ResumeCheckout() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("t") || "";
  const email = params.get("e") || "";
  const [state, setState] = useState({ loading: true, intent: null, error: "" });

  useEffect(() => {
    if (!token || !email) {
      setState({ loading: false, intent: null, error: "This resume link is missing its token." });
      return;
    }
    api.get(`/checkout/intent/${encodeURIComponent(token)}`, { params: { email } })
      .then((r) => setState({ loading: false, intent: r.data, error: "" }))
      .catch((e) => {
        const code = e?.response?.status;
        const msg = code === 410
          ? "Your 24-hour hold has expired. Start a fresh booking — same price if the trip is still available."
          : code === 404
            ? "We couldn't find that quote. It may have already been booked."
            : (e?.response?.data?.detail || "Could not load your saved quote.");
        setState({ loading: false, intent: null, error: msg });
      });
  }, [token, email]);

  // Auto-forward: if the stored intent maps cleanly to a service page,
  // bounce the guest there with `?resume=1&t=…&e=…` so BookingFlow can
  // rehydrate from the token. For custom groups we stay on this page.
  useEffect(() => {
    if (!state.intent) return;
    const svc = (state.intent.service_type || "").toLowerCase();
    if (!svc) return;
    const map = { taxi: "/taxi", tour: "/tours", rental: "/rentals" };
    const path = map[svc];
    if (!path) return;
    const q = new URLSearchParams({
      resume: "1", t: token, e: email, item: state.intent.item_id || "",
    }).toString();
    // Small delay so the user sees "Reopening your booking…" for a split
    // second rather than a jarring instant redirect.
    const h = setTimeout(() => nav(`${path}?${q}`, { replace: true }), 900);
    return () => clearTimeout(h);
  }, [state.intent, token, email, nav]);

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-14" data-testid="resume-checkout-page">
      <div className="text-[10px] tracking-[0.3em] uppercase text-[#D4A94A] font-bold">Welcome back</div>
      <h1 className="serif text-3xl sm:text-4xl text-[#0B3B5C] mt-2">
        {state.loading ? "Reopening your booking…"
          : state.intent ? "Your price is still live."
          : "That link didn't resolve."}
      </h1>

      {state.loading && (
        <div className="mt-8 flex items-center gap-3 text-[#64748B]">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Rehydrating your quote…</span>
        </div>
      )}

      {state.intent && !state.loading && (
        <div className="mt-8 rounded-3xl border border-[#E2E8F0] bg-white p-6" data-testid="resume-checkout-summary">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] tracking-[0.22em] uppercase text-[#64748B] font-bold">Your trip</div>
              <div className="text-[#0B3B5C] font-bold mt-1 text-lg">{state.intent.item_name}</div>
              {state.intent.booking_date && (
                <div className="text-[13px] text-[#64748B] mt-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {state.intent.booking_date.replace("T", " · ").slice(0, 20)}
                </div>
              )}
              {state.intent.pax ? (
                <div className="text-[12px] text-[#64748B] mt-0.5">{state.intent.pax} guest{state.intent.pax === 1 ? "" : "s"}</div>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-[10px] tracking-[0.22em] uppercase text-[#64748B] font-bold">Total</div>
              <div className="serif text-2xl text-[#E86A3C] font-black mt-1">{money(state.intent.total)}</div>
            </div>
          </div>

          <button
            onClick={() => {
              const svc = (state.intent.service_type || "").toLowerCase();
              const map = { taxi: "/taxi", tour: "/tours", rental: "/rentals" };
              const path = map[svc] || "/";
              const q = new URLSearchParams({
                resume: "1", t: token, e: email, item: state.intent.item_id || "",
              }).toString();
              nav(`${path}?${q}`);
            }}
            data-testid="resume-checkout-cta"
            className="btn-shine mt-6 w-full rounded-full bg-[#E86A3C] text-white px-5 py-3 text-sm font-bold hover:bg-[#d55a30] inline-flex items-center justify-center gap-2"
          >
            Finish booking <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-[11px] text-[#64748B] text-center mt-3">
            Taking you to the booking page — your details and price are preserved.
          </p>
        </div>
      )}

      {!state.intent && !state.loading && (
        <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6" data-testid="resume-checkout-error">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-900">We can't resume this one</div>
              <p className="text-[13px] text-amber-800 mt-1 leading-snug">{state.error}</p>
              <button
                onClick={() => nav("/")}
                data-testid="resume-checkout-start-over"
                className="mt-4 inline-flex items-center gap-1 rounded-full bg-[#0B3B5C] text-white px-4 py-2 text-xs font-bold hover:bg-[#132a4a]"
              >
                Start a fresh booking <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
