// Lightweight face position utilities — NO TensorFlow / BlazeFace / MediaPipe dependency.
// Import this instead of faceDetection.ts / faceTracking.ts when you only need
// pure position-calculation functions.

export type { FaceCrop } from "./faceDetection";
export type { FaceKeyframe } from "./faceTracking";

/**
 * Compute a CSS `object-position` string from a FaceCrop.
 * For 9:16 format on 16:9 source, adjusts the horizontal range so the
 * face stays centered in the narrow vertical crop.
 */
export function getSmartCropPosition(
  faceCrop: { centerX: number; centerY: number; detected: boolean } | undefined,
  format?: string
): string {
  if (!faceCrop || !faceCrop.detected) {
    return "center 30%";
  }
  const xPercent = Math.round(faceCrop.centerX * 100);
  const yPercent = Math.round(faceCrop.centerY * 100);

  if (format === "9:16") {
    const r = (9 / 16) / (16 / 9); // ≈ 0.316
    const objectX = Math.max(
      0,
      Math.min(100, ((faceCrop.centerX - r / 2) / (1 - r)) * 100)
    );
    return `${Math.round(objectX)}% ${yPercent}%`;
  }

  return `${xPercent}% ${yPercent}%`;
}

/**
 * Interpolate face position at a given time from an array of keyframes.
 * Pure math — no model loading.
 */
export function getFacePositionAtTime(
  keyframes: Array<{
    t: number;
    x: number;
    y: number;
    trackingSource?: "face" | "body" | "held";
  }>,
  time: number
): { x: number; y: number; trackingSource?: "face" | "body" | "held" } {
  if (!keyframes || keyframes.length === 0) {
    return { x: 0.5, y: 0.35, trackingSource: "held" };
  }

  const after = keyframes.find((k) => k.t >= time);
  const before = [...keyframes].reverse().find((k) => k.t <= time);

  if (!before)
    return { x: after!.x, y: after!.y, trackingSource: after!.trackingSource };
  if (!after)
    return { x: before.x, y: before.y, trackingSource: before.trackingSource };
  if (before.t === after.t)
    return { x: before.x, y: before.y, trackingSource: before.trackingSource };

  const t = (time - before.t) / (after.t - before.t);
  const sourceRank = { face: 2, body: 1, held: 0 } as const;
  const dominantSource =
    (sourceRank[before.trackingSource ?? "held"] ?? 0) >=
    (sourceRank[after.trackingSource ?? "held"] ?? 0)
      ? before.trackingSource
      : after.trackingSource;

  return {
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
    trackingSource: dominantSource,
  };
}
