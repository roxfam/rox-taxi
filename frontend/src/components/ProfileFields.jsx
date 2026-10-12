import { Phone, MapPin, Building2, Globe, Hotel, CalendarDays, Megaphone } from "lucide-react";

const COUNTRIES = ["United States", "Canada", "The Bahamas", "United Kingdom", "Germany", "France", "Italy", "Spain", "Netherlands", "Brazil", "Mexico", "Jamaica", "Australia", "Other"];
const HEARD = ["Google search", "Instagram", "Facebook", "TikTok", "Friend or family", "Hotel or cruise staff", "TripAdvisor", "Returning guest", "Other"];

export const EMPTY_PROFILE = { phone: "", address: "", city: "", country: "", hotel: "", travel_from: "", travel_to: "", heard_from: "", marketing_opt_in: true };

export const profileMissing = (p) => ["phone", "address", "city", "country"].filter((k) => !(p[k] || "").trim());

const Row = ({ icon: Icon, label, children }) => (
  <label className="block">
    <span className="text-[10px] tracking-[0.25em] uppercase text-[#64748B] font-bold flex items-center gap-2 mb-1">
      <Icon className="w-3.5 h-3.5 text-[#D4A94A]" />{label}
    </span>
    {children}
  </label>
);

export default function ProfileFields({ value, onChange, showOptional = true }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const cls = "pf-input";
  return (
    <div className="space-y-5" data-testid="profile-fields">
      <Row icon={Phone} label="Mobile phone *">
        <input required type="tel" autoComplete="tel" value={value.phone} onChange={set("phone")} placeholder="+1 242 555 0123" className={cls} data-testid="profile-phone" />
      </Row>
      <Row icon={MapPin} label="Street address *">
        <input required autoComplete="street-address" value={value.address} onChange={set("address")} placeholder="123 Bay Street" className={cls} data-testid="profile-address" />
      </Row>
      <div className="grid grid-cols-2 gap-4">
        <Row icon={Building2} label="City *">
          <input required autoComplete="address-level2" value={value.city} onChange={set("city")} placeholder="Miami" className={cls} data-testid="profile-city" />
        </Row>
        <Row icon={Globe} label="Country *">
          <input required list="pf-countries" autoComplete="country-name" value={value.country} onChange={set("country")} placeholder="United States" className={cls} data-testid="profile-country" />
          <datalist id="pf-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Row>
      </div>
      {showOptional && (
        <div className="rounded-2xl bg-[#FBF7EF] border border-[#EFE7D5] p-4 space-y-4" data-testid="profile-optional">
          <div className="text-[10px] tracking-[0.3em] uppercase font-bold text-[#A88235]">Help us plan your trip (optional)</div>
          <Row icon={Hotel} label="Hotel or cruise ship">
            <input value={value.hotel} onChange={set("hotel")} placeholder="Baha Mar / Wonder of the Seas" className={cls} data-testid="profile-hotel" />
          </Row>
          <div className="grid grid-cols-2 gap-4">
            <Row icon={CalendarDays} label="Arriving">
              <input type="date" value={value.travel_from} onChange={set("travel_from")} className={cls} data-testid="profile-travel-from" />
            </Row>
            <Row icon={CalendarDays} label="Leaving">
              <input type="date" value={value.travel_to} min={value.travel_from || undefined} onChange={set("travel_to")} className={cls} data-testid="profile-travel-to" />
            </Row>
          </div>
          <Row icon={Megaphone} label="How did you hear about us?">
            <select value={value.heard_from} onChange={set("heard_from")} className={cls} data-testid="profile-heard-from">
              <option value="">Select…</option>
              {HEARD.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </Row>
          <label className="flex items-start gap-2 text-xs text-[#0B3B5C] cursor-pointer">
            <input type="checkbox" checked={!!value.marketing_opt_in} onChange={set("marketing_opt_in")} className="mt-0.5" data-testid="profile-optin" />
            Send me exclusive offers and island tips by text and email. Unsubscribe anytime.
          </label>
        </div>
      )}
      <style>{`.pf-input{width:100%;background:transparent;border:0;border-bottom:1.5px solid #E2E8F0;padding:10px 0;font-size:15px;color:#0B3B5C;outline:none;transition:border-color .2s}.pf-input:focus{border-color:#D4A94A}.pf-input::placeholder{color:#94a3b8}`}</style>
    </div>
  );
}
