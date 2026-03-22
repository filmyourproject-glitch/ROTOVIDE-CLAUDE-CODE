import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

// Map Stripe price IDs to credit amounts for top-ups
const TOPUP_CREDITS: Record<string, number> = {
  "price_1T6l0s2Q7kGVknGdDPzvHLLz": 60,
  "price_1T6l1D2Q7kGVknGdaRx3T2qx": 120,
  "price_1T6l2F2Q7kGVknGdwQfnct7C": 250,
};

// Pro subscription price IDs
const PRO_PRICE_IDS = [
  "price_1T6l0E2Q7kGVknGdPI95X953", // monthly
  "price_1T6l0Y2Q7kGVknGd8mXXVpiL", // annual
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  let event: Stripe.Event;

  if (webhookSecret && signature) {
    // Verify webhook signature
    const body = await req.text();
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      logStep("Signature verification failed", { error: (err as Error).message });
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400, headers: corsHeaders });
    }
  } else {
    // Fallback: parse without verification (development)
    const body = await req.json();
    event = body as Stripe.Event;
    logStep("WARNING: No webhook secret configured, skipping signature verification");
  }

  logStep("Event received", { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const customerEmail = session.customer_email || session.customer_details?.email;

        logStep("Checkout completed", { userId, customerEmail, mode: session.mode });

        if (!userId) {
          logStep("No user_id in metadata, skipping");
          break;
        }

        if (session.mode === "payment") {
          // One-time top-up: retrieve line items to find credit amount
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
          for (const item of lineItems.data) {
            const priceId = item.price?.id;
            if (priceId && TOPUP_CREDITS[priceId]) {
              const credits = TOPUP_CREDITS[priceId];
              logStep("Adding top-up credits", { userId, credits, priceId });

              // Add credits
              const { error: updateError } = await supabase
                .from("user_credits")
                .update({
                  topup_credits: supabase.rpc ? undefined : undefined, // handled below
                })
                .eq("user_id", userId);

              // Use raw SQL increment via RPC or direct update
              const { data: currentCredits } = await supabase
                .from("user_credits")
                .select("topup_credits")
                .eq("user_id", userId)
                .single();

              if (currentCredits) {
                await supabase
                  .from("user_credits")
                  .update({
                    topup_credits: currentCredits.topup_credits + credits,
                    stripe_customer_id: session.customer as string || undefined,
                  })
                  .eq("user_id", userId);
              }

              // Log transaction
              await supabase.from("credit_transactions").insert({
                user_id: userId,
                amount: credits,
                type: "topup",
                description: `Purchased ${credits} credits`,
                stripe_payment_intent_id: session.payment_intent as string || null,
              });

              logStep("Top-up credits added successfully", { credits });

              // Check if credits are low after top-up and send notification
              const { data: updatedCredits } = await supabase
                .from("user_credits")
                .select("subscription_credits, topup_credits, trial_credits, trial_expires_at")
                .eq("user_id", userId)
                .single();

              if (updatedCredits) {
                const totalRemaining =
                  (updatedCredits.subscription_credits || 0) +
                  (updatedCredits.topup_credits || 0) +
                  (updatedCredits.trial_expires_at && new Date(updatedCredits.trial_expires_at) > new Date()
                    ? (updatedCredits.trial_credits || 0) : 0);

                if (totalRemaining < 10) {
                  try {
                    await supabase.functions.invoke("send-notification", {
                      body: { type: "credits_low", user_id: userId, data: { credits_remaining: totalRemaining } },
                    });
                  } catch (notifErr) {
                    console.error("Failed to send credits_low notification:", notifErr);
                  }
                }
              }
            }
          }
        }

        if (session.mode === "subscription") {
          // Subscription activation
          const customerId = session.customer as string;
          logStep("Activating subscription", { userId, customerId });

          await supabase
            .from("user_credits")
            .update({
              plan: "pro",
              stripe_customer_id: customerId,
              subscription_credits: 150,
            })
            .eq("user_id", userId);

          await supabase
            .from("profiles")
            .update({ plan: "pro" })
            .eq("id", userId);

          // Log transaction
          await supabase.from("credit_transactions").insert({
            user_id: userId,
            amount: 150,
            type: "subscription",
            description: "Pro subscription activated - 150 credits",
            stripe_payment_intent_id: session.payment_intent as string || null,
          });

          logStep("Subscription activated successfully");
        }
        break;
      }

      case "invoice.paid": {
        // Monthly credit reset for recurring subscriptions
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Only process subscription renewals, not first payments
        if (invoice.billing_reason !== "subscription_cycle") {
          logStep("Skipping non-renewal invoice", { reason: invoice.billing_reason });
          break;
        }

        logStep("Subscription renewal", { customerId });

        // Find user by stripe_customer_id
        const { data: creditRecord } = await supabase
          .from("user_credits")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (creditRecord) {
          await supabase
            .from("user_credits")
            .update({
              subscription_credits: 150,
              subscription_resets_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq("user_id", creditRecord.user_id);

          await supabase.from("credit_transactions").insert({
            user_id: creditRecord.user_id,
            amount: 150,
            type: "subscription_reset",
            description: "Monthly subscription credits reset",
          });

          logStep("Credits reset for renewal", { userId: creditRecord.user_id });
        }
        break;
      }

      case "customer.subscription.deleted": {
        // Subscription canceled
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        logStep("Subscription canceled", { customerId });

        const { data: creditRecord } = await supabase
          .from("user_credits")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (creditRecord) {
          await supabase
            .from("user_credits")
            .update({
              plan: "free",
              subscription_credits: 0,
              subscription_resets_at: null,
            })
            .eq("user_id", creditRecord.user_id);

          await supabase
            .from("profiles")
            .update({ plan: "free" })
            .eq("id", creditRecord.user_id);

          logStep("Downgraded to free", { userId: creditRecord.user_id });
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR processing event", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
