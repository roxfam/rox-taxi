import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Gift, Share2, Copy, Mail, Facebook, MessageCircle, Twitter, Link2,
  Check, Sparkles, ArrowRight, Send,
} from "lucide-react";

/**
 * ReferFriend — public share flow at /refer.
 *
 * How the mechanic works end-to-end:
 *   1. Sharer types their name + an optional personal note.
 *   2. We generate a stable share code seeded on the sharer's name so a
 *      family can send the same code multiple times without conflict
 *      (`FRIEND-{initials}-{4-char hash}`).
 *   3. Sharer taps a channel (WhatsApp / Email / Facebook / X / Copy Link).
 *   4. Recipient lands on `roxtaxi.com/?ref=<code>&from=<name>` — the
 *      <ReferralCatcher> in Layout picks that up, stores it in
 *      localStorage, and pops a floating "10% off" welcome banner.
 *   5. When the recipient hits BookingFlow the 10% comes off subtotal as
 *      a "Friend-of-{name} discount" line item.
 *
 * No backend required on the sharer side — the code is deterministic and
 * the redemption is captured in the booking payload (`referred_by_name` +
 * `referral_code`) so admin can see attribution in the bookings table.
 */

const PUBLIC_SITE = "https://roxtaxi.com";

function makeShareCode(name) {
  const clean = (name || "friend").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const initials = clean ? clean.slice(0, 6) : "FRIEND";
  // Deterministic 4-char hash so the same name always yields the same code.
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  const suffix = Math.abs(hash).toString(36).toUpperCase().slice(0, 4).padStart(4, "X");
  return `FRIEND-${initials}-${suffix}`;
}

