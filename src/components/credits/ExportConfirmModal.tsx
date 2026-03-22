import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Zap } from "lucide-react";

interface Props {
  open: boolean;
  creditCost: number;
  creditsRemaining: number;
  plan: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ExportConfirmModal({ open, creditCost, creditsRemaining, plan, onConfirm, onCancel }: Props) {
  const afterExport = creditsRemaining - creditCost;
  const isWatermarked = plan === "free";

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent style={{ background: '#111111', border: '1px solid rgba(242,237,228,0.1)' }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Confirm Export
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-muted-foreground">
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded p-3 bg-background text-center">
                <p className="text-2xl font-display text-primary">{creditCost}</p>
                <p className="text-xs text-muted-foreground">Credits used</p>
              </div>
              <div className="rounded p-3 bg-background text-center">
                <p className="text-2xl font-display text-foreground">{Math.max(0, afterExport)}</p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
            </div>
            {isWatermarked && (
              <p className="text-xs text-warning bg-warning/5 border border-warning/20 rounded p-2">
                Free plan: ROTOVIDE watermark will be applied.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {isWatermarked ? "Export with Watermark" : `Export — ${creditCost} Credit${creditCost !== 1 ? "s" : ""}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
