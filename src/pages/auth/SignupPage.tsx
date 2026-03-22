import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RotovideLogo } from "@/components/ui/RotovideLogo";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [codeFromUrl, setCodeFromUrl] = useState(false);
  const [codeError, setCodeError] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      setInviteCode(code.toUpperCase().trim());
      setCodeFromUrl(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError("");

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    const trimmedCode = inviteCode.toUpperCase().trim();
    if (!trimmedCode) {
      setCodeError("Invite code is required.");
      return;
    }

    setLoading(true);

    // Validate invite code
    const { data: waitlistEntry, error: lookupError } = await (supabase
      .from("waitlist")
      .select("id, redeemed, code_sent") as any)
      .eq("invite_code", trimmedCode)
      .maybeSingle();

    if (lookupError || !waitlistEntry) {
      setCodeError("Invalid invite code. Double-check your email for the correct code.");
      setLoading(false);
      return;
    }

    if ((waitlistEntry as any).redeemed) {
      setCodeError("This invite code has already been used.");
      setLoading(false);
      return;
    }

    // Proceed with signup
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/verified`,
      },
    });

    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    // Mark code as redeemed
    await (supabase
      .from("waitlist") as any)
      .update({ redeemed: true, redeemed_at: new Date().toISOString() })
      .eq("invite_code", trimmedCode);

    setLoading(false);
    navigate("/auth/verify", { state: { email } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#080808' }}>
      <div className="w-full max-w-[440px]">
        <div className="flex flex-col items-center mb-8">
          <RotovideLogo size="nav" showTagline />
          <div className="w-full mt-8" style={{ borderTop: '1px solid rgba(242,237,228,0.06)' }} />
        </div>

        <div className="p-12 rounded" style={{ background: '#0d0d0d', border: '1px solid rgba(242,237,228,0.08)' }}>
          <h2 className="font-display text-foreground mb-2" style={{ fontSize: 32, letterSpacing: 2 }}>CREATE ACCOUNT</h2>
          <p className="text-sm mb-6" style={{ color: 'rgba(242,237,228,0.4)' }}>Start making beat-synced videos</p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="invite-code" className="text-label" style={{ color: 'rgba(242,237,228,0.4)' }}>INVITE CODE</Label>
              <div className="relative">
                <Input
                  id="invite-code"
                  placeholder="RTV-XXXXX"
                  value={inviteCode}
                  onChange={(e) => { setInviteCode(e.target.value.toUpperCase()); setCodeError(""); }}
                  readOnly={codeFromUrl}
                  required
                  className={codeFromUrl ? "pr-24" : ""}
                />
                {codeFromUrl && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-medium" style={{ color: '#E8FF47' }}>
                    <Check className="w-3.5 h-3.5" /> Valid invite code
                  </span>
                )}
              </div>
              {codeError && <p className="text-xs" style={{ color: '#ff6b6b' }}>{codeError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-label" style={{ color: 'rgba(242,237,228,0.4)' }}>FULL NAME</Label>
              <Input id="name" placeholder="Your name"
                value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-label" style={{ color: 'rgba(242,237,228,0.4)' }}>EMAIL</Label>
              <Input id="email" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-label" style={{ color: 'rgba(242,237,228,0.4)' }}>PASSWORD</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-default"
                  style={{ color: 'rgba(242,237,228,0.4)' }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-label" style={{ color: 'rgba(242,237,228,0.4)' }}>CONFIRM PASSWORD</Label>
              <Input id="confirm" type="password" placeholder="••••••••"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>

            <Button className="w-full" size="lg" disabled={loading}>
              {loading ? "Creating account…" : "Create Account"}
            </Button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'rgba(242,237,228,0.4)' }}>
            Already have an account?{" "}
            <Link to="/auth/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
