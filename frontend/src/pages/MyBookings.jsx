import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API, money, STATUS_STEPS, STATUS_INDEX } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Ticket, MapPin, ArrowRight, LogOut } from "lucide-react";

export default function MyBookings() {
  const { user, loading, login, logout } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { setFetching(false); return; }
    (async () => {
      setFetching(true);
      try {
        const r = await fetch(`${API}/my/bookings`, { credentials: "include" });
        if (r.ok) setBookings(await r.json());
      } finally { setFetching(false); }
    })();
  }, [user, loading]);

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
        <button
          onClick={login}
          data-testid="mybookings-google-signin-btn"
          className="mt-8 inline-flex items-center gap-3 rounded-full bg-white border border-[#E2E8F0] px-6 py-3 text-sm font-semibold hover:border-[#D4A94A] active:scale-95"
        >
          <GoogleIcon /> Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-10 py-16" data-testid="mybookings-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {user.picture && <img src={user.picture} alt="" className="w-14 h-14 rounded-full border-2 border-white shadow-md" />}
          <div>
            <div className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Signed in</div>
            <div className="serif text-3xl text-[#0B3B5C]">Welcome back, {user.name?.split(" ")[0] || "friend"}.</div>
            <div className="text-sm text-[#64748B] mt-0.5">{user.email}</div>
          </div>
        </div>
        <button onClick={logout} className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] px-4 py-2 text-sm hover:border-[#0B3B5C]" data-testid="mybookings-logout">
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>

      <h2 className="serif text-3xl text-[#0B3B5C] mt-12">Your bookings</h2>
      {bookings.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#E2E8F0] p-10 text-center text-[#64748B]">
          You haven't made a booking yet. <Link to="/taxi" className="text-[#D4A94A] hover:underline">Book a taxi →</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {bookings.map((b) => {
            const idx = STATUS_INDEX(b.status);
            return (
              <div key={b.id} className="rounded-2xl border border-[#E2E8F0] bg-white p-6 flex flex-wrap gap-6 items-center justify-between hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(212,169,74,0.08)] transition-transform" data-testid={`mybookings-item-${b.id}`}>
                <div>
                  <div className="mono text-lg text-[#0B3B5C] font-semibold">{b.id}</div>
                  <div className="text-sm text-[#0B3B5C] mt-1">{b.item_name}</div>
                  <div className="text-xs text-[#64748B] mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {new Date(b.booking_date).toLocaleString()}</div>
                </div>
                <div className="flex-1 min-w-[240px]">
                  <div className="text-xs tracking-[0.2em] uppercase text-[#64748B]">Status</div>
                  <div className="mt-1 text-sm font-semibold text-[#0B3B5C]">{STATUS_STEPS[Math.max(idx,0)]?.label || b.status.replace("_"," ")}</div>
                  <div className="mt-2 h-1 rounded-full bg-[#F1F5F9] overflow-hidden">
                    <div className="h-full bg-[#D4A94A]" style={{ width: `${Math.max(idx,0)/(STATUS_STEPS.length-1)*100}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="mono text-lg text-[#E86A3C] font-semibold">{money(b.total)}</div>
                  <Link to={`/track?id=${b.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-[#D4A94A] hover:underline">Track <ArrowRight className="w-3 h-3" /></Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.1 29.2 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.9 29 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.6 19 13 24 13c2.8 0 5.4 1.1 7.4 2.8l5.7-5.7C33.5 6.9 29 5 24 5 16.3 5 9.7 9.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 43c5 0 9.4-1.9 12.8-5l-5.9-5c-2 1.4-4.4 2.2-6.9 2.2-5.2 0-9.6-3.4-11.2-8L6.4 32.4C9.7 38.4 16.3 43 24 43z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l5.9 5c-.4.4 6.1-4.5 6.1-14.7 0-1.2-.1-2.3-.4-3.5z"/></svg>
  );
}
