import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { songTitle, artistName, sections, bpm } = await req.json();

    const sectionTypes = [...new Set((sections || []).map((s: any) => s.type))].join(", ");

    const systemPrompt = `You are a social media copywriter for music videos. Generate engaging post copy for a music video. Be concise, trendy, and use music industry language. Always respond using the provided tool.`;

    const userPrompt = `Generate social media post copy for this music video:
- Song: "${songTitle || "Untitled"}" by ${artistName || "Unknown Artist"}
- BPM: ${bpm || "unknown"}
- Song sections detected: ${sectionTypes || "none"}

Create copy for TikTok (under 150 chars, 5 hashtags), YouTube (title + 2-3 sentence description), and Instagram (caption + 5 hashtags).`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_social_copy",
              description: "Return social media copy for TikTok, YouTube, and Instagram.",
              parameters: {
                type: "object",
                properties: {
                  tiktok: {
                    type: "object",
                    properties: {
                      caption: { type: "string", description: "Under 150 characters" },
                      hashtags: { type: "array", items: { type: "string" }, description: "5 hashtags" },
                    },
                    required: ["caption", "hashtags"],
                    additionalProperties: false,
                  },
                  youtube: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string", description: "2-3 sentences" },
                    },
                    required: ["title", "description"],
                    additionalProperties: false,
                  },
                  instagram: {
                    type: "object",
                    properties: {
                      caption: { type: "string" },
                      hashtags: { type: "array", items: { type: "string" }, description: "5 hashtags" },
                    },
                    required: ["caption", "hashtags"],
                    additionalProperties: false,
                  },
                },
                required: ["tiktok", "youtube", "instagram"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_social_copy" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call in AI response");
    }

    const socialCopy = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(socialCopy), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-social-copy error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
