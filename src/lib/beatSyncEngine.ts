import { supabase } from "@/integrations/supabase/client";
import type { StylePreset, Section, TimelineClip, AnalysisData } from "@/types";

import { analyzeSongFromBuffer, detectBpmFromBuffer, findClipOffset } from "./audioAnalyzer";
import type { AudioAnalysisResult } from "./audioAnalyzer";
import { computeIntelligentCuts, selectNextClip } from "./intelligentCutting";

export interface SyncSection {
  type: string;
  start: number;
  end: number;
}

export interface AiPlacement {
  beat_index: number;
  timestamp: number;
  type: "performance" | "broll";
  duration_beats: number;
  reason: string;
  effect?: string;
}

export interface SyncResult {
  success: boolean;
  error?: string;
}

/** Generate beat timestamps from BPM and duration */
export function generateBeatTimestamps(bpm: number, songDuration: number): number[] {
  const beatInterval = 60 / bpm;
  const timestamps: number[] = [];
  let t = 0;
  while (t < songDuration) {
    timestamps.push(parseFloat(t.toFixed(3)));
    t += beatInterval;
  }
  return timestamps;
}

/** Build estimated song sections based on duration */
export function buildSections(songDuration: number): SyncSection[] {
  return [
    { type: "intro", start: 0, end: songDuration * 0.08 },
    { type: "verse", start: songDuration * 0.08, end: songDuration * 0.35 },
    { type: "chorus", start: songDuration * 0.35, end: songDuration * 0.55 },
    { type: "verse", start: songDuration * 0.55, end: songDuration * 0.72 },
    { type: "chorus", start: songDuration * 0.72, end: songDuration * 0.92 },
    { type: "outro", start: songDuration * 0.92, end: songDuration },
  ];
}

/** Mathematical fallback algorithm when AI fails */
export function fallbackPlacement(
  beatTimestamps: number[],
  sections: SyncSection[],
  stylePreset: StylePreset,
  brollCount: number,
  songDuration: number,
): { placements: AiPlacement[]; creative_note: string } {
  const placements: AiPlacement[] = [];
  let lastWasBroll = false;

  const beatsPerCut: Record<string, number> = {
    raw_cut: 8,    // 2 bars — ~4s at 120bpm, natural for verse cuts
    cinematic: 16, // 4 bars — ~8s, long cinematic takes
    hype: 4,       // 1 bar  — ~2s, fast but watchable
    vibe: 16,      // 4 bars — ~8s, long atmospheric holds
  };
  const cut = beatsPerCut[stylePreset] || 4;

  for (let i = 0; i < beatTimestamps.length; i += cut) {
    const timestamp = beatTimestamps[i];
    const nextTimestamp = beatTimestamps[i + cut] || songDuration;
    const duration = nextTimestamp - timestamp;
    if (duration < 0.5) continue;

    const section = sections.find((s) => timestamp >= s.start && timestamp < s.end);
    if (!section) continue;

    const canUseBroll =
      brollCount > 0 &&
      !lastWasBroll &&
      (section.type === "verse" || section.type === "intro") &&
      i % (cut * 4) === cut * 2;

    const type = canUseBroll ? "broll" : "performance";

    placements.push({
      beat_index: i,
      timestamp,
      type,
      duration_beats: cut,
      reason: `${section.type} section - ${type}`,
      ...(type === "performance" ? { effect: undefined } : {}),
    });

    lastWasBroll = type === "broll";
  }

  return {
    placements,
    creative_note: "Beat-synced using ROTOVIDE director rules.",
  };
}

/** Effects removed — hard cuts only. Stub kept for type compatibility. */
function assignEffects(
  placements: AiPlacement[],
  _sections: SyncSection[],
  _stylePreset: StylePreset,
  _analysisData?: AudioAnalysisResult | null,
): { effect: string; base_effects: string[]; audio_event: string }[] {
  return placements.map(() => ({
    effect: 'hard_cut',
    base_effects: [],
    audio_event: 'default',
  }));
}

