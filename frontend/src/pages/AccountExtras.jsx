import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Sparkles, ArrowRight, Copy, UserRound, Pencil } from "lucide-react";
import { toast } from "sonner";
import { API, money } from "../lib/api";
import { cdn } from "../lib/img";
import { useAuth } from "../lib/auth";
import CompleteProfileModal from "../components/CompleteProfileModal";

export function ProfileCard() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const p = user?.profile || {};
  const rows = [["Phone", p.phone || user?.phone], ["Address", [p.address, p.city, p.country].filter(Boolean).join(", ")],
    ["Hotel / ship", p.hotel], ["Travel dates", p.travel_from ? `${p.travel_from}${p.travel_to ? ` → ${p.travel_to}` : ""}` : ""]];
  return (
    <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white p-5" data-testid="account-profile-card">
      <div className="flex items-center justify-between">
        <h3 className="serif text-xl text-[#0B3B5C] inline-flex items-center gap-2"><UserRound className="w-5 h-5 text-[#D4A94A]" /> Your details</h3>
        <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B3B5C] hover:text-[#D4A94A] transition-colors" data-testid="account-profile-edit"><Pencil className="w-3.5 h-3.5" /> Edit</button>
      </div>
      <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-[#F1F5F9] py-1.5">
            <dt className="text-xs text-[#64748B]">{k}</dt><dd className="text-[#0B3B5C] font-medium text-right">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      {editing && <CompleteProfileModal open onClose={() => setEditing(false)} />}
    </div>
  );
}

const useMine = (path) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(`${API}${path}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setData)
      .catch(() => setData([]));
  }, [path]);
  return data;
};

export function TripSummary({ bookings }) {
  const past = bookings.filter((b) => b.status === "completed" || (b.status !== "cancelled" && new Date(b.booking_date) < new Date()));
  const spent = bookings.filter((b) => b.payment_status === "paid").reduce((s, b) => s + Number(b.total || 0), 0);
  const last = past.map((b) => b.booking_date).sort().pop();
  const items = [
    ["Trips taken", past.length, "summary-trips"],
    ["Total spent", money(spent), "summary-spent"],
    ["Last trip", last ? new Date(last).toLocaleDateString() : "—", "summary-last"],
  ];
  return (
    <div className="mt-6 grid grid-cols-3 gap-3" data-testid="account-trip-summary">
      {items.map(([k, v, id]) => (
        <div key={k} className="rounded-2xl border border-[#E2E8F0] bg-white p-4 text-center">
          <div className="mono text-lg sm:text-xl font-bold text-[#0B3B5C]" data-testid={id}>{v}</div>
          <div className="text-[10px] tracking-[0.15em] uppercase text-[#64748B] mt-1">{k}</div>
        </div>
      ))}
    </div>
  );
}

export function MyGiftCards() {
  const cards = useMine("/my/gift-cards");
  if (!cards) return null;
  return (
    <div className="mt-8 rounded-2xl border border-[#EFE7D5] bg-[#FBF7EF] p-5" data-testid="account-gift-cards">
      <div className="flex items-center justify-between">
        <h3 className="serif text-xl text-[#0B3B5C] inline-flex items-center gap-2"><Gift className="w-5 h-5 text-[#D4A94A]" /> Gift cards</h3>
        <Link to="/gift-cards" className="text-xs font-semibold text-[#E86A3C] hover:underline" data-testid="account-buy-gift-card">Buy a gift card →</Link>
      </div>
      {cards.length === 0 ? (
        <p className="mt-2 text-sm text-[#64748B]" data-testid="account-gift-cards-empty">No gift cards yet. Gift cards sent to your email will show up here.</p>
      ) : (
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.code} className="rounded-xl bg-white border border-[#EFE7D5] p-4" data-testid={`account-gift-card-${c.code}`}>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Code copied"); }} className="mono font-bold text-[#0B3B5C] inline-flex items-center gap-1.5">
                  {c.code} <Copy className="w-3 h-3" />
                </button>
                <span className={`mono font-black ${c.expired ? "text-[#94a3b8] line-through" : "text-[#059669]"}`}>{money(c.balance)}</span>
              </div>
              <div className="text-[11px] text-[#64748B] mt-1">
                {c.mine ? "Sent to you" : "You bought this"} · {c.expired ? "Expired" : c.expires_at ? `Valid until ${new Date(c.expires_at).toLocaleDateString()}` : "No expiry"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecommendedForYou() {
  const recs = useMine("/my/recommendations");
  if (!recs || recs.length === 0) return null;
  return (
    <div className="mt-10" data-testid="account-recommendations">
      <h3 className="serif text-2xl text-[#0B3B5C] inline-flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#D4A94A]" /> Recommended for you</h3>
      <div className="mt-4 flex gap-4 overflow-x-auto pb-2 snap-x">
        {recs.map((r) => (
          <Link key={r.id} to={r.link} className="snap-start shrink-0 w-60 rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden hover:-translate-y-0.5 hover:shadow-lg transition-transform" data-testid={`account-rec-${r.id}`}>
            <div className="h-28 bg-gradient-to-br from-[#0B3B5C] to-[#D4A94A]">
              {r.image_url && <img src={cdn(r.image_url, { w: 480 })} alt={r.name} className="w-full h-full object-cover" loading="lazy" />}
            </div>
            <div className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-[#D4A94A] font-bold">{r.reason}</div>
              <div className="text-sm font-semibold text-[#0B3B5C] mt-1 line-clamp-2">{r.name}</div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="mono text-[#E86A3C] font-bold">{r.price ? `from ${money(r.price)}` : ""}</span>
                <span className="inline-flex items-center gap-1 text-[#0B3B5C] font-semibold">Book <ArrowRight className="w-3 h-3" /></span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function bookAgainLink(b) {
  if (b.item_id === "cable-beach-day") return "/tours/cable-beach-day";
  if (b.service_type === "tour") return `/tours?book=${b.item_id}`;
  if (b.service_type === "rental") return "/rentals";
  return "/taxi";
}
