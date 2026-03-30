import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ADMIN_EMAILS } from "@/lib/admin/constants";

export function AdminRoute({ children }: { children: React.ReactNode }) {
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

  if (!ADMIN_EMAILS.includes(user.email ?? "")) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
}
