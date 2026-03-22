import { Clock, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function TrialBanner() {
  const { profile, credits } = useAuth();
  const navigate = useNavigate();

  const trialExpiresAt = credits?.trial_expires_at;
  if (!trialExpiresAt) return null;

  const expiryDate = new Date(trialExpiresAt);
  const now = new Date();
  if (expiryDate <= now) return null;

  const hoursLeft = Math.max(0, Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60)));
  const daysLeft = Math.floor(hoursLeft / 24);
  const timeLabel = daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""}` : `${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}`;

  return (
    <div className="rounded p-4 flex items-center gap-3 bg-warning/5 border border-warning/20">
      <Clock className="w-5 h-5 text-warning shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          Trial expires in {timeLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {credits?.trial_credits ?? 0} trial credits remaining. Upgrade to keep creating.
        </p>
      </div>
      <Button size="sm" onClick={() => navigate("/app/billing")}>
        Upgrade <ArrowRight className="w-3 h-3 ml-1" />
      </Button>
    </div>
  );
}
