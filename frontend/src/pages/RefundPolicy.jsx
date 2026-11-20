import { Link } from "react-router-dom";
import { ShieldCheck, CalendarCheck, Clock, Gift } from "lucide-react";
import Seo from "../components/Seo";

const AT_A_GLANCE = [
  { Icon: CalendarCheck, t: "24+ hours' notice", d: "Your payment becomes Rox travel credit, valid for 12 months." },
  { Icon: Clock, t: "Under 24 hours or no-show", d: "Your booking is considered used and can't be credited." },
  { Icon: Gift, t: "Need a new date?", d: "Change it for free on the Track page, up to 2 hours before pickup." },
];

const SECTIONS = [
  { t: "1. Our commitment", d: [
    "As soon as you book, your driver, vehicle or tour place is reserved just for you, and we turn away other guests to keep it.",
    "So that we can keep our prices fair and our drivers paid, every booking is final. Instead of cash refunds, we give flexible Rox travel credit so your money is never lost."] },
  { t: "2. Cancelling 24 hours or more before pickup", d: [
    "You'll get Rox travel credit for the full amount you paid, minus the payment processing fee. That fee is paid to the card company and we can't get it back.",
    "Your credit code arrives by email and text and is also saved to your account. You can use it on any taxi ride, tour or car rental.",
    "Credit is valid for 12 months from the day it's issued. It can be used in part, but it can't be exchanged for cash.",
    "Our team confirms every cancellation request, usually within one business day."] },
  { t: "3. Cancelling less than 24 hours before, or not showing up", d: [
    "By this point your driver and time slot are fully committed, so we can't offer a refund or credit for late cancellations or no-shows.",
    "If you're more than 30 minutes late without letting us know, your booking counts as a no-show.",
    "Running late? Message us on WhatsApp and we'll do our best to wait for you or arrange another pickup."] },
  { t: "4. Free date changes", d: [
    "Plans change, and we get it. You can move your booking to another date or time for free on the Track page, up to 2 hours before pickup, if there's space.",
    "If the new trip costs more, you only pay the difference. If it costs less, we add the difference to your account as Rox credit."] },
  { t: "5. Non-refundable items", d: [
    "Payment processing fees, driver tips, gift cards, Rox credit, and group or holiday deposits are non-refundable.",
    "VAT is only returned as part of a Rox credit."] },
  { t: "6. If we need to cancel", d: [
    "Your safety comes first. If we have to cancel because of severe weather, safety concerns or a vehicle problem, we'll offer you a new date or full Rox credit, including all fees.",
    "In special cases, our management team may approve a refund to your original card or PayPal. Approved refunds can take 10–14 business days to show on your statement."] },
  { t: "7. Car rentals", d: [
    "We place a hold for the full rental amount on your card and charge it only after your trip.",
    "We may charge the security deposit for damage, missing fuel, late return, traffic fines or extra cleaning. We'll always explain any charge."] },
  { t: "8. Questions about a charge", d: [
    "We're here to help. If anything about your booking or charge doesn't look right, please contact us first. Most issues are sorted out quickly with a new date or travel credit.",
    "By booking, you agree to this policy. If a charge is disputed with your bank, we'll share your booking details, this policy and the trip records with them."] },
];

export default function RefundPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16" data-testid="refund-policy-page">
      <Seo title="Cancellation & Refund Policy | Rox Taxi Service & Tours" description="Flexible Rox travel credit for cancellations made 24+ hours ahead, free date changes, and clear terms for late cancellations and no-shows." path="/refund-policy" />
      <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-[#D4A94A] font-black"><ShieldCheck className="w-4 h-4" /> Booking policy</div>
      <h1 className="font-[Georgia] text-4xl sm:text-5xl text-[#0B3B5C] mt-3">Cancellation &amp; Refund Policy</h1>
      <p className="text-[#64748B] mt-4 leading-relaxed">We want your time in The Bahamas to be easy, including when plans change. This policy explains what happens if you need to cancel or change a booking.</p>

      <div className="mt-8 grid sm:grid-cols-3 gap-3" data-testid="refund-policy-glance">
        {AT_A_GLANCE.map(({ Icon, t, d }) => (
          <div key={t} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <Icon className="w-5 h-5 text-[#D4A94A]" />
            <div className="mt-2 text-sm font-semibold text-[#0B3B5C]">{t}</div>
            <div className="mt-1 text-xs text-[#64748B] leading-relaxed">{d}</div>
          </div>
        ))}
      </div>

      <div className="mt-12 space-y-8">
        {SECTIONS.map((s, i) => (
          <section key={s.t} data-testid={`refund-policy-section-${i + 1}`}>
            <h2 className="text-base md:text-lg font-semibold text-[#0B3B5C]">{s.t}</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-[#334155] leading-relaxed list-disc pl-5">
              {s.d.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-12 text-sm text-[#64748B]">Have a question before you cancel? <Link to="/contact" className="underline text-[#0B3B5C]" data-testid="refund-policy-contact">Get in touch</Link> and we&apos;ll gladly help you find the best option.</p>
    </div>
  );
}
