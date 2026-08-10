import { useEffect, useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { Users, MapPin, ShieldAlert } from "lucide-react";
import { api } from "../../lib/api";

// Small, hosted TopoJSON — 110m resolution is plenty for a pin map and
// keeps the payload under 100 KB. Anything higher-res would balloon the
// admin page for zero visual gain at this render size.
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Rough centroids for the most common signup countries. We prefer these
// over runtime geocoding (no extra API call, works offline, immediate
// render). Backend supplies ISO-3 codes but centroid lookup keys on the
// country name for simplicity — expand this table as new markets show up.
const CENTROIDS = {
  "United States": [-95, 40], "Canada": [-96, 60], "United Kingdom": [-2, 54],
  "Bahamas": [-77.4, 25.03], "Jamaica": [-77.3, 18.1], "Trinidad and Tobago": [-61.2, 10.7],
  "Barbados": [-59.5, 13.2], "Cuba": [-77.8, 21.5], "Dominican Republic": [-70.7, 18.7],
  "Mexico": [-102.5, 23.6], "Brazil": [-51.9, -14.2], "Argentina": [-63.6, -38.4],
  "Colombia": [-74.3, 4.6], "Venezuela": [-66.6, 6.4],
  "Germany": [10.4, 51.2], "France": [2.2, 46.2], "Italy": [12.6, 41.9], "Spain": [-3.7, 40.5],
  "Netherlands": [5.3, 52.1], "Belgium": [4.5, 50.5], "Portugal": [-8.2, 39.4],
  "Ireland": [-8.2, 53.4], "Sweden": [18.6, 60.1], "Norway": [8.5, 60.5],
  "Denmark": [9.5, 56.3], "Poland": [19.1, 51.9], "Switzerland": [8.2, 46.8],
  "Austria": [14.6, 47.5], "Russia": [105.3, 61.5], "Ukraine": [31.2, 48.4],
  "Turkey": [35.2, 39.0], "Israel": [34.9, 31.0], "United Arab Emirates": [53.8, 23.4],
  "Saudi Arabia": [45.1, 23.9], "Qatar": [51.2, 25.4],
  "China": [104.2, 35.9], "Japan": [138.3, 36.2], "South Korea": [127.8, 35.9],
  "India": [78.9, 20.6], "Pakistan": [69.3, 30.4], "Bangladesh": [90.4, 23.7],
  "Philippines": [121.8, 13.0], "Indonesia": [113.9, -0.8], "Thailand": [100.9, 15.9],
  "Vietnam": [108.3, 14.1], "Australia": [133.8, -25.3], "New Zealand": [174.9, -40.9],
  "South Africa": [22.9, -30.6], "Nigeria": [8.7, 9.1], "Kenya": [37.9, -0.02],
  "Ghana": [-1.0, 7.9], "Ethiopia": [40.5, 9.1], "Egypt": [30.8, 26.8],
  "Morocco": [-7.1, 31.8], "Haiti": [-72.3, 18.9],
};

// Fallback for countries not in the centroid table — pin them off-map
// but keep the count visible in the table below.
function centroidFor(country) {
  return CENTROIDS[country] || null;
}

function fmt(dateStr) {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return dateStr; }
}

