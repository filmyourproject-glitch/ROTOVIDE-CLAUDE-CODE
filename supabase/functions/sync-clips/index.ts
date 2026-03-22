import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { project_id, song_storage_path, clips } = await req.json();

    if (!project_id || !song_storage_path || !clips?.length) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const railwayUrl = Deno.env.get("RAILWAY_RENDER_URL");
    const renderSecret = Deno.env.get("RENDER_SECRET");

    if (!railwayUrl || !renderSecret) {
      return new Response(
        JSON.stringify({ error: "Railway not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Railway sync-clips endpoint
    const res = await fetch(`${railwayUrl}/sync-clips`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Render-Secret": renderSecret,
      },
      body: JSON.stringify({ project_id, song_storage_path, clips }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("sync-clips error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
