import { NavLink } from "react-router-dom";
import { LayoutGrid, Users, BarChart3, ArrowLeft } from "lucide-react";
import { RotovideLogo } from "@/components/ui/RotovideLogo";

const navItems = [
  { to: "/app/admin", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/app/admin/waitlist", label: "Waitlist", icon: Users },
  { to: "/app/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export function AdminSidebar() {
  return (
    <aside
      className="hidden lg:flex flex-col w-60 h-screen fixed left-0 top-0 z-30"
      style={{
        background: "#0a0a0a",
        borderRight: "1px solid rgba(242,237,228,0.06)",
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <RotovideLogo size="nav" />
        <div
          className="mt-2 px-2 py-1 rounded text-center"
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            letterSpacing: 2,
            color: "#E8FF47",
            background: "rgba(232,255,71,0.06)",
            border: "1px solid rgba(232,255,71,0.12)",
          }}
        >
          ADMIN
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors ${
                isActive
                  ? "text-foreground"
                  : "text-foreground/50 hover:text-foreground/70"
              }`
            }
            style={({ isActive }) => ({
              background: isActive ? "rgba(232,255,71,0.06)" : "transparent",
              borderLeft: isActive
                ? "2px solid #E8FF47"
                : "2px solid transparent",
            })}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Back to app */}
      <div className="px-3 pb-5">
        <NavLink
          to="/app/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded text-sm text-foreground/40 hover:text-foreground/60 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to App
        </NavLink>
      </div>
    </aside>
  );
}
