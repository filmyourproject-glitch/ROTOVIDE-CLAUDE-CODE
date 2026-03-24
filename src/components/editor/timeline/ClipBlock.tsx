import { cn } from "@/lib/utils";
import type { TimelineClip } from "@/types";
import type { EditTool } from "@/components/editor/EditingToolbar";
import { MIN_CLIP_DURATION } from "./utils";

export interface ClipBlockProps {
  clip: TimelineClip;
  rowType: "performance" | "broll";
  pps: number;
  duration: number;
  isMobile: boolean;
  activeTool: EditTool;
  currentTime: number;
  selectedClipId: string | null;
  dragClipId: string | null;
  trimClipId: string | null;
  trimSide: "left" | "right" | null;
  trimDelta: number;
  clipNames?: Record<string, string>;
  clipThumbnails?: Record<string, string>;
  onClipTap: (e: React.MouseEvent | React.TouchEvent, clipId: string) => void;
  onClipTouchStart: (e: React.TouchEvent, clipId: string) => void;
  onClipTouchMove: (e: React.TouchEvent) => void;
  onClipTouchEnd: () => void;
  onClipMouseDown: (e: React.MouseEvent, clipId: string) => void;
  onTrimStart: (clipId: string, side: "left" | "right", clientX: number, e: React.TouchEvent | React.MouseEvent) => void;
}

export function ClipBlock({
  clip,
  rowType,
  pps,
  duration,
  isMobile,
  activeTool,
  currentTime,
  selectedClipId,
  dragClipId,
  trimClipId,
  trimSide,
  trimDelta,
  clipNames,
  clipThumbnails,
  onClipTap,
  onClipTouchStart,
  onClipTouchMove,
  onClipTouchEnd,
  onClipMouseDown,
  onTrimStart,
}: ClipBlockProps) {
  const isPerf = rowType === "performance";
  const isSelected = clip.id === selectedClipId;
  const isBeingDragged = clip.id === dragClipId;
  const isBeingTrimmed = clip.id === trimClipId;
  const isSplitTarget = activeTool === "split" && currentTime > clip.start && currentTime < clip.end;

  let displayStart = clip.start;
  let displayEnd = clip.end;
  if (isBeingTrimmed && trimSide) {
    if (trimSide === "left") {
      displayStart = Math.max(0, clip.start + trimDelta);
      if (displayEnd - displayStart < MIN_CLIP_DURATION) displayStart = displayEnd - MIN_CLIP_DURATION;
    } else {
      displayEnd = Math.min(duration, clip.end + trimDelta);
      if (displayEnd - displayStart < MIN_CLIP_DURATION) displayEnd = displayStart + MIN_CLIP_DURATION;
    }
  }

  const widthPx = (displayEnd - displayStart) * pps;
  const leftPx = displayStart * pps;
  const clipName = clipNames?.[clip.clip_id]?.replace(/\.[^/.]+$/, "") ?? (isPerf ? "Perf" : "B-Roll");
  const thumbUrl = clipThumbnails?.[clip.clip_id];
  const showLabel = widthPx > 30;
  const clipDur = (displayEnd - displayStart).toFixed(1);

  return (
    <div
      key={clip.id}
      className={cn(
        "absolute rounded flex items-center cursor-pointer transition-all duration-100",
        isPerf
          ? "border-primary/30 bg-primary/80"
          : "border-[#4ECDC4]/30 bg-[#4ECDC4]/70",
        isSelected && "ring-2 ring-primary",
        isBeingDragged && "opacity-90 scale-105 shadow-[0_0_16px_hsl(var(--primary)/0.4)] z-30",
        isSplitTarget && "ring-1 ring-primary/50",
        "border"
      )}
      style={{
        left: leftPx,
        width: widthPx,
        height: "100%",
        minWidth: 8,
        ...(thumbUrl ? {
          backgroundImage: `url(${thumbUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : {}),
      }}
      title={`${clipName}: ${clipDur}s`}
      onClick={(e) => onClipTap(e, clip.id)}
      onTouchStart={(e) => onClipTouchStart(e, clip.id)}
      onTouchMove={onClipTouchMove}
      onTouchEnd={onClipTouchEnd}
      onMouseDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x > 24 && x < rect.width - 24) {
          onClipMouseDown(e, clip.id);
        }
      }}
    >
      {/* Left trim handle */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center cursor-col-resize z-10",
          isMobile ? "opacity-100" : "opacity-0 hover:opacity-100",
          "transition-opacity"
        )}
        onMouseDown={(e) => onTrimStart(clip.id, "left", e.clientX, e)}
        onTouchStart={(e) => onTrimStart(clip.id, "left", e.touches[0].clientX, e)}
      >
        <div className="w-1 h-3/5 rounded-full bg-primary" />
      </div>

      {/* Clip label */}
      {showLabel && (
        <span className={cn(
          "text-[10px] truncate font-mono font-medium px-7",
          isPerf ? "text-primary-foreground/80" : "text-success-foreground/80"
        )}>
          {clipName}
        </span>
      )}

      {/* Right trim handle */}
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 w-6 flex items-center justify-center cursor-col-resize z-10",
          isMobile ? "opacity-100" : "opacity-0 hover:opacity-100",
          "transition-opacity"
        )}
        onMouseDown={(e) => onTrimStart(clip.id, "right", e.clientX, e)}
        onTouchStart={(e) => onTrimStart(clip.id, "right", e.touches[0].clientX, e)}
      >
        <div className="w-1 h-3/5 rounded-full bg-primary" />
      </div>

      {/* Trim duration badge */}
      {isBeingTrimmed && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-secondary text-primary text-[10px] font-mono px-2 py-0.5 rounded whitespace-nowrap z-40">
          {clipDur}s
        </div>
      )}
    </div>
  );
}

// Drop insertion line for drag-to-reorder
export interface DropLineProps {
  dropIndex: number | null;
  dragClipId: string | null;
  clips: TimelineClip[];
  rowClips: TimelineClip[];
  pps: number;
}

export function DropLine({ dropIndex, dragClipId, clips, rowClips, pps }: DropLineProps) {
  if (dropIndex === null || !dragClipId) return null;
  const draggedClip = clips.find(c => c.id === dragClipId);
  if (!draggedClip) return null;
  const sameType = rowClips.filter(c => c.type === draggedClip.type && c.id !== dragClipId);
  if (sameType.length === 0 && dropIndex === 0) {
    return <div className="absolute top-0 bottom-0 w-0.5 bg-primary z-20" style={{ left: 0 }} />;
  }
  const idx = Math.min(dropIndex, sameType.length);
  const refClip = idx > 0 ? sameType[idx - 1] : null;
  const x = refClip ? refClip.end * pps : 0;
  return <div className="absolute top-0 bottom-0 w-0.5 bg-primary z-20" style={{ left: x }} />;
}
