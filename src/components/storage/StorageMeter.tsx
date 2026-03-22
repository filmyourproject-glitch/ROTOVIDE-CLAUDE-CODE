import { cn } from "@/lib/utils";

interface StorageMeterProps {
  usedBytes: number;
  totalBytes: number;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function StorageMeter({ usedBytes, totalBytes, className }: StorageMeterProps) {
  const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  // Color based on usage: accent → warning → error
  const barStyle = percent >= 90
    ? "bg-destructive"
    : percent >= 75
      ? "bg-warning"
      : "bg-primary";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-label text-muted-foreground">Storage</span>
        <span className="text-mono text-foreground">
          {formatBytes(usedBytes)} / {formatBytes(totalBytes)}
        </span>
      </div>
      <div className="h-[3px] rounded-sm bg-foreground/[0.08] overflow-hidden">
        <div
          className={cn("h-full rounded-sm transition-all duration-500", barStyle)}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
