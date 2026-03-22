import { AlertTriangle, Zap, Crown } from "lucide-react";
import { useCreditSystem } from "@/hooks/useCreditSystem";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function AlertBanner() {
  const { alertLevel, totalAvailable, plan } = useCreditSystem();
  const navigate = useNavigate();

  if (alertLevel === "ok") return null;

  if (plan === "free") {
    return (
      <div className="rounded p-4 flex items-center gap-3 bg-primary/5 border border-primary/20">
        <Crown className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Free plan — exports are watermarked</p>
          <p className="text-xs text-muted-foreground">Upgrade to Pro for clean, unwatermarked exports.</p>
        </div>
        <Button size="sm" onClick={() => navigate("/app/billing")}>Upgrade</Button>
      </div>
    );
  }

  return (
    <div className={`rounded p-4 flex items-center gap-3 ${
      alertLevel === "empty" || alertLevel === "critical" 
        ? "bg-destructive/5 border border-destructive/20" 
        : "bg-warning/5 border border-warning/20"
    }`}>
      <AlertTriangle className={`w-5 h-5 shrink-0 ${
        alertLevel === "empty" || alertLevel === "critical" ? "text-destructive" : "text-warning"
      }`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          {alertLevel === "empty" ? "No credits remaining" : `Only ${totalAvailable} credits left`}
        </p>
        <p className="text-xs text-muted-foreground">
          {alertLevel === "empty" ? "Buy credits to continue exporting." : "Consider topping up to avoid interruptions."}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => navigate("/app/billing")}>
        Buy Credits
      </Button>
    </div>
  );
}
