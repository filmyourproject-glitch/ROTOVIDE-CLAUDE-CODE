import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RotovideLogo } from "@/components/ui/RotovideLogo";
import { cn } from "@/lib/utils";
import { STRIPE_PRODUCTS, STRIPE_TOPUPS } from "@/lib/stripeConfig";

function Navbar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl"
      style={{ background: 'rgba(8,8,8,0.85)', borderBottom: '1px solid rgba(242,237,228,0.08)' }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between px-5 md:px-10 h-16">
        <Link to="/"><RotovideLogo size="nav" /></Link>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild><Link to="/auth/login">Log In</Link></Button>
          <Button size="sm" asChild><Link to="/auth/signup">Start Free Trial</Link></Button>
        </div>
      </div>
    </nav>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const activePro = annual ? STRIPE_PRODUCTS.pro_annual : STRIPE_PRODUCTS.pro_monthly;

  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "/mo",
      credits: "20 / month",
      features: [
        "20 credits per month",
        "Watermarked exports",
        "Clips expire after 3 days",
        "720p max resolution",
      ],
      cta: "Get Started Free",
      href: "/auth/signup",
      highlighted: false,
    },
    {
      name: "Pro",
      price: annual ? "$14.99" : "$24.99",
      period: annual ? "/mo (billed yearly)" : "/mo",
      credits: "150 / month",
      features: [
        "150 credits per month",
        "No watermark",
        "Exports never expire",
        "1080p / 4K exports",
        "Multi-cam distribution",
        "Section-aware cutting",
        "Priority processing",
      ],
      cta: "Start Free Trial",
      href: "/auth/signup",
      highlighted: true,
      savings: annual ? "Save 40%" : undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-32 pb-24 px-5">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="font-display text-foreground mb-3" style={{ fontSize: 'clamp(36px, 6vw, 64px)', letterSpacing: 3 }}>
              LESS THAN ONE BEAT LEASE.
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              One song. 8–16 posts. Under $25.
            </p>
          </div>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3 mb-12">
            <span className={cn("text-sm transition-colors", !annual ? "text-foreground" : "text-muted-foreground")}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors",
                annual ? "bg-primary" : "bg-foreground/20"
              )}
            >
              <div className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-background transition-transform",
                annual ? "translate-x-6" : "translate-x-0.5"
              )} />
            </button>
            <span className={cn("text-sm transition-colors", annual ? "text-foreground" : "text-muted-foreground")}>
              Annual <span className="text-primary text-xs font-mono">SAVE 40%</span>
            </span>
          </div>

          {/* Plan Cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-20">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "rounded-lg p-8 space-y-6 relative",
                  plan.highlighted
                    ? "border-2 border-primary/30 bg-primary/[0.02]"
                    : "border border-border bg-card"
                )}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-6 text-[10px] font-mono tracking-widest uppercase bg-primary text-primary-foreground px-3 py-1 rounded">
                    MOST POPULAR
                  </span>
                )}
                {plan.savings && (
                  <span className="absolute -top-3 right-6 text-[10px] font-mono tracking-widest uppercase bg-primary/20 text-primary px-3 py-1 rounded">
                    {plan.savings}
                  </span>
                )}
                <div>
                  <h3 className="font-display text-foreground text-xl tracking-wider">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-4xl font-display text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{plan.credits}</p>
                </div>

                <ul className="space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  size="lg"
                  className="w-full"
                  variant={plan.highlighted ? "default" : "outline"}
                  asChild
                >
                  <Link to={plan.href}>
                    {plan.cta} <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>

          {/* Top-Up Packs */}
          <div className="text-center mb-8">
            <h2 className="font-display text-foreground text-2xl tracking-wider mb-2">NEED MORE CREDITS?</h2>
            <p className="text-sm text-muted-foreground">Top-up credits never expire. Use them anytime.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto mb-20">
            {STRIPE_TOPUPS.map((pack) => (
              <div
                key={pack.price_id}
                className={cn(
                  "rounded-lg p-6 text-center space-y-2",
                  pack.popular
                    ? "border-2 border-primary/30 bg-primary/[0.02]"
                    : "border border-border bg-card"
                )}
              >
                {pack.popular && (
                  <span className="text-[9px] font-mono tracking-widest uppercase text-primary">BEST VALUE</span>
                )}
                <p className="text-3xl font-display text-primary">
                  <Zap className="w-5 h-5 inline mr-1" />{pack.credits}
                </p>
                <p className="text-xs text-muted-foreground">credits</p>
                <p className="text-xl font-display text-foreground">{pack.price}</p>
              </div>
            ))}
          </div>

          {/* Final CTA */}
          <div className="text-center rounded-lg p-12 border border-border bg-card">
            <h2 className="font-display text-foreground text-3xl tracking-wider mb-3">DROP YOUR FIRST SONG.</h2>
            <p className="text-muted-foreground mb-6">Free trial. 15 credits. 3 days. No card.</p>
            <Button size="lg" className="text-base px-10 py-6" asChild>
              <Link to="/auth/signup">Start Free <ArrowRight className="w-4 h-4 ml-2" /></Link>
            </Button>
            <p className="text-xs text-muted-foreground mt-4">Takes 2 minutes to set up.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <RotovideLogo size="nav" />
            <span className="text-xs text-muted-foreground">Built for independent Christian artists.</span>
          </div>
          <div className="flex gap-6 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link to="/auth/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link to="/auth/signup" className="hover:text-foreground transition-colors">Sign Up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
