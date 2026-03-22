import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RotovideLogo } from "@/components/ui/RotovideLogo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#080808' }}>
      <div className="w-full max-w-[440px]">
        <div className="flex flex-col items-center mb-8">
          <RotovideLogo size="nav" />
        </div>

        <div className="p-12 rounded" style={{ background: '#0d0d0d', border: '1px solid rgba(242,237,228,0.08)' }}>
          {sent ? (
            <div className="text-center space-y-3 py-4">
              <h2 className="font-display text-foreground" style={{ fontSize: 28, letterSpacing: 2 }}>CHECK YOUR EMAIL</h2>
              <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>If an account with that email exists, we've sent a password reset link.</p>
              <Button variant="outline" asChild><Link to="/auth/login">Back to Sign In</Link></Button>
            </div>
          ) : (
            <>
              <h2 className="font-display text-foreground mb-2" style={{ fontSize: 32, letterSpacing: 2 }}>RESET PASSWORD</h2>
              <p className="text-sm mb-6" style={{ color: 'rgba(242,237,228,0.4)' }}>Enter your email and we'll send you a reset link.</p>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-label" style={{ color: 'rgba(242,237,228,0.4)' }}>EMAIL</Label>
                  <Input id="email" type="email" placeholder="you@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <Button className="w-full" size="lg" disabled={loading}>
                  {loading ? "Sending…" : "Send Reset Link"}
                </Button>
              </form>
              <p className="text-center text-sm mt-6" style={{ color: 'rgba(242,237,228,0.4)' }}>
                <Link to="/auth/login" className="text-primary hover:underline font-medium">Back to Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
