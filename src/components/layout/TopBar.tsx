import { useState } from "react";
import { Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { RotovideLogo } from "@/components/ui/RotovideLogo";
import { CreditPill } from "@/components/credits/CreditPill";
import { TopupModal } from "@/components/credits/TopupModal";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopBar() {
  const { user, initials, signOut } = useAuth();
  const navigate = useNavigate();
  const [topupOpen, setTopupOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
    toast("You've been signed out.");
  };

  return (
    <>
      <header className="h-16 flex items-center justify-between px-6 sticky top-0 z-20"
        style={{ background: 'rgba(8,8,8,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(242,237,228,0.08)' }}>
        {/* Mobile logo */}
        <div className="lg:hidden">
          <RotovideLogo size="nav" />
        </div>

        <div className="hidden lg:block" />

        {/* Right side */}
        <div className="flex items-center gap-3">
          <CreditPill onClick={() => setTopupOpen(true)} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary focus:outline-none">
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" style={{ background: '#1A1A1A', border: '1px solid rgba(242,237,228,0.1)' }}>
              <div className="px-3 py-2">
                <p className="font-mono text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/app/settings")} className="cursor-pointer">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-[#FF4747] focus:text-[#FF4747]">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <TopupModal open={topupOpen} onClose={() => setTopupOpen(false)} />
    </>
  );
}
