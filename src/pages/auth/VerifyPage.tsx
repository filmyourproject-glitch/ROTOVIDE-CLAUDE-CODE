import { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { RotovideLogo } from "@/components/ui/RotovideLogo";

const COOLDOWN_SECONDS = 60;

export default function VerifyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = (location.state as { email?: string })?.email || "";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Check if user is already verified — redirect to dashboard
  useEffect(() => {
    const checkVerified = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email_confirmed_at) {
        navigate("/app/dashboard", { replace: true });
      }
    };
    checkVerified();

    // Poll every 5s for verification status
    const interval = setInterval(checkVerified, 5000);
    return () => clearInterval(interval);
  }, [navigate]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          setResent(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (!email || cooldown > 0) return;
    setResending(true);
    await supabase.auth.resend({ type: "signup", email });
    setResending(false);
    setResent(true);
    setCooldown(COOLDOWN_SECONDS);
  }, [email, cooldown]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#080808' }}>
      <div className="w-full max-w-[440px] text-center">
        <div className="flex flex-col items-center mb-8">
          <RotovideLogo size="nav" />
        </div>

        <div className="p-12 rounded space-y-5" style={{ background: '#0d0d0d', border: '1px solid rgba(242,237,228,0.08)' }}>
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl"
            style={{ background: 'rgba(232,255,71,0.1)' }}
          >
            ✉️
          </div>
          <h2 className="font-display text-primary" style={{ fontSize: 28, letterSpacing: 2 }}>
            CHECK YOUR EMAIL
          </h2>
          <p className="text-sm" style={{ color: '#F2EDE4' }}>
            We sent a verification link to{" "}
            {email ? <span className="text-foreground font-medium">{email}</span> : "your email"}.
            Click it to activate your account.
          </p>

          <div style={{ borderTop: '1px solid rgba(242,237,228,0.06)' }} className="pt-4">
            <p className="text-xs mb-3" style={{ color: 'rgba(242,237,228,0.4)' }}>
              Didn't get it?
            </p>
            {email && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${resending ? "animate-spin" : ""}`} />
                {resent && cooldown > 0
                  ? `✓ Sent! Resend in ${cooldown}s`
                  : cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : "Resend verification email"}
              </Button>
            )}
          </div>

          <p className="text-xs pt-2" style={{ color: 'rgba(242,237,228,0.35)' }}>
            Already verified?{" "}
            <Link to="/auth/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
