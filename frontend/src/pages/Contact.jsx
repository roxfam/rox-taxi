import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Facebook, Phone, Mail, MapPin, MessageSquare, Star, ExternalLink, Send } from "lucide-react";

const ROX_PHONE = "+1 (242) 432-2587";
const ROX_PHONE_TEL = "+12424322587";
const ROX_EMAIL = "info@roxtaxi242.com";

// Fallback Google-Reviews link — used when the admin hasn't set a specific
// URL in Site Config yet. Opens Google Maps searching for the business.
const DEFAULT_GOOGLE_REVIEWS_URL = "https://www.google.com/maps/search/Rox+Taxi+Service+and+Tours+Nassau";

export default function Contact() {
  const [cfg, setCfg] = useState({
    facebook_url: "https://www.facebook.com/roxtaxiservice/",
    google_reviews_url: DEFAULT_GOOGLE_REVIEWS_URL,
  });
  useEffect(() => {
    api.get("/site-config").then((r) => setCfg((c) => ({ ...c, ...r.data }))).catch(() => {});
  }, []);

  const reviewsUrl = cfg.google_reviews_url || DEFAULT_GOOGLE_REVIEWS_URL;

  return (
    <div data-testid="contact-page" className="max-w-6xl mx-auto px-6 lg:px-10 py-24">
      <span className="text-xs tracking-[0.3em] uppercase text-[#64748B]">Get in touch</span>
      <h1 className="serif text-6xl sm:text-7xl text-[#0B3B5C] mt-3 leading-[0.9]">
        Say <em className="italic text-[#D4A94A]">hello</em>.
      </h1>
      <p className="mt-5 max-w-2xl text-[#64748B] leading-relaxed">
        Group booking, corporate charter, or a question about your trip? Reach us on Facebook,
        WhatsApp, email or phone — we typically respond in under an hour, 24/7.
      </p>

      {/* Contact channel cards */}
      <div className="mt-12 grid sm:grid-cols-2 gap-5">
        <a href={cfg.facebook_url} target="_blank" rel="noreferrer" data-testid="contact-facebook" className="rounded-2xl border border-[#E2E8F0] bg-white p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(212,169,74,0.12)] transition-transform">
          <div className="w-11 h-11 rounded-xl bg-[#1877F2]/10 flex items-center justify-center text-[#1877F2]"><Facebook className="w-5 h-5" /></div>
          <div className="serif text-2xl text-[#0B3B5C] mt-4">Facebook</div>
          <div className="text-sm text-[#64748B] mt-1">facebook.com/roxtaxiservice</div>
        </a>
        <a href={`tel:${ROX_PHONE_TEL}`} data-testid="contact-phone" className="rounded-2xl border border-[#E2E8F0] bg-white p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(212,169,74,0.12)] transition-transform">
          <div className="w-11 h-11 rounded-xl bg-[#D4A94A]/10 flex items-center justify-center text-[#D4A94A]"><Phone className="w-5 h-5" /></div>
          <div className="serif text-2xl text-[#0B3B5C] mt-4">Call</div>
          <div className="text-sm text-[#64748B] mt-1">{ROX_PHONE}</div>
        </a>
        <a href={`mailto:${ROX_EMAIL}`} data-testid="contact-email" className="rounded-2xl border border-[#E2E8F0] bg-white p-6 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(212,169,74,0.12)] transition-transform">
          <div className="w-11 h-11 rounded-xl bg-[#E86A3C]/10 flex items-center justify-center text-[#E86A3C]"><Mail className="w-5 h-5" /></div>
          <div className="serif text-2xl text-[#0B3B5C] mt-4">Email</div>
          <div className="text-sm text-[#64748B] mt-1">{ROX_EMAIL}</div>
        </a>
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <div className="w-11 h-11 rounded-xl bg-[#0B3B5C]/10 flex items-center justify-center text-[#0B3B5C]"><MapPin className="w-5 h-5" /></div>
          <div className="serif text-2xl text-[#0B3B5C] mt-4">Base of operations</div>
          <div className="text-sm text-[#64748B] mt-1">Nassau, New Providence, The Bahamas</div>
        </div>
      </div>

      {/* Contact form + Google reviews side by side on lg screens */}
      <div className="mt-16 grid lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <ContactForm />
        </div>
        <div className="lg:col-span-2">
          <GoogleReviewsCard url={reviewsUrl} />
        </div>
      </div>
    </div>
  );
}

