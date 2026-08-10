import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { lazy, Suspense, useEffect } from "react";

import Layout from "./components/Layout";
// Home is the LCP page — keep it in the main bundle so first paint is fast.
import Home from "./pages/Home";
// Every other route is lazy-loaded — cuts the initial JS payload by ~60%
// on the main entry chunk and defers heavy admin/booking pages until the
// user actually navigates to them.
const Taxi = lazy(() => import("./pages/Taxi"));
const Tours = lazy(() => import("./pages/Tours"));
const CarRental = lazy(() => import("./pages/CarRental"));
const Track = lazy(() => import("./pages/Track"));
const DriverShare = lazy(() => import("./pages/DriverShare"));
const DriverManifest = lazy(() => import("./pages/DriverManifest"));
const DriverHelp = lazy(() => import("./pages/DriverHelp"));
const Contact = lazy(() => import("./pages/Contact"));
const About = lazy(() => import("./pages/About"));
const Groups = lazy(() => import("./pages/Groups"));
const WeddingBuilder = lazy(() => import("./pages/WeddingBuilder"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Wall = lazy(() => import("./pages/Wall"));
const Ardastra = lazy(() => import("./pages/attractions/Ardastra"));
const Atlantis = lazy(() => import("./pages/attractions/Atlantis"));
const BlueLagoon = lazy(() => import("./pages/attractions/BlueLagoon"));
const BahaMar = lazy(() => import("./pages/attractions/BahaMar"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const Pay = lazy(() => import("./pages/Pay"));
const PaymentSuccess = lazy(() => import("./pages/PaymentReturn").then((m) => ({ default: m.PaymentSuccess })));
const PaymentCancel = lazy(() => import("./pages/PaymentReturn").then((m) => ({ default: m.PaymentCancel })));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminManage = lazy(() => import("./pages/AdminManage"));
const AdminGroups = lazy(() => import("./pages/AdminGroups"));
const MyBookings = lazy(() => import("./pages/MyBookings"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const PrintReceipt = lazy(() => import("./pages/PrintReceipt"));
const GiftCards = lazy(() => import("./pages/GiftCards"));
const UploadLicense = lazy(() => import("./pages/UploadLicense"));
const TravelToNassau = lazy(() => import("./pages/TravelToNassau"));
const CruiseGroupsNassau = lazy(() => import("./pages/CruiseGroupsNassau"));
import { AuthProvider } from "./lib/auth";

import { useVisitorBeacon } from "./hooks/useVisitorBeacon";
import SummerBanner from "./components/SummerBanner";
import FacebookPixel from "./components/FacebookPixel";
import SeoVerification from "./components/SeoVerification";

function RouteSkeleton() {
  // Minimal skeleton shown while a lazy chunk is resolving. Deliberately
  // brand-neutral so it feels like part of the page rather than a spinner.
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: "Georgia,serif" }} data-testid="route-skeleton">
      <span style={{ letterSpacing: "0.32em", textTransform: "uppercase", fontSize: "11px" }}>Loading…</span>
    </div>
  );
}

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
      <SeoVerification />
      <Suspense fallback={<RouteSkeleton />}>
      <Routes>
      <Route path="/" element={<CustomerShell><Home /></CustomerShell>} />
      <Route path="/taxi" element={<CustomerShell><Taxi /></CustomerShell>} />
      <Route path="/tours" element={<CustomerShell><Tours /></CustomerShell>} />
      <Route path="/rentals" element={<CustomerShell><CarRental /></CustomerShell>} />
      <Route path="/track" element={<CustomerShell><Track /></CustomerShell>} />
      <Route path="/driver/:booking_id" element={<DriverShare />} />
      <Route path="/driver/manifest" element={<DriverManifest />} />
      <Route path="/driver/help" element={<DriverHelp />} />
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
    </Suspense>
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
