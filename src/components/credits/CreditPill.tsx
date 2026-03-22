import { Zap } from "lucide-react";
import { useCreditSystem } from "@/hooks/useCreditSystem";
import { cn } from "@/lib/utils";

export function CreditPill({ onClick }: { onClick?: () => void }) {
  const { totalAvailable, alertLevel } = useCreditSystem();

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono tracking-wide transition-all",
        "hover:scale-105 active:scale-95",
        alertLevel === "ok" && "bg-primary/10 text-primary border border-primary/20",
        alertLevel === "low" && "bg-warning/10 text-warning border border-warning/20",
        alertLevel === "critical" && "bg-destructive/10 text-destructive border border-destructive/20 animate-pulse",
        alertLevel === "empty" && "bg-destructive/10 text-destructive border border-destructive/20",
      )}
    >
      <Zap className="w-3 h-3" />
      {totalAvailable} credits
    </button>
  );
}
