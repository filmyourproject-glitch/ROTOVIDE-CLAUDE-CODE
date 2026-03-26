import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sourceAssetId, clips, projectId, userId } = await req.json();

    if (!sourceAssetId || !clips?.length || !projectId || !userId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const muxTokenId = Deno.env.get("MUX_TOKEN_ID")!;
    const muxTokenSecret = Deno.env.get("MUX_TOKEN_SECRET")!;
    const auth = btoa(`${muxTokenId}:${muxTokenSecret}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const results = [];

    for (const clip of clips) {
      // Create a Mux clip asset from the source
      const muxRes = await fetch("https://api.mux.com/video/v1/assets", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: [{
            url: `mux://assets/${sourceAssetId}`,
            start_time: clip.startTime,
            end_time: clip.endTime,
          }],
          playback_policy: ["public"],
          normalize_audio: true,
        }),
      });

      if (!muxRes.ok) {
        const err = await muxRes.text();
        console.error(`Mux clip creation failed: ${err}`);
        continue;
      }

      const { data: asset } = await muxRes.json();

      // Save clip to project_clips table
      await supabase.from("project_clips").insert({
        project_id: projectId,
        user_id: userId,
        clip_index: clip.index ?? results.length,
        start_time: clip.startTime,
        end_time: clip.endTime,
        score: clip.energy ?? 0,
        label: clip.label ?? null,
        status: "processing",
        mux_asset_id: asset.id,
        mux_playback_id: asset.playback_ids?.[0]?.id ?? null,
      });

      results.push({
        muxAssetId: asset.id,
        muxPlaybackId: asset.playback_ids?.[0]?.id,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.endTime - clip.startTime,
      });
    }

    return new Response(JSON.stringify({ clips: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
