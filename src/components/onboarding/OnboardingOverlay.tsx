import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StepWelcome from "./StepWelcome";
import StepHowItWorks from "./StepHowItWorks";
import StepUseCase from "./StepUseCase";
import StepFirstUpload from "./StepFirstUpload";

type Step = "welcome" | "how_it_works" | "use_case" | "first_upload";
const STEPS: Step[] = ["welcome", "how_it_works", "use_case", "first_upload"];

interface Props {
  onComplete: () => void;
}

export default function OnboardingOverlay({ onComplete }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("welcome");
  const [primaryUse, setPrimaryUse] = useState<string | null>(null);

  const handleComplete = async () => {
    if (user) {
      await supabase
        .from("user_credits")
        .update({ onboarding_completed: true })
        .eq("user_id", user.id);
    }
    onComplete();
  };

  const currentIndex = STEPS.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-lg mx-auto px-5">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "w-2 h-2 rounded-full transition-colors duration-300",
                i <= currentIndex ? "bg-primary" : "bg-muted-foreground/30"
              )}
            />
          ))}
        </div>

        {/* Steps */}
        {step === "welcome" && (
          <StepWelcome
            onNext={() => setStep("how_it_works")}
            onSkip={handleComplete}
          />
        )}
        {step === "how_it_works" && (
          <StepHowItWorks onComplete={() => setStep("use_case")} />
        )}
        {step === "use_case" && (
          <StepUseCase
            onSelect={(use) => {
              setPrimaryUse(use);
              setStep("first_upload");
            }}
          />
        )}
        {step === "first_upload" && (
          <StepFirstUpload primaryUse={primaryUse} onNext={handleComplete} />
        )}
      </div>
    </div>
  );
}
