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
    const body = await req.json();
    const eventType = body.type;
    const eventData = body.data;

    console.log("Mux webhook event:", eventType);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (eventType === "video.asset.ready") {
      const assetId = eventData.id;
      const playbackId = eventData.playback_ids?.[0]?.id;
      const uploadId = eventData.upload_id;
      const duration = eventData.duration;

      if (!uploadId) {
        console.warn("No upload_id in asset.ready event");
        return new Response(JSON.stringify({ ok: true }), {
          headers: corsHeaders,
        });
      }

      // Find the media_files row by mux_upload_id
      const { data: mediaFile, error: findErr } = await supabase
        .from("media_files")
        .select("id, user_id")
        .eq("mux_upload_id", uploadId)
        .maybeSingle();

      if (findErr || !mediaFile) {
        console.error("Could not find media_file for upload:", uploadId, findErr);
      } else {
        // Update with Mux asset details
        const { error: updateErr } = await supabase
          .from("media_files")
          .update({
            mux_asset_id: assetId,
            mux_playback_id: playbackId,
            status: "ready",
            duration_seconds: duration || null,
          })
          .eq("id", mediaFile.id);

        if (updateErr) {
          console.error("Failed to update media_file:", updateErr);
        } else {
          console.log(`Updated media_file ${mediaFile.id} with Mux asset ${assetId}`);
        }

        // Update storage used
        await supabase.rpc("update_storage_used", {
          p_user_id: mediaFile.user_id,
        });
      }

      // ── Check if this upload belongs to an export (render pipeline) ──
      // The render service stores mux_upload_id in the export settings
      const { data: exportRecord } = await supabase
        .from("exports")
        .select("id, project_id, user_id")
        .eq("status", "processing")
        .filter("settings->>mux_upload_id", "eq", uploadId)
        .maybeSingle();

      if (exportRecord) {
        console.log(`Export ${exportRecord.id} asset ready — updating to 'completed'`);

        await supabase.from("exports").update({
          status: "completed",
          mux_asset_id: assetId,
          mux_playback_id: playbackId,
          download_url: `https://stream.mux.com/${playbackId}/high.mp4`,
        }).eq("id", exportRecord.id);

        // Send export_ready notification
        try {
          const { data: project } = await supabase
            .from("projects")
            .select("song_title, artist_name")
            .eq("id", exportRecord.project_id)
            .single();

          await supabase.functions.invoke("send-notification", {
            body: {
              type: "export_ready",
              user_id: exportRecord.user_id,
              data: {
                song_title: project?.song_title || "Untitled",
                artist_name: project?.artist_name || "Unknown Artist",
                project_id: exportRecord.project_id,
              },
            },
          });
        } catch (notifErr) {
          console.error("Failed to send export notification:", notifErr);
        }
      }
    }

    // ── Handle static renditions becoming available ──
    if (eventType === "video.asset.static_renditions.ready") {
      const assetId = eventData.id;
      console.log("Static renditions ready for asset:", assetId);

      const { data: mediaFile } = await supabase
        .from("media_files")
        .select("id")
        .eq("mux_asset_id", assetId)
        .maybeSingle();

      if (mediaFile) {
        await supabase
          .from("media_files")
          .update({ static_renditions_ready: true })
          .eq("id", mediaFile.id);
        console.log(`Marked static_renditions_ready for media_file ${mediaFile.id}`);
      } else {
        console.warn("No media_file found for asset:", assetId);
      }
    }

    if (eventType === "video.asset.errored") {
      const uploadId = eventData.upload_id;
      if (uploadId) {
        await supabase
          .from("media_files")
          .update({ status: "error" })
          .eq("mux_upload_id", uploadId);
        console.error("Mux asset error for upload:", uploadId, eventData.errors);
      }
    }

    if (eventType === "video.upload.errored") {
      const uploadId = eventData.id;
      if (uploadId) {
        await supabase
          .from("media_files")
          .update({ status: "error" })
          .eq("mux_upload_id", uploadId);
        console.error("Mux upload error:", uploadId);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
