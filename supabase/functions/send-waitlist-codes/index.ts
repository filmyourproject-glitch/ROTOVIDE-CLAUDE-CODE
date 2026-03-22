import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json();

    if (body.send_all) {
      // TODO: Wire Resend email sending here at launch
      // For now, just mark code_sent = true for all pending rows
      await supabase
        .from("waitlist")
        .update({ code_sent: true, code_sent_at: new Date().toISOString() })
        .eq("code_sent", false);
    } else if (body.waitlist_id) {
      await supabase
        .from("waitlist")
        .update({ code_sent: true, code_sent_at: new Date().toISOString() })
        .eq("id", body.waitlist_id);
    }

    return new Response(JSON.stringify({ success: true }), {
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
