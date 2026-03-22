import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !session) {
    return <Navigate to="/auth/login" replace />;
  }

  // Block unverified users — redirect to verification page
  if (!user.email_confirmed_at) {
    return <Navigate to="/auth/verify" replace state={{ email: user.email }} />;
  }

  return <OnboardingGate>{children}</OnboardingGate>;
}
