import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { BackgroundUploadProvider } from "@/contexts/BackgroundUploadContext";
import { BackgroundUploadBar } from "@/components/upload/BackgroundUploadBar";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import SignupPage from "@/pages/auth/SignupPage";
import CheckEmailPage from "@/pages/auth/CheckEmailPage";
import VerifyPage from "@/pages/auth/VerifyPage";
import VerifiedPage from "@/pages/auth/VerifiedPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import DashboardPage from "@/pages/app/DashboardPage";
import ProjectsPage from "@/pages/app/ProjectsPage";
import NewProjectPage from "@/pages/app/NewProjectPage";
import ProjectDetailPage from "@/pages/app/ProjectDetailPage";
import EditorPage from "@/pages/app/EditorPage";
import StoragePage from "@/pages/app/StoragePage";
import BillingPage from "@/pages/app/BillingPage";
import SettingsPage from "@/pages/app/SettingsPage";
import LongToShortsPage from "@/pages/app/LongToShortsPage";
import CaptionsPage from "@/pages/app/CaptionsPage";
import NotFound from "@/pages/NotFound";
import LandingPage from "@/pages/LandingPage";
import PricingPage from "@/pages/PricingPage";
import WaitlistPage from "@/pages/admin/WaitlistPage";

const queryClient = new QueryClient();

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const repaint = () => {
      const el = document.documentElement;
      el.style.display = "none";
      void el.offsetHeight;
      el.style.display = "";
    };

    repaint();
    const t1 = setTimeout(repaint, 50);
    const t2 = setTimeout(repaint, 150);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BackgroundUploadProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/pricing" element={<PricingPage />} />

            {/* Auth routes */}
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/signup" element={<SignupPage />} />
            <Route path="/auth/check-email" element={<CheckEmailPage />} />
            <Route path="/auth/verify" element={<VerifyPage />} />
            <Route path="/auth/verified" element={<VerifiedPage />} />
            <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Legacy redirects */}
            <Route path="/login" element={<Navigate to="/auth/login" replace />} />
            <Route path="/signup" element={<Navigate to="/auth/signup" replace />} />

            {/* Protected app routes */}
            <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/new" element={<NewProjectPage />} />
              <Route path="projects/:id" element={<ProjectDetailPage />} />
              <Route path="storage" element={<StoragePage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="long-to-shorts" element={<LongToShortsPage />} />
              <Route path="captions" element={<CaptionsPage />} />
            </Route>

            {/* Editor — full-screen, outside AppLayout */}
            <Route path="/app/projects/:id/editor" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />

            {/* Admin routes */}
            <Route path="/admin/waitlist" element={<ProtectedRoute><WaitlistPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          <BackgroundUploadBar />
        </BrowserRouter>
      </TooltipProvider>
      </BackgroundUploadProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
