import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { api, BACKEND_URL, money } from "../lib/api";
import { Ticket, MapPin, Clock, Users, Share2, Download, Camera, Smartphone } from "lucide-react";

/**
 * BoardingPass — /booking/:id/pass
 *
 * Mobile-optimised "boarding pass" style card for the guest to show at
 * pickup. Renders the booking's QR from /api/bookings/:id/qr.png so the
 * driver can scan it and mark the trip as picked_up.
 *
 * Save-to-phone strategy (no Apple/Google Wallet API required):
 *   • Native Web Share API where available (opens iOS/Android share sheet)
 *   • "Save as image" downloads a PNG snapshot to camera roll
 *   • Add-to-Home-Screen tip so users can pin it as a PWA icon
 */
export default function BoardingPass() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [err, setErr] = useState("");
  const cardRef = useRef(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        // Public booking summary (no token — endpoint returns non-financial fields only)
        const { data } = await api.get(`/bookings/${id}/public-summary`);
        if (!cancel) setBooking(data);
      } catch (e) {
        if (!cancel) setErr(e?.response?.data?.detail || "We couldn't find that booking.");
      }
    })();
    return () => { cancel = true; };
  }, [id]);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Rox pickup pass · ${id}`,
          text: `My Rox Taxi booking ${id}. Driver scans this at pickup.`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("Pass link copied — paste it into Notes or Wallet.");
      }
    } catch {
      // user dismissed
    }
  };

  const saveAsImage = async () => {
    // Draw a snapshot of the pass so the customer can add to their camera roll
    // (which iOS + Android both surface inside Wallet's "Add scanner" flow).
    try {
      const html2canvas = (await import("html2canvas")).default;
      const el = cardRef.current;
      if (!el) return;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#0B3B5C" });
      const link = document.createElement("a");
      link.download = `rox-pass-${id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      alert("Take a screenshot to save the pass to your camera roll (long-press on iOS, side-buttons on Android).");
    }
  };

  if (err) {
    return (
      <div className="min-h-screen bg-[#0B3B5C] flex items-center justify-center p-6 text-center" data-testid="boarding-pass-error">
        <div className="max-w-sm text-white">
          <Ticket className="w-12 h-12 mx-auto text-[#D4A94A]" />
          <h1 className="font-[Georgia] text-2xl mt-4">Pass not available</h1>
          <p className="text-white/70 text-sm mt-2">{err}</p>
        </div>
      </div>
    );
  }

  const qrSrc = `${BACKEND_URL}/api/bookings/${id}/qr.png`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B3B5C] via-[#082941] to-[#0B3B5C] p-4 sm:p-8" data-testid="boarding-pass-page">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] tracking-[.28em] uppercase text-[#D4A94A] font-bold">
            <Ticket className="w-3.5 h-3.5" /> Rox pickup pass
          </div>
          <h1 className="font-[Georgia] text-white text-2xl mt-2">Show this to your driver</h1>
        </div>

        <div
          ref={cardRef}
          className="bg-white rounded-2xl overflow-hidden shadow-2xl"
          data-testid="boarding-pass-card"
        >
          {/* Header stripe */}
          <div className="bg-gradient-to-r from-[#D4A94A] to-[#B8912F] px-5 py-4 text-[#0B3B5C]">
            <div className="text-[10px] tracking-[.22em] uppercase font-bold opacity-80">Rox Taxi Service &amp; Tours</div>
            <div className="text-xl font-black tracking-wide font-mono">{id}</div>
          </div>

          {/* QR + booking details */}
          <div className="p-5 space-y-4">
            <div className="flex flex-col items-center bg-[#FBF7EF] rounded-xl p-4 border border-[#E2E8F0]">
              <img
                src={qrSrc}
                alt="Pickup QR"
                width={220}
                height={220}
                className="w-56 h-56 object-contain"
                crossOrigin="anonymous"
                data-testid="boarding-pass-qr"
              />
              <div className="mt-2 text-[10px] uppercase tracking-[.2em] text-[#64748B] font-bold">Driver scans to confirm pickup</div>
            </div>

            {booking && (
              <div className="space-y-2 text-sm">
                <Row icon={<Ticket className="w-4 h-4" />} label="Service" value={booking.item_name} />
                <Row icon={<Clock className="w-4 h-4" />} label="When" value={`${booking.booking_date}${booking.booking_time ? " · " + booking.booking_time : ""}`} />
                {booking.pickup_location && (
                  <Row icon={<MapPin className="w-4 h-4" />} label="Pickup" value={booking.pickup_location} />
                )}
                {booking.dropoff_location && (
                  <Row icon={<MapPin className="w-4 h-4 opacity-60" />} label="Dropoff" value={booking.dropoff_location} />
                )}
                <Row icon={<Users className="w-4 h-4" />} label="Guests" value={booking.passengers || 1} />
                {typeof booking.total === "number" && booking.total > 0 && (
                  <Row icon={<span className="text-[15px]">💰</span>} label="Total" value={money(booking.total)} />
                )}
              </div>
            )}
          </div>

          {/* Footer stripe */}
          <div className="bg-[#0B3B5C] text-white px-5 py-3 text-center">
            <div className="text-[10px] tracking-[.18em] uppercase text-[#D4A94A] font-bold">Bahamas · Nassau &amp; Paradise Island</div>
            <div className="text-[11px] mt-1 text-white/70">Questions? WhatsApp +1 (242) 432-2587</div>
          </div>
        </div>

        {/* Save-to-phone controls */}
        <div className="mt-6 space-y-3">
          <button
            onClick={saveAsImage}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#D4A94A] hover:bg-[#B8912F] text-[#0B3B5C] font-bold py-3 rounded-xl transition-colors"
            data-testid="boarding-pass-save-image"
          >
            <Download className="w-4 h-4" /> Save pass to Photos
          </button>
          <button
            onClick={share}
            className="w-full inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-bold py-3 rounded-xl transition-colors border border-white/20"
            data-testid="boarding-pass-share"
          >
            <Share2 className="w-4 h-4" /> Share pass
          </button>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-[12px] text-white/80 leading-relaxed">
            <div className="flex items-center gap-2 text-[#D4A94A] font-bold uppercase tracking-wider text-[10px] mb-2">
              <Smartphone className="w-3 h-3" /> Add to phone
            </div>
            <ul className="space-y-1.5 list-disc pl-5">
              <li><strong>iPhone</strong>: tap <em>Share</em> → <em>Add to Home Screen</em> to pin this pass, or long-press the QR to save it to Photos.</li>
              <li><strong>Android</strong>: tap <em>⋮ menu</em> → <em>Add to Home screen</em>, or press <em>Save pass to Photos</em> above.</li>
              <li>The QR keeps working offline once it's saved to your camera roll.</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 text-center text-[11px] text-white/40">
          <Camera className="w-3.5 h-3.5 inline-block mr-1" />
          Pass ID: <span className="font-mono">{id}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="text-[#D4A94A] mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[#94a3b8] font-bold">{label}</div>
        <div className="text-[#0B3B5C] font-semibold text-sm truncate">{value}</div>
      </div>
    </div>
  );
}