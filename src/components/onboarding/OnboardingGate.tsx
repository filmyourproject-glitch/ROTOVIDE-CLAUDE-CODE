import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import OnboardingOverlay from "./OnboardingOverlay";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) return;

    const check = async () => {
      try {
        const { data } = await supabase
          .from("user_credits")
          .select("onboarding_completed")
          .eq("user_id", user.id)
          .maybeSingle();

        const isNewUser = (() => {
          const created = user.created_at
            ? new Date(user.created_at).getTime()
            : 0;
          return Date.now() - created < 10 * 60 * 1000;
        })();

        const completed = data?.onboarding_completed ?? false;
        setShowOnboarding(!completed && isNewUser);
      } catch {
        setShowOnboarding(false);
      } finally {
        setChecked(true);
      }
    };

    check();
  }, [user]);

  return (
    <>
      {children}
      {checked && showOnboarding && (
        <OnboardingOverlay onComplete={() => setShowOnboarding(false)} />
      )}
    </>
  );
}
