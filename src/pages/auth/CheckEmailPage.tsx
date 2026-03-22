import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RotovideLogo } from "@/components/ui/RotovideLogo";

export default function CheckEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#080808' }}>
      <div className="w-full max-w-[440px] text-center">
        <div className="flex flex-col items-center mb-8">
          <RotovideLogo size="nav" />
        </div>

        <div className="p-12 rounded space-y-4" style={{ background: '#0d0d0d', border: '1px solid rgba(242,237,228,0.08)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(71,255,138,0.1)' }}>
            <MailCheck className="w-7 h-7 text-success" />
          </div>
          <h2 className="font-display text-foreground" style={{ fontSize: 28, letterSpacing: 2 }}>CHECK YOUR EMAIL</h2>
          <p className="text-sm" style={{ color: 'rgba(242,237,228,0.5)' }}>
            We sent a verification link to your email address. Click the link to verify your account and start creating music videos.
          </p>
          <p className="text-xs" style={{ color: 'rgba(242,237,228,0.35)' }}>
            Didn't receive it? Check your spam folder or try signing up again.
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/auth/login">Back to Sign In</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
