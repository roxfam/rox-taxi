import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";

import Layout from "./components/Layout";
import Home from "./pages/Home";
import Taxi from "./pages/Taxi";
import Tours from "./pages/Tours";
import CarRental from "./pages/CarRental";
import Track from "./pages/Track";
import DriverShare from "./pages/DriverShare";
import DriverManifest from "./pages/DriverManifest";
import Contact from "./pages/Contact";
import About from "./pages/About";
import Groups from "./pages/Groups";
import WeddingBuilder from "./pages/WeddingBuilder";
import Gallery from "./pages/Gallery";
import Wall from "./pages/Wall";
import Ardastra from "./pages/attractions/Ardastra";
import Atlantis from "./pages/attractions/Atlantis";
import BlueLagoon from "./pages/attractions/BlueLagoon";
import BahaMar from "./pages/attractions/BahaMar";
import ComingSoon from "./pages/ComingSoon";
import Pay from "./pages/Pay";
import { PaymentSuccess, PaymentCancel } from "./pages/PaymentReturn";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminManage from "./pages/AdminManage";
import AdminGroups from "./pages/AdminGroups";
import MyBookings from "./pages/MyBookings";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from "./pages/AuthCallback";
import PrintReceipt from "./pages/PrintReceipt";
import GiftCards from "./pages/GiftCards";
import UploadLicense from "./pages/UploadLicense";
import TravelToNassau from "./pages/TravelToNassau";
import CruiseGroupsNassau from "./pages/CruiseGroupsNassau";
import { AuthProvider } from "./lib/auth";
import { useEffect } from "react";

import { useVisitorBeacon } from "./hooks/useVisitorBeacon";
import SummerBanner from "./components/SummerBanner";
import FacebookPixel from "./components/FacebookPixel";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function CustomerShell({ children }) {
  return <Layout><SummerBanner />{children}</Layout>;
}

function AppRouter() {
  const location = useLocation();
  useVisitorBeacon();
  // Handle OAuth callback: session_id in URL fragment
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <>
      <FacebookPixel />
      <Routes>
      <Route path="/" element={<CustomerShell><Home /></CustomerShell>} />
      <Route path="/taxi" element={<CustomerShell><Taxi /></CustomerShell>} />
      <Route path="/tours" element={<CustomerShell><Tours /></CustomerShell>} />
      <Route path="/rentals" element={<CustomerShell><CarRental /></CustomerShell>} />
      <Route path="/track" element={<CustomerShell><Track /></CustomerShell>} />
      <Route path="/driver/:booking_id" element={<DriverShare />} />
      <Route path="/driver/manifest" element={<DriverManifest />} />
      <Route path="/contact" element={<CustomerShell><Contact /></CustomerShell>} />
      <Route path="/about" element={<CustomerShell><About /></CustomerShell>} />
      <Route path="/groups" element={<CustomerShell><Groups /></CustomerShell>} />
      <Route path="/wedding-builder" element={<CustomerShell><WeddingBuilder /></CustomerShell>} />
      <Route path="/gallery" element={<CustomerShell><Gallery /></CustomerShell>} />
      <Route path="/wall" element={<CustomerShell><Wall /></CustomerShell>} />
      <Route path="/travel-to-nassau" element={<CustomerShell><TravelToNassau /></CustomerShell>} />
      <Route path="/cruise-groups-nassau" element={<CustomerShell><CruiseGroupsNassau /></CustomerShell>} />
      <Route path="/tours/ardastra" element={<CustomerShell><Ardastra /></CustomerShell>} />
      <Route path="/tours/atlantis" element={<CustomerShell><Atlantis /></CustomerShell>} />
      <Route path="/tours/blue-lagoon" element={<CustomerShell><BlueLagoon /></CustomerShell>} />
      <Route path="/tours/baha-mar" element={<CustomerShell><BahaMar /></CustomerShell>} />
      <Route path="/cities/:slug" element={<CustomerShell><ComingSoon /></CustomerShell>} />
      <Route path="/pay" element={<CustomerShell><Pay /></CustomerShell>} />
      <Route path="/pay/:bookingId" element={<CustomerShell><Pay /></CustomerShell>} />
      <Route path="/my-bookings" element={<CustomerShell><MyBookings /></CustomerShell>} />
      <Route path="/login" element={<CustomerShell><Login /></CustomerShell>} />
      <Route path="/signup" element={<CustomerShell><Signup /></CustomerShell>} />
      <Route path="/reset-password" element={<CustomerShell><ResetPassword /></CustomerShell>} />
      <Route path="/payment/success" element={<CustomerShell><PaymentSuccess /></CustomerShell>} />
      <Route path="/payment/cancel" element={<CustomerShell><PaymentCancel /></CustomerShell>} />
      <Route path="/upload-license/:bookingId" element={<UploadLicense />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/manage" element={<AdminManage />} />
      <Route path="/admin/groups" element={<AdminGroups />} />
    </Routes>
    </>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <ScrollToTop />
          <Toaster position="top-right" richColors />
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
