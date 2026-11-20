import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import Seo from "../components/Seo";

const SECTIONS = [
  { t: "1. All payments are final", d: [
    "We reserve your driver, vehicle or tour seat the moment you pay, and we turn other guests away to hold it. So all payments are final and we don't give cash or card refunds.",
    "If you cancel in time, you get Rox credit instead (see section 2)."] },
  { t: "2. Cancelling 24 hours or more before pickup", d: [
    "You get Rox credit for the amount you paid, minus the non-refundable processing fee.",
    "The credit comes as a code by email and text, and it also shows in your account. You can use it on any taxi ride, tour or rental.",
    "The credit lasts 12 months from the day it's issued. It has no cash value and can't be swapped for money.",
    "Cancellation requests are reviewed and approved by our team."] },
  { t: "3. Cancelling less than 24 hours before, or not showing up", d: [
    "Cancelling less than 24 hours before pickup, not showing up, or arriving more than 30 minutes late counts as using the booking. You get no refund and no credit.",
    "The driver and the time slot were already set aside for you."] },
  { t: "4. Rescheduling instead of cancelling", d: [
    "You can move your booking to a new date for free on the Track page, up to 2 hours before pickup, if there's space.",
    "If the new trip costs more, you pay the difference. If it costs less, the difference becomes Rox credit."] },
  { t: "5. Fees that are never refunded", d: [
    "Processing fees, driver tips, gift cards, Rox credit, and group or holiday deposits are non-refundable.",
    "VAT is only returned as part of a Rox credit."] },
  { t: "6. If we have to cancel", d: [
    "If we cancel because of bad weather, safety or a problem with a vehicle, we'll offer you a new date or full Rox credit, including fees.",
    "Card refunds are at the discretion of Rox management. Approved card refunds can take up to 10–14 business days to show after we process them."] },
  { t: "7. Car rentals", d: [
    "We hold the full rental amount on your card and charge it after the trip.",
    "We may charge the security deposit for damage, low fuel, late return, tickets or cleaning."] },
  { t: "8. Card disputes", d: [
    "By booking, you agree to this policy. Please contact us before you dispute a charge with your bank. Most issues can be fixed quickly with a new date or Rox credit.",
    "If you file a dispute, we send your bank a copy of the booking, this policy and the trip records."] },
];

export default function RefundPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16" data-testid="refund-policy-page">
      <Seo title="Cancellation & Refund Policy | Rox Taxi Service & Tours" description="Rox Taxi cancellation and refund policy: Rox credit for 24h+ cancellations, no refunds within 24 hours or no-shows." path="/refund-policy" />
      <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase text-[#D4A94A] font-black"><ShieldCheck className="w-4 h-4" /> Policy</div>
      <h1 className="font-[Georgia] text-4xl sm:text-5xl text-[#0B3B5C] mt-3">Cancellation &amp; Refund Policy</h1>
      <p className="text-[#64748B] mt-4 leading-relaxed">The short version: cancel 24 hours or more before pickup and you get <strong>Rox credit</strong> (valid 12 months). Cancel less than 24 hours before, or don&apos;t show up, and you get no refund.</p>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((s, i) => (
          <section key={s.t} data-testid={`refund-policy-section-${i + 1}`}>
            <h2 className="text-base md:text-lg font-semibold text-[#0B3B5C]">{s.t}</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-[#334155] leading-relaxed list-disc pl-5">
              {s.d.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-12 text-sm text-[#64748B]">Questions? <Link to="/contact" className="underline text-[#0B3B5C]" data-testid="refund-policy-contact">Contact us</Link> before you cancel and we&apos;ll help you find a new date.</p>
    </div>
  );
}
