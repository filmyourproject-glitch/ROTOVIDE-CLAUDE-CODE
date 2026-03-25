import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Gemini config ──────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const FILE_API_UPLOAD = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const FILE_API_GET = "https://generativelanguage.googleapis.com/v1beta/files";

const SCENE_ANALYSIS_PROMPT = `Analyze this music video clip and return a structured JSON description of every distinct scene or shot change.

For each scene, identify:
- timestamp: when this scene starts (seconds from beginning of the clip)
- duration: how long this scene lasts (seconds)
- description: one sentence describing what is happening visually
- faces: array of people visible, each with "description" (who they appear to be), "clothing" (what they are wearing in detail — colors, brands, accessories), "expression" (facial expression and energy)
- location: where this scene takes place (e.g., "studio", "parking garage", "rooftop", "car interior", "street")
- action: what the main subject is doing (e.g., "rapping to camera", "walking", "dancing", "sitting", "gesturing")
- mood: the visual mood (e.g., "aggressive", "relaxed", "hype", "melancholy", "confident", "dark", "celebratory")
- energy: 0.0 to 1.0 scale of visual energy and movement intensity
- camera: camera angle and movement (e.g., "close-up, static", "wide shot, dolly", "medium shot, handheld", "low angle, tracking")

Also provide a "visual_summary" field: a 2-3 sentence overall description of the clip's visual content, setting, and aesthetic. Mention the most distinctive visual elements (clothing, locations, lighting).

Return ONLY valid JSON with this exact structure:
{
  "visual_summary": "Overall clip description...",
  "scenes": [
    {
      "timestamp": 0.0,
      "duration": 3.5,
      "description": "...",
      "faces": [{"description": "...", "clothing": "...", "expression": "..."}],
      "location": "...",
      "action": "...",
      "mood": "...",
      "energy": 0.8,
      "camera": "..."
    }
  ]
}`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractUserId(authHeader: string): string | null {
  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

/** Upload video bytes to Google File API, returns fileUri once ACTIVE */
async function uploadToGoogleFileAPI(
  videoBytes: ArrayBuffer,
  apiKey: string,
  displayName: string,
  signal: AbortSignal
): Promise<string> {
  // Step 1: Start resumable upload
  const startRes = await fetch(`${FILE_API_UPLOAD}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Type": "video/mp4",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { displayName },
    }),
    signal,
  });

  if (!startRes.ok) {
    const errText = await startRes.text().catch(() => "");
    throw new Error(`File API start failed (${startRes.status}): ${errText}`);
  }

  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("No upload URL returned from File API");
  }

  // Step 2: Upload the video bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": "video/mp4",
    },
    body: videoBytes,
    signal,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`File API upload failed (${uploadRes.status}): ${errText}`);
  }

  const fileInfo = await uploadRes.json();
  const fileName = fileInfo.file?.name;
  if (!fileName) {
    throw new Error("No file name returned from upload");
  }

  // Step 3: Poll until file state is ACTIVE (usually 5-15s for short clips)
  const maxPolls = 30;
  const pollInterval = 2000; // 2s
  for (let i = 0; i < maxPolls; i++) {
    const statusRes = await fetch(`${FILE_API_GET}/${fileName}?key=${apiKey}`, {
      signal,
    });
    if (!statusRes.ok) {
      throw new Error(`File API status check failed: ${statusRes.status}`);
    }
    const status = await statusRes.json();

    if (status.state === "ACTIVE") {
      return status.uri;
    }
    if (status.state === "FAILED") {
      throw new Error(`File API processing failed: ${JSON.stringify(status.error)}`);
    }

    // Still PROCESSING — wait and retry
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error("File API polling timed out — file never became ACTIVE");
}

/** Call Gemini generateContent with a file URI */
async function analyzeVideoWithGemini(
  fileUri: string,
  apiKey: string,
  signal: AbortSignal
): Promise<{ visual_summary: string; scenes: unknown[]; tokenCount: number }> {
  const body = {
    contents: [
      {
        parts: [
          {
            fileData: {
              mimeType: "video/mp4",
              fileUri,
            },
          },
          {
            text: SCENE_ANALYSIS_PROMPT,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();

  // Extract token counts
  const usage = data.usageMetadata;
  const tokenCount =
    (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

  // Extract the JSON text content
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error("No text content in Gemini response");
  }

  // Parse — Gemini with responseMimeType=json should return clean JSON
  let parsed;
  try {
    parsed = JSON.parse(textContent);
  } catch {
    // Try stripping markdown fences
    const cleaned = textContent
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    parsed = JSON.parse(cleaned);
  }

  return {
    visual_summary: parsed.visual_summary || "",
    scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
    tokenCount,
  };
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Accept both single media_file_id and array
    const { media_file_id, media_file_ids } = await req.json();
    const ids: string[] = media_file_ids || (media_file_id ? [media_file_id] : []);

    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "No media_file_ids provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine user_id — from JWT (frontend) or service role (webhook)
    const authHeader = req.headers.get("Authorization") || "";
    const userId = extractUserId(authHeader);

    const results: { indexed: string[]; skipped: string[]; failed: string[] } = {
      indexed: [],
      skipped: [],
      failed: [],
    };

    // Process clips sequentially to stay within memory limits
    for (const fileId of ids) {
      try {
        // 1. Check existing index — skip if already ready
        const { data: existing } = await supabase
          .from("video_indexes")
          .select("status")
          .eq("media_file_id", fileId)
          .maybeSingle();

        if (existing?.status === "ready") {
          results.skipped.push(fileId);
          continue;
        }

        // 2. Look up media_file for Mux playback ID
        const { data: mediaFile, error: mfErr } = await supabase
          .from("media_files")
          .select("id, project_id, user_id, mux_playback_id, file_name, duration_seconds, file_type")
          .eq("id", fileId)
          .maybeSingle();

        if (mfErr || !mediaFile) {
          console.error(`[INDEX-VIDEO] Media file not found: ${fileId}`, mfErr);
          results.failed.push(fileId);
          continue;
        }

        if (!mediaFile.mux_playback_id) {
          console.warn(`[INDEX-VIDEO] No Mux playback ID for ${fileId} — skipping`);
          results.failed.push(fileId);
          continue;
        }

        // Skip songs — only index video clips
        if (mediaFile.file_type === "song") {
          results.skipped.push(fileId);
          continue;
        }

        const effectiveUserId = userId || mediaFile.user_id;

        // 3. Upsert video_indexes row → status "processing"
        await supabase.from("video_indexes").upsert(
          {
            media_file_id: fileId,
            project_id: mediaFile.project_id,
            user_id: effectiveUserId,
            status: "processing",
            error_message: null,
            gemini_model: GEMINI_MODEL,
          },
          { onConflict: "media_file_id" }
        );

        const startTime = Date.now();

        // 4. Download the low.mp4 from Mux (480p, ~10-30MB)
        const muxUrl = `https://stream.mux.com/${mediaFile.mux_playback_id}/low.mp4`;
        console.log(`[INDEX-VIDEO] Downloading ${muxUrl} for ${mediaFile.file_name}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55000); // 55s total budget

        let videoBytes: ArrayBuffer;
        try {
          const videoRes = await fetch(muxUrl, { signal: controller.signal });
          if (!videoRes.ok) {
            throw new Error(`Mux download failed: ${videoRes.status}`);
          }
          videoBytes = await videoRes.arrayBuffer();
          console.log(`[INDEX-VIDEO] Downloaded ${(videoBytes.byteLength / 1024 / 1024).toFixed(1)}MB`);
        } catch (dlErr) {
          clearTimeout(timeout);
          throw new Error(`Video download failed: ${dlErr}`);
        }

        // 5. Upload to Google File API
        console.log(`[INDEX-VIDEO] Uploading to Google File API...`);
        const displayName = `rotovide-${fileId}`;
        const fileUri = await uploadToGoogleFileAPI(
          videoBytes,
          geminiKey,
          displayName,
          controller.signal
        );
        console.log(`[INDEX-VIDEO] File API URI: ${fileUri}`);

        // Free the video bytes from memory
        videoBytes = null!;

        // 6. Call Gemini for scene analysis
        console.log(`[INDEX-VIDEO] Calling Gemini 2.5 Flash...`);
        const analysis = await analyzeVideoWithGemini(
          fileUri,
          geminiKey,
          controller.signal
        );
        clearTimeout(timeout);

        const processingTimeMs = Date.now() - startTime;
        console.log(
          `[INDEX-VIDEO] Gemini analysis complete: ${analysis.scenes.length} scenes, ` +
          `${analysis.tokenCount} tokens, ${processingTimeMs}ms`
        );

        // 7. Update video_indexes with results
        await supabase
          .from("video_indexes")
          .update({
            scene_descriptions: analysis.scenes,
            visual_summary: analysis.visual_summary,
            status: "ready",
            token_count: analysis.tokenCount,
            processing_time_ms: processingTimeMs,
            indexed_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            error_message: null,
          })
          .eq("media_file_id", fileId);

        results.indexed.push(fileId);

        // 8. Clean up: delete the file from Google File API (best effort)
        try {
          const fileName = fileUri.split("/").pop();
          if (fileName) {
            await fetch(
              `${FILE_API_GET}/${fileName}?key=${geminiKey}`,
              { method: "DELETE" }
            );
          }
        } catch {
          // Non-critical — Google will auto-expire it
        }
      } catch (err) {
        console.error(`[INDEX-VIDEO] Failed to index ${fileId}:`, err);

        // Mark as failed in DB
        await supabase
          .from("video_indexes")
          .upsert(
            {
              media_file_id: fileId,
              project_id: "", // Will be ignored on conflict
              user_id: userId || "",
              status: "failed",
              error_message: String(err).slice(0, 500),
              gemini_model: GEMINI_MODEL,
            },
            { onConflict: "media_file_id" }
          )
          .then(() => {});

        // Also try a direct update (in case upsert fails due to missing project_id)
        await supabase
          .from("video_indexes")
          .update({
            status: "failed",
            error_message: String(err).slice(0, 500),
          })
          .eq("media_file_id", fileId)
          .then(() => {});

        results.failed.push(fileId);
      }
    }

    console.log("[INDEX-VIDEO] Results:", JSON.stringify(results));

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[INDEX-VIDEO] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
