import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildConfirmationEmail(): { subject: string; html: string } {
  return {
    subject: "You're on the ROTOVIDE waitlist",
    html: `
      <div style="font-family: sans-serif; background: #080808; color: #fff; padding: 40px; max-width: 480px; margin: 0 auto;">
        <h1 style="font-family: 'Bebas Neue', sans-serif; color: #E8FF47; font-size: 28px; margin: 0 0 16px 0;">
          You're on the list.
        </h1>
        <p style="color: #ccc; line-height: 1.6; margin: 0 0 24px 0;">
          Thanks for signing up for ROTOVIDE — the AI music video editor built for independent artists.
        </p>
        <p style="color: #ccc; line-height: 1.6; margin: 0 0 24px 0;">
          When we launch, you'll receive an exclusive link with a free trial so you can start creating beat-synced music videos, social clips, and captions from day one.
        </p>
        <div style="text-align: center; margin: 0 0 32px 0;">
          <a href="https://rotovide.com"
             style="display: inline-block; padding: 14px 28px; background: #E8FF47; color: #080808; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px;">
            Visit ROTOVIDE
          </a>
        </div>
        <p style="color: #666; font-size: 12px; line-height: 1.5; margin: 0;">
          You're receiving this because you joined the ROTOVIDE waitlist. If this wasn't you, you can safely ignore this email.
        </p>
      </div>
    `,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not set");

    const { email } = await req.json();
    if (!email) throw new Error("email is required");

    const { subject, html } = buildConfirmationEmail();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ROTOVIDE <info@info.rotovide.com>",
        to: [email],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Resend error: ${errBody}`);
    }

    return new Response(
      JSON.stringify({ sent: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("waitlist-confirmation error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
