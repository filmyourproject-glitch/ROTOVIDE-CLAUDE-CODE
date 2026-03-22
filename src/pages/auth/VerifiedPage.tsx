import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { RotovideLogo } from "@/components/ui/RotovideLogo";

export default function VerifiedPage() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
  }, []);

  if (hasSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#080808' }}>
      <div className="w-full max-w-[440px] text-center">
        <div className="flex flex-col items-center mb-8">
          <RotovideLogo size="nav" />
        </div>

        <div className="p-12 rounded space-y-5" style={{ background: '#0d0d0d', border: '1px solid rgba(242,237,228,0.08)' }}>
          {hasSession ? (
            <>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(71,255,138,0.1)' }}>
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <h2 className="font-display text-foreground" style={{ fontSize: 28, letterSpacing: 2 }}>YOU'RE VERIFIED</h2>
              <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>
                Your account is active. Start your free 3-day Pro trial now.
              </p>
              <Button asChild size="lg" className="w-full">
                <Link to="/app">Go to Dashboard →</Link>
              </Button>
            </>
          ) : (
            <>
              <h2 className="font-display text-foreground" style={{ fontSize: 28, letterSpacing: 2 }}>SESSION EXPIRED</h2>
              <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>
                Session expired. Please log in.
              </p>
              <Button asChild variant="outline">
                <Link to="/auth/login">Sign In</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
