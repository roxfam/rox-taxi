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
import { PaymentSuccess, PaymentCancel } from "./pages/PaymentReturn";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import { useEffect } from "react";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function CustomerShell({ children }) {
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <ScrollToTop />
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<CustomerShell><Home /></CustomerShell>} />
          <Route path="/taxi" element={<CustomerShell><Taxi /></CustomerShell>} />
          <Route path="/tours" element={<CustomerShell><Tours /></CustomerShell>} />
          <Route path="/rentals" element={<CustomerShell><CarRental /></CustomerShell>} />
          <Route path="/track" element={<CustomerShell><Track /></CustomerShell>} />
          <Route path="/contact" element={<CustomerShell><Contact /></CustomerShell>} />
          <Route path="/payment/success" element={<CustomerShell><PaymentSuccess /></CustomerShell>} />
          <Route path="/payment/cancel" element={<CustomerShell><PaymentCancel /></CustomerShell>} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
