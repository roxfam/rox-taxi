import { Link } from "react-router-dom";
import { Smartphone, MapPin, Bell, Wifi, BatteryCharging, Camera, MessageCircle, ArrowLeft, Chrome, Apple } from "lucide-react";

// Driver mobile onboarding — /driver/help
// Plain-English, phone-first walkthrough that answers the two questions
// drivers actually ask on day one:
//   1. "How do I use my phone as the GPS for a booking?"
//   2. "How do I get pinged when a new booking comes in?"
// Kept as a single scrollable page so a driver can bookmark it on their
// home screen and refer back whenever they get a new phone.
export default function DriverHelp() {
  return (
    <div className="min-h-screen bg-[#0B192C] text-white" data-testid="driver-help-page">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <Link to="/driver/manifest" className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white mb-6" data-testid="driver-help-back">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to manifest
        </Link>

        <div className="flex items-center gap-2 text-[10px] tracking-[0.32em] uppercase text-[#D4A94A] font-black">
          <Smartphone className="w-3 h-3" /> Driver setup
        </div>
        <h1 className="serif text-4xl sm:text-5xl mt-2 leading-tight">
          Use your phone as the <span className="text-[#D4A94A]">GPS + pager</span>.
        </h1>
        <p className="text-white/70 mt-3 text-sm sm:text-base">
          Ten-minute setup — done once, sticks forever. Works on any phone with Chrome or Safari.
        </p>

        {/* Section 1: New booking notifications */}
        <Section
          n={1}
          testid="section-notifications"
          icon={<Bell className="w-5 h-5" />}
          title="Get pinged the second a booking comes in"
        >
          <Bullet><strong>SMS + email</strong> — every new booking already sends the driver number a text via Twilio. Nothing to install.</Bullet>
          <Bullet>
            <strong>Push notifications on your lock screen</strong> (recommended) — one-tap opt-in from the admin dashboard header. Works even when the browser is closed.
          </Bullet>
          <SubSteps>
            <li>Open <Link to="/admin" className="text-[#D4A94A] underline">roxtaxi.com/admin</Link> on your phone.</li>
            <li>Tap <strong>Enable push</strong> in the top-right (looks like a bell).</li>
            <li>Say <strong>Allow</strong> when the browser prompts you.</li>
            <li>Tap <strong>Push on → Send test</strong> to feel a real buzz.</li>
          </SubSteps>
          <Bullet>
            <strong>WhatsApp</strong> — for private customer questions, always reply from the group WhatsApp so the whole team sees it.
          </Bullet>
        </Section>

        {/* Section 2: GPS live share */}
        <Section
          n={2}
          testid="section-gps"
          icon={<MapPin className="w-5 h-5" />}
          title="Share your live location with the guest"
        >
          <p className="text-white/70 text-sm mb-3">
            Every booking has a private driver link. Tapping <strong>Start GPS sharing</strong> streams your position to the guest's Track page and auto-pings them when you're 5 minutes out.
          </p>
          <SubSteps>
            <li>Tap the private <em>driver link</em> in your dispatch SMS (or grab it from the manifest).</li>
            <li>Tap <strong>Allow</strong> when the browser asks for location. iOS says <em>"Allow Once"</em> — pick <em>"Allow While Using"</em> instead so it doesn't ask again mid-trip.</li>
            <li>Tap the big orange <strong>Start GPS sharing</strong> button.</li>
            <li>Leave the screen ON (see next section for the trick).</li>
          </SubSteps>
          <Callout tint="#059669">
            <strong>Automatic guest pings:</strong> when you're within ~800 metres (5 min) of the pickup, the guest gets an SMS + email that reads "your driver is 5 minutes away." No action from you.
          </Callout>
          <Callout tint="#E86A3C">
            <strong>The "I've arrived" button</strong> at the top of the driver page fires a second SMS + email confirming you're outside. Tap it the moment you park.
          </Callout>
        </Section>

        {/* Section 3: Screen + battery */}
        <Section
          n={3}
          testid="section-battery"
          icon={<BatteryCharging className="w-5 h-5" />}
          title="Keep the phone alive for a 40-min ride"
        >
          <Bullet><strong>Turn off auto-lock</strong> while sharing GPS — Settings → Display &amp; Brightness → Auto-Lock → <em>Never</em> (iOS) / Settings → Display → Screen timeout → <em>30 min</em> (Android). Turn it back on once you drop the guest.</Bullet>
          <Bullet><strong>Plug into car USB</strong> — GPS + screen-on burns ~15%/hour. A basic car charger keeps you at 100%.</Bullet>
          <Bullet><strong>Skip Low Power Mode</strong> — iOS throttles background GPS below 20% battery.</Bullet>
          <Bullet><strong>WiFi = off, cellular data = on</strong> — WiFi that flickers between hotels kills the GPS stream. Stick to LTE/5G.</Bullet>
        </Section>

        {/* Section 4: Photo handoff */}
        <Section
          n={4}
          testid="section-photos"
          icon={<Camera className="w-5 h-5" />}
          title="Snap a pickup photo (no-show insurance)"
        >
          <p className="text-white/70 text-sm mb-3">
            On the driver page, tap <strong>Snap pickup photo</strong> — the camera opens, take one shot of the guest with their luggage (or of the vehicle for a rental drop). Uploads to the booking automatically. Admins see the thumbnail on the booking row.
          </p>
          <Callout tint="#D4A94A">
            <strong>Why bother?</strong> If a guest disputes a no-show or claims damage on a rental return, one time-stamped photo saves you a $150 argument.
          </Callout>
        </Section>

        {/* Section 5: Save to home screen */}
        <Section
          n={5}
          testid="section-homescreen"
          icon={<Smartphone className="w-5 h-5" />}
          title="Save the driver page as an app icon"
        >
          <p className="text-white/70 text-sm mb-3">
            Turns the manifest page into a one-tap app — no browser bar, no fumbling for the link.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <PlatformCard icon={<Apple className="w-5 h-5" />} name="iPhone (Safari)">
              <li>Open <span className="mono">roxtaxi.com/driver/manifest</span></li>
              <li>Tap the <strong>Share</strong> icon (arrow up from a box)</li>
              <li>Scroll down → <strong>Add to Home Screen</strong></li>
              <li>Name it "Rox Manifest" → <strong>Add</strong></li>
            </PlatformCard>
            <PlatformCard icon={<Chrome className="w-5 h-5" />} name="Android (Chrome)">
              <li>Open <span className="mono">roxtaxi.com/driver/manifest</span></li>
              <li>Tap the <strong>three-dot menu</strong> (top-right)</li>
              <li>Tap <strong>Add to Home screen</strong></li>
              <li>Name it → <strong>Add</strong></li>
            </PlatformCard>
          </div>
        </Section>

        <div className="mt-10 border-t border-white/10 pt-6 text-center">
          <p className="text-white/60 text-sm">Stuck? WhatsApp us for a 2-minute walkthrough.</p>
          <a
            href="https://wa.me/12424322587"
            target="_blank" rel="noreferrer"
            data-testid="driver-help-wa"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white font-bold text-sm px-5 py-3 hover:opacity-90 active:scale-95"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp Rox dispatch
          </a>
        </div>
      </div>
    </div>
  );
}