function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "General inquiry", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error("Name, email and message are required");
      return;
    }
    setSending(true);
    try {
      await api.post("/contact", form);
      setSent(true);
      setForm({ name: "", email: "", phone: "", subject: "General inquiry", message: "" });
      toast.success("Message sent — we'll be in touch within the hour");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Send failed — please try email or WhatsApp");
    } finally { setSending(false); }
  };

  if (sent) {
    return (
      <div className="rounded-3xl border border-[#059669]/30 bg-[#F0FDF4] p-10 text-center" data-testid="contact-form-sent">
        <div className="w-14 h-14 rounded-full bg-[#059669]/10 text-[#059669] flex items-center justify-center mx-auto mb-4">
          <Send className="w-6 h-6" />
        </div>
        <h3 className="serif text-3xl text-[#0B3B5C] mb-2">Message received</h3>
        <p className="text-[#64748B] max-w-md mx-auto">Thanks for reaching out — a member of the Rox team will reply directly to {ROX_EMAIL} within the hour.</p>
        <button
          onClick={() => setSent(false)}
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#0B3B5C] hover:text-[#D4A94A]"
          data-testid="contact-form-send-another"
        >
          Send another message →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-[#E2E8F0] bg-white p-8" data-testid="contact-form">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="w-5 h-5 text-[#D4A94A]" />
        <h3 className="serif text-2xl text-[#0B3B5C]">Send us a message</h3>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Your name *" val={form.name} on={(v) => setForm({ ...form, name: v })} testid="contact-form-name" />
        <Field label="Email *" type="email" val={form.email} on={(v) => setForm({ ...form, email: v })} testid="contact-form-email" />
        <Field label="Phone (optional)" val={form.phone} on={(v) => setForm({ ...form, phone: v })} testid="contact-form-phone" />
        <div>
          <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">Topic</label>
          <select
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            data-testid="contact-form-subject"
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0B3B5C] focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20"
          >
            <option>General inquiry</option>
            <option>Airport transfer</option>
            <option>Tour booking</option>
            <option>Car rental</option>
            <option>Wedding / group</option>
            <option>Payment / refund</option>
          </select>
        </div>
      </div>
      <div className="mt-4">
        <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">Message *</label>
        <textarea
          rows={5}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Tell us about your trip — dates, group size, pickup location, anything specific we should know."
          data-testid="contact-form-message"
          className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20"
        />
      </div>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-[#64748B]">We reply in under an hour, 24/7. No spam.</p>
        <button
          type="submit"
          disabled={sending}
          data-testid="contact-form-submit"
          className="inline-flex items-center gap-2 rounded-full bg-[#E86A3C] hover:bg-[#d55a30] text-white px-6 py-3 text-sm font-semibold disabled:opacity-60 transition-colors"
        >
          <Send className="w-4 h-4" /> {sending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, val, on, type = "text", testid }) {
  return (
    <div>
      <label className="block text-xs tracking-[0.2em] uppercase text-[#64748B] mb-2">{label}</label>
      <input
        type={type}
        value={val}
        onChange={(e) => on(e.target.value)}
        data-testid={testid}
        className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm focus:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20"
      />
    </div>
  );
}

function GoogleReviewsCard({ url }) {
  return (
    <div className="sticky top-24 rounded-3xl border border-[#E2E8F0] bg-gradient-to-br from-white to-[#FBF7EF] p-8" data-testid="google-reviews-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-lg bg-white border border-[#E2E8F0] flex items-center justify-center">
          {/* Multi-color Google G */}
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        </div>
        <div>
          <div className="serif text-lg text-[#0B3B5C] leading-tight">Verified on Google</div>
          <div className="text-[11px] text-[#64748B] leading-tight">Real reviews from real riders</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-1">
        {[0,1,2,3,4].map((i) => <Star key={i} className="w-5 h-5 text-[#FBBC05] fill-[#FBBC05]" />)}
        <span className="serif text-2xl text-[#0B3B5C] font-semibold ml-1">4.9</span>
      </div>
      <div className="text-xs text-[#64748B] mb-6">Averaged across hundreds of trips across Nassau, Paradise Island &amp; Cable Beach.</div>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        data-testid="google-reviews-cta"
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0B3B5C] hover:bg-[#132a4a] text-white text-sm font-semibold py-3 transition-colors"
      >
        Read reviews on Google
        <ExternalLink className="w-3.5 h-3.5 opacity-80" />
      </a>

      <div className="mt-6 pt-6 border-t border-[#E2E8F0]">
        <div className="text-[11px] tracking-[0.2em] uppercase text-[#64748B] mb-3">What guests say</div>
        <blockquote className="text-sm text-[#0B192C] italic leading-relaxed border-l-2 border-[#D4A94A] pl-4">
          "Fast pickup at LPIA, driver was fantastic and got us to Atlantis smoothly. Booked the return the same night — would use again."
        </blockquote>
        <div className="text-[11px] text-[#64748B] mt-2">— Verified rider · Google review</div>
      </div>
    </div>
  );
}
