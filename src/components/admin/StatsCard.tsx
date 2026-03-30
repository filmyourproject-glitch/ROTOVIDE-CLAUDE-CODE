import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: string;
}

export function StatsCard({ label, value, icon: Icon, color = "#E8FF47" }: StatsCardProps) {
  return (
    <div
      className="p-5 rounded-lg"
      style={{
        background: "#0d0d0d",
        border: "1px solid rgba(242,237,228,0.08)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-mono tracking-widest uppercase"
          style={{ color: "rgba(242,237,228,0.45)" }}
        >
          {label}
        </span>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div
        className="text-3xl font-bold"
        style={{ fontFamily: "'Bebas Neue', cursive", letterSpacing: 2, color }}
      >
        {value}
      </div>
    </div>
  );
}
