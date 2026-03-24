import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    } = await req.json();

    const directorInstruction = user_message
      ? `\nThe artist has given you a specific direction: "${user_message}"\nApply this direction when generating the placements below. Honor the artist's intent above default style rules.\n`
      : "";

    const prompt = `You are a professional music video director specializing in rap and hip-hop videos.
${directorInstruction}

Here is the song data:
- BPM: ${bpm}
- Duration: ${songDuration} seconds
- Edit style: ${stylePreset}
- Sections: ${JSON.stringify(sections)}
- Performance clips available: ${performanceClipCount}
- B-roll clips available: ${brollClipCount}
- First 20 beat timestamps: ${JSON.stringify(beatTimestamps.slice(0, 20))}

Style guide for this project:
- raw_cut: hard cut every 2 beats, B-roll max 2 beats, aggressive and energetic
- cinematic: cut every 4 beats, B-roll holds 6-8 beats, slow and intentional
- hype: cut every beat, B-roll bursts 1-2 beats max, maximum chaos and energy
- vibe: cut every 8 beats, B-roll holds 8-12 beats, moody and atmospheric

Director rules you must follow:
1. B-roll NEVER plays during chorus sections — performance only on the hook
2. ALL cuts must land on a beat timestamp from the list above
3. Never place two B-roll clips back to back — always alternate
4. The outro must end on a performance clip
5. The intro can use B-roll to establish mood before the first verse
6. Generate placements covering the ENTIRE song duration from 0 to ${songDuration} seconds

Additionally, for each placement, recommend the best cinematic effect from this list:
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
- hard_cut: default when no effect needed

Return ONLY valid JSON with no other text, no markdown, no explanation:
{
  "placements": [
    { "beat_index": 4, "timestamp": 1.71, "type": "broll", "duration_beats": 4, "reason": "opening verse energy drop", "effect": "slow_zoom" },
    { "beat_index": 8, "timestamp": 3.43, "type": "performance", "duration_beats": 8, "reason": "building energy into first chorus", "effect": "flash_cut" }
  ],
  "creative_note": "One sentence describing the overall creative approach for this video"
}`;

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
        messages: [{ role: "user", content: prompt }],
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
