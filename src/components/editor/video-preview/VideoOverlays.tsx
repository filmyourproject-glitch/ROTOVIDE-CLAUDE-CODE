import type { FaceCrop } from "@/lib/faceDetection";
import type { FaceKeyframe } from "@/lib/faceTracking";
import { getFacePositionAtTime } from "@/lib/faceTracking";
import type { CameraEntry } from "../VideoPreview";

interface FaceTrackingBadgeProps {
  hasKeyframes: boolean;
  faceCrop?: FaceCrop;
  faceKeyframes?: FaceKeyframe[];
  currentTime: number;
  activeCameraId: string | null;
  cameraRegistry: Record<string, CameraEntry>;
  clipStart: number;
  sourceOffset: number;
}

export function FaceTrackingBadge({
  hasKeyframes,
  faceCrop,
  faceKeyframes,
  currentTime,
  activeCameraId,
  cameraRegistry,
  clipStart,
  sourceOffset,
}: FaceTrackingBadgeProps) {
  let trackingLabel = "CENTER CROP";
  if (hasKeyframes && faceKeyframes) {
    const posInClip = activeCameraId
      ? Math.max(0, currentTime + (cameraRegistry[activeCameraId]?.xcorrOffset ?? 0))
      : (currentTime - clipStart) + sourceOffset;
    const result = getFacePositionAtTime(faceKeyframes, posInClip);
    const source = (result as any).trackingSource;
    if (source === "body") trackingLabel = "BODY TRACKING";
    else if (source === "face") trackingLabel = "FACE TRACKING";
    else if (source === "held") trackingLabel = "TRACKING HELD";
  } else if (faceCrop?.detected) {
    trackingLabel = "FACE DETECTED";
  }

  return (
    <div className="absolute bottom-2 left-3 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1 z-10">
      <div
        className="w-[5px] h-[5px] rounded-full"
        style={{ background: (hasKeyframes || faceCrop?.detected) ? "hsl(var(--primary))" : "hsl(var(--foreground) / 0.3)" }}
      />
      <span className="text-[8px] font-mono text-foreground/70 tracking-wider">
        {trackingLabel}
      </span>
    </div>
  );
}

interface WatermarkOverlayProps {
  showWatermark: boolean;
}

export function WatermarkOverlay({ showWatermark }: WatermarkOverlayProps) {
  if (!showWatermark) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
      <span
        className="font-mono tracking-[6px] select-none"
        style={{
          fontSize: 28,
          color: "hsla(0, 0%, 100%, 0.15)",
          textShadow: "0 2px 8px hsla(0, 0%, 0%, 0.4)",
          transform: "rotate(-18deg)",
          letterSpacing: 6,
          fontWeight: 700,
        }}
      >
        ROTOVIDE
      </span>
    </div>
  );
}