export default function SignupCountriesCard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    api.get("/admin/analytics/signup-countries")
      .then((r) => setData(r.data))
      .catch(() => setData({ rows: [], unique_countries: 0, total_signups_tracked: 0, legacy_users: 0, unknown_country_users: 0 }))
      .finally(() => setBusy(false));
  }, []);

  // Country → count map for O(1) fill-color lookup while Geographies
  // iterates the whole world. Highlights countries we've had signups from.
  const countMap = useMemo(() => {
    const m = new Map();
    (data?.rows || []).forEach((r) => m.set(r.country, r.count));
    return m;
  }, [data]);

  const maxCount = Math.max(1, ...(data?.rows || []).map((r) => r.count));

  const fillColor = (name) => {
    const c = countMap.get(name);
    if (!c) return "#EEF2F6";
    // Amber → deep-navy gradient by intensity so bigger clusters pop
    const t = Math.log(c + 1) / Math.log(maxCount + 1); // 0..1
    if (t < 0.35) return "#F5D57B";
    if (t < 0.65) return "#D4A94A";
    if (t < 0.85) return "#B08533";
    return "#0B3B5C";
  };

  return (
    <div className="mt-8 rounded-2xl bg-white border border-[#E2E8F0] p-6" data-testid="signup-countries-card">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#DC2626]" />
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#DC2626] font-bold">Fraud watch</div>
          </div>
          <div className="serif text-2xl text-[#0B3B5C] mt-1 leading-tight">Signups by country</div>
          <div className="text-xs text-[#64748B] mt-1">
            Spot suspicious clusters before a fraud wave. Legacy accounts and unresolved IPs are excluded.
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <MiniStat label="Unique countries" value={data?.unique_countries || 0} tone="#0B3B5C" icon={<MapPin className="w-3 h-3" />} testid="stat-unique-countries" />
          <MiniStat label="Tracked signups" value={data?.total_signups_tracked || 0} tone="#D4A94A" icon={<Users className="w-3 h-3" />} testid="stat-tracked-signups" />
          <MiniStat label="Legacy users" value={data?.legacy_users || 0} tone="#94a3b8" testid="stat-legacy-users" />
        </div>
      </div>

      {busy ? (
        <div className="h-64 flex items-center justify-center text-xs text-[#94a3b8]" data-testid="signup-countries-loading">Loading map…</div>
      ) : (
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
          {/* ── World map ─────────────────────────────────────────── */}
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] overflow-hidden" data-testid="signup-countries-map">
            <ComposableMap projectionConfig={{ scale: 130 }} width={800} height={400} style={{ width: "100%", height: "auto" }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) => geographies.map((geo) => {
                  const name = geo.properties.name;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fillColor(name)}
                      stroke="#FFFFFF"
                      strokeWidth={0.4}
                      style={{
                        default: { outline: "none" },
                        hover: { fill: "#E86A3C", outline: "none" },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })}
              </Geographies>
              {(data?.rows || []).map((r) => {
                const c = centroidFor(r.country);
                if (!c) return null;
                // Pin size scales with signup count (log for readability)
                const radius = 3 + Math.min(9, Math.log(r.count + 1) * 3.5);
                return (
                  <Marker key={r.country} coordinates={c}>
                    <circle r={radius} fill="#DC2626" fillOpacity={0.35} stroke="#DC2626" strokeWidth={1.2} />
                    <circle r={2} fill="#DC2626" />
                  </Marker>
                );
              })}
            </ComposableMap>
            <div className="px-4 py-2 border-t border-[#E2E8F0] flex items-center gap-4 text-[10px] text-[#64748B]">
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#F5D57B]" /> 1 signup</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#D4A94A]" /> few</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#B08533]" /> many</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#0B3B5C]" /> highest</span>
              <span className="inline-flex items-center gap-1.5 ml-auto"><span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]/70" /> pin (size = count)</span>
            </div>
          </div>

          {/* ── Ranked table ──────────────────────────────────────── */}
          <div className="rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="signup-countries-table">
            {(data?.rows || []).length === 0 ? (
              <div className="p-6 text-center text-xs text-[#94a3b8]">
                No signups tracked with country data yet. New accounts will start appearing here as soon as they register.
              </div>
            ) : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F8FAFC] text-left text-[10px] uppercase tracking-widest text-[#64748B] sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Country</th>
                      <th className="px-3 py-2 text-right">Signups</th>
                      <th className="px-3 py-2">First / Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.rows || []).map((r) => (
                      <tr key={r.country} className="border-t border-[#F1F5F9] hover:bg-[#FBF7EF]/40" data-testid={`country-row-${r.country.toLowerCase().replace(/\s+/g,'-')}`}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-[#0B3B5C]">{r.country}</div>
                          {r.sample_city && <div className="text-[10px] text-[#94a3b8] mt-0.5">{r.sample_city}</div>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="mono font-bold text-[#D4A94A]" data-testid={`country-count-${r.country.toLowerCase().replace(/\s+/g,'-')}`}>{r.count}</div>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-[#64748B]">
                          <div>First {fmt(r.first_seen)}</div>
                          {r.last_seen && r.last_seen !== r.first_seen && <div className="text-[#94a3b8]">Last {fmt(r.last_seen)}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone, icon, testid }) {
  return (
    <div className="rounded-lg bg-[#FBF7EF] border border-[#E2E8F0] px-3 py-2 min-w-[100px]" data-testid={testid}>
      <div className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-semibold flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="serif text-2xl leading-none mt-0.5" style={{ color: tone }}>{value}</div>
    </div>
  );
}
