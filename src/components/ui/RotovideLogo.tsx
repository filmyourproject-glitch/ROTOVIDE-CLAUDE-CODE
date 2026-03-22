import { cn } from "@/lib/utils";

interface RotovideLogoMarkProps {
  size?: number;
  className?: string;
}

export function RotovideLogoMark({ size = 120, className }: RotovideLogoMarkProps) {
  const scale = size / 120;
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ width: size, height: size }}>
      {/* Glow pulse */}
      <div
        className="absolute rounded-full"
        style={{
          inset: -size * 0.16,
          background: 'radial-gradient(circle, rgba(232,255,71,0.06) 0%, transparent 70%)',
          animation: 'glowPulse 3s ease-in-out infinite',
        }}
      />
      {/* Outer ring — accent top+right, spinning CW */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: `${2 * scale}px solid transparent`,
          borderTopColor: '#E8FF47',
          borderRightColor: '#E8FF47',
          animation: 'spinRing 3s linear infinite',
        }}
      />
      {/* Middle dashed ring — spinning CCW */}
      <div
        className="absolute rounded-full"
        style={{
          inset: size * 0.117,
          border: `${1 * scale}px dashed rgba(242,237,228,0.2)`,
          animation: 'spinRing 8s linear infinite reverse',
        }}
      />
      {/* Inner circle with film lines and play icon */}
      <div
        className="absolute rounded-full flex items-center justify-center overflow-hidden"
        style={{
          inset: size * 0.233,
          background: '#1A1A1A',
          border: `${1.5 * scale}px solid rgba(232,255,71,0.3)`,
        }}
      >
        {/* Film frame lines */}
        <div className="absolute" style={{ width: 2 * scale, height: '100%', background: 'rgba(232,255,71,0.12)', left: '30%' }} />
        <div className="absolute" style={{ width: 2 * scale, height: '100%', background: 'rgba(232,255,71,0.12)', right: '30%' }} />
        {/* Play triangle */}
        <div
          className="relative z-10"
          style={{
            width: 0,
            height: 0,
            borderTop: `${10 * scale}px solid transparent`,
            borderBottom: `${10 * scale}px solid transparent`,
            borderLeft: `${16 * scale}px solid #E8FF47`,
            marginLeft: 4 * scale,
            filter: 'drop-shadow(0 0 8px rgba(232,255,71,0.6))',
          }}
        />
      </div>
      {/* Orbit dot 1 — accent */}
      <div
        className="absolute rounded-full"
        style={{
          width: 6 * scale,
          height: 6 * scale,
          background: '#E8FF47',
          top: '50%',
          left: '50%',
          margin: `${-3 * scale}px 0 0 ${-3 * scale}px`,
          animation: `orbitDot 3s linear infinite`,
          boxShadow: '0 0 8px #E8FF47',
        }}
      />
      {/* Orbit dot 2 — white, offset */}
      <div
        className="absolute rounded-full"
        style={{
          width: 4 * scale,
          height: 4 * scale,
          background: '#F2EDE4',
          top: '50%',
          left: '50%',
          margin: `${-2 * scale}px 0 0 ${-2 * scale}px`,
          animation: `orbitDot 3s linear infinite`,
          animationDelay: '-1.5s',
          boxShadow: '0 0 6px rgba(242,237,228,0.4)',
        }}
      />
    </div>
  );
}

interface RotovideWordmarkProps {
  size?: number;
  className?: string;
}

export function RotovideWordmark({ size = 64, className }: RotovideWordmarkProps) {
  return (
    <div className={cn("flex items-baseline", className)} style={{ gap: 2, letterSpacing: -0.5 }}>
      <span
        className="font-display leading-none"
        style={{ fontSize: size, color: '#F2EDE4', letterSpacing: 3 }}
      >
        ROTO
      </span>
      <span
        className="font-display leading-none"
        style={{ fontSize: size, color: '#E8FF47', letterSpacing: 3 }}
      >
        VIDE
      </span>
    </div>
  );
}

interface RotovideLogoProps {
  size?: "hero" | "nav" | "icon";
  showWordmark?: boolean;
  showTagline?: boolean;
  className?: string;
}

const sizeMap = {
  hero: { mark: 120, wordmark: 64 },
  nav: { mark: 40, wordmark: 28 },
  icon: { mark: 64, wordmark: 0 },
};

export function RotovideLogo({ size = "nav", showWordmark = true, showTagline = false, className }: RotovideLogoProps) {
  const s = sizeMap[size];
  return (
    <div className={cn("flex items-center", className)} style={{ gap: size === "hero" ? 24 : 12 }}>
      <RotovideLogoMark size={s.mark} />
      {showWordmark && s.wordmark > 0 && (
        <div className="flex flex-col">
          <RotovideWordmark size={s.wordmark} />
          {showTagline && (
            <span className="text-label" style={{ color: 'rgba(242,237,228,0.4)', letterSpacing: 4, marginTop: 4 }}>
              AI-Powered Music Video Editing
            </span>
          )}
        </div>
      )}
    </div>
  );
}
