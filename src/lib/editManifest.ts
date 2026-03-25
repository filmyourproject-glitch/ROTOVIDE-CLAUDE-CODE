// Edit Manifest Schema for ROTOVIDE
// AI outputs JSON Edit Manifests; the app interprets them for preview and export.
// Based on OpenTimelineIO structure with AI-specific extensions.

export interface EditManifest {
  manifest_version: "1.0";
  metadata: ManifestMetadata;
  resources: ManifestResources;
  timeline: Timeline;
  edit_decisions: EditDecision[];
}

export interface ManifestMetadata {
  id: string;
  project_id: string;
  style_label: EditStyle;
  ai_model: string;
  parent_version: string | null;
  confidence: number;
  created_at: string;
  created_by: "ai" | "user";
}

export type EditStyle = "high_energy" | "cinematic" | "slow_mood" | "custom";

export interface ManifestResources {
  media: MediaResource[];
  audio: AudioResource[];
}

export interface MediaResource {
  id: string;
  src: string;          // "mux://playback-id" format
  duration: number;     // seconds
  rate: number;         // fps (e.g. 29.97)
  width: number;
  height: number;
  scene_index: SceneSegment[];
  face_keyframes?: FaceKeyframe[];
}

export interface SceneSegment {
  start: number;
  end: number;
  description: string;
  mood: string;
  faces_detected: number;
  dominant_colors: string[];
}

export interface AudioResource {
  id: string;
  src: string;
  duration: number;
  bpm: number;
  beat_timestamps: number[];
  sections: AudioSection[];
}

export interface AudioSection {
  type: "intro" | "verse" | "chorus" | "bridge" | "outro";
  start: number;
  end: number;
  energy: number;  // 0–1
}

export interface Timeline {
  output: OutputSettings;
  tracks: Track[];
}

export interface OutputSettings {
  width: number;
  height: number;
  fps: number;
  aspect_ratio: "9:16" | "16:9" | "1:1";
  duration: number;
}

export interface Track {
  id: string;
  kind: "video" | "audio" | "text";
  clips: Clip[];
}

export interface Clip {
  id: string;
  media_ref: string;
  timeline_position: number;
  source_range: SourceRange;
  effects: Effect[];
  transition_in?: Transition;
  transition_out?: Transition;
  face_crop?: FaceCrop;
  ai_rationale: string;
}

export interface SourceRange {
  start: number;
  duration: number;
}

export interface Effect {
  id: string;
  type: EffectType;
  params: Record<string, unknown>;
  intensity: number;  // 0–1
}

export type EffectType =
  | "color_grade"
  | "speed"
  | "flash_cut"
  | "whip_transition"
  | "zoom"
  | "shake"
  | "letterbox"
  | "vignette"
  | "grain";

export interface Transition {
  type: "cut" | "fade" | "dissolve" | "wipe" | "flash";
  duration: number;
}

export interface FaceCrop {
  enabled: boolean;
  tracked: boolean;
  static_x?: number;        // 0–1, used when not tracked
  keyframes?: FaceKeyframe[];
}

export interface FaceKeyframe {
  timestamp: number;
  x: number;       // 0–1 normalized
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface EditDecision {
  id: string;
  type: "cut" | "effect" | "transition" | "reorder";
  timestamp: number;
  confidence: number;
  rationale: string;
  alternatives: EditAlternative[];
}

export interface EditAlternative {
  description: string;
  preview_params: Record<string, unknown>;
}

// ── Utility functions ────────────────────────────────────────────────────────

export function createEmptyManifest(projectId: string, style: EditStyle): EditManifest {
  return {
    manifest_version: "1.0",
    metadata: {
      id: crypto.randomUUID(),
      project_id: projectId,
      style_label: style,
      ai_model: "gemini-2.5-pro",
      parent_version: null,
      confidence: 0,
      created_at: new Date().toISOString(),
      created_by: "ai",
    },
    resources: { media: [], audio: [] },
    timeline: {
      output: {
        width: 1080,
        height: 1920,
        fps: 29.97,
        aspect_ratio: "9:16",
        duration: 0,
      },
      tracks: [],
    },
    edit_decisions: [],
  };
}

export function cloneManifest(manifest: EditManifest, newStyle?: EditStyle): EditManifest {
  const clone = JSON.parse(JSON.stringify(manifest)) as EditManifest;
  clone.metadata.id = crypto.randomUUID();
  clone.metadata.parent_version = manifest.metadata.id;
  clone.metadata.created_at = new Date().toISOString();
  if (newStyle) clone.metadata.style_label = newStyle;
  return clone;
}

export function getClipAtTime(manifest: EditManifest, time: number): Clip | null {
  for (const track of manifest.timeline.tracks) {
    if (track.kind !== "video") continue;
    for (const clip of track.clips) {
      const clipEnd = clip.timeline_position + clip.source_range.duration;
      if (time >= clip.timeline_position && time < clipEnd) return clip;
    }
  }
  return null;
}

export function getTotalDuration(manifest: EditManifest): number {
  let maxEnd = 0;
  for (const track of manifest.timeline.tracks) {
    for (const clip of track.clips) {
      maxEnd = Math.max(maxEnd, clip.timeline_position + clip.source_range.duration);
    }
  }
  return maxEnd;
}
