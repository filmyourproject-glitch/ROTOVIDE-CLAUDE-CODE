const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const { songTitle, artistName, sections, bpm } = await req.json();
    const sectionTypes = [...new Set((sections || []).map((s: any) => s.type))].join(", ");

    const userPrompt = `Generate social media post copy for this music video:
- Song: "${songTitle || "Untitled"}" by ${artistName || "Unknown Artist"}
- BPM: ${bpm || "unknown"}
- Song sections detected: ${sectionTypes || "none"}

Create copy for TikTok (under 150 chars caption, 5 hashtags), YouTube (title + 2-3 sentence description), and Instagram (caption + 5 hashtags).

Be concise, trendy, and use music industry language. Sound like a real person, not a marketing bot.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        tools: [
          {
            name: "generate_social_copy",
            description: "Return social media copy for TikTok, YouTube, and Instagram.",
            input_schema: {
              type: "object",
              properties: {
                tiktok: {
                  type: "object",
                  properties: {
                    caption: { type: "string", description: "Under 150 characters" },
                    hashtags: { type: "array", items: { type: "string" }, description: "5 hashtags without the # symbol" },
                  },
                  required: ["caption", "hashtags"],
                },
                youtube: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string", description: "2-3 sentences" },
                  },
                  required: ["title", "description"],
                },
                instagram: {
                  type: "object",
                  properties: {
                    caption: { type: "string" },
                    hashtags: { type: "array", items: { type: "string" }, description: "5 hashtags without the # symbol" },
                  },
                  required: ["caption", "hashtags"],
                },
              },
              required: ["tiktok", "youtube", "instagram"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "generate_social_copy" },
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("[GENERATE-SOCIAL-COPY] API error:", response.status, errText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Claude tool_use response format
    const toolUseBlock = data.content?.find((block: any) => block.type === "tool_use");
    if (!toolUseBlock?.input) {
      throw new Error("No tool_use block in response");
    }

    const socialCopy = toolUseBlock.input;

    return new Response(JSON.stringify(socialCopy), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[GENERATE-SOCIAL-COPY] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
