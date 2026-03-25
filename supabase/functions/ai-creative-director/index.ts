import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Shared director rules & effect guide ────────────────────────────────────

const DIRECTOR_RULES = (songDuration: number) => `Director rules you must follow:
1. B-roll NEVER plays during chorus sections — performance only on the hook
2. ALL cuts must land on a beat timestamp from the list above
3. Never place two B-roll clips back to back — always alternate
4. The outro must end on a performance clip
5. The intro can use B-roll to establish mood before the first verse
6. Generate placements covering the ENTIRE song duration from 0 to ${songDuration} seconds`;

const STYLE_GUIDE = `Style guide:
- raw_cut: hard cut every 2 beats, B-roll max 2 beats, aggressive and energetic
- cinematic: cut every 4 beats, B-roll holds 6-8 beats, slow and intentional
- hype: cut every beat, B-roll bursts 1-2 beats max, maximum chaos and energy
- vibe: cut every 8 beats, B-roll holds 8-12 beats, moody and atmospheric`;

const EFFECT_GUIDE = `Effect types (for manifest clips):
- flash_cut: on kick/808 hits, high energy moments
- whip_transition: snare hits, quick camera movement moments
- zoom: slow building tension or drop emphasis
- shake: hype moments, aggressive 808 bass hits
- speed: right before a drop — slows down then snaps
- grain: vibe/cinematic style, atmospheric texture
- vignette: cinematic style, used throughout
- letterbox: cinematic style, widescreen feel
- color_grade: overall mood coloring`;

const LEGACY_EFFECT_GUIDE = `Effect list:
flash_cut, whip_transition, crash_zoom, slow_zoom, film_burn, freeze_frame, speed_ramp, stutter, color_shift, vignette, double_exposure, glitch, dutch_angle, camera_shake, fisheye, vhs, hard_cut

Effect selection guide:
- flash_cut: on kick/808 hits, high energy moments
- crash_zoom: at beat drops and section changes only — use sparingly
- whip_transition: snare hits, quick camera movement moments
- stutter: snare rolls, rapid-fire lyrics moments
- glitch: the single biggest drop in the song — use ONCE maximum
- slow_zoom: breakdown sections, building tension before chorus
- speed_ramp: right before a drop — slows down then snaps
- film_burn: between major sections (intro→verse, verse→chorus)
- camera_shake: hype moments, aggressive 808 bass hits
- color_shift: surprise moments, unexpected musical change
- double_exposure: atmospheric B-roll during slow verses
- dutch_angle: tension, aggression, unease in the verse
- vhs: vibe style only, used throughout
- vignette: cinematic style, used throughout
- freeze_frame: a single powerful lyric moment — use once maximum
- fisheye: wide establishing shots only
- hard_cut: default when no effect needed`;

// ── Scene context builder (Phase 5 — Gemini video understanding) ────────────

interface SceneData {
  timestamp: number;
  duration: number;
  description: string;
  faces?: Array<{ clothing?: string }>;
  location?: string;
  action?: string;
  mood?: string;
  energy?: number;
  camera?: string;
}

interface VideoIndexRow {
  media_file_id: string;
  scene_descriptions: unknown;
  visual_summary: string | null;
}

