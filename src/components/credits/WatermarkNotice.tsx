import { AlertTriangle } from "lucide-react";

export function WatermarkNotice() {
  return (
    <div className="flex items-center gap-2 text-xs text-warning bg-warning/5 border border-warning/20 rounded px-3 py-2">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span>Free plan: ROTOVIDE watermark will be applied to exports</span>
    </div>
  );
}
