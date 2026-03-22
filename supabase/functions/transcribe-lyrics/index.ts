import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ success: false, error: "API key not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { projectId, audioUrl } = await req.json();
    if (!projectId || !audioUrl) {
      console.error("Missing params — projectId:", projectId, "audioUrl:", audioUrl);
      return new Response(
        JSON.stringify({ success: false, error: "projectId and audioUrl are required" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch audio file
    console.log("Fetching audio from:", audioUrl);
    const audioResp = await fetch(audioUrl);
    if (!audioResp.ok) throw new Error(`Failed to fetch audio: ${audioResp.status}`);
    const audioBlob = await audioResp.blob();

    // Send to Whisper API
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");

    console.log("Sending to Whisper API...");
    const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!whisperResp.ok) {
      const errText = await whisperResp.text();
      console.error("Whisper API error:", whisperResp.status, errText);
      throw new Error(`Whisper API error: ${whisperResp.status}`);
    }

    const whisperData = await whisperResp.json();
    console.log("Whisper response received, words:", whisperData.words?.length);

    // Extract word-level timestamps
    const words = (whisperData.words || []).map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    const lyricsData = {
      words,
      generated_at: new Date().toISOString(),
    };

    // Store in projects.lyrics_data
    const { error: updateError } = await supabase
      .from("projects")
      .update({ lyrics_data: lyricsData })
      .eq("id", projectId);

    if (updateError) {
      console.error("Failed to store lyrics_data:", updateError);
      throw new Error(`Failed to store lyrics: ${updateError.message}`);
    }

    console.log("Lyrics stored successfully for project:", projectId);

    return new Response(JSON.stringify({ success: true, wordCount: words.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-lyrics error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
