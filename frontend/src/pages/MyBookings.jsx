import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API, money, STATUS_STEPS, STATUS_INDEX, BACKEND_URL } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Ticket, MapPin, ArrowRight, LogOut, XCircle, Download, CreditCard, Clock, Shield, CalendarPlus, Gift, Copy } from "lucide-react";
import { toast } from "sonner";
import ExtendRentalModal from "./ExtendRentalModal";

export default function MyBookings() {
  const { user, loading, logout } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [cancelling, setCancelling] = useState(null);
  const [extending, setExtending] = useState(null);
  const [referral, setReferral] = useState(null);

  const loadBookings = async () => {
    setFetching(true);
    try {
      const r = await fetch(`${API}/my/bookings`, { credentials: "include" });
      if (r.ok) setBookings(await r.json());
    } finally { setFetching(false); }
  };

  const loadReferral = async () => {
    try {
      const r = await fetch(`${API}/referrals/summary`, { credentials: "include" });
      if (r.ok) setReferral(await r.json());
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { setFetching(false); return; }
    loadBookings();
    loadReferral();
    // Post-checkout success toast
    const q = new URLSearchParams(window.location.search);
    if (q.get("extended")) {
      toast.success(`Rental ${q.get("extended")} extended — new return date applied.`);
      window.history.replaceState({}, "", "/my-bookings");
    } else if (q.get("extend_cancelled")) {
      toast("Extension cancelled — no charge made.");
      window.history.replaceState({}, "", "/my-bookings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const handleCancel = async (b) => {
    if (!window.confirm(`Cancel booking ${b.id}? A 15% fee applies if cancelled with ≥48 hours notice. Cancellations inside 48hr are non-refundable.`)) return;
    setCancelling(b.id);
    try {
      const r = await fetch(`${API}/bookings/${b.id}/cancel`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Cancel failed");
      toast.success(data.message || "Cancelled.");
      await loadBookings();
    } catch (e) {
      toast.error(e.message);
    } finally { setCancelling(null); }
  };

  if (loading || fetching) {
    return <div className="min-h-[60vh] flex items-center justify-center text-[#64748B]">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="mybookings-signin">
        <div className="w-16 h-16 rounded-full bg-[#D4A94A]/10 text-[#D4A94A] mx-auto flex items-center justify-center mb-6">
          <Ticket className="w-7 h-7" />
        </div>
        <h1 className="serif text-4xl sm:text-5xl text-[#0B3B5C]">Sign in to see your rides.</h1>
        <p className="text-[#64748B] mt-3">Access every taxi, tour and rental you've booked with Rox — all in one place.</p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link to="/login" data-testid="mybookings-signin-btn" className="inline-flex items-center gap-2 rounded-full bg-[#0B3B5C] hover:bg-[#0B192C] text-white px-6 py-3 text-sm font-semibold">
            Sign in
          </Link>
          <Link to="/signup" data-testid="mybookings-signup-btn" className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white text-[#0B3B5C] px-6 py-3 text-sm font-semibold hover:border-[#D4A94A]">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-10 py-16" data-testid="mybookings-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {user.picture ? (
            <img src={user.picture} alt="" className="w-14 h-14 rounded-full border-2 border-white shadow-md object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#D4A94A]/12 text-[#D4A94A] font-bold text-xl flex items-center justify-center border-2 border-white shadow-md">
              {(user.name || user.email || "?").trim().charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Signed in</div>
            <div className="serif text-3xl text-[#0B3B5C]">Welcome back, {user.name?.split(" ")[0] || "friend"}.</div>
            <div className="text-sm text-[#64748B] mt-0.5">{user.email}</div>
            {user.last_login_at && (
              <div className="text-[11px] text-[#94a3b8] mt-1 flex items-center gap-1" data-testid="mybookings-last-login">
                <Clock className="w-3 h-3" /> Last sign-in {new Date(user.last_login_at).toLocaleString()} · via {user.last_login_method || user.provider || "email"}
              </div>
            )}
          </div>
        </div>
        <button onClick={() => logout()} className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] px-4 py-2 text-sm hover:border-[#0B3B5C]" data-testid="mybookings-logout">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 text-[11px] text-[#64748B] bg-white/60 backdrop-blur rounded-full border border-white/70 px-3 py-1.5" data-testid="mybookings-idle-notice">
        <Shield className="w-3.5 h-3.5 text-[#D4A94A]" /> You'll be signed out automatically after 1 hour of inactivity.
      </div>

      {referral && referral.code && (
        <div
          className="mt-8 rounded-2xl border border-[#EFE7D5] bg-gradient-to-br from-[#FBF7EF] to-white p-5 shadow-[0_10px_30px_rgba(212,169,74,0.08)]"
          data-testid="referral-card"
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-[#D4A94A]/12 text-[#D4A94A] flex items-center justify-center">
                <Gift className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] tracking-[0.25em] uppercase text-[#64748B] font-semibold">Your referral code</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span data-testid="referral-code" className="mono font-bold text-lg text-[#0B3B5C]">{referral.code}</span>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(referral.referral_link).then(() => toast.success("Link copied")); }}
                    className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] hover:border-[#D4A94A] text-[11px] text-[#0B3B5C] px-2.5 py-1"
                    data-testid="referral-copy-link"
                    title="Copy your invite link"
                  >
                    <Copy className="w-3 h-3" /> Copy link
                  </button>
                </div>
                <div className="text-[11px] text-[#64748B] mt-1">
                  Refer <strong className="text-[#0B3B5C]">{referral.unlock_every}</strong> friends who complete their first paid trip →
                  unlock a <strong className="text-[#059669]">${referral.reward_per_unlock_usd}</strong> credit.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6 shrink-0">
              <Stat label="Invited" value={referral.total_referred} testid="referral-total-referred" />
              <Stat label="Rides completed" value={referral.total_converted} testid="referral-total-converted" />
              <Stat label="Credit balance" value={money(referral.credit_balance)} tone="ok" testid="referral-credit-balance" />
            </div>
          </div>
          {referral.total_converted > 0 && (
            <div className="mt-3 h-1.5 bg-[#EFE7D5] rounded-full overflow-hidden" data-testid="referral-progress">
              <div
                className="h-full bg-gradient-to-r from-[#D4A94A] to-[#A88235]"
                style={{ width: `${((referral.total_converted % referral.unlock_every) / referral.unlock_every) * 100 || 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      <h2 className="serif text-3xl text-[#0B3B5C] mt-12">Your bookings</h2>
      {bookings.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] p-10 text-center text-[#64748B]">
          You haven't made a booking yet. <Link to="/taxi" className="text-[#D4A94A] hover:underline">Book a taxi →</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {bookings.map((b) => {
            const idx = STATUS_INDEX(b.status);
            const isCancelled = b.status === "cancelled";
            const isCompleted = b.status === "completed";
            const paid = b.payment_status === "paid";
            const canCancel = !isCancelled && !isCompleted;
            const showPay = !paid && !isCancelled;
            return (
              <div key={b.id} className="rounded-2xl border border-[#E2E8F0] bg-white p-6 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(212,169,74,0.08)] transition-transform" data-testid={`mybookings-item-${b.id}`}>
                <div className="flex flex-wrap gap-6 items-center justify-between">
                  <div>
                    <div className="mono text-lg text-[#0B3B5C] font-semibold">{b.id}</div>
                    <div className="text-sm text-[#0B3B5C] mt-1">{b.item_name}</div>
                    <div className="text-xs text-[#64748B] mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {new Date(b.booking_date).toLocaleString()}</div>
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <div className="text-xs tracking-[0.2em] uppercase text-[#64748B]">Status</div>
                    <div className={`mt-1 text-sm font-semibold ${isCancelled ? "text-[#B91C1C]" : "text-[#0B3B5C]"}`}>
                      {isCancelled ? "Cancelled" : (STATUS_STEPS[Math.max(idx,0)]?.label || b.status.replace("_"," "))}
                    </div>
                    {!isCancelled && (
                      <div className="mt-2 h-1 rounded-full bg-[#F1F5F9] overflow-hidden">
                        <div className="h-full bg-[#D4A94A]" style={{ width: `${Math.max(idx,0)/(STATUS_STEPS.length-1)*100}%` }} />
                      </div>
                    )}
                    <div className="mt-2 text-[11px] text-[#64748B]">Payment: <span className={paid ? "text-emerald-600 font-semibold" : "text-[#E86A3C] font-semibold"}>{b.payment_status || "pending"}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-lg text-[#E86A3C] font-semibold">{money(b.total)}</div>
                    {!isCancelled && (
                      <Link to={`/track?id=${b.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-[#D4A94A] hover:underline">
                        Track <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[#F1F5F9] flex flex-wrap gap-2">
                  {showPay && (
                    <Link to={`/pay/${b.id}`} data-testid={`mybookings-pay-${b.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white text-xs font-semibold px-3.5 py-2">
                      <CreditCard className="w-3.5 h-3.5" /> Pay balance
                    </Link>
                  )}
                  <a href={`${BACKEND_URL}/api/bookings/${b.id}/receipt.pdf`} target="_blank" rel="noreferrer" data-testid={`mybookings-receipt-${b.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white hover:border-[#0B3B5C] text-[#0B3B5C] text-xs font-semibold px-3.5 py-2">
                    <Download className="w-3.5 h-3.5" /> Download receipt
                  </a>
                  {canCancel && (
                    <button onClick={() => handleCancel(b)} disabled={cancelling === b.id} data-testid={`mybookings-cancel-${b.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#FECACA] bg-[#FEF2F2] hover:border-[#B91C1C] text-[#B91C1C] text-xs font-semibold px-3.5 py-2 disabled:opacity-60">
                      <XCircle className="w-3.5 h-3.5" /> {cancelling === b.id ? "Cancelling…" : "Cancel"}
                    </button>
                  )}
                  {/* Extend rental — only for paid, active rentals */}
                  {b.service_type === "rental" && paid && !isCancelled && !isCompleted && (
                    <button
                      onClick={() => setExtending(b)}
                      data-testid={`mybookings-extend-${b.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#EFE7D5] bg-white hover:border-[#D4A94A] text-[#0B3B5C] text-xs font-semibold px-3.5 py-2"
                      title="Add more days — no new deposit needed"
                    >
                      <CalendarPlus className="w-3.5 h-3.5 text-[#D4A94A]" /> Extend rental
                    </button>
                  )}
                  {isCancelled && b.cancellation && (
                    <span className="text-[11px] text-[#64748B]" data-testid={`mybookings-cancel-info-${b.id}`}>
                      Cancelled · fee {money(b.cancellation.fee)} · refund est {money(b.cancellation.refund_estimate)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {extending && (
        <ExtendRentalModal
          booking={extending}
          onClose={() => setExtending(null)}
          onSuccess={() => { setExtending(null); loadBookings(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone, testid }) {
  return (
    <div className="text-center" data-testid={testid}>
      <div className={`text-lg font-bold ${tone === "ok" ? "text-[#059669]" : "text-[#0B3B5C]"} mono`}>{value}</div>
      <div className="text-[10px] tracking-[0.15em] uppercase text-[#64748B]">{label}</div>
    </div>
  );
}