function Section({ n, testid, icon, title, children }) {
  return (
    <section data-testid={testid} className="mt-10">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-full bg-[#D4A94A] text-[#0B192C] flex items-center justify-center font-black text-sm">
          {n}
        </span>
        <span className="text-[#D4A94A]">{icon}</span>
        <h2 className="serif text-xl sm:text-2xl text-white">{title}</h2>
      </div>
      <div className="pl-12 space-y-3">{children}</div>
    </section>
  );
}


function Bullet({ children }) {
  return (
    <div className="text-sm text-white/85 leading-relaxed flex gap-2">
      <span className="text-[#D4A94A] mt-0.5">▸</span>
      <span>{children}</span>
    </div>
  );
}


function SubSteps({ children }) {
  return <ol className="pl-6 mt-2 space-y-1.5 text-sm text-white/70 list-decimal">{children}</ol>;
}


function Callout({ tint, children }) {
  return (
    <div
      className="mt-3 rounded-xl p-3 text-sm leading-relaxed"
      style={{ background: `${tint}18`, border: `1px solid ${tint}55`, color: `${tint}` }}
    >
      <span className="text-white/85">{children}</span>
    </div>
  );
}


function PlatformCard({ icon, name, children }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-center gap-2 text-[#D4A94A] font-bold text-sm mb-2">
        {icon} {name}
      </div>
      <ol className="pl-4 text-xs text-white/75 space-y-1 list-decimal">{children}</ol>
    </div>
  );
}
