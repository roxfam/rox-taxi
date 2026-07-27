import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";

import Layout from "./components/Layout";
import Home from "./pages/Home";
import Taxi from "./pages/Taxi";
import Tours from "./pages/Tours";
import CarRental from "./pages/CarRental";
import Track from "./pages/Track";
import Contact from "./pages/Contact";
import About from "./pages/About";
import Groups from "./pages/Groups";
import { PaymentSuccess, PaymentCancel } from "./pages/PaymentReturn";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminManage from "./pages/AdminManage";
import AdminGroups from "./pages/AdminGroups";
import MyBookings from "./pages/MyBookings";
import AuthCallback from "./pages/AuthCallback";
import { AuthProvider } from "./lib/auth";
import { useEffect } from "react";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function CustomerShell({ children }) {
  return <Layout>{children}</Layout>;
}

function AppRouter() {
  const location = useLocation();
  // Handle OAuth callback: session_id in URL fragment
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<CustomerShell><Home /></CustomerShell>} />
      <Route path="/taxi" element={<CustomerShell><Taxi /></CustomerShell>} />
      <Route path="/tours" element={<CustomerShell><Tours /></CustomerShell>} />
      <Route path="/rentals" element={<CustomerShell><CarRental /></CustomerShell>} />
      <Route path="/track" element={<CustomerShell><Track /></CustomerShell>} />
      <Route path="/contact" element={<CustomerShell><Contact /></CustomerShell>} />
      <Route path="/about" element={<CustomerShell><About /></CustomerShell>} />
      <Route path="/groups" element={<CustomerShell><Groups /></CustomerShell>} />
      <Route path="/my-bookings" element={<CustomerShell><MyBookings /></CustomerShell>} />
      <Route path="/payment/success" element={<CustomerShell><PaymentSuccess /></CustomerShell>} />
      <Route path="/payment/cancel" element={<CustomerShell><PaymentCancel /></CustomerShell>} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/manage" element={<AdminManage />} />
      <Route path="/admin/groups" element={<AdminGroups />} />
    </Routes>
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