function buildSceneContext(
  indexes: VideoIndexRow[],
  mediaResources?: { id: string; type: string; duration: number }[]
): string {
  if (!indexes.length) return "";

  const parts: string[] = [
    "\n── VISUAL CONTENT ANALYSIS (from Gemini video understanding) ──",
    "Use this data to match specific clips to song sections based on their visual content.",
  ];

  for (const idx of indexes) {
    const resource = mediaResources?.find((m) => m.id === idx.media_file_id);
    const typeLabel = resource?.type ?? "clip";

    parts.push(`\nClip "${idx.media_file_id}" (${typeLabel}):`);

    if (idx.visual_summary) {
      parts.push(`  Summary: ${idx.visual_summary}`);
    }

    const scenes = idx.scene_descriptions as SceneData[];
    if (Array.isArray(scenes) && scenes.length > 0) {
      // Limit to 8 key scenes per clip to cap token usage
      const keyScenes =
        scenes.length > 8 ? selectKeyScenes(scenes, 8) : scenes;

      for (const scene of keyScenes) {
        const clothing = scene.faces?.[0]?.clothing
          ? ` [wearing: ${scene.faces[0].clothing}]`
          : "";
        parts.push(
          `  @${scene.timestamp.toFixed(1)}s (${scene.duration.toFixed(1)}s): ` +
            `${scene.description}${clothing} | ${scene.location ?? "?"} | ` +
            `mood:${scene.mood ?? "?"} energy:${scene.energy ?? "?"} | ${scene.camera ?? ""}`
        );
      }
    }
  }

  parts.push(
    "\nYou can reference this visual content when choosing clip placements. " +
      "Match aggressive/hype visuals to chorus sections, moody/atmospheric visuals to verses, " +
      'and use the artist\'s descriptions (e.g. "the red jacket shot") to find specific clips.'
  );

  return parts.join("\n");
}

function selectKeyScenes(scenes: SceneData[], count: number): SceneData[] {
  const sorted = [...scenes].sort((a, b) => a.timestamp - b.timestamp);
  const step = Math.max(1, Math.floor(sorted.length / count));
  const selected = new Set<number>();

  // Evenly spaced scenes
  for (let i = 0; i < sorted.length && selected.size < count; i += step) {
    selected.add(i);
  }

  // Fill remaining slots with highest energy scenes
  const byEnergy = sorted
    .map((s, i) => ({ i, energy: s.energy ?? 0 }))
    .sort((a, b) => b.energy - a.energy);

  for (const { i } of byEnergy) {
    if (selected.size >= count) break;
    selected.add(i);
  }

  return [...selected]
    .sort((a, b) => a - b)
    .map((i) => sorted[i]);
}

// ── Prompt builders ─────────────────────────────────────────────────────────

function buildManifestPrompt(params: {
  bpm: number;
  songDuration: number;
  stylePreset: string;
  sections: unknown[];
  performanceClipCount: number;
  brollClipCount: number;
  beatTimestamps: number[];
  userMessage: string;
  mediaResources?: { id: string; type: string; duration: number }[];
  sceneContext?: string;
}) {
  const mediaList = params.mediaResources?.length
    ? `\nAvailable media resources (use these exact IDs as media_ref):\n${params.mediaResources.map((m) => `- "${m.id}" (${m.type}, ${m.duration.toFixed(1)}s)`).join("\n")}`
    : `\nUse "perf_0", "perf_1", ... for performance clips and "broll_0", "broll_1", ... for B-roll clips.`;

  const directorInstruction = params.userMessage
    ? `\nThe artist has given you a specific direction: "${params.userMessage}"\nApply this direction when generating the edit. Honor the artist's intent above default style rules.\n`
    : "";

  return `You are a professional music video director specializing in rap and hip-hop videos.
${directorInstruction}
Here is the song data:
- BPM: ${params.bpm}
- Duration: ${params.songDuration} seconds
- Edit style: ${params.stylePreset}
- Sections: ${JSON.stringify(params.sections)}
- Performance clips available: ${params.performanceClipCount}
- B-roll clips available: ${params.brollClipCount}
- First 20 beat timestamps: ${JSON.stringify(params.beatTimestamps.slice(0, 20))}
${mediaList}
${params.sceneContext || ""}

${STYLE_GUIDE}

${DIRECTOR_RULES(params.songDuration)}

${EFFECT_GUIDE}

Return ONLY valid JSON with no other text, no markdown, no explanation.
Output a video track with clips covering the entire song. Each clip references a media_ref ID from the list above.

{
  "clips": [
    {
      "id": "c0",
      "media_ref": "<media resource id>",
      "timeline_position": 0.0,
      "source_range": { "start": 0.0, "duration": 3.43 },
      "effects": [{ "id": "e0", "type": "flash_cut", "params": {}, "intensity": 0.8 }],
      "transition_in": { "type": "cut", "duration": 0 },
      "face_crop": { "enabled": true, "tracked": true },
      "ai_rationale": "Reason for this clip placement"
    }
  ],
  "creative_note": "One sentence describing the overall creative approach"
}`;
}

