import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAILS: Record<string, (data: Record<string, unknown>) => { subject: string; html: string }> = {
  trial_expiring: () => ({
    subject: "Your ROTOVIDE trial ends tomorrow",
    html: `
      <div style="font-family: sans-serif; background: #080808; color: #fff; padding: 40px;">
        <h1 style="font-family: 'Bebas Neue', sans-serif; color: #E8FF47; font-size: 28px;">Your Trial Ends Tomorrow</h1>
        <p style="color: #ccc; line-height: 1.6;">Your free trial expires in less than 24 hours. Upgrade to Pro to keep your videos and continue creating. Less than one beat lease per month.</p>
        <a href="https://rotovide.com/pricing" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #E8FF47; color: #080808; text-decoration: none; font-weight: bold; border-radius: 8px;">Upgrade to Pro</a>
      </div>
    `,
  }),
  credits_low: (data) => ({
    subject: "You're running low on ROTOVIDE credits",
    html: `
      <div style="font-family: sans-serif; background: #080808; color: #fff; padding: 40px;">
        <h1 style="font-family: 'Bebas Neue', sans-serif; color: #E8FF47; font-size: 28px;">Credits Running Low</h1>
        <p style="color: #ccc; line-height: 1.6;">You have ${data.credits_remaining ?? 0} credits left. Top up to keep exporting your music videos.</p>
        <a href="https://rotovide.com/app/billing" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #E8FF47; color: #080808; text-decoration: none; font-weight: bold; border-radius: 8px;">Get More Credits</a>
      </div>
    `,
  }),
  export_ready: (data) => ({
    subject: "Your music video is ready 🎬",
    html: `
      <div style="font-family: sans-serif; background: #080808; color: #fff; padding: 40px;">
        <h1 style="font-family: 'Bebas Neue', sans-serif; color: #E8FF47; font-size: 28px;">Your Video Is Ready</h1>
        <p style="color: #ccc; line-height: 1.6;">Your video '${data.song_title ?? "Untitled"}' by ${data.artist_name ?? "Unknown Artist"} has finished rendering and is ready to download.</p>
        <a href="https://rotovide.com/app/projects/${data.project_id ?? ""}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #E8FF47; color: #080808; text-decoration: none; font-weight: bold; border-radius: 8px;">Download Your Video</a>
      </div>
    `,
  }),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, user_id, data } = await req.json();

    if (!type || !user_id) {
      return new Response(JSON.stringify({ error: "Missing type or user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailBuilder = EMAILS[type];
    if (!emailBuilder) {
      return new Response(JSON.stringify({ error: `Unknown notification type: ${type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up user email
    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(user_id);
    if (userErr || !user?.email) {
      console.error("Could not find user email:", userErr);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user notification preferences
    const { data: credits } = await supabase
      .from("user_credits")
      .select("email_trial_expiry, email_low_credits, email_export_ready")
      .eq("user_id", user_id)
      .single();

    if (credits) {
      if (type === "trial_expiring" && !credits.email_trial_expiry) {
        return new Response(JSON.stringify({ skipped: true, reason: "User opted out" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (type === "credits_low" && !credits.email_low_credits) {
        return new Response(JSON.stringify({ skipped: true, reason: "User opted out" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (type === "export_ready" && !credits.email_export_ready) {
        return new Response(JSON.stringify({ skipped: true, reason: "User opted out" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { subject, html } = emailBuilder(data || {});

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ROTOVIDE <info@info.rotovide.com>",
        to: [user.email],
        subject,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Sent ${type} notification to ${user.email}`);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-notification error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
