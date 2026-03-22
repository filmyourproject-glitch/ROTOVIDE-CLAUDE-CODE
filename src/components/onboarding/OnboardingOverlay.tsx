import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StepWelcome from "./StepWelcome";

interface Props {
  onComplete: () => void;
}

export default function OnboardingOverlay({ onComplete }: Props) {
  const { user } = useAuth();

  const handleComplete = async () => {
    if (user) {
      await supabase
        .from("user_credits")
        .update({ onboarding_completed: true })
        .eq("user_id", user.id);
    }
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-lg mx-auto px-5">
        <StepWelcome onNext={handleComplete} />
      </div>
    </div>
  );
}
