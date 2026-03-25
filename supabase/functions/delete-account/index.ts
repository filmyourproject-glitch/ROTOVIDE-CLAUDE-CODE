import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  console.log(`[DELETE-ACCOUNT] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    // ── 1. Authenticate user from JWT ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);

    const user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");

    const userId = user.id;
    const email = user.email ?? "unknown";
    log("Starting account deletion", { userId, email });

    const warnings: string[] = [];

    // ── 2. Cancel Stripe subscription (if any) ────────────────────────────
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey && email !== "unknown") {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        const customers = await stripe.customers.list({ email, limit: 1 });

        if (customers.data.length > 0) {
          const customerId = customers.data[0].id;
          log("Found Stripe customer", { customerId });

          // Cancel all active subscriptions
          const subs = await stripe.subscriptions.list({
            customer: customerId,
            status: "active",
          });
          for (const sub of subs.data) {
            await stripe.subscriptions.cancel(sub.id);
            log("Cancelled subscription", { subId: sub.id });
          }

          // Delete the customer entirely
          await stripe.customers.del(customerId);
          log("Deleted Stripe customer", { customerId });
        } else {
          log("No Stripe customer found — skipping");
        }
      } else {
        log("STRIPE_SECRET_KEY not set — skipping Stripe cleanup");
      }
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
      warnings.push(`Stripe cleanup warning: ${msg}`);
      log("Stripe cleanup error (non-fatal)", { error: msg });
    }

    // ── 3. Delete Supabase Storage files ───────────────────────────────────
    try {
      // List all projects to find storage paths
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", userId);

      if (projects?.length) {
        for (const project of projects) {
          const prefix = `${userId}/${project.id}`;
          const { data: files } = await supabase.storage
            .from("media")
            .list(prefix, { limit: 1000 });

          if (files?.length) {
            const paths = files.map((f) => `${prefix}/${f.name}`);
            await supabase.storage.from("media").remove(paths);
            log("Deleted storage files", { projectId: project.id, count: paths.length });
          }
        }

        // Also try deleting the user-level folder
        const { data: userFiles } = await supabase.storage
          .from("media")
          .list(userId, { limit: 1000 });

        if (userFiles?.length) {
          const paths = userFiles
            .filter((f) => f.name) // skip folder entries
            .map((f) => `${userId}/${f.name}`);
          if (paths.length) {
            await supabase.storage.from("media").remove(paths);
          }
        }
      }
      log("Storage cleanup complete");
    } catch (storageErr) {
      const msg = storageErr instanceof Error ? storageErr.message : String(storageErr);
      warnings.push(`Storage cleanup warning: ${msg}`);
      log("Storage cleanup error (non-fatal)", { error: msg });
    }

    // ── 4. Delete DB rows (respecting FK constraints) ──────────────────────
    // Tables referencing auth.users directly (not cascaded from profiles):
    const directTables = [
      "edit_manifests",
      "director_chats",
      "video_indexes",
    ];

    for (const table of directTables) {
      try {
        const { error: delErr } = await supabase
          .from(table)
          .delete()
          .eq("user_id", userId);
        if (delErr) {
          warnings.push(`${table} delete warning: ${delErr.message}`);
          log(`Failed to delete from ${table}`, { error: delErr.message });
        } else {
          log(`Deleted from ${table}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`${table} delete warning: ${msg}`);
      }
    }

    // Tables with user_id that may not cascade from profiles deletion:
    const userIdTables = [
      "exports",       // FK → profiles(id), should cascade but be safe
      "project_clips",
      "media_files",   // FK → profiles(id)
      "projects",      // FK → profiles(id)
      "credit_transactions",
      "user_credits",
      "trial_attempts",
    ];

    for (const table of userIdTables) {
      try {
        const { error: delErr } = await supabase
          .from(table)
          .delete()
          .eq("user_id", userId);
        if (delErr) {
          warnings.push(`${table} delete warning: ${delErr.message}`);
          log(`Failed to delete from ${table}`, { error: delErr.message });
        } else {
          log(`Deleted from ${table}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`${table} delete warning: ${msg}`);
      }
    }

    // Delete profiles row (id = auth user id)
    try {
      const { error: profileErr } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);
      if (profileErr) {
        warnings.push(`profiles delete warning: ${profileErr.message}`);
        log("Failed to delete profile", { error: profileErr.message });
      } else {
        log("Deleted profile");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`profiles delete warning: ${msg}`);
    }

    // ── 5. Delete auth user (final step) ───────────────────────────────────
    const { error: authDelErr } = await supabase.auth.admin.deleteUser(userId);
    if (authDelErr) {
      log("Failed to delete auth user", { error: authDelErr.message });
      return new Response(
        JSON.stringify({
          error: `Data cleaned up but failed to delete auth user: ${authDelErr.message}`,
          warnings,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log("Auth user deleted — account deletion complete", { userId });

    return new Response(
      JSON.stringify({ success: true, warnings: warnings.length ? warnings : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("FATAL ERROR", { error: msg });
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
