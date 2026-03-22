import { Zap, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { RotovideLogo } from "@/components/ui/RotovideLogo";

export default function StepWelcome({ onNext }: { onNext: () => void }) {
  const { credits } = useAuth();

  return (
    <div className="text-center space-y-8 relative">

      {/* X button — always visible escape hatch */}
      <button
        onClick={onNext}
        className="absolute -top-2 right-0 p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
        aria-label="Skip onboarding"
      >
        <X className="w-5 h-5" />
      </button>

      <RotovideLogo size="hero" />

      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-display text-foreground tracking-wider">
          YOUR 3-DAY FREE TRIAL HAS STARTED.
        </h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {credits?.trial_credits ?? 15} credits loaded. No credit card required.
          Let's get your first video done.
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-primary">
        <Zap className="w-5 h-5" />
        <span className="text-4xl font-display">{credits?.trial_credits ?? 15}</span>
        <span className="text-sm text-muted-foreground">credits</span>
      </div>

      <Button size="lg" className="text-base px-10 py-6" onClick={onNext}>
        Let's Go <ArrowRight className="w-4 h-4 ml-2" />
      </Button>

      <button
        onClick={onNext}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
      >
        Skip for now
      </button>

    </div>
  );
}
