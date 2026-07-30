import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Copy, ImageOff } from "lucide-react";
import { api } from "../../lib/api";

/**
 * Image Health — one-click scan of every user-facing image (home slides,
 * tours, rentals, taxi services, approved guest photos). HEADs each URL
 * concurrently on the backend and lists any that failed (404, timeout,
 * DNS, forbidden). Operators can then jump straight to the matching
 * catalog tab to swap the photo.
 */

const SOURCE_LABEL = {
  home_slide: "Home Slide",
  tour: "Tour",
  rental: "Rental",
  taxi_service: "Taxi Service",
  guest_photo: "Guest Photo",
};

const SOURCE_COLOR = {
  home_slide: "bg-[#D4A94A]/12 text-[#A88235]",
  tour: "bg-[#0B3B5C]/10 text-[#0B3B5C]",
  rental: "bg-[#E86A3C]/12 text-[#B4522B]",
  taxi_service: "bg-[#059669]/12 text-[#047857]",
  guest_photo: "bg-[#7C3AED]/12 text-[#6D28D9]",
};

export default function BrokenImagesPanel() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      const { data } = await api.get("/admin/images/scan");
      setResult(data);
      if (data.broken_count === 0) {
        toast.success(`All ${data.total} images reachable — nothing broken 🎉`);
      } else {
        toast.error(`Found ${data.broken_count} broken image${data.broken_count > 1 ? "s" : ""}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const items = result ? (showAll ? result.all : result.broken) : [];

  return (
    <div className="space-y-6" data-testid="broken-images-panel">
      {/* Header + primary CTA */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center shrink-0">
              <ImageOff className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0B3B5C]">Image Health</h2>
              <p className="text-sm text-[#64748B] mt-1 max-w-xl">
                Scans every photo used across the site — home slides, tours,
                rentals, taxi services, and approved guest submissions —
                then flags anything that returns 404, times out, or gets
                blocked. Guests never see broken images again.
              </p>
            </div>
          </div>
          <button
            onClick={scan}
            disabled={scanning}
            data-testid="broken-images-scan-btn"
            className="inline-flex items-center gap-2 rounded-full bg-[#0B3B5C] hover:bg-[#0B192C] text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-60 shadow-[0_10px_25px_rgba(11,59,92,0.25)]"
          >
            {scanning ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> {result ? "Re-scan now" : "Scan now"}</>
            )}
          </button>
        </div>

        {/* Summary counters */}
        {result && (
          <div className="mt-6 grid grid-cols-3 gap-3" data-testid="broken-images-summary">
            <Stat
              label="Total scanned"
              value={result.total}
              tone="neutral"
              testid="broken-images-total"
            />
            <Stat
              label="Broken"
              value={result.broken_count}
              tone={result.broken_count > 0 ? "bad" : "good"}
              testid="broken-images-count"
            />
            <Stat
              label="Healthy"
              value={result.total - result.broken_count}
              tone="good"
              testid="broken-images-healthy"
            />
          </div>
        )}
      </div>

      {/* Empty state before first scan */}
      {!result && !scanning && (
        <div
          className="bg-white rounded-2xl border border-dashed border-[#E2E8F0] p-10 text-center"
          data-testid="broken-images-empty"
        >
          <p className="text-[#64748B]">
            Hit <strong>Scan now</strong> to check every image on the site. Usually
            takes 3-8 seconds depending on how many photos you have.
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-white rounded-2xl border border-[#E2E8F0]" data-testid="broken-images-results">
          <div className="flex items-center justify-between p-4 border-b border-[#F1F5F9]">
            <div className="flex items-center gap-2 text-sm text-[#0B3B5C] font-semibold">
              {result.broken_count === 0 ? (
                <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> All images reachable</>
              ) : (
                <><AlertTriangle className="w-4 h-4 text-[#B45309]" /> {result.broken_count} broken</>
              )}
            </div>
            <button
              onClick={() => setShowAll((v) => !v)}
              data-testid="broken-images-toggle"
              className="text-xs text-[#0B3B5C] hover:text-[#D4A94A] font-semibold"
            >
              {showAll ? "Show broken only" : `Show all ${result.total}`}
            </button>
          </div>

          {items.length === 0 ? (
            <div className="p-10 text-center text-[#64748B] text-sm" data-testid="broken-images-no-items">
              {showAll ? "No images in the catalog yet." : "Nothing broken — you're good."}
            </div>
          ) : (
            <ul className="divide-y divide-[#F1F5F9]">
              {items.map((it, i) => (
                <li key={`${it.url}-${i}`} className="p-4 flex items-center gap-4" data-testid={`broken-image-row-${i}`}>
                  <div className="w-16 h-16 rounded-lg bg-[#F1F5F9] flex items-center justify-center overflow-hidden shrink-0">
                    {it.ok ? (
                      <img
                        src={it.url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <ImageOff className="w-6 h-6 text-[#B45309]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${SOURCE_COLOR[it.source] || "bg-[#F1F5F9] text-[#64748B]"}`}>
                        {SOURCE_LABEL[it.source] || it.source}
                      </span>
                      <span className="text-sm font-semibold text-[#0B3B5C] truncate">{it.title || it.item_id}</span>
                      {it.ok ? (
                        <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">HTTP {it.status_code}</span>
                      ) : (
                        <span className="text-[11px] text-[#B91C1C] bg-[#FEF2F2] px-2 py-0.5 rounded-full font-semibold" data-testid="broken-image-error">
                          {it.error || `HTTP ${it.status_code || "??"}`}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-[#64748B] truncate font-mono">{it.url}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(it.url);
                        toast.success("URL copied");
                      }}
                      className="p-2 rounded-lg text-[#64748B] hover:text-[#0B3B5C] hover:bg-[#F1F5F9]"
                      title="Copy URL"
                      data-testid={`broken-image-copy-${i}`}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg text-[#64748B] hover:text-[#0B3B5C] hover:bg-[#F1F5F9]"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <a
                      href={it.admin_url}
                      className="inline-flex items-center gap-1 rounded-full bg-[#D4A94A] hover:bg-[#A88235] text-white text-xs font-semibold px-3 py-1.5 ml-1"
                      data-testid={`broken-image-fix-${i}`}
                    >
                      Fix
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {result.scanned_at && (
            <div className="px-4 py-3 border-t border-[#F1F5F9] text-[11px] text-[#94a3b8]">
              Scanned {new Date(result.scanned_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, testid }) {
  const toneCls =
    tone === "bad" ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
    : tone === "good" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-[#F1F5F9] text-[#0B3B5C] border-[#E2E8F0]";
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`} data-testid={testid}>
      <div className="text-[10px] tracking-[0.2em] uppercase font-bold opacity-80">{label}</div>
      <div className="text-2xl font-bold mono mt-1">{value}</div>
    </div>
  );
}
