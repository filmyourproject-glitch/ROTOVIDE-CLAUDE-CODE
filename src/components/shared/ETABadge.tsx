interface ETABadgeProps {
  percent: number;
  etaMinutes?: number;
}

export function ETABadge({ percent, etaMinutes }: ETABadgeProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-t-xl"
      style={{ background: "rgba(8,8,8,0.75)", backdropFilter: "blur(4px)" }}
    >
      <div className="text-center">
        <div
          className="text-2xl font-bold"
          style={{
            fontFamily: "'Bebas Neue', cursive",
            color: "#E8FF47",
            letterSpacing: 2,
          }}
        >
          {clamped}%
        </div>
        {etaMinutes != null && etaMinutes > 0 && (
          <div
            className="text-[10px] font-mono tracking-wider mt-0.5"
            style={{ color: "rgba(242,237,228,0.4)" }}
          >
            ETA {etaMinutes}m
          </div>
        )}
        {/* Mini progress bar */}
        <div
          className="w-16 h-1 rounded-full mt-2 mx-auto overflow-hidden"
          style={{ background: "rgba(242,237,228,0.1)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${clamped}%`,
              background: "#E8FF47",
              transition: "width 0.5s ease-out",
            }}
          />
        </div>
      </div>
    </div>
  );
}
