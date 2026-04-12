import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildLaunchEmail(name: string | null): { subject: string; html: string } {
  const greeting = name ? `Hey ${name},` : "Hey,";
  return {
    subject: "You're In! Welcome to ROTOVIDE",
    html: `
      <div style="font-family: sans-serif; background: #080808; color: #fff; padding: 40px; max-width: 480px; margin: 0 auto;">
        <h1 style="font-family: 'Bebas Neue', sans-serif; color: #E8FF47; font-size: 28px; margin: 0 0 16px 0;">
          You're Approved.
        </h1>
        <p style="color: #ccc; line-height: 1.6; margin: 0 0 24px 0;">
          ${greeting} your application to ROTOVIDE has been approved. You're one of the first Christian artists to get access.
        </p>
        <p style="color: #ccc; line-height: 1.6; margin: 0 0 24px 0;">
          We'll send you another email when the platform is live with your login link. Get your footage and songs ready — your first beat-synced music video is about to happen.
        </p>
        <div style="text-align: center; margin: 0 0 32px 0;">
          <a href="https://rotovide.com"
             style="display: inline-block; padding: 14px 28px; background: #E8FF47; color: #080808; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px;">
            Visit ROTOVIDE
          </a>
        </div>
        <p style="color: #666; font-size: 12px; line-height: 1.5; margin: 0;">
          You're receiving this because you applied to the ROTOVIDE waitlist. If this wasn't you, you can ignore this email.
        </p>
      </div>
    `,
  };
}

async function sendEmail(
  resendApiKey: string,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ROTOVIDE <info@info.rotovide.com>",
        to: [to],
        subject,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch approved users who haven't been sent a launch email
    const { data: rows, error } = await supabase
      .from("waitlist")
      .select("id, email, name")
      .eq("status", "approved")
      .is("invite_sent_at", null);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "No pending launch emails" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      const { subject, html } = buildLaunchEmail(row.name);
      const ok = await sendEmail(resendApiKey, row.email, subject, html);

      if (ok) {
        await supabase
          .from("waitlist")
          .update({ invite_sent_at: new Date().toISOString() })
          .eq("id", row.id);
        sent++;
      } else {
        failed++;
      }

      // Rate limit: 100ms between sends
      await new Promise((r) => setTimeout(r, 100));
    }

    return new Response(
      JSON.stringify({ sent, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
