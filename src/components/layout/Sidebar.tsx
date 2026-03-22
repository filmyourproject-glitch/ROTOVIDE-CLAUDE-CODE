import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, Film, Scissors, CreditCard, Settings, LogOut, HardDrive, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { RotovideLogo } from "@/components/ui/RotovideLogo";

const navItems = [
  { to: "/app/dashboard", icon: LayoutGrid, label: "Dashboard" },
  { to: "/app/projects", icon: Film, label: "Projects" },
  { to: "/app/long-to-shorts", icon: Scissors, label: "Long to Shorts" },
  { to: "/app/captions", icon: MessageSquare, label: "AI Captions" },
  { to: "/app/storage", icon: HardDrive, label: "Storage" },
  { to: "/app/billing", icon: CreditCard, label: "Billing" },
  { to: "/app/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { displayName, initials, planLabel, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate("/auth/login");
  };

  const badgeClass = planLabel === "pro"
    ? "bg-primary/[0.12] text-primary border border-primary/20 font-mono text-[9px] tracking-[2px] uppercase px-2 py-0.5 rounded-sm"
    : planLabel === "trial"
      ? "bg-primary/[0.08] text-primary border border-primary/30 border-dashed font-mono text-[9px] tracking-[2px] uppercase px-2 py-0.5 rounded-sm"
      : "bg-foreground/[0.08] text-foreground/50 font-mono text-[9px] tracking-[2px] uppercase px-2 py-0.5 rounded-sm";

  return (
    <aside className="hidden lg:flex flex-col w-60 h-screen fixed left-0 top-0 z-30"
      style={{ background: '#0a0a0a', borderRight: '1px solid rgba(242,237,228,0.06)' }}>
      {/* Logo */}
      <div className="flex items-center px-5 h-16" style={{ borderBottom: '1px solid rgba(242,237,228,0.06)' }}>
        <RotovideLogo size="nav" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-default",
                isActive
                  ? "text-foreground bg-foreground/[0.05]"
                  : "text-foreground/50 hover:text-foreground hover:bg-foreground/[0.03]"
              )}
              style={isActive ? { borderLeft: '2px solid #E8FF47', paddingLeft: 10 } : {}}
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 pb-4 pt-4" style={{ borderTop: '1px solid rgba(242,237,228,0.06)' }}>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">{displayName}</p>
            <span className={badgeClass}>{planLabel}</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded text-sm text-foreground/50 hover:text-foreground hover:bg-foreground/[0.03] transition-default w-full mt-1"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </aside>
  );
}
