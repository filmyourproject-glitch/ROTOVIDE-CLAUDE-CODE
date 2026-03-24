import type { TimelineClip } from "@/types";

// ── Constants ──────────────────────────────────────────────────────────────
export const BASE_PPS = 80;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 0.5;
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_MOVE_THRESHOLD = 8;
export const MIN_CLIP_DURATION = 0.5;
export const PLAYHEAD_OFFSET_PCT = 0.25;
export const SCRUB_THRESHOLD_PX = 5;
export const TAP_THRESHOLD_MS = 200;

export const SECTION_PILL_COLORS: Record<string, string> = {
  intro: "bg-muted-foreground/30 text-muted-foreground",
  verse: "bg-primary/50 text-primary-foreground",
  chorus: "bg-primary/80 text-primary-foreground",
  bridge: "bg-warning/50 text-warning-foreground",
  outro: "bg-muted-foreground/30 text-muted-foreground",
};

// ── Helpers ────────────────────────────────────────────────────────────────
export function formatTimeBadge(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function recalcTimings(clips: TimelineClip[]): TimelineClip[] {
  const perf = clips.filter(c => c.type === "performance");
  const broll = clips.filter(c => c.type === "broll");
  return [...recalcTimingsForType(perf), ...recalcTimingsForType(broll)].sort((a, b) => a.start - b.start);
}

export function recalcTimingsForType(clips: TimelineClip[]): TimelineClip[] {
  let cursor = clips.length > 0 ? clips[0].start : 0;
  return clips.map(c => {
    const dur = c.end - c.start;
    const updated = { ...c, start: cursor, end: cursor + dur };
    cursor += dur;
    return updated;
  });
}
