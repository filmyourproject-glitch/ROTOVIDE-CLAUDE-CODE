import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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
    const { playbackId, maxRetries = 3 } = await req.json();

    if (!playbackId || typeof playbackId !== "string") {
      return new Response(
        JSON.stringify({ error: "playbackId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const renditions = ["low.mp4", "medium.mp4", "high.mp4"];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (const rendition of renditions) {
        try {
          const url = `https://stream.mux.com/${playbackId}/${rendition}`;
          console.log(`Trying ${url}`);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          const resp = await fetch(url, {
            signal: controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; ROTOVIDE/1.0)",
              "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8",
              "Referer": "https://rotovide.com/",
              "Range": "bytes=0-10485760",
            },
          });
          clearTimeout(timeout);
          console.log(`Trying ${url} — status: ${resp.status}`);

          if (resp.ok || resp.status === 206) {
            console.log(
              `Fetched ${rendition} (attempt ${attempt + 1}) for playback ${playbackId}`,
            );
            const buffer = await resp.arrayBuffer();
            console.log(`Downloaded ${buffer.byteLength} bytes from ${rendition}`);
            return new Response(buffer, {
              headers: {
                ...corsHeaders,
                "Content-Type": "audio/mp4",
              },
            });
          } else {
            console.log(`Failed: status=${resp.status}`);
            const errText = await resp.text().catch(() => "");
            console.log(`Error body: ${errText.slice(0, 200)}`);
          }
        } catch (err) {
          console.log(`Fetch error for ${rendition}: ${err.message}`);
        }
      }

      if (attempt < maxRetries - 1) {
        console.log(
          `Mux renditions not ready yet, waiting 10s (attempt ${attempt + 1}/${maxRetries})...`,
        );
        await new Promise((r) => setTimeout(r, 10000));
      }
    }

    return new Response(
      JSON.stringify({ error: "No rendition available after retries" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
