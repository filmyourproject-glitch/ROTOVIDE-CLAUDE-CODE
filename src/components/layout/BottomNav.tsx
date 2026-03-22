import { NavLink, useLocation } from "react-router-dom";
import { LayoutGrid, Film, Scissors, MessageSquare, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/app/dashboard", icon: LayoutGrid, label: "Home" },
  { to: "/app/projects", icon: Film, label: "Projects" },
  { to: "/app/long-to-shorts", icon: Scissors, label: "Shorts" },
  { to: "/app/captions", icon: MessageSquare, label: "Captions" },
  { to: "/app/settings", icon: Settings, label: "Settings" },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2"
      style={{ background: '#080808', borderTop: '1px solid rgba(242,237,228,0.06)', height: 'calc(64px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {navItems.map(({ to, icon: Icon, label }) => {
        const isActive = location.pathname.startsWith(to);
        return (
          <NavLink
            key={to}
            to={to}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded text-xs transition-default",
              "min-h-[44px] min-w-[44px] px-3 py-2",
              isActive ? "text-primary" : "text-foreground/50"
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}
