import { useEffect, useState } from "react";
import { MapPin, AlertTriangle, CheckCircle2, Compass } from "lucide-react";
import { api } from "../../lib/api";

/**
 * PickupAuditCard — 60-day audit of driver-scan GPS pings vs the booked
 * pickup location. Any check-in that lands >500m away from the closest
 * known Nassau anchor (LPIA · Cruise Port · Cable Beach · Atlantis · etc.)
 * gets red-flagged so admins can quickly spot drivers who may have hit
 * "Confirm pickup" from their couch instead of at the meeting spot.
 *
 * Uses a haversine distance server-side; frontend just renders the rows.
 */
export default function PickupAuditCard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    api.get("/admin/analytics/pickup-audit")
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setBusy(false));
  }, []);

  if (busy) return <div className="mt-8 h-40 rounded-2xl bg-white border border-[#E2E8F0] p-6 text-xs text-[#94a3b8] flex items-center justify-center" data-testid="pickup-audit-loading">Loading pickup audit…</div>;
  if (!data) return null;

  const { total, flagged, flag_threshold_m, rows, window_days } = data;
  const clean = total - flagged;

  return (
    <div className="mt-8 rounded-2xl bg-white border border-[#E2E8F0] p-6" data-testid="pickup-audit-card">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#D4A94A]" />
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#D4A94A] font-bold">Driver pickup GPS audit</div>
          </div>
          <h2 className="serif text-2xl text-[#0B3B5C] mt-1">
            Where did drivers <em>actually</em> check in?
          </h2>
          <p className="text-xs text-[#64748B] mt-1 max-w-lg">
            Last {window_days} days of QR check-ins. Any ping more than {flag_threshold_m}m from the booked pickup anchor is flagged for review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1 text-xs font-bold" data-testid="pickup-audit-clean-pill">
            <CheckCircle2 className="w-3.5 h-3.5" /> {clean} on-spot
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
              flagged > 0
                ? "bg-[#FEF2E8] border-[#E86A3C]/30 text-[#E86A3C]"
                : "bg-[#F1F5F9] border-[#E2E8F0] text-[#64748B]"
            }`}
            data-testid="pickup-audit-flagged-pill"
          >
            <AlertTriangle className="w-3.5 h-3.5" /> {flagged} flagged
          </span>
        </div>
      </div>

      {total === 0 ? (
        <div className="mt-6 rounded-xl bg-[#FBF7EF] border border-dashed border-[#EFE7D5] p-6 text-center text-sm text-[#64748B]" data-testid="pickup-audit-empty">
          No GPS-stamped check-ins yet. Once drivers start scanning guest QR codes and granting location permission, their pings will show up here.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto" data-testid="pickup-audit-table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-[#94a3b8] text-left">
                <th className="pb-2 pr-3 font-semibold">Booking</th>
                <th className="pb-2 pr-3 font-semibold">Booked pickup</th>
                <th className="pb-2 pr-3 font-semibold">Anchor</th>
                <th className="pb-2 pr-3 font-semibold text-right">Distance</th>
                <th className="pb-2 pl-3 font-semibold">Check-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {rows.map((r) => (
                <tr
                  key={r.booking_id}
                  className={r.flagged ? "bg-[#FEF2E8]/40" : ""}
                  data-testid={`pickup-audit-row-${r.booking_id}`}
                >
                  <td className="py-2.5 pr-3">
                    <div className="mono text-[#0B3B5C] font-semibold text-xs">{r.booking_id}</div>
                    <div className="text-[11px] text-[#94a3b8] truncate max-w-[140px]">{r.customer_name}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-[12px] text-[#0B3B5C] max-w-[220px] truncate" title={r.pickup_location}>{r.pickup_location || "—"}</td>
                  <td className="py-2.5 pr-3 text-[11px] text-[#64748B]">
                    <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.expected_anchor_label}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <span
                      className={`inline-flex items-center gap-1 mono text-xs font-black px-2 py-0.5 rounded ${
                        r.flagged
                          ? "text-[#E86A3C] bg-[#FEF2E8]"
                          : "text-emerald-600 bg-emerald-50"
                      }`}
                      data-testid={`pickup-audit-distance-${r.booking_id}`}
                    >
                      {r.distance_m < 1000 ? `${Math.round(r.distance_m)}m` : `${r.distance_km}km`}
                    </span>
                    {r.accuracy_m != null && (
                      <div className="text-[10px] text-[#94a3b8] mt-0.5">±{Math.round(r.accuracy_m)}m</div>
                    )}
                  </td>
                  <td className="py-2.5 pl-3 text-[11px] text-[#64748B] whitespace-nowrap">{r.at ? new Date(r.at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
