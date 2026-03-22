import { Check, X, ArrowRight, Loader2, Zap, CreditCard, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { STRIPE_PRODUCTS, STRIPE_TOPUPS } from "@/lib/stripeConfig";
import { useSearchParams } from "react-router-dom";

/* ─── plan features ─── */
const FREE_FEATURES = [
  { label: "15 trial credits (3-day expiry)", included: true },
  { label: "50GB storage", included: true },
  { label: "Watermark on exports", included: true },
  { label: "Raw Cut style only", included: true },
  { label: "720p exports", included: true },
  { label: "Cinematic / Hype / Vibe styles", included: false },
  { label: "AI B-roll placement", included: false },
  { label: "4K or H.265", included: false },
  { label: "Both format export", included: false },
];

const PRO_FEATURES = [
  { label: "150 credits / month", included: true },
  { label: "1TB storage", included: true },
  { label: "No watermark", included: true },
  { label: "All 4 edit styles", included: true },
  { label: "AI B-roll intelligent placement", included: true },
  { label: "4K + H.265 export", included: true },
  { label: "Both formats (9:16 + 16:9)", included: true },
  { label: "Priority render queue", included: true },
];

const faqs = [
  { q: "How do credits work?", a: "Each export costs 1 credit. Trial accounts start with 15 credits (expire in 3 days). Pro subscribers get 150 credits/month that reset on your billing date. Top-up credits never expire." },
  { q: "What happens when I run out of credits?", a: "Free tier users can still export with a watermark. Pro users need credits or a top-up for unwatermarked exports." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your subscription management portal. You'll keep Pro access until the end of your billing period." },
  { q: "Why does raw footage expire after 7 days?", a: "Raw video files are large. We delete them after 7 days to keep storage costs low and ROTOVIDE affordable. Your timeline and settings are always preserved." },
  { q: "Is my music safe?", a: "100%. We never use your music or footage for training, sharing, or any other purpose." },
];

export default function BillingPage() {
  const [searchParams] = useSearchParams();
  const { isPro, subscription, credits, refreshSubscription, refreshCredits } = useAuth();
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [managingPortal, setManagingPortal] = useState(false);

  /* ─── handle success/cancel redirect ─── */
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Payment successful! Your account has been updated.");
      refreshSubscription();
      refreshCredits();
    }
    if (searchParams.get("canceled") === "true") {
      toast("Payment canceled.");
    }
  }, [searchParams, refreshSubscription, refreshCredits]);

  /* ─── checkout handler ─── */
  const handleCheckout = async (priceId: string, mode: "subscription" | "payment") => {
    setCheckingOut(priceId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId, mode },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err) {
      console.error("Checkout error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setCheckingOut(null);
    }
  };

  /* ─── manage subscription ─── */
  const handleManageSubscription = async () => {
    setManagingPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err) {
      console.error("Portal error:", err);
      toast.error("Could not open subscription management.");
    } finally {
      setManagingPortal(false);
    }
  };

  const totalCredits = credits?.total ?? 0;

  return (
    <div className="space-y-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-foreground">Billing</h1>

      {/* Credit Balance */}
      <div className="surface-card shadow-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Credit Balance</p>
            <p className="text-3xl font-bold text-foreground mt-1">{totalCredits}</p>
            {credits && (
              <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                {credits.subscription_credits > 0 && <span>{credits.subscription_credits} subscription</span>}
                {credits.topup_credits > 0 && <span>{credits.topup_credits} top-up</span>}
                {credits.trial_credits > 0 && credits.trial_expires_at && new Date(credits.trial_expires_at) > new Date() && (
                  <span>{credits.trial_credits} trial</span>
                )}
              </div>
            )}
          </div>
          <Zap className="w-8 h-8 text-primary opacity-50" />
        </div>
      </div>

      {/* Current Plan */}
      <div className="surface-card shadow-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current Plan</p>
            <p className="text-xl font-bold text-foreground mt-1">
              {isPro ? "Pro Plan" : "Free Plan"}
            </p>
            {isPro && subscription?.subscription_end && (
              <p className="text-sm text-muted-foreground mt-1">
                Renews {new Date(subscription.subscription_end).toLocaleDateString()}
              </p>
            )}
          </div>
          {isPro && (
            <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={managingPortal}>
              {managingPortal ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Settings className="w-4 h-4 mr-1" />}
              Manage
            </Button>
          )}
        </div>
      </div>

      {/* Subscription Plans */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Plans</h2>
        <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
          {/* Free */}
          <div className="surface-card shadow-card p-6 flex flex-col">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-foreground">Free</h3>
              <div className="mt-2">
                <span className="text-3xl font-bold text-foreground">$0</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </div>
            <ul className="space-y-2.5 flex-1 mb-6">
              {FREE_FEATURES.map((f) => (
                <li key={f.label} className="flex items-center gap-2 text-sm">
                  {f.included ? <Check className="w-4 h-4 text-success shrink-0" /> : <X className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span className={f.included ? "text-foreground" : "text-muted-foreground"}>{f.label}</span>
                </li>
              ))}
            </ul>
            <Button className="w-full" variant="outline" disabled>
              {!isPro ? "Current Plan" : "Downgrade"}
            </Button>
          </div>

          {/* Pro */}
          <div className="surface-card shadow-card p-6 flex flex-col relative border-primary glow-primary">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full bg-primary text-primary-foreground">
              Most Popular
            </span>
            <div className="mb-6">
              <h3 className="text-lg font-bold text-foreground">Pro</h3>
              <div className="mt-2 flex items-baseline gap-3">
                <div>
                  <span className="text-3xl font-bold text-foreground">{STRIPE_PRODUCTS.pro_monthly.price}</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  or {STRIPE_PRODUCTS.pro_annual.price}/yr ({STRIPE_PRODUCTS.pro_annual.savings})
                </span>
              </div>
            </div>
            <ul className="space-y-2.5 flex-1 mb-6">
              {PRO_FEATURES.map((f) => (
                <li key={f.label} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-success shrink-0" />
                  <span className="text-foreground">{f.label}</span>
                </li>
              ))}
            </ul>
            {isPro ? (
              <Button className="w-full" variant="outline" disabled>
                Current Plan
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => handleCheckout(STRIPE_PRODUCTS.pro_monthly.price_id, "subscription")}
                  disabled={!!checkingOut}
                >
                  {checkingOut === STRIPE_PRODUCTS.pro_monthly.price_id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Subscribe Monthly <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => handleCheckout(STRIPE_PRODUCTS.pro_annual.price_id, "subscription")}
                  disabled={!!checkingOut}
                >
                  {checkingOut === STRIPE_PRODUCTS.pro_annual.price_id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Subscribe Annual ({STRIPE_PRODUCTS.pro_annual.savings}) <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Credit Top-Ups */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Credit Top-Ups</h2>
        <p className="text-sm text-muted-foreground mb-4">One-time purchase. Credits never expire.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
          {STRIPE_TOPUPS.map((topup) => (
            <div
              key={topup.price_id}
              className={cn(
                "surface-card shadow-card p-5 flex flex-col items-center text-center relative",
                topup.popular && "border-primary glow-primary"
              )}
            >
              {topup.popular && (
                <span className="absolute -top-2.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                  Best Value
                </span>
              )}
              <CreditCard className="w-5 h-5 text-primary mb-2" />
              <p className="text-2xl font-bold text-foreground">{topup.credits}</p>
              <p className="text-xs text-muted-foreground mb-3">credits</p>
              <p className="text-lg font-semibold text-foreground mb-4">{topup.price}</p>
              <Button
                className="w-full"
                size="sm"
                variant={topup.popular ? "default" : "outline"}
                onClick={() => handleCheckout(topup.price_id, "payment")}
                disabled={!!checkingOut}
              >
                {checkingOut === topup.price_id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Buy
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">FAQ</h2>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="surface-card shadow-card overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left px-5 py-4 flex items-center justify-between text-sm font-medium text-foreground"
              >
                {faq.q}
                <span className="text-muted-foreground">{openFaq === i ? "−" : "+"}</span>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-sm text-muted-foreground">{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
