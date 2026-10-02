import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";
import { api } from "../lib/api";
import Seo from "../components/Seo";

export function CardHoldSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id") || "";
  const [state, setState] = useState({ loading: true, saved: false, status: null, bookingId: null, error: null });

  useEffect(() => {
    if (!sessionId) {
      setState({ loading: false, saved: false, status: null, bookingId: null, error: "Missing session id" });
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const { data } = await api.get(`/card-hold/status/${sessionId}`);
        if (cancelled) return;
        if (data.saved) {
          setState({ loading: false, saved: true, status: data.status, bookingId: data.booking_id, error: null });
          return;
        }
        if (attempts >= 10) {
          setState({ loading: false, saved: false, status: data.status, bookingId: data.booking_id, error: null });
          return;
        }
        setTimeout(poll, 1500);
      } catch (e) {
        if (cancelled) return;
        setState({ loading: false, saved: false, status: null, bookingId: null, error: e?.response?.data?.detail || "Could not verify" });
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <>
      <Seo title="Card secured · Rox Taxi" description="Your card is on file for your Rox Taxi booking." noindex />
      <section className="min-h-[70vh] bg-[#F8FAFC] py-24 px-6">
        <div className="max-w-xl mx-auto bg-white rounded-3xl border border-[#E2E8F0] shadow-sm p-10 text-center" data-testid="card-hold-success">
          {state.loading && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-[#0B3B5C] mx-auto" />
              <h1 className="serif text-3xl text-[#0B3B5C] mt-6">Securing your card…</h1>
              <p className="text-[#64748B] mt-3">Hang tight — Stripe is confirming the save.</p>
            </>
          )}
          {!state.loading && state.saved && (
            <>
              <div className="w-16 h-16 rounded-full bg-[#059669]/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9 text-[#059669]" />
              </div>
              <h1 className="serif text-3xl text-[#0B3B5C] mt-6" data-testid="card-hold-success-title">Card on file.</h1>
              <p className="text-[#64748B] mt-3 leading-relaxed">
                Your card has been securely saved for booking <span className="mono font-semibold text-[#0B3B5C]">{state.bookingId}</span>.
                We will <strong>only</strong> charge it if an incidental applies (damage, late return, extra cleaning) and we'll always
                tell you the reason first.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0B3B5C]/5 border border-[#0B3B5C]/15 px-4 py-2 text-xs font-semibold text-[#0B3B5C]">
                <ShieldCheck className="w-4 h-4 text-[#D4A94A]" /> Powered by Stripe · PCI-DSS Level 1
              </div>
              <div className="mt-8">
                <Link to="/" className="inline-block rounded-full bg-[#0B3B5C] text-white px-6 py-3 text-sm font-semibold hover:bg-[#132a4a]">
                  Back to Rox Taxi
                </Link>
              </div>
            </>
          )}
          {!state.loading && !state.saved && (
            <>
              <div className="w-16 h-16 rounded-full bg-[#DC2626]/10 flex items-center justify-center mx-auto">
                <X className="w-9 h-9 text-[#DC2626]" />
              </div>
              <h1 className="serif text-3xl text-[#0B3B5C] mt-6">Still processing…</h1>
              <p className="text-[#64748B] mt-3">
                We haven't received confirmation yet. Please try again in a minute or reach out to us.
              </p>
              {state.error && <p className="mt-2 text-xs text-[#DC2626]">{state.error}</p>}
              <div className="mt-8">
                <Link to="/" className="inline-block rounded-full bg-[#0B3B5C] text-white px-6 py-3 text-sm font-semibold hover:bg-[#132a4a]">
                  Back to Rox Taxi
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

export function CardHoldCancel() {
  return (
    <>
      <Seo title="Card save cancelled · Rox Taxi" description="You cancelled saving a card on file." noindex />
      <section className="min-h-[70vh] bg-[#F8FAFC] py-24 px-6">
        <div className="max-w-xl mx-auto bg-white rounded-3xl border border-[#E2E8F0] shadow-sm p-10 text-center" data-testid="card-hold-cancel">
          <div className="w-16 h-16 rounded-full bg-[#F1F5F9] flex items-center justify-center mx-auto">
            <X className="w-9 h-9 text-[#64748B]" />
          </div>
          <h1 className="serif text-3xl text-[#0B3B5C] mt-6">Card save cancelled.</h1>
          <p className="text-[#64748B] mt-3">
            No worries — we did not save anything. If you'd like to try again, just use the secure link we sent you.
          </p>
          <div className="mt-8">
            <Link to="/" className="inline-block rounded-full bg-[#0B3B5C] text-white px-6 py-3 text-sm font-semibold hover:bg-[#132a4a]">
              Back to Rox Taxi
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
