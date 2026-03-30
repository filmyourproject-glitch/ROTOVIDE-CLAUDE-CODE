import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProcessingProgressProps {
  percent: number;
  message?: string;
  etaSeconds?: number | null;
  onCancel?: () => void;
  open: boolean;
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function ProcessingProgress({
  percent,
  message = "Processing your video...",
  etaSeconds,
  onCancel,
  open,
}: ProcessingProgressProps) {
  if (!open) return null;

  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(8,8,8,0.92)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl p-8 text-center"
        style={{
          background: "#0d0d0d",
          border: "1px solid rgba(242,237,228,0.08)",
        }}
      >
        {/* Percentage */}
        <div
          className="mb-2"
          style={{
            fontFamily: "'Bebas Neue', cursive",
            fontSize: 72,
            letterSpacing: 4,
            color: "#E8FF47",
            lineHeight: 1,
          }}
        >
          {Math.round(clamped)}%
        </div>

        {/* Message */}
        <p
          className="mb-6 text-sm"
          style={{ color: "rgba(242,237,228,0.6)" }}
        >
          {message}
        </p>

        {/* Progress bar */}
        <div
          className="w-full h-2 rounded-full mb-3 overflow-hidden"
          style={{ background: "rgba(242,237,228,0.06)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${clamped}%`,
              background: "linear-gradient(90deg, #E8FF47, #c4d93c)",
            }}
          />
        </div>

        {/* ETA */}
        {etaSeconds != null && etaSeconds > 0 && (
          <p
            className="mb-6 text-xs font-mono tracking-wider"
            style={{ color: "rgba(242,237,228,0.35)" }}
          >
            ETA {formatETA(etaSeconds)}
          </p>
        )}

        {/* Cancel */}
        {onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-foreground/40 hover:text-foreground/60 gap-2"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
