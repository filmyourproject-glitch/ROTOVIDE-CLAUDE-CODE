import { useEffect, lazy, Suspense } from "react";
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
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { RoutePrefetcher } from "@/components/layout/RoutePrefetcher";

// ── Lazy-loaded pages ──────────────────────────────────────────────────────
// Auth
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const SignupPage = lazy(() => import("@/pages/auth/SignupPage"));
const CheckEmailPage = lazy(() => import("@/pages/auth/CheckEmailPage"));
const VerifyPage = lazy(() => import("@/pages/auth/VerifyPage"));
const VerifiedPage = lazy(() => import("@/pages/auth/VerifiedPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));

// App
const DashboardPage = lazy(() => import("@/pages/app/DashboardPage"));
const ProjectsPage = lazy(() => import("@/pages/app/ProjectsPage"));
const NewProjectPage = lazy(() => import("@/pages/app/NewProjectPage"));
const ProjectDetailPage = lazy(() => import("@/pages/app/ProjectDetailPage"));
const EditorPage = lazy(() => import("@/pages/app/EditorPage"));
const StoragePage = lazy(() => import("@/pages/app/StoragePage"));
const BillingPage = lazy(() => import("@/pages/app/BillingPage"));
const SettingsPage = lazy(() => import("@/pages/app/SettingsPage"));
const LongToShortsPage = lazy(() => import("@/pages/app/LongToShortsPage"));
const CaptionsPage = lazy(() => import("@/pages/app/CaptionsPage"));

// Public + admin
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const WaitlistPage = lazy(() => import("@/pages/admin/WaitlistPage"));

// Dev-only debug panel (code-split, must be after all imports to avoid TDZ)
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import("@/components/debug/DebugPanel"))
  : () => null;

// ── Route loading spinner ──────────────────────────────────────────────────
function RouteSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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
        <ErrorBoundary>
        <BrowserRouter>
          <ScrollToTop />
          <RoutePrefetcher />
          <Suspense fallback={<RouteSpinner />}>
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
          </Suspense>
          <BackgroundUploadBar />
        </BrowserRouter>
        </ErrorBoundary>
        {import.meta.env.DEV && (
          <Suspense fallback={null}>
            <DebugPanel />
          </Suspense>
        )}
      </TooltipProvider>
      </BackgroundUploadProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
