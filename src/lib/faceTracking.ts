import { loadFaceModel } from './faceDetection';
import * as blazeface from '@tensorflow-models/blazeface';
import { Pose, POSE_CONNECTIONS, Results as PoseResults } from '@mediapipe/pose';

export interface FaceKeyframe {
  t: number;
  x: number;
  y: number;
  confidence: number;
  trackingSource: 'face' | 'body' | 'held';
}

// ── BlazeFace model (shared) ──
let cachedModel: blazeface.BlazeFaceModel | null = null;

async function getModel(): Promise<blazeface.BlazeFaceModel> {
  await loadFaceModel();
  if (!cachedModel) {
    cachedModel = await blazeface.load();
  }
  return cachedModel;
}

// ── MediaPipe Pose (lazy singleton) ──
let poseInstance: Pose | null = null;
let poseReady = false;

function getPose(): Pose {
  if (!poseInstance) {
    poseInstance = new Pose({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    poseInstance.setOptions({
      modelComplexity: 0, // lightweight — fast enough for per-frame fallback
      enableSegmentation: false,
      smoothLandmarks: false,
    });
    // Warm-up handled on first .send()
    poseReady = true;
  }
  return poseInstance;
}

/**
 * Run MediaPipe Pose on a canvas frame and return the upper-body center.
 * Returns null if no body landmarks detected.
 */
async function detectBodyCenter(
  canvas: HTMLCanvasElement,
): Promise<{ x: number; y: number } | null> {
  const pose = getPose();

  return new Promise<{ x: number; y: number } | null>((resolve) => {
    let resolved = false;

    pose.onResults((results: PoseResults) => {
      if (resolved) return;
      resolved = true;

      if (!results.poseLandmarks?.length) {
        resolve(null);
        return;
      }

      const lm = results.poseLandmarks;
      const leftShoulder = lm[11]; // landmark 11
      const rightShoulder = lm[12]; // landmark 12

      if (!leftShoulder || !rightShoulder) {
        resolve(null);
        return;
      }

      // Both visibility thresholds must pass
      if ((leftShoulder.visibility ?? 0) < 0.3 && (rightShoulder.visibility ?? 0) < 0.3) {
        resolve(null);
        return;
      }

      const bodyCenterX = (leftShoulder.x + rightShoulder.x) / 2;
      // Shift up 0.1 toward where the face would be
      const bodyCenterY = (leftShoulder.y + rightShoulder.y) / 2 - 0.1;

      resolve({
        x: Math.max(0, Math.min(1, bodyCenterX)),
        y: Math.max(0, Math.min(1, bodyCenterY)),
      });
    });

    // Safety timeout — don't block forever
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 3000);

    pose.send({ image: canvas }).catch(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
}

// ── Confidence thresholds ──
const HIGH_CONFIDENCE = 0.7;
const LOW_CONFIDENCE = 0.3;

export async function extractFaceKeyframes(
  file: File,
  onProgress?: (pct: number) => void
): Promise<FaceKeyframe[]> {
  const model = await getModel();

  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => resolve();
  });

  const duration = video.duration;
  if (!duration || !isFinite(duration)) {
    URL.revokeObjectURL(video.src);
    return [];
  }

  const isMobile = window.innerWidth < 768 || navigator.maxTouchPoints > 0;
  const SAMPLE_INTERVAL = isMobile ? 1.0 : 0.5;
  const totalSamples = Math.floor(duration / SAMPLE_INTERVAL);
  const keyframes: FaceKeyframe[] = [];

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d')!;

  for (let i = 0; i <= totalSamples; i++) {
    const t = i * SAMPLE_INTERVAL;
    video.currentTime = t;

    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const prev = keyframes[keyframes.length - 1];
    const prevX = prev?.x ?? 0.5;
    const prevY = prev?.y ?? 0.35;

    try {
      const predictions = await model.estimateFaces(canvas, false);

      if (predictions.length > 0) {
        const face = predictions.reduce((a, b) =>
          (a.probability as number) > (b.probability as number) ? a : b
        );

        const prob = face.probability as number;
        const [x1, y1] = face.topLeft as [number, number];
        const [x2, y2] = face.bottomRight as [number, number];
        const faceCenterX = ((x1 + x2) / 2) / canvas.width;
        const faceCenterY = ((y1 + y2) / 2) / canvas.height;
        const clampedX = Math.max(0, Math.min(1, faceCenterX));
        const clampedY = Math.max(0, Math.min(1, faceCenterY));

        if (prob >= HIGH_CONFIDENCE) {
          // High confidence — trust face fully
          keyframes.push({ t, x: clampedX, y: clampedY, confidence: prob, trackingSource: 'face' });
        } else if (prob >= LOW_CONFIDENCE) {
          // Medium confidence — blend 70% face, 30% previous
          keyframes.push({
            t,
            x: clampedX * 0.7 + prevX * 0.3,
            y: clampedY * 0.7 + prevY * 0.3,
            confidence: prob,
            trackingSource: 'face',
          });
        } else {
          // Low confidence face — try body fallback
          const body = await detectBodyCenter(canvas);
          if (body) {
            keyframes.push({ t, x: body.x, y: body.y, confidence: 0.5, trackingSource: 'body' });
          } else {
            keyframes.push({ t, x: prevX, y: prevY, confidence: 0, trackingSource: 'held' });
          }
        }
      } else {
        // No face at all — try body fallback
        const body = await detectBodyCenter(canvas);
        if (body) {
          keyframes.push({ t, x: body.x, y: body.y, confidence: 0.5, trackingSource: 'body' });
        } else {
          keyframes.push({ t, x: prevX, y: prevY, confidence: 0, trackingSource: 'held' });
        }
      }
    } catch {
      keyframes.push({ t, x: prevX, y: prevY, confidence: 0, trackingSource: 'held' });
    }

    onProgress?.(Math.round((i / totalSamples) * 100));
  }

  URL.revokeObjectURL(video.src);
  return keyframes;
}

export function smoothKeyframes(
  keyframes: FaceKeyframe[],
  windowSize = 5
): FaceKeyframe[] {
  return keyframes.map((kf, i) => {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(keyframes.length, start + windowSize);
    const win = keyframes.slice(start, end);
    const avgX = win.reduce((s, k) => s + k.x, 0) / win.length;
    const avgY = win.reduce((s, k) => s + k.y, 0) / win.length;
    return { ...kf, x: avgX, y: avgY };
  });
}

export function getFacePositionAtTime(
  keyframes: FaceKeyframe[],
  time: number
): { x: number; y: number; trackingSource?: 'face' | 'body' | 'held' } {
  if (!keyframes || keyframes.length === 0) {
    return { x: 0.5, y: 0.35, trackingSource: 'held' };
  }

  const after = keyframes.find(k => k.t >= time);
  const before = [...keyframes].reverse().find(k => k.t <= time);

  if (!before) return { x: after!.x, y: after!.y, trackingSource: after!.trackingSource };
  if (!after) return { x: before.x, y: before.y, trackingSource: before.trackingSource };
  if (before.t === after.t) return { x: before.x, y: before.y, trackingSource: before.trackingSource };

  const t = (time - before.t) / (after.t - before.t);
  // Use the dominant tracking source (prefer face > body > held)
  const sourceRank = { face: 2, body: 1, held: 0 };
  const dominantSource = sourceRank[before.trackingSource] >= sourceRank[after.trackingSource]
    ? before.trackingSource
    : after.trackingSource;

  return {
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
    trackingSource: dominantSource,
  };
}
