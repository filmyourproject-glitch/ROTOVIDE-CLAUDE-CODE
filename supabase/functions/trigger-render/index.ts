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

    // Await the fetch — Railway responds 202 immediately and renders in a background thread.
    // Do NOT use fire-and-forget: Deno Deploy kills unawaited promises when the Response is returned.
    const renderRes = await fetch(`${railwayUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Render-Secret": renderSecret,
      },
      body: JSON.stringify({ export_id, project_id }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!renderRes.ok) {
      const errText = await renderRes.text().catch(() => "");
      console.error(`Render service error ${renderRes.status}: ${errText}`);
      return new Response(JSON.stringify({ error: "Render service unavailable" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
