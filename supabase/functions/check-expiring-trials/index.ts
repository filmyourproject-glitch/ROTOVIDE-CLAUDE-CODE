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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find users whose trial expires within the next 24 hours
    const { data: expiringUsers, error } = await supabase
      .from("user_credits")
      .select("user_id")
      .eq("plan", "trial")
      .gt("trial_expires_at", now.toISOString())
      .lt("trial_expires_at", in24h.toISOString())
      .eq("email_trial_expiry", true);

    if (error) {
      console.error("Query error:", error);
      return new Response(JSON.stringify({ error: "Query failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    for (const user of expiringUsers || []) {
      try {
        await supabase.functions.invoke("send-notification", {
          body: { type: "trial_expiring", user_id: user.user_id, data: {} },
        });
        sent++;
      } catch (err) {
        console.error(`Failed to notify ${user.user_id}:`, err);
      }
    }

    console.log(`Checked expiring trials: ${expiringUsers?.length ?? 0} found, ${sent} notified`);

    return new Response(JSON.stringify({ checked: expiringUsers?.length ?? 0, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("check-expiring-trials error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
