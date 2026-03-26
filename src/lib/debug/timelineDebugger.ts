/**
 * Timeline Debugger — validates timeline data integrity and EditManifest structure.
 */
import type { EditManifest, TimelineClip } from "@/lib/editManifest";

export type IssueSeverity = "error" | "warning" | "info";

export interface TimelineIssue {
  severity: IssueSeverity;
  message: string;
  clipIndex?: number;
  clipId?: string;
}

/**
 * Validate timeline clip array for structural issues.
 */
export function validateTimeline(clips: TimelineClip[]): TimelineIssue[] {
  const issues: TimelineIssue[] = [];

  if (!clips || clips.length === 0) {
    issues.push({ severity: "warning", message: "Timeline is empty" });
    return issues;
  }

  const seenIds = new Set<string>();

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];

    // Missing clip_id
    if (!clip.clip_id) {
      issues.push({
        severity: "error",
        message: `Clip at index ${i} has no clip_id`,
        clipIndex: i,
      });
    }

    // Duplicate clip ID in same position
    const key = `${clip.clip_id}:${clip.start_time}`;
    if (seenIds.has(key)) {
      issues.push({
        severity: "warning",
        message: `Duplicate clip+start_time: ${clip.clip_id} at ${clip.start_time}s`,
        clipIndex: i,
        clipId: clip.clip_id,
      });
    }
    seenIds.add(key);

    // Zero or negative duration
    const duration = clip.end_time - clip.start_time;
    if (duration <= 0) {
      issues.push({
        severity: "error",
        message: `Clip "${clip.clip_id}" has zero or negative duration: ${duration}s`,
        clipIndex: i,
        clipId: clip.clip_id,
      });
    }

    // Very short clip (under 0.1s)
    if (duration > 0 && duration < 0.1) {
      issues.push({
        severity: "warning",
        message: `Clip "${clip.clip_id}" is very short: ${duration.toFixed(3)}s`,
        clipIndex: i,
        clipId: clip.clip_id,
      });
    }

    // Negative start time
    if (clip.start_time < 0) {
      issues.push({
        severity: "error",
        message: `Clip "${clip.clip_id}" has negative start_time: ${clip.start_time}`,
        clipIndex: i,
        clipId: clip.clip_id,
      });
    }

    // Check for overlaps with next clip
    if (i < clips.length - 1) {
      const next = clips[i + 1];
      if (clip.end_time > next.start_time + 0.01) {
        issues.push({
          severity: "warning",
          message: `Overlap: "${clip.clip_id}" ends at ${clip.end_time.toFixed(2)}s but "${next.clip_id}" starts at ${next.start_time.toFixed(2)}s`,
          clipIndex: i,
          clipId: clip.clip_id,
        });
      }

      // Gap between clips
      const gap = next.start_time - clip.end_time;
      if (gap > 0.5) {
        issues.push({
          severity: "info",
          message: `Gap of ${gap.toFixed(2)}s between clips ${i} and ${i + 1}`,
          clipIndex: i,
        });
      }
    }
  }

  return issues;
}

/**
 * Validate EditManifest structure.
 */
export function validateManifest(manifest: EditManifest): TimelineIssue[] {
  const issues: TimelineIssue[] = [];

  if (!manifest) {
    issues.push({ severity: "error", message: "Manifest is null/undefined" });
    return issues;
  }

  if (!manifest.timeline || !Array.isArray(manifest.timeline)) {
    issues.push({ severity: "error", message: "Manifest has no timeline array" });
  } else {
    issues.push(...validateTimeline(manifest.timeline));
  }

  if (!manifest.bpm || manifest.bpm <= 0) {
    issues.push({ severity: "warning", message: `Invalid BPM: ${manifest.bpm}` });
  }

  if (manifest.bpm && (manifest.bpm < 40 || manifest.bpm > 300)) {
    issues.push({
      severity: "warning",
      message: `Unusual BPM value: ${manifest.bpm} (expected 40-300)`,
    });
  }

  return issues;
}

/**
 * Compute a summary diff between two manifests.
 */
export function diffManifests(
  before: EditManifest,
  after: EditManifest,
): string[] {
  const changes: string[] = [];

  const bLen = before.timeline?.length ?? 0;
  const aLen = after.timeline?.length ?? 0;

  if (bLen !== aLen) {
    changes.push(`Timeline clips: ${bLen} -> ${aLen} (${aLen > bLen ? "+" : ""}${aLen - bLen})`);
  }

  if (before.bpm !== after.bpm) {
    changes.push(`BPM: ${before.bpm} -> ${after.bpm}`);
  }

  if (before.style !== after.style) {
    changes.push(`Style: "${before.style || "none"}" -> "${after.style || "none"}"`);
  }

  // Check for reordered clips
  if (bLen === aLen && bLen > 0) {
    let reordered = 0;
    for (let i = 0; i < bLen; i++) {
      if (before.timeline[i]?.clip_id !== after.timeline[i]?.clip_id) {
        reordered++;
      }
    }
    if (reordered > 0) {
      changes.push(`${reordered} clips changed position`);
    }
  }

  if (changes.length === 0) {
    changes.push("No changes detected");
  }

  return changes;
}
