import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { isAdminAuthed, adminLogout } from "../lib/api";
import QuotesPanel from "./admin/QuotesPanel";
import InvoicesPanel from "./admin/InvoicesPanel";

export default function AdminQuotes() {
  const nav = useNavigate();
  useEffect(() => {
    if (!isAdminAuthed()) nav("/admin/login");
  }, [nav]);
  return (
    <div className="min-h-screen bg-[#F1F5F9]" data-testid="admin-quotes-page">
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-[70]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <img src="/logo-gold.webp" alt="Rox" width={32} height={32} className="w-9 h-9 object-contain" />
              <span className="font-semibold text-[#0B3B5C]">Quotes &amp; invoices</span>
            </div>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <button onClick={() => nav("/admin")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-bookings">Bookings</button>
              <button onClick={() => nav("/admin/quotes")} className="px-3 py-1.5 rounded-md bg-[#0B3B5C] text-white" data-testid="admin-nav-quotes">Quotes</button>
              <button onClick={() => nav("/admin/manage")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-manage">Manage catalog</button>
              <button onClick={() => nav("/admin/groups")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-groups">Group inquiries</button>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => nav("/admin")} className="sm:hidden text-sm text-[#64748B]" data-testid="admin-quotes-back">← Dashboard</button>
            <button onClick={async () => { await adminLogout(); nav("/admin/login"); }} className="text-sm flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-[#F1F5F9]"><LogOut className="w-4 h-4" /> Sign out</button>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-12">
        <QuotesPanel />
        <InvoicesPanel />
      </div>
    </div>
  );
}
