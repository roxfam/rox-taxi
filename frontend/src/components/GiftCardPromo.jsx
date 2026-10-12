import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Gift, ArrowRight } from "lucide-react";

export default function GiftCardPromo() {
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-10 py-12" data-testid="home-gift-card-promo">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl bg-[#0B192C] text-white px-8 sm:px-14 py-12 flex flex-col md:flex-row md:items-center gap-8"
      >
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[#D4A94A]/20 blur-3xl" />
        <div className="w-16 h-16 rounded-2xl bg-[#D4A94A] text-[#0B192C] flex items-center justify-center shrink-0">
          <Gift className="w-8 h-8" />
        </div>
        <div className="flex-1 relative">
          <div className="text-xs tracking-[0.3em] uppercase text-[#D4A94A]">Gift cards available</div>
          <h2 className="serif text-3xl sm:text-4xl mt-2 leading-tight">Give a Bahamas ride, tour or beach day.</h2>
          <p className="mt-3 text-white/70 text-sm max-w-xl">Delivered instantly by email. Good on every taxi, tour, car rental, Cable Beach day and group booking. Valid for 12 months from purchase.</p>
        </div>
        <Link to="/gift-cards" className="relative btn-shine inline-flex items-center gap-2 rounded-full bg-[#E86A3C] px-7 py-4 text-sm font-semibold hover:bg-[#d55a30] transition-colors shrink-0" data-testid="home-gift-card-cta">
          Buy a gift card <ArrowRight className="w-4 h-4" />
        </Link>
      </motion.div>
    </section>
  );
}
