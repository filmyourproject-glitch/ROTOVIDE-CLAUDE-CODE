import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Style configurations ────────────────────────────────────────────────────

interface StyleConfig {
  label: string;
  cutBeats: string;
  effects: string;
  transitions: string;
  description: string;
}

const STYLE_CONFIGS: Record<string, StyleConfig> = {
  high_energy: {
    label: "high_energy",
    cutBeats: "1-2",
    effects: "flash_cut, shake, speed, zoom",
    transitions: "cut, flash",
    description:
      "Maximum energy. Hard cuts every 1-2 beats. Flash effects, high contrast, aggressive camera shake. B-roll bursts of 1-2 beats max.",
  },
  cinematic: {
    label: "cinematic",
    cutBeats: "8-16",
    effects: "letterbox, vignette, color_grade, zoom",
    transitions: "dissolve, fade",
    description:
      "Slow, intentional cuts every 8-16 beats. Dissolves between clips, letterboxing, warm cinematic color grade. B-roll holds 6-8 beats.",
  },
  slow_mood: {
    label: "slow_mood",
    cutBeats: "16+",
    effects: "vignette, grain, color_grade",
    transitions: "fade, dissolve",
    description:
      "Minimalist. Cuts every 16+ beats. Desaturated look, heavy vignette, moody film grain. B-roll holds 8-12 beats. Atmospheric and brooding.",
  },
};

// ── Shared rules ────────────────────────────────────────────────────────────

const DIRECTOR_RULES = (songDuration: number) => `Director rules:
1. B-roll NEVER plays during chorus sections — performance only on the hook
2. ALL cuts must land on a beat timestamp
3. Never place two B-roll clips back to back — always alternate
4. The outro must end on a performance clip
5. The intro can use B-roll to establish mood
6. Cover the ENTIRE song from 0 to ${songDuration} seconds`;

const EFFECT_GUIDE = `Effect types available (use these in clip effects):
- flash_cut: kick/808 hits, high energy
- whip_transition: snare hits, quick camera movement
- zoom: building tension or drop emphasis
- shake: hype moments, aggressive 808 bass
- speed: right before a drop
- grain: atmospheric texture
- vignette: cinematic mood
- letterbox: widescreen feel
- color_grade: overall mood coloring`;

// ── Prompt builder ──────────────────────────────────────────────────────────

function buildStylePrompt(
  style: StyleConfig,
  params: {
    bpm: number;
    songDuration: number;
    sections: unknown[];
    performanceClipCount: number;
    brollClipCount: number;
    beatTimestamps: number[];
    mediaResources?: { id: string; type: string; duration: number }[];
  }
) {
  const mediaList = params.mediaResources?.length
    ? `\nAvailable media (use these exact IDs as media_ref):\n${params.mediaResources.map((m) => `- "${m.id}" (${m.type}, ${m.duration.toFixed(1)}s)`).join("\n")}`
    : `\nUse "perf_0", "perf_1", ... for performance clips and "broll_0", "broll_1", ... for B-roll clips.`;

  return `You are a professional music video director. Generate a ${style.label} edit for this rap/hip-hop track.

STYLE: ${style.description}
- Cut frequency: every ${style.cutBeats} beats
- Primary effects: ${style.effects}
- Transition style: ${style.transitions}

Song data:
- BPM: ${params.bpm}
- Duration: ${params.songDuration} seconds
- Sections: ${JSON.stringify(params.sections)}
- Performance clips: ${params.performanceClipCount}
- B-roll clips: ${params.brollClipCount}
- First 20 beats: ${JSON.stringify(params.beatTimestamps.slice(0, 20))}
${mediaList}

${DIRECTOR_RULES(params.songDuration)}

${EFFECT_GUIDE}

Return ONLY valid JSON, no markdown, no explanation:
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
      "ai_rationale": "Reason for this clip"
    }
  ],
  "creative_note": "One sentence describing this ${style.label} approach",
  "confidence": 0.85
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

function wrapInManifest(
  clips: unknown[],
  params: {
    projectId: string;
    styleLabel: string;
    songDuration: number;
    confidence: number;
  }
) {
  return {
    manifest_version: "1.0",
    metadata: {
      id: crypto.randomUUID(),
      project_id: params.projectId,
      style_label: params.styleLabel,
      ai_model: "claude-haiku-4-5-20251001",
      parent_version: null,
      confidence: params.confidence,
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
      tracks: [{ id: "v1", kind: "video", clips }],
    },
    edit_decisions: [],
  };
}

async function generateManifestForStyle(
  style: string,
  config: StyleConfig,
  params: {
    bpm: number;
    songDuration: number;
    sections: unknown[];
    performanceClipCount: number;
    brollClipCount: number;
    beatTimestamps: number[];
    mediaResources?: { id: string; type: string; duration: number }[];
  },
  anthropicKey: string,
  projectId: string
) {
  const prompt = buildStylePrompt(config, params);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
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
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`API error (${aiResponse.status}): ${errText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.content?.[0]?.text || "";
    const jsonStr = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.clips) || parsed.clips.length === 0) {
      throw new Error("No clips in AI response");
    }

    const manifest = wrapInManifest(parsed.clips, {
      projectId,
      styleLabel: style,
      songDuration: params.songDuration,
      confidence: parsed.confidence ?? 0.85,
    });

    return { style, manifest, creative_note: parsed.creative_note || "" };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
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
      project_id,
      bpm,
      songDuration,
      sections,
      performanceClipCount,
      brollClipCount,
      beatTimestamps,
      media_resources,
    } = await req.json();

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const params = {
      bpm,
      songDuration,
      sections,
      performanceClipCount,
      brollClipCount,
      beatTimestamps: beatTimestamps || [],
      mediaResources: media_resources,
    };

    // Fire all 3 style generations in parallel
    const styles = ["high_energy", "cinematic", "slow_mood"] as const;
    const settled = await Promise.allSettled(
      styles.map((style) =>
        generateManifestForStyle(
          style,
          STYLE_CONFIGS[style],
          params,
          anthropicKey,
          project_id || ""
        )
      )
    );

    const manifests: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const style = styles[i];
      if (result.status === "fulfilled") {
        manifests[style] = result.value.manifest;
      } else {
        console.error(`[PARALLEL-EDIT-GEN] ${style} failed:`, result.reason);
        errors[style] = result.reason?.message || "Unknown error";
      }
    }

    // Store manifests in DB
    if (project_id && Object.keys(manifests).length > 0) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const userId = extractUserId(authHeader);

        // Un-flag existing current manifests for this project
        await supabaseAdmin
          .from("edit_manifests")
          .update({ is_current: false })
          .eq("project_id", project_id);

        // Insert all successful manifests (cinematic is default current)
        for (const [style, manifest] of Object.entries(manifests)) {
          const m = manifest as { metadata: { id: string; style_label: string } };
          await supabaseAdmin.from("edit_manifests").insert({
            project_id,
            user_id: userId,
            style_label: m.metadata.style_label,
            manifest,
            parent_id: null,
            is_current: style === "cinematic",
          });
        }
      } catch (dbErr) {
        console.error("[PARALLEL-EDIT-GEN] DB persistence error:", dbErr);
      }
    }

    return new Response(
      JSON.stringify({
        manifests,
        ...(Object.keys(errors).length > 0 ? { errors } : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[PARALLEL-EDIT-GEN] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
