import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { youtubeUrl, url, project_id, user_id, file_type } = await req.json();
    const videoUrl = youtubeUrl || url;

    // Validate URL format
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;
    if (!videoUrl || !ytRegex.test(videoUrl)) {
      return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!project_id || !user_id) {
      return new Response(JSON.stringify({ error: "Missing project_id or user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const railwayUrl = Deno.env.get("RAILWAY_RENDER_URL");
    const renderSecret = Deno.env.get("RENDER_SECRET");

    if (!railwayUrl || !renderSecret) {
      const videoIdMatch = videoUrl.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
      const videoId = videoIdMatch?.[1];
      return new Response(JSON.stringify({
        success: false,
        videoId,
        message: "YouTube download service not configured. Please upload your video file directly.",
        thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a media_files record upfront so the frontend has an ID to poll
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const videoIdMatch = videoUrl.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
    const videoId = videoIdMatch?.[1] || "unknown";

    const { data: mediaFile, error: insertErr } = await supabase
      .from("media_files")
      .insert({
        project_id,
        user_id,
        file_name: `youtube-${videoId}.mp4`,
        file_type: file_type || "performance_clip",
        status: "processing",
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Failed to create media_files record:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to create media record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget: start Railway download but don't await completion
    const fetchPromise = fetch(`${railwayUrl}/download-youtube`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Render-Secret": renderSecret,
      },
      body: JSON.stringify({
        url: videoUrl,
        project_id,
        user_id,
        file_type: file_type || "performance_clip",
        media_file_id: mediaFile.id,
      }),
    });

    // Don't await — return immediately
    EdgeRuntime.waitUntil(fetchPromise.catch(err =>
      console.error("Background download error:", err)
    ));

    // Return success immediately so frontend can start polling
    return new Response(JSON.stringify({
      success: true,
      media_file_id: mediaFile.id,
      mux_asset_id: null,
      mux_playback_id: null,
    }), {
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
