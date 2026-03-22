import { cn } from "@/lib/utils";
import type { SyncStatus, VideoFormat, StylePreset } from "@/types";

interface StatusBadgeProps {
  status: SyncStatus;
  className?: string;
}

const statusConfig: Record<SyncStatus, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "text-muted-foreground" },
  processing: { label: "Syncing", classes: "text-primary animate-pulse" },
  ready: { label: "Ready", classes: "text-success" },
  failed: { label: "Failed", classes: "text-destructive" },
};

export function SyncStatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[2px]", config.classes, className)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", {
        "bg-muted-foreground": status === "pending",
        "bg-primary": status === "processing",
        "bg-success": status === "ready",
        "bg-destructive": status === "failed",
      })} />
      {config.label}
    </span>
  );
}

export function FormatBadge({ format, className }: { format: VideoFormat; className?: string }) {
  const labels: Record<VideoFormat, string> = { "9:16": "9:16", "16:9": "16:9", both: "Both" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-[2px] bg-foreground/[0.06] text-foreground/[0.35]", className)}>
      {labels[format]}
    </span>
  );
}

export function StyleBadge({ style, className }: { style: StylePreset; className?: string }) {
  const labels: Record<StylePreset, string> = {
    raw_cut: "Raw Cut",
    cinematic: "Cinematic",
    hype: "Hype",
    vibe: "Vibe",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-[9px] uppercase tracking-[2px] bg-foreground/[0.06] text-foreground/[0.35]", className)}>
      {labels[style]}
    </span>
  );
}
