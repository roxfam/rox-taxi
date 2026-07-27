import { useState } from "react";
import { Gift, Copy, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Referral widget: shows a shareable link + 5% commission info.
 * Props: inquiryId (used as the referrer's own code so wedding planners
 * can share their own package as a taste), baseUrl (optional).
 */
export default function ReferralWidget({ inquiryId }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/wedding-builder?ref=${inquiryId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch { toast.error("Copy failed"); }
  };

  return (
    <div className="rounded-3xl border border-[#D4A94A]/30 bg-gradient-to-br from-[#FBF7EF] to-white p-6 sm:p-8 text-left" data-testid="referral-widget">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[#D4A94A]/15 text-[#D4A94A] flex items-center justify-center"><Gift className="w-5 h-5" /></div>
        <div>
          <div className="text-xs tracking-[0.25em] uppercase text-[#D4A94A] font-semibold">Refer a couple · Earn 5%</div>
          <h3 className="serif text-2xl text-[#0B3B5C] leading-tight mt-1">Share your <em className="italic">Rox</em> package.</h3>
        </div>
      </div>
      <p className="text-sm text-[#64748B] leading-relaxed mt-4">
        Wedding planners &amp; happy couples: share your referral link. When a friend books a wedding package with Rox, you get <strong className="text-[#0B3B5C]">5% of the final package total</strong> — paid via Zelle or PayPal after their event.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <input
          readOnly
          value={link}
          data-testid="referral-link-input"
          className="flex-1 mono text-xs rounded-full bg-white border border-[#EFE7D5] px-4 py-2.5 text-[#0B3B5C]"
        />
        <button
          onClick={copy}
          data-testid="referral-copy-btn"
          className="rounded-full bg-[#0B3B5C] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#0a2f4a] active:scale-95 flex items-center gap-1.5"
        >
          {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent("Planning a Bahamas wedding? Rox Taxi built me a full transport + tour package: " + link)}`}
          target="_blank" rel="noreferrer"
          data-testid="referral-share-whatsapp"
          className="rounded-full bg-[#25D366] text-white px-4 py-2 text-xs font-semibold hover:bg-[#20b757]"
        >
          Share via WhatsApp
        </a>
        <a
          href={`mailto:?subject=${encodeURIComponent("Rox Taxi Bahamas — wedding package")}&body=${encodeURIComponent("I loved building my Bahamas wedding package with Rox — thought you might too:\n\n" + link)}`}
          data-testid="referral-share-email"
          className="rounded-full border border-[#EFE7D5] text-[#0B3B5C] px-4 py-2 text-xs font-semibold hover:border-[#D4A94A]"
        >
          Share via Email
        </a>
      </div>
    </div>
  );
}
