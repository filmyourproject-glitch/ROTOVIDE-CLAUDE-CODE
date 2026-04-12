import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildInviteEmail(inviteCode: string): { subject: string; html: string } {
  return {
    subject: "You're In — Your ROTOVIDE Invite Code",
    html: `
      <div style="font-family: sans-serif; background: #080808; color: #fff; padding: 40px; max-width: 480px; margin: 0 auto;">
        <h1 style="font-family: 'Bebas Neue', sans-serif; color: #E8FF47; font-size: 28px; margin: 0 0 16px 0;">
          You're In.
        </h1>
        <p style="color: #ccc; line-height: 1.6; margin: 0 0 24px 0;">
          Your ROTOVIDE invite code is ready. Use it to create your account and start building beat-synced music videos in minutes.
        </p>
        <div style="background: #111; padding: 20px; border-radius: 8px; text-align: center; margin: 0 0 24px 0; border: 1px solid #222;">
          <code style="font-size: 28px; color: #E8FF47; letter-spacing: 6px; font-weight: bold;">${inviteCode}</code>
        </div>
        <div style="text-align: center; margin: 0 0 32px 0;">
          <a href="https://rotovide.com/auth/signup?code=${inviteCode}"
             style="display: inline-block; padding: 14px 28px; background: #E8FF47; color: #080808; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px;">
            Sign Up Now
          </a>
        </div>
        <p style="color: #666; font-size: 12px; line-height: 1.5; margin: 0;">
          If you didn't request this invite, you can safely ignore this email.
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

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Resend error for ${to}: ${errText}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err);
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    let sent = 0;
    let failed = 0;

    if (body.send_all) {
      // Send to all pending waitlist entries
      const { data: pendingRows, error: fetchErr } = await supabase
        .from("waitlist")
        .select("id, email, invite_code")
        .eq("code_sent", false);

      if (fetchErr) {
        console.error("Failed to fetch pending waitlist rows:", fetchErr);
        return new Response(
          JSON.stringify({ error: "Failed to fetch waitlist entries" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!pendingRows?.length) {
        return new Response(
          JSON.stringify({ success: true, sent: 0, failed: 0, message: "No pending entries" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Sending waitlist codes to ${pendingRows.length} entries`);

      for (const row of pendingRows) {
        if (!row.email || !row.invite_code) {
          console.warn(`Skipping row ${row.id}: missing email or invite_code`);
          failed++;
          continue;
        }

        const { subject, html } = buildInviteEmail(row.invite_code);
        const ok = await sendEmail(resendApiKey, row.email, subject, html);

        if (ok) {
          await supabase
            .from("waitlist")
            .update({ code_sent: true, code_sent_at: new Date().toISOString() })
            .eq("id", row.id);
          sent++;
          console.log(`Sent invite to ${row.email}`);
        } else {
          failed++;
        }

        // Rate-limit: 100ms between sends
        await delay(100);
      }
    } else if (body.waitlist_id) {
      // Send to a single waitlist entry
      const { data: row, error: fetchErr } = await supabase
        .from("waitlist")
        .select("id, email, invite_code")
        .eq("id", body.waitlist_id)
        .single();

      if (fetchErr || !row) {
        return new Response(
          JSON.stringify({ error: "Waitlist entry not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { subject, html } = buildInviteEmail(row.invite_code);
      const ok = await sendEmail(resendApiKey, row.email, subject, html);

      if (ok) {
        await supabase
          .from("waitlist")
          .update({ code_sent: true, code_sent_at: new Date().toISOString() })
          .eq("id", row.id);
        sent = 1;
        console.log(`Sent invite to ${row.email}`);
      } else {
        failed = 1;
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Provide send_all: true or waitlist_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-waitlist-codes error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