export default function ReferFriend() {
  useEffect(() => {
    document.title = "Refer a Friend · 10% off next visit · Rox Taxi";
  }, []);

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => makeShareCode(name || "friend"), [name]);
  const shareUrl = useMemo(() => {
    const from = encodeURIComponent((name || "").trim() || "a friend");
    return `${PUBLIC_SITE}/?ref=${encodeURIComponent(code)}&from=${from}`;
  }, [code, name]);

  const shareText = useMemo(() => {
    const bits = [];
    const senderLabel = (name || "").trim() ? `${name.trim()} just sent you` : "You just got";
    bits.push(`${senderLabel} 10% off your next Rox Taxi & Tours booking in Nassau, Bahamas.`);
    if (message.trim()) bits.push(`\n\n"${message.trim()}" — ${(name || "").trim() || "your friend"}`);
    bits.push(`\n\nRedeem code ${code} → ${shareUrl}`);
    return bits.join("");
  }, [name, message, code, shareUrl]);

  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(shareUrl);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(shareText);
      setCopied(true);
      toast.success("Share message copied — paste it anywhere");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't copy — try selecting the message manually.");
    }
  };

  const nativeShare = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({
        title: "10% off Rox Taxi & Tours",
        text: shareText,
        url: shareUrl,
      });
    } catch { /* user cancelled — no-op */ }
  };

  return (
    <div className="bg-gradient-to-br from-[#FBF7EF] via-white to-[#FBF7EF] min-h-screen py-16" data-testid="refer-friend-page">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        {/* Hero */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#D4A94A] to-[#c99738] text-white text-[10px] uppercase tracking-widest font-black px-3 py-1.5 shadow-[0_10px_25px_rgba(212,169,74,0.35)]">
            <Gift className="w-3 h-3" /> Refer a friend
          </div>
          <h1 className="serif text-5xl sm:text-6xl mt-5 leading-[0.95] text-[#0B3B5C]">
            Send them <em className="italic text-[#D4A94A]">10% off</em>.
          </h1>
          <p className="mt-4 max-w-lg mx-auto text-[#334155] leading-relaxed">
            Anyone who books through your link gets 10% off their next trip with us — no minimum, no expiry. Send it however you like.
          </p>
        </div>

        {/* Form */}
        <div className="mt-10 rounded-3xl bg-white border border-[#E2E8F0] p-6 sm:p-8 shadow-[0_20px_50px_rgba(11,59,92,0.08)]">
          <label className="block">
            <span className="text-[10px] tracking-[0.28em] uppercase font-black text-[#0B3B5C]">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="e.g. James"
              data-testid="refer-name-input"
              className="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-base focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20"
            />
            <span className="mt-1.5 text-[11px] text-[#64748B]">Shows up on your friend's welcome banner ("James sent you 10% off").</span>
          </label>

          <label className="block mt-6">
            <span className="text-[10px] tracking-[0.28em] uppercase font-black text-[#0B3B5C]">Personal note (optional)</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 240))}
              placeholder="Reagan's tour is the reason we did Nassau properly — book him if you can."
              rows={3}
              data-testid="refer-message-input"
              className="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm leading-relaxed focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20 resize-none"
            />
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#64748B]">
              <span>Adds a quoted "mention" from you in the share message.</span>
              <span className="mono">{message.length}/240</span>
            </div>
          </label>

          {/* Live preview */}
          <div className="mt-8 rounded-2xl bg-[#FBF7EF] border border-[#D4A94A]/30 p-5" data-testid="refer-preview-card">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.28em] uppercase font-black text-[#D4A94A]">
              <Sparkles className="w-3 h-3" /> Preview
            </div>
            <p className="mt-3 text-sm text-[#334155] leading-relaxed whitespace-pre-line" data-testid="refer-preview-text">
              {shareText}
            </p>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-white border border-[#E2E8F0] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[9px] tracking-[0.28em] uppercase font-black text-[#0B3B5C]">
                  Your special code
                </div>
                <div className="mono font-black text-lg text-[#E86A3C] truncate" data-testid="refer-code-display">
                  {code}
                </div>
              </div>
              <button
                type="button"
                onClick={copy}
                data-testid="refer-copy-btn"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0B3B5C] text-white px-4 py-2 text-xs font-bold hover:bg-[#0a324f] active:scale-95"
              >
                {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy message</>}
              </button>
            </div>
          </div>

          {/* Share channels */}
          <div className="mt-8">
            <div className="text-[10px] tracking-[0.28em] uppercase font-black text-[#0B3B5C]">
              Share where they'll actually read it
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="refer-channels">
              <ShareBtn
                testid="refer-whatsapp"
                href={`https://wa.me/?text=${encodedText}`}
                bg="hover:bg-[#25D366] hover:border-[#25D366]"
                icon={MessageCircle}
                label="WhatsApp"
              />
              <ShareBtn
                testid="refer-email"
                href={`mailto:?subject=${encodeURIComponent(`${(name || "Your friend").trim()} sent you 10% off Rox Taxi & Tours`)}&body=${encodedText}`}
                bg="hover:bg-[#D4A94A] hover:border-[#D4A94A]"
                icon={Mail}
                label="Email"
              />
              <ShareBtn
                testid="refer-facebook"
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`}
                bg="hover:bg-[#1877F2] hover:border-[#1877F2]"
                icon={Facebook}
                label="Facebook"
              />
              <ShareBtn
                testid="refer-twitter"
                href={`https://twitter.com/intent/tweet?text=${encodedText}`}
                bg="hover:bg-[#0B192C] hover:border-[#0B192C]"
                icon={Twitter}
                label="X / Twitter"
              />
              <ShareBtn
                testid="refer-copy-link"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(shareUrl);
                    toast.success("Link copied — paste it anywhere");
                  } catch {
                    toast.error("Couldn't copy the link");
                  }
                }}
                bg="hover:bg-[#0B3B5C] hover:border-[#0B3B5C]"
                icon={Link2}
                label="Copy link"
              />
              <ShareBtn
                testid="refer-native-share"
                onClick={nativeShare}
                bg="hover:bg-[#E86A3C] hover:border-[#E86A3C]"
                icon={Share2}
                label="More apps…"
              />
            </div>
          </div>

          {/* URL row */}
          <div className="mt-8 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 flex items-center gap-3">
            <Link2 className="w-4 h-4 text-[#64748B] shrink-0" />
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
              data-testid="refer-url-input"
              className="flex-1 bg-transparent mono text-xs text-[#0B3B5C] focus:outline-none min-w-0"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard?.writeText(shareUrl);
                  toast.success("Link copied");
                } catch { toast.error("Couldn't copy"); }
              }}
              className="inline-flex items-center gap-1 rounded-full bg-white border border-[#E2E8F0] px-3 py-1.5 text-[11px] font-bold text-[#0B3B5C] hover:border-[#D4A94A]"
              data-testid="refer-url-copy-btn"
            >
              <Copy className="w-3 h-3" /> Copy URL
            </button>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {[
            { icon: Send,    title: "You share",    body: "Send your code to friends heading to Nassau — any channel works." },
            { icon: Gift,    title: "They save 10%", body: "Their next booking auto-applies 10% off the tour or transfer — no minimum." },
            { icon: Sparkles, title: "You get thanked", body: "When they book, we'll credit you toward a free Reagan tour after 5 friends convert." },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl bg-white border border-[#E2E8F0] p-5">
              <s.icon className="w-5 h-5 text-[#D4A94A]" />
              <div className="mt-3 text-sm font-black text-[#0B3B5C]">{s.title}</div>
              <div className="mt-1 text-xs text-[#64748B] leading-relaxed">{s.body}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/nassau-with-reagan"
            data-testid="refer-see-tour-cta"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#0B3B5C] hover:text-[#D4A94A]"
          >
            Or check out what they'd be booking → the Reagan tour <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ShareBtn({ testid, href, onClick, icon: Icon, label, bg }) {
  const cls = `group inline-flex items-center justify-center gap-2 rounded-2xl bg-white border-2 border-[#E2E8F0] px-4 py-3.5 text-sm font-bold text-[#0B3B5C] transition-all hover:text-white hover:scale-[1.02] active:scale-95 ${bg}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} data-testid={testid} className={cls}>
        <Icon className="w-4 h-4 shrink-0" /> <span>{label}</span>
      </button>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" data-testid={testid} className={cls}>
      <Icon className="w-4 h-4 shrink-0" /> <span>{label}</span>
    </a>
  );
}
