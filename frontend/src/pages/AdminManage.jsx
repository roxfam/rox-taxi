import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CatalogPanel from "./admin/CatalogPanel";
import ImagesPanel from "./admin/ImagesPanel";
import MessagesPanel from "./admin/MessagesPanel";
import SiteConfigPanel from "./admin/SiteConfigPanel";
import HomeSlidesPanel from "./admin/HomeSlidesPanel";

const TABS = [
  { key: "home_slides", label: "Home Slides" },
  { key: "tours", label: "Tours" },
  { key: "taxi_services", label: "Taxi Services" },
  { key: "rentals", label: "Rentals" },
  { key: "images", label: "Images" },
  { key: "messages", label: "Messages" },
  { key: "site", label: "Site Config" },
];

// Thin routing shell for the /admin/manage screen. Each tab renders a
// self-contained panel from ./admin/* so this file stays under 100 lines.
export default function AdminManage() {
  const [tab, setTab] = useState("tours");
  const nav = useNavigate();

  useEffect(() => {
    if (!localStorage.getItem("admin_token")) nav("/admin/login");
  }, [nav]);

  return (
    <div className="min-h-screen bg-[#F1F5F9]" data-testid="admin-manage">
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-[80]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[#0B3B5C] text-white flex items-center justify-center text-xs font-bold">RX</div>
              <span className="font-semibold text-[#0B3B5C]">Manage catalog</span>
            </div>
            <nav className="hidden sm:flex items-center gap-1 text-sm">
              <button onClick={() => nav("/admin")} className="px-3 py-1.5 rounded-md hover:bg-[#F1F5F9] text-[#64748B]" data-testid="admin-nav-bookings">Bookings</button>
              <button onClick={() => nav("/admin/manage")} className="px-3 py-1.5 rounded-md bg-[#0B3B5C] text-white" data-testid="admin-nav-manage">Manage catalog</button>
            </nav>
          </div>
          <button onClick={() => nav("/admin")} className="text-sm text-[#64748B] hover:text-[#0B3B5C]" data-testid="admin-manage-back">← Dashboard</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-testid={`admin-tab-${t.key}`}
              className={`px-4 py-2 rounded-md text-sm ${tab === t.key ? "bg-[#0B3B5C] text-white" : "bg-white border border-[#E2E8F0] hover:border-[#0B3B5C]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "site" ? <SiteConfigPanel />
          : tab === "images" ? <ImagesPanel />
          : tab === "messages" ? <MessagesPanel />
          : tab === "home_slides" ? <HomeSlidesPanel />
          : <CatalogPanel kind={tab} />}
      </div>
    </div>
  );
}