/** Ensure the first clip in a timeline is always a performance clip */
export function ensureFirstClipIsPerformance<T extends { type: string }>(clips: T[]): T[] {
  if (clips.length === 0) return clips;
  if (clips[0].type !== "broll") return clips;
  const perfIdx = clips.findIndex(c => c.type === "performance");
  if (perfIdx === -1) return clips;
  const result = [...clips];
  [result[0], result[perfIdx]] = [result[perfIdx], result[0]];
  return result;
}
/** Fetch audio from Mux MP4 with retries for renditions still transcoding */
/** Fetch Mux audio via server-side edge function proxy (avoids CORS) */
async function fetchMuxAudio(playbackId: string): Promise<ArrayBuffer | null> {
  try {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token ?? anonKey;

    const resp = await fetch(
      `https://${projectId}.supabase.co/functions/v1/fetch-mux-audio`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ playbackId }),
      }
    );

    if (!resp.ok) {
      console.warn("fetch-mux-audio HTTP error:", resp.status);
      return null;
    }

    const buffer = await resp.arrayBuffer();
    if (import.meta.env.DEV) console.log(`fetch-mux-audio returned ${buffer.byteLength} bytes`);
    return buffer;
  } catch (err) {
    console.warn("fetchMuxAudio failed:", err);
    return null;
  }
}


/** Wait for all clips to have static MP4 renditions ready */
async function waitForClipsReady(
  clipIds: string[],
  maxWaitMs = 300000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { data } = await supabase
      .from("media_files")
      .select("id, status, static_renditions_ready")
      .in("id", clipIds);

    const readyCount = data?.filter(
      f => (f as any).static_renditions_ready === true
    ).length ?? 0;
    const allReady = readyCount === clipIds.length;
    if (allReady) {
      if (import.meta.env.DEV) console.log(`All ${clipIds.length} clips have MP4 renditions ready`);
      return true;
    }

    if (import.meta.env.DEV) console.log(`Waiting for MP4 renditions... ${readyCount}/${clipIds.length} ready`);
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
}

