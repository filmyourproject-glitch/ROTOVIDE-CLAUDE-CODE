// Redeployed March 19 2026 — refreshing Mux credentials
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

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
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    const { projectId, fileName, fileType, fileSize } = await req.json();
    if (!projectId || !fileName || !fileType) {
      return new Response(
        JSON.stringify({ error: "Missing projectId, fileName, or fileType" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify project belongs to user
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (projErr || !project) {
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Create Mux Direct Upload
    const MUX_TOKEN_ID = Deno.env.get("MUX_TOKEN_ID");
    const MUX_TOKEN_SECRET = Deno.env.get("MUX_TOKEN_SECRET");
    if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
      return new Response(
        JSON.stringify({ error: "Mux not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const muxRes = await fetch("https://api.mux.com/video/v1/uploads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " + btoa(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`),
      },
      body: JSON.stringify({
        new_asset_settings: {
          playback_policy: ["public"],
          normalize_audio: true,
          mp4_support: "standard",
        },
        cors_origin: "*",
      }),
    });

    if (!muxRes.ok) {
      const errText = await muxRes.text();
      console.error("Mux API error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to create Mux upload" }),
        { status: 502, headers: corsHeaders }
      );
    }

    const muxData = await muxRes.json();
    const upload = muxData.data;

    // Create media_files row immediately
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: mediaFile, error: insertErr } = await adminClient
      .from("media_files")
      .insert({
        user_id: userId,
        project_id: projectId,
        file_type: fileType,
        file_name: fileName,
        size_bytes: fileSize || 0,
        mux_upload_id: upload.id,
        status: "uploading",
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("Insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to create media file record" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Update storage_used_bytes
    await adminClient.rpc("update_storage_used", { p_user_id: userId });

    return new Response(
      JSON.stringify({
        uploadUrl: upload.url,
        uploadId: upload.id,
        mediaFileId: mediaFile.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
