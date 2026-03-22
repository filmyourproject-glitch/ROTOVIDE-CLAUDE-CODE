const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { export_id, project_id } = await req.json();

    if (!export_id || !project_id) {
      return new Response(JSON.stringify({ error: "Missing export_id or project_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const railwayUrl = Deno.env.get("RAILWAY_RENDER_URL");
    const renderSecret = Deno.env.get("RENDER_SECRET");

    if (!railwayUrl || !renderSecret) {
      return new Response(JSON.stringify({ error: "Render service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire and forget — don't await the full render
    fetch(`${railwayUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Render-Secret": renderSecret,
      },
      body: JSON.stringify({ export_id, project_id }),
    }).catch((err) => console.error("Render trigger failed:", err));

    return new Response(JSON.stringify({ success: true, message: "Render started" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("trigger-render error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
