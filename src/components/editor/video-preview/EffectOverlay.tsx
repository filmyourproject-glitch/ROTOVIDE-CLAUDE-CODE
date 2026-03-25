// EffectOverlay: renders CSS-based visual approximations of manifest effects
// Overlaid on the video container — same pattern as WatermarkOverlay/LyricsCaptionOverlay.

import { useEffect, useRef, useState, useMemo } from "react";
import type { Effect } from "@/types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ActiveTransition {
  type: "fade" | "dissolve" | "flash" | "wipe";
  progress: number; // 0-1
}

interface EffectOverlayProps {
  effects: Effect[];
  transition: ActiveTransition | null;
  currentTime: number;
  clipStart: number;
  clipEnd: number;
}

// ── Noise SVG for film grain (inlined data URI) ─────────────────────────────

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")`;

// ── Main component ──────────────────────────────────────────────────────────

export function EffectOverlay({
  effects,
  transition,
  currentTime,
  clipStart,
  clipEnd,
}: EffectOverlayProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 20 }}
    >
      {effects.map((effect, i) => (
        <EffectRenderer
          key={`${effect.type}-${i}`}
          effect={effect}
          currentTime={currentTime}
          clipStart={clipStart}
          clipEnd={clipEnd}
        />
      ))}
      {transition && <TransitionRenderer transition={transition} />}
    </div>
  );
}

// ── Individual effect renderers ─────────────────────────────────────────────

function EffectRenderer({
  effect,
  currentTime,
  clipStart,
  clipEnd,
}: {
  effect: Effect;
  currentTime: number;
  clipStart: number;
  clipEnd: number;
}) {
  const intensity = (effect.params?.intensity as number) ?? 0.5;

  switch (effect.type) {
    case "film_grain":
      return <GrainOverlay intensity={intensity} />;
    case "vignette":
      return <VignetteOverlay intensity={intensity} />;
    case "letterbox":
      return <LetterboxOverlay intensity={intensity} />;
    case "zoom_in":
      return (
        <ZoomOverlay
          intensity={intensity}
          currentTime={currentTime}
          effectStart={effect.at_seconds}
          duration={effect.duration_seconds ?? clipEnd - clipStart}
        />
      );
    case "camera_shake":
      return <ShakeOverlay intensity={intensity} />;
    case "hard_cut":
      return (
        <FlashOverlay
          currentTime={currentTime}
          effectStart={effect.at_seconds}
        />
      );
    case "speed_ramp":
      return <SpeedBadge factor={effect.params?.factor as number} />;
    default:
      return null;
  }
}

// ── Film grain ──────────────────────────────────────────────────────────────

function GrainOverlay({ intensity }: { intensity: number }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: GRAIN_SVG,
        backgroundSize: "200px 200px",
        mixBlendMode: "overlay",
        opacity: Math.min(0.6, intensity * 0.5),
        animation: "grain-shift 0.4s steps(4) infinite",
      }}
    >
      <style>{`
        @keyframes grain-shift {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-5%, 5%); }
          50% { transform: translate(5%, -5%); }
          75% { transform: translate(-3%, -3%); }
          100% { transform: translate(0, 0); }
        }
      `}</style>
    </div>
  );
}

// ── Vignette ────────────────────────────────────────────────────────────────

function VignetteOverlay({ intensity }: { intensity: number }) {
  const spread = Math.round(30 + intensity * 40); // 30-70px
  const blur = Math.round(40 + intensity * 60); // 40-100px
  return (
    <div
      className="absolute inset-0"
      style={{
        boxShadow: `inset 0 0 ${blur}px ${spread}px rgba(0,0,0,${0.3 + intensity * 0.4})`,
      }}
    />
  );
}

// ── Letterbox ───────────────────────────────────────────────────────────────

function LetterboxOverlay({ intensity }: { intensity: number }) {
  const barPct = 4 + intensity * 8; // 4-12% of height per bar
  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 bg-black"
        style={{ height: `${barPct}%` }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-black"
        style={{ height: `${barPct}%` }}
      />
    </>
  );
}

// ── Zoom ────────────────────────────────────────────────────────────────────

function ZoomOverlay({
  intensity,
  currentTime,
  effectStart,
  duration,
}: {
  intensity: number;
  currentTime: number;
  effectStart: number;
  duration: number;
}) {
  const progress = Math.min(1, Math.max(0, (currentTime - effectStart) / duration));
  const scale = 1 + progress * intensity * 0.2; // up to 1.2x

  return (
    <div
      className="absolute inset-0"
      style={{
        transform: `scale(${scale.toFixed(4)})`,
        transformOrigin: "center center",
      }}
    />
  );
}

// ── Camera shake ────────────────────────────────────────────────────────────

function ShakeOverlay({ intensity }: { intensity: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let active = true;
    const maxJitter = Math.round(2 + intensity * 6); // 2-8px

    const jitter = () => {
      if (!active || !ref.current) return;
      const x = (Math.random() - 0.5) * 2 * maxJitter;
      const y = (Math.random() - 0.5) * 2 * maxJitter;
      ref.current.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      rafRef.current = requestAnimationFrame(jitter);
    };

    rafRef.current = requestAnimationFrame(jitter);
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [intensity]);

  // This overlay applies a transform to a full-size transparent div.
  // The parent video container should have overflow:hidden to clip the jitter.
  return <div ref={ref} className="absolute inset-0" />;
}

// ── Flash (hard cut / beat flash) ───────────────────────────────────────────

function FlashOverlay({
  currentTime,
  effectStart,
}: {
  currentTime: number;
  effectStart: number;
}) {
  const elapsed = currentTime - effectStart;
  // Flash lasts 150ms
  if (elapsed < 0 || elapsed > 0.15) return null;
  const opacity = Math.max(0, 0.9 - (elapsed / 0.15) * 0.9);
  return (
    <div
      className="absolute inset-0 bg-white"
      style={{ opacity }}
    />
  );
}

// ── Speed ramp badge ────────────────────────────────────────────────────────

function SpeedBadge({ factor }: { factor?: number }) {
  const label = factor != null && factor < 1
    ? `${(factor * 100).toFixed(0)}% SPEED`
    : factor != null && factor > 1
      ? `${factor.toFixed(1)}x SPEED`
      : "SPEED";

  return (
    <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 text-white text-xs font-mono">
      {label}
    </div>
  );
}

// ── Transition renderer ─────────────────────────────────────────────────────

function TransitionRenderer({ transition }: { transition: ActiveTransition }) {
  switch (transition.type) {
    case "fade":
    case "dissolve":
      return (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: transition.progress }}
        />
      );
    case "flash":
      return (
        <div
          className="absolute inset-0 bg-white"
          style={{ opacity: Math.max(0, 1 - transition.progress * 2) }}
        />
      );
    case "wipe": {
      // Horizontal motion blur approximation
      const blur = Math.round(transition.progress * 12);
      return (
        <div
          className="absolute inset-0"
          style={{
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
          }}
        />
      );
    }
    default:
      return null;
  }
}