function buildLegacyPrompt(params: {
  bpm: number;
  songDuration: number;
  stylePreset: string;
  sections: unknown[];
  performanceClipCount: number;
  brollClipCount: number;
  beatTimestamps: number[];
  userMessage: string;
}) {
  const directorInstruction = params.userMessage
    ? `\nThe artist has given you a specific direction: "${params.userMessage}"\nApply this direction when generating the placements below. Honor the artist's intent above default style rules.\n`
    : "";

  return `You are a professional music video director specializing in rap and hip-hop videos.
${directorInstruction}

Here is the song data:
- BPM: ${params.bpm}
- Duration: ${params.songDuration} seconds
- Edit style: ${params.stylePreset}
- Sections: ${JSON.stringify(params.sections)}
- Performance clips available: ${params.performanceClipCount}
- B-roll clips available: ${params.brollClipCount}
- First 20 beat timestamps: ${JSON.stringify(params.beatTimestamps.slice(0, 20))}

${STYLE_GUIDE}

${DIRECTOR_RULES(params.songDuration)}

Additionally, for each placement, recommend the best cinematic effect from this list:
${LEGACY_EFFECT_GUIDE}

Return ONLY valid JSON with no other text, no markdown, no explanation:
{
  "placements": [
    { "beat_index": 4, "timestamp": 1.71, "type": "broll", "duration_beats": 4, "reason": "opening verse energy drop", "effect": "slow_zoom" },
    { "beat_index": 8, "timestamp": 3.43, "type": "performance", "duration_beats": 8, "reason": "building energy into first chorus", "effect": "flash_cut" }
  ],
  "creative_note": "One sentence describing the overall creative approach for this video"
}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractUserId(authHeader: string): string | null {
  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

/** Wrap AI-generated clips array into a full EditManifest */
function wrapInManifest(
  clips: unknown[],
  params: {
    projectId: string;
    stylePreset: string;
    songDuration: number;
    parentManifestId?: string | null;
  }
) {
  const styleMap: Record<string, string> = {
    raw_cut: "high_energy",
    hype: "high_energy",
    cinematic: "cinematic",
    vibe: "slow_mood",
  };

  return {
    manifest_version: "1.0",
    metadata: {
      id: crypto.randomUUID(),
      project_id: params.projectId,
      style_label: styleMap[params.stylePreset] || "custom",
      ai_model: "claude-haiku-4-5-20251001",
      parent_version: params.parentManifestId || null,
      confidence: 0.85,
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
        duration: params.songDuration,
      },
      tracks: [
        {
          id: "v1",
          kind: "video",
          clips: clips,
        },
      ],
    },
    edit_decisions: [],
  };
}

/** Convert manifest clips back to legacy placements for backward compat */
function manifestClipsToLegacyPlacements(
  clips: Array<{
    media_ref: string;
    timeline_position: number;
    source_range: { duration: number };
    ai_rationale: string;
    effects?: Array<{ type: string }>;
  }>,
  bpm: number
) {
  const secondsPerBeat = 60 / (bpm || 140);
  return clips.map((c, i) => ({
    beat_index: Math.round(c.timeline_position / secondsPerBeat),
    timestamp: c.timeline_position,
    type: c.media_ref?.startsWith("broll") ? "broll" : "performance",
    duration_beats: Math.round(c.source_range.duration / secondsPerBeat),
    reason: c.ai_rationale || "",
    effect: c.effects?.[0]?.type || "hard_cut",
  }));
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      bpm,
      songDuration,
      stylePreset,
      sections,
      performanceClipCount,
      brollClipCount,
      beatTimestamps,
      user_message,
      // New fields for manifest mode
      project_id,
      current_manifest,
      media_resources,
      conversation_history,
      output_format,
    } = await req.json();

    const useManifest = output_format === "manifest";

    // ── Phase 5: Fetch video indexes for visual context ──
    let sceneContext = "";
    if (project_id && useManifest) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { data: indexes } = await supabaseAdmin
          .from("video_indexes")
          .select("media_file_id, scene_descriptions, visual_summary")
          .eq("project_id", project_id)
          .eq("status", "ready");

        if (indexes?.length) {
          sceneContext = buildSceneContext(
            indexes as VideoIndexRow[],
            media_resources
          );
          console.log(
            `[AI-CREATIVE-DIRECTOR] Injecting scene context from ${indexes.length} video indexes`
          );
        }
      } catch (sceneErr) {
        // Non-blocking — continue without scene context
        console.error("[AI-CREATIVE-DIRECTOR] Failed to fetch video indexes:", sceneErr);
      }
    }

    // ── Build prompt ──
    const promptParams = {
      bpm,
      songDuration,
      stylePreset,
      sections,
      performanceClipCount,
      brollClipCount,
      beatTimestamps: beatTimestamps || [],
      userMessage: user_message || "",
      mediaResources: media_resources,
      sceneContext,
    };

    const prompt = useManifest
      ? buildManifestPrompt(promptParams)
      : buildLegacyPrompt(promptParams);

    // ── Build messages array (conversation threading) ──
    const messages: Array<{ role: string; content: string }> = [];
    if (conversation_history?.length) {
      for (const msg of conversation_history) {
        // Skip the initial greeting from the director
        if (msg.role === "director" && messages.length === 0 && !msg.placements && !msg.manifest) continue;
        messages.push({
          role: msg.role === "director" ? "assistant" : "user",
          content: msg.content,
        });
      }
    }
    messages.push({ role: "user", content: prompt });

    // ── Call Anthropic API ──
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("[AI-CREATIVE-DIRECTOR] API error:", errText);
      return new Response(
        JSON.stringify({ error: "AI request failed", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.content?.[0]?.text || "";

    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[AI-CREATIVE-DIRECTOR] Failed to parse JSON:", content);
      return new Response(
        JSON.stringify({ error: "Invalid AI response", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Process response based on mode ──
    if (useManifest) {
      const aiClips = parsed.clips;
      if (!Array.isArray(aiClips) || aiClips.length === 0) {
        // Fallback: if AI returned legacy placements format, still handle it
        if (parsed.placements && Array.isArray(parsed.placements)) {
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ error: "No clips in AI response", fallback: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const manifest = wrapInManifest(aiClips, {
        projectId: project_id || "",
        stylePreset,
        songDuration,
        parentManifestId: current_manifest?.metadata?.id,
      });

      const creativeNote = parsed.creative_note || "AI-generated edit";
      const legacyPlacements = manifestClipsToLegacyPlacements(aiClips, bpm);

      // ── DB persistence ──
      if (project_id) {
        try {
          const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );
          const userId = extractUserId(authHeader);

          // Un-flag previous current manifests, then insert new one
          await supabaseAdmin
            .from("edit_manifests")
            .update({ is_current: false })
            .eq("project_id", project_id);

          await supabaseAdmin.from("edit_manifests").insert({
            project_id,
            user_id: userId,
            style_label: manifest.metadata.style_label,
            manifest,
            parent_id: current_manifest?.metadata?.id || null,
            is_current: true,
          });

          // Upsert director chat
          const updatedMessages = [
            ...(conversation_history || []),
            { role: "user", content: user_message || "" },
            { role: "director", content: creativeNote },
          ];
          await supabaseAdmin.from("director_chats").upsert(
            {
              project_id,
              user_id: userId,
              messages: updatedMessages,
            },
            { onConflict: "project_id" }
          );
        } catch (dbErr) {
          // Don't fail the response on DB errors — log and continue
          console.error("[AI-CREATIVE-DIRECTOR] DB persistence error:", dbErr);
        }
      }

      return new Response(
        JSON.stringify({
          manifest,
          creative_note: creativeNote,
          placements: legacyPlacements,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Legacy placements mode (backward compat) ──
    if (!parsed.placements || !Array.isArray(parsed.placements)) {
      return new Response(
        JSON.stringify({ error: "No placements in AI response", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[AI-CREATIVE-DIRECTOR] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err), fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