export async function runBeatSync(projectId: string): Promise<SyncResult> {
  // 1. Fetch project data
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (projErr || !project) {
    return { success: false, error: "Project not found." };
  }

  // 2. Fetch media files
  const { data: mediaFiles } = await supabase
    .from("media_files")
    .select("*")
    .eq("project_id", projectId)
    .is("deleted_at", null);

  const allFiles = mediaFiles || [];
  const songFile = allFiles.find((f) => f.file_type === "song");
  const performanceClips = allFiles.filter(
    (f) => f.file_type === "performance_clip" || f.clip_classification === "performance"
  );
  const brollClips = allFiles.filter(
    (f) => f.file_type === "broll_clip" || f.clip_classification === "broll"
  );

  if (performanceClips.length === 0) {
    await supabase.from("projects").update({ sync_status: "pending" }).eq("id", projectId);
    return { success: false, error: "Upload at least one performance clip before syncing." };
  }

  // 2b. Wait for Mux to finish processing all clips before proceeding
  const allClipIds = [...performanceClips, ...brollClips].map(c => c.id);
  const clipsReady = await waitForClipsReady(allClipIds);
  if (!clipsReady) {
    console.warn("Some clips did not finish processing in time — proceeding with available data");
  }

  // 2c. Re-fetch media files to get fresh mux_playback_id values written by the webhook
  const { data: refreshedFiles } = await supabase
    .from("media_files")
    .select("*")
    .eq("project_id", projectId)
    .is("deleted_at", null);

  if (refreshedFiles) {
    // Update arrays with fresh data
    performanceClips.length = 0;
    performanceClips.push(
      ...refreshedFiles.filter(
        (f) => f.file_type === "performance_clip" || f.clip_classification === "performance"
      )
    );
    brollClips.length = 0;
    brollClips.push(
      ...refreshedFiles.filter(
        (f) => f.file_type === "broll_clip" || f.clip_classification === "broll"
      )
    );
    if (import.meta.env.DEV) console.log(`Refreshed clip data — ${performanceClips.filter(c => c.mux_playback_id).length}/${performanceClips.length} clips have playback IDs`);
  }

  // 3. Run audio analysis + auto BPM detection if song file exists
  let analysisResult: AudioAnalysisResult | null = null;
  let songAudioBuffer: AudioBuffer | null = null;
  let detectedBpm: number | null = null;

  if (songFile?.storage_path) {
    try {
      if (import.meta.env.DEV) console.log("Running audio analysis...");
      const { data: signedUrl } = await supabase.storage
        .from("media")
        .createSignedUrl(songFile.storage_path, 600);

      if (signedUrl?.signedUrl) {
        const response = await fetch(signedUrl.signedUrl);
        const audioArrayBuffer = await response.arrayBuffer();

        // Decode audio buffer for BPM detection and cross-correlation
        const audioCtx = new OfflineAudioContext(1, 1, 44100);
        songAudioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer.slice(0));

        // Auto-detect BPM from audio
        detectedBpm = detectBpmFromBuffer(songAudioBuffer);
        if (import.meta.env.DEV) console.log(`Auto-detected BPM: ${detectedBpm}`);

        // Use detected BPM if no manual BPM was set, or use manual as fallback
        const effectiveBpm = detectedBpm || project.bpm || 120;

        // Run full analysis using the already-decoded buffer
        analysisResult = analyzeSongFromBuffer(songAudioBuffer, effectiveBpm);

        if (import.meta.env.DEV) console.log(`Audio analysis complete: ${analysisResult.kick_timestamps.length} kicks, ${analysisResult.snare_timestamps.length} snares, ${analysisResult.drop_timestamps.length} drops, ${analysisResult.sections.length} sections`);
      }
    } catch (err) {
      console.warn("Audio analysis failed, using heuristic sections:", err);
    }
  }

  // FIX: Use AudioBuffer.duration first (exact), then DB field, then fallback
  const songDuration = songAudioBuffer?.duration || songFile?.duration_seconds || 204;

  // Persist the real duration back to media_files for future use
  if (songAudioBuffer?.duration && songFile?.id) {
    try {
      await supabase.from("media_files").update({ duration_seconds: songAudioBuffer.duration }).eq("id", songFile.id);
    } catch (err) {
      console.warn("Failed to persist song duration:", err);
    }
  }

  // Use detected BPM, or manual BPM, or default 120
  const bpm = detectedBpm || project.bpm || 120;

  // 3b. Compute audio offsets via Railway full waveform cross-correlation
  const clipOffsets: Record<string, number> = {};

  if (songFile?.storage_path && performanceClips.length > 0) {
    try {
      if (import.meta.env.DEV) console.log("Sending clips to Railway for waveform sync...");
      const { data, error } = await supabase.functions.invoke("sync-clips", {
        body: {
          project_id: projectId,
          song_storage_path: songFile.storage_path,
          clips: performanceClips.map(c => ({
            id: c.id,
            mux_playback_id: c.mux_playback_id,
          })),
        },
      });

      if (error) {
        console.warn("sync-clips edge function error:", error);
      } else if (data?.results) {
        for (const result of data.results) {
          if (result.pre_roll !== undefined && !result.error) {
            clipOffsets[result.clip_id] = result.pre_roll;
            if (import.meta.env.DEV) console.log(`Clip ${result.clip_id}: preRoll=${result.pre_roll.toFixed(2)}s confidence=${(result.confidence * 100).toFixed(1)}%`);
          }
        }
        if (import.meta.env.DEV) console.log(`Railway sync complete: ${Object.keys(clipOffsets).length}/${performanceClips.length} clips synced`);
      }
    } catch (err) {
      console.warn("Railway sync failed, using timeline-based offsets:", err);
    }
  }

  // Use analysis sections if available, otherwise heuristic
  const sections = analysisResult?.sections?.length
    ? analysisResult.sections.map(s => ({ type: s.type, start: s.start, end: s.end }))
    : buildSections(songDuration);

  const beatTimestamps = analysisResult?.beats || generateBeatTimestamps(bpm, songDuration);
  const beatInterval = 60 / bpm;
  const stylePreset = (project.style_preset || "raw_cut") as StylePreset;

  // 4. Compute section-aware intelligent cut points
  let placements: AiPlacement[] = [];
  let creativeNote = "";

  const cutPoints = computeIntelligentCuts(
    bpm,
    songDuration,
    sections as any[],
    analysisResult?.energy_curve,
    analysisResult?.kick_timestamps,
    analysisResult?.drop_timestamps,
  );
  if (import.meta.env.DEV) console.log(`Intelligent cutting: ${cutPoints.length} cuts across ${sections.length} sections`);

  // 4b. Optional AI Creative Director enhancement
  let aiBrollIndices: Set<number> | null = null;
  if (brollClips.length > 0) {
    try {
      const aiPromise = supabase.functions.invoke("ai-creative-director", {
        body: {
          bpm,
          songDuration,
          stylePreset,
          sections,
          performanceClipCount: performanceClips.length,
          brollClipCount: brollClips.length,
          beatTimestamps,
        },
      });

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
      const aiResult = await Promise.race([aiPromise, timeoutPromise]);

      if (aiResult && 'data' in aiResult && aiResult.data && !aiResult.data.fallback) {
        const aiPlacements = aiResult.data.placements;
        if (Array.isArray(aiPlacements)) {
          aiBrollIndices = new Set<number>();
          for (const p of aiPlacements) {
            if (p.type === 'broll' && typeof p.beat_index === 'number') {
              aiBrollIndices.add(p.beat_index);
            }
          }
          if (aiResult.data.creative_note) {
            creativeNote = aiResult.data.creative_note;
          }
          if (import.meta.env.DEV) console.log(`AI Creative Director: ${aiBrollIndices.size} B-roll suggestions applied`);
        }
      }
    } catch (aiErr) {
      console.warn("AI Creative Director failed (using fallback):", aiErr);
    }
  }

  // Build placements from cut points (clip type determined later by selectNextClip)
  placements = cutPoints.map((cut, idx) => {
    const nextCut = cutPoints[idx + 1];
    const end = nextCut ? nextCut.time : songDuration;
    const durationBeats = Math.max(1, Math.round((end - cut.time) / beatInterval));

    return {
      beat_index: idx,
      timestamp: cut.time,
      type: 'performance' as const, // placeholder, overridden by selectNextClip
      duration_beats: durationBeats,
      reason: `${cut.sectionType} - ${cut.type} (energy: ${cut.intensity.toFixed(2)})`,
    };
  });

  if (!creativeNote) {
    creativeNote = `Section-aware edit: ${sections.map(s => s.type).join(' → ')}. ` +
      `${cutPoints.filter(c => c.sectionType === 'chorus').length} chorus cuts, ` +
      `${cutPoints.filter(c => c.sectionType === 'verse').length} verse cuts.`;
  }

  if (brollClips.length === 0) {
    creativeNote =
      "Performance-only edit — upload B-roll clips to unlock AI placement.";
  }

  // 5. Assign effects (hard cuts only)
  const effectAssignments = assignEffects(placements, sections, stylePreset, analysisResult);

  // 6. Build timeline clips using live switcher model
  let lastClipId: string | null = null;
  let brollCooldown = 0;
  let perfRobinIdx = 0;
  let brollRobinIdx = 0;

  const timelineClips: (TimelineClip & { effect: string; base_effects: string[]; audio_event: string })[] = [];

  for (let idx = 0; idx < placements.length; idx++) {
    const placement = placements[idx];
    const cut = cutPoints[idx];

    // Use selectNextClip to determine which camera to cut to
    const isLastClip = idx === placements.length - 1;
    const { clip, isBroll, newBrollCooldown, newPerfIdx, newBrollIdx } = selectNextClip(
      lastClipId,
      idx,
      cut.sectionType,
      cut.intensity,
      performanceClips,
      brollClips,
      brollCooldown,
      perfRobinIdx,
      brollRobinIdx,
    );

    // Override: never use B-roll as the very last clip
    let finalIsBroll = isBroll;
    let finalClip = clip;
    if (isLastClip && isBroll) {
      // Force performance clip
      let pIdx = perfRobinIdx % performanceClips.length;
      if (performanceClips[pIdx].id === lastClipId && performanceClips.length > 1) {
        pIdx = (pIdx + 1) % performanceClips.length;
      }
      finalClip = performanceClips[pIdx];
      finalIsBroll = false;
    }

    lastClipId = finalClip.id;
    brollCooldown = isLastClip && isBroll ? newBrollCooldown : newBrollCooldown;
    perfRobinIdx = newPerfIdx;
    brollRobinIdx = newBrollIdx;

    const clipType = finalIsBroll ? 'broll' : 'performance';

    const end = Math.min(
      placement.timestamp + placement.duration_beats * beatInterval,
      songDuration
    );

    const { effect, base_effects, audio_event } = effectAssignments[idx];

    // Performance clips: at song time T, clip plays at T + sync_offset
    // sync_offset = pre-roll (can be negative if clip started after song)
    // B-roll clips: always play from second 0, no sync needed
    let sourceOffset = 0;
    if (clipType === "performance" && finalClip?.id) {
      const syncOffset = clipOffsets[finalClip.id] ?? 0;
      sourceOffset = placement.timestamp + syncOffset;
      sourceOffset = Math.max(0, sourceOffset);
    } else if (clipType === "broll") {
      sourceOffset = 0;
    }

    timelineClips.push({
      id: `tc_${idx}`,
      clip_id: finalClip?.id || `mock_${idx}`,
      type: clipType,
      start: placement.timestamp,
      end,
      source_offset: sourceOffset,
      mute_original_audio: true,
      beat_aligned: true,
      placement_reason: placement.reason,
      crop: null,
      effects: [effect, ...base_effects]
        .filter((e, i, arr) => arr.indexOf(e) === i)
        .map(e => ({ type: e as any, at_seconds: placement.timestamp, params: {} })),
      effect,
      base_effects,
      audio_event,
    });
  }

  // 7b. First placement is already forced to performance by selectNextClip (cutIndex > 0 check)
  const orderedClips = timelineClips;

  // Log switcher summary
  const perfCount = orderedClips.filter(c => c.type === 'performance').length;
  const brollCount = orderedClips.filter(c => c.type === 'broll').length;
  const uniqueCams = new Set(orderedClips.map(c => c.clip_id)).size;
  if (import.meta.env.DEV) console.log(`Live Switcher: ${orderedClips.length} cuts, ${perfCount} perf / ${brollCount} broll, ${uniqueCams} unique cameras`);

  // 8. Build sections with real energy_avg from analysis
  const timelineSections: Section[] = analysisResult?.sections?.length
    ? analysisResult.sections
    : sections.map((s) => ({
        type: s.type as Section["type"],
        start: s.start,
        end: s.end,
        energy_avg:
          s.type === "chorus" ? 0.9
          : s.type === "verse" ? 0.6
          : s.type === "intro" ? 0.3
          : 0.2,
      }));

  // 9. Store analysis data
  const analysisData = analysisResult ? {
    bpm: analysisResult.bpm,
    beats: analysisResult.beats,
    energy_curve: analysisResult.energy_curve,
    sections: analysisResult.sections,
    duration: analysisResult.duration,
    kick_timestamps: analysisResult.kick_timestamps,
    snare_timestamps: analysisResult.snare_timestamps,
    drop_timestamps: analysisResult.drop_timestamps,
  } : null;

  // 10. Save to database
  const { error: saveError } = await supabase
    .from("projects")
    .update({
      sync_status: "ready",
      detected_bpm: bpm,
      analysis_data: analysisData as any,
      timeline_data: {
        bpm,
        duration: songDuration,
        format: project.format || "9:16",
        style: stylePreset,
        beat_timestamps: beatTimestamps,
        beats: beatTimestamps,
        sections: timelineSections,
        timeline: orderedClips,
        effects: [],
        creative_note: creativeNote,
        clip_summary: {
          performance_count: performanceClips.length,
          broll_count: brollClips.length,
          total_duration: songDuration,
        },
      },
    } as any)
    .eq("id", projectId);

  if (saveError) {
    console.error("Save error:", saveError);
    await supabase.from("projects").update({ sync_status: "failed" }).eq("id", projectId);
    return { success: false, error: "Failed to save timeline." };
  }

  return { success: true };
}
