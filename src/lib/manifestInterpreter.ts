// Manifest Interpreter: converts EditManifest → TimelineClip[]
// Decouples AI output format from the editor's internal runtime model.

import type {
  EditManifest,
  Clip,
  Effect as ManifestEffect,
  EffectType as ManifestEffectType,
  Transition,
  FaceCrop as ManifestFaceCrop,
} from "./editManifest";
import type { TimelineClip, Effect, CropSettings } from "@/types";

// ── Effect mapping tables ──────────────────────────────────────────────────

const EFFECT_TYPE_MAP: Partial<Record<ManifestEffectType, Effect["type"]>> = {
  flash_cut: "hard_cut",
  whip_transition: "whip_transition",
  zoom: "zoom_in",
  shake: "camera_shake",
  speed: "speed_ramp",
  grain: "film_grain",
  // color_grade, letterbox, vignette → skipped (handled by editor/render pipeline)
};

const TRANSITION_TYPE_MAP: Record<string, Effect["type"] | null> = {
  cut: null,
  fade: "slow_dissolve",
  dissolve: "slow_dissolve",
  wipe: "whip_transition",
  flash: "hard_cut",
};

// ── Internal helpers ───────────────────────────────────────────────────────

function mapManifestEffect(me: ManifestEffect): Effect | null {
  const runtimeType = EFFECT_TYPE_MAP[me.type];
  if (!runtimeType) return null;
  return {
    type: runtimeType,
    at_seconds: 0,
    duration_seconds: undefined,
    params: { ...me.params, intensity: me.intensity },
  };
}

function mapTransitionToEffect(
  transition: Transition | undefined,
  atSeconds: number
): Effect | null {
  if (!transition) return null;
  const runtimeType = TRANSITION_TYPE_MAP[transition.type];
  if (!runtimeType) return null;
  return {
    type: runtimeType,
    at_seconds: atSeconds,
    duration_seconds: transition.duration || undefined,
    params: {},
  };
}

function mapFaceCrop(fc: ManifestFaceCrop | undefined): CropSettings | null {
  if (!fc?.enabled) return null;
  return { strategy: "smart_center", width_pct: 0.5625 };
}

function resolveClipId(
  mediaRef: string,
  availableClips: TimelineClip[],
  mediaFileMap: Record<string, string> | undefined,
  index: number,
  clipType: "performance" | "broll"
): string {
  // 1. Try direct lookup via mediaFileMap
  if (mediaFileMap?.[mediaRef]) return mediaFileMap[mediaRef];

  // 2. Try matching mediaRef against existing clip_ids
  const directMatch = availableClips.find((c) => c.clip_id === mediaRef);
  if (directMatch) return directMatch.clip_id;

  // 3. Fall back to cycling through available clips of the same type
  const sameType = availableClips.filter((c) => c.type === clipType);
  if (sameType.length > 0) {
    return sameType[index % sameType.length].clip_id;
  }

  // 4. Last resort: first available clip
  return availableClips[0]?.clip_id ?? mediaRef;
}

function inferClipType(
  clipId: string,
  availableClips: TimelineClip[]
): "performance" | "broll" {
  const match = availableClips.find((c) => c.clip_id === clipId);
  return match?.type ?? "performance";
}

// ── Main conversion function ───────────────────────────────────────────────

export function convertManifestToTimeline(
  manifest: EditManifest,
  availableClips: TimelineClip[],
  mediaFileMap?: Record<string, string>
): TimelineClip[] {
  const videoTracks = manifest.timeline.tracks.filter(
    (t) => t.kind === "video"
  );
  if (videoTracks.length === 0) return [];

  const result: TimelineClip[] = [];
  let clipIndex = 0;

  for (const track of videoTracks) {
    for (const clip of track.clips) {
      // Determine type first for fallback resolution
      const tentativeId = resolveClipId(
        clip.media_ref,
        availableClips,
        mediaFileMap,
        clipIndex,
        "performance" // temporary — will re-resolve if needed
      );
      const clipType = inferClipType(tentativeId, availableClips);

      // Re-resolve with correct type for cycling
      const resolvedClipId = resolveClipId(
        clip.media_ref,
        availableClips,
        mediaFileMap,
        clipIndex,
        clipType
      );

      // Map effects
      const effects: Effect[] = [];
      for (const me of clip.effects) {
        const mapped = mapManifestEffect(me);
        if (mapped) {
          mapped.at_seconds = clip.timeline_position;
          effects.push(mapped);
        }
      }

      // Map transitions to effects
      const transIn = mapTransitionToEffect(
        clip.transition_in,
        clip.timeline_position
      );
      if (transIn) effects.push(transIn);

      const clipEnd =
        clip.timeline_position + clip.source_range.duration;
      const transOut = mapTransitionToEffect(clip.transition_out, clipEnd);
      if (transOut) effects.push(transOut);

      result.push({
        id: clip.id || `manifest_${clipIndex}`,
        clip_id: resolvedClipId,
        type: clipType,
        start: clip.timeline_position,
        end: clipEnd,
        source_offset: clip.source_range.start,
        mute_original_audio: true,
        beat_aligned: true,
        placement_reason: clip.ai_rationale || "",
        crop: mapFaceCrop(clip.face_crop),
        effects,
      });

      clipIndex++;
    }
  }

  // Sort by timeline position
  result.sort((a, b) => a.start - b.start);
  return result;
}

// ── Utility: extract stats from a manifest ─────────────────────────────────

export function getManifestStats(manifest: EditManifest): {
  cutCount: number;
  effectCount: number;
  confidence: number;
  duration: number;
} {
  const videoClips = manifest.timeline.tracks
    .filter((t) => t.kind === "video")
    .flatMap((t) => t.clips);

  const effectCount = videoClips.reduce(
    (sum, c) => sum + c.effects.length,
    0
  );

  return {
    cutCount: videoClips.length,
    effectCount,
    confidence: manifest.metadata.confidence,
    duration: manifest.timeline.output.duration,
  };
}
