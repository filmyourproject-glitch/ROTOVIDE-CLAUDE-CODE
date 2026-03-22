import { useBackgroundUploads, type UploadPhase } from "@/contexts/BackgroundUploadContext";
import { cn } from "@/lib/utils";

function phaseColor(phase: UploadPhase): string {
  switch (phase) {
    case "transcoding": return "text-yellow-400";
    case "uploading_proxy": return "text-blue-400";
    case "uploading_original": return "text-primary";
    case "complete": return "text-green-500";
    case "error": return "text-destructive";
    default: return "text-muted-foreground";
  }
}

function progressBarColor(phase: UploadPhase): string {
  switch (phase) {
    case "transcoding": return "bg-yellow-400";
    case "uploading_proxy": return "bg-blue-400";
    case "error": return "bg-destructive";
    case "complete": return "bg-green-500";
    default: return "bg-primary";
  }
}

export function BackgroundUploadBar() {
  const { uploads } = useBackgroundUploads();
  const active = uploads.filter((u) => u.phase !== "complete" && u.phase !== "error");
  const allEntries = uploads.filter((u) => u.phase !== "complete" || true); // show all

  if (uploads.length === 0) return null;

  const completedCount = uploads.filter((u) => u.phase === "complete").length;
  const totalCount = uploads.length;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-background border-t border-primary/20 px-4 py-2 space-y-1.5 max-h-[200px] overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-primary text-xs font-mono font-medium">
          PROCESSING FILES
        </span>
        <span className="text-muted-foreground text-[11px] font-mono">
          {completedCount}/{totalCount} complete
        </span>
      </div>

      {uploads.map((u) => (
        <div key={u.id} className="flex items-center gap-2">
          <span className="text-[11px] text-foreground font-medium truncate max-w-[180px]">
            {u.fileName}
          </span>
          <div className="flex-1 bg-muted rounded h-1">
            <div
              className={cn("h-full rounded transition-all duration-300 ease-out", progressBarColor(u.phase))}
              style={{ width: `${u.progress}%` }}
            />
          </div>
          <span className={cn("text-[10px] font-mono whitespace-nowrap", phaseColor(u.phase))}>
            {u.phase === "uploading_original" && u.speedMBps
              ? `${u.label} ${u.speedMBps} MB/s`
              : u.label}
          </span>
        </div>
      ))}
    </div>
  );
}
