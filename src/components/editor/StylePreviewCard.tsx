// StylePreviewCard: renders an animated GIF preview of a manifest style variant
// with static CSS effect overlay, stats, and apply button.

import { useState, useMemo } from "react";
import { CheckCircle, Loader2, ImageOff } from "lucide-react";
import type { EditManifest } from "@/lib/editManifest";
import type { Section } from "@/types";
import { findPreviewMoment, getManifestStats } from "@/lib/manifestInterpreter";
import { getMuxAnimatedUrl, getMuxThumbnailUrl } from "@/lib/muxThumbnails";

// ── Minimal static effect overlays (no time sync needed) ────────────────────

function StaticGrainOverlay({ intensity }: { intensity: number }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")`,
        backgroundSize: "200px 200px",
        mixBlendMode: "overlay",
        opacity: Math.min(0.5, intensity * 0.4),
      }}
    />
  );
}

function StaticVignetteOverlay({ intensity }: { intensity: number }) {
  const spread = Math.round(20 + intensity * 30);
  const blur = Math.round(30 + intensity * 40);
  return (
    <div
      className="absolute inset-0"
      style={{
        boxShadow: `inset 0 0 ${blur}px ${spread}px rgba(0,0,0,${0.3 + intensity * 0.4})`,
      }}
    />
  );
}

function StaticLetterboxOverlay({ intensity }: { intensity: number }) {
  const barPct = 4 + intensity * 8;
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

// ── Types ───────────────────────────────────────────────────────────────────

interface ClipMeta {
  url: string;
  muxPlaybackId?: string;
  [key: string]: unknown;
}

interface StylePreviewCardProps {
  manifest: EditManifest;
  sections: Section[];
  clipMeta: Record<string, ClipMeta>;
  styleMeta: {
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  };
  onApply: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function StylePreviewCard({
  manifest,
  sections,
  clipMeta,
  styleMeta,
  onApply,
}: StylePreviewCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const stats = useMemo(() => getManifestStats(manifest), [manifest]);
  const Icon = styleMeta.icon;

  // Find the best preview moment and generate the GIF URL
  const preview = useMemo(() => {
    const moment = findPreviewMoment(manifest, sections);
    if (!moment) return null;

    // Resolve media_ref → clip_id → muxPlaybackId
    // The media_ref may be a direct clip_id or a pattern like "perf_0"
    const meta = clipMeta[moment.mediaRef];
    const playbackId = meta?.muxPlaybackId;

    if (!playbackId) {
      // Try cycling through clipMeta to find any matching clip
      const allMetas = Object.values(clipMeta);
      const withPlayback = allMetas.find((m) => m.muxPlaybackId);
      if (!withPlayback?.muxPlaybackId) return null;
      return {
        gifUrl: getMuxAnimatedUrl(withPlayback.muxPlaybackId, {
          width: 320,
          fps: 8,
          start: Math.max(0, Math.floor(moment.sourceStart)),
          end: Math.ceil(moment.sourceEnd),
        }),
        thumbUrl: getMuxThumbnailUrl(withPlayback.muxPlaybackId, {
          width: 320,
          time: Math.floor(moment.sourceStart),
          fitMode: "smartcrop",
        }),
        effects: moment.effects,
      };
    }

    return {
      gifUrl: getMuxAnimatedUrl(playbackId, {
        width: 320,
        fps: 8,
        start: Math.max(0, Math.floor(moment.sourceStart)),
        end: Math.ceil(moment.sourceEnd),
      }),
      thumbUrl: getMuxThumbnailUrl(playbackId, {
        width: 320,
        time: Math.floor(moment.sourceStart),
        fitMode: "smartcrop",
      }),
      effects: moment.effects,
    };
  }, [manifest, sections, clipMeta]);

  // Extract dominant effects for overlay
  const effectOverlays = useMemo(() => {
    if (!preview?.effects) return { grain: 0, vignette: 0, letterbox: 0 };
    let grain = 0;
    let vignette = 0;
    let letterbox = 0;
    for (const eff of preview.effects) {
      if (eff.type === "grain") grain = Math.max(grain, eff.intensity);
      if (eff.type === "vignette") vignette = Math.max(vignette, eff.intensity);
      if (eff.type === "letterbox") letterbox = Math.max(letterbox, eff.intensity);
    }
    return { grain, vignette, letterbox };
  }, [preview?.effects]);

  return (
    <div
      className="rounded-xl flex flex-col gap-3 overflow-hidden"
      style={{
        background: "hsl(0 0% 8%)",
        border: "1px solid hsl(var(--border))",
      }}
    >
      {/* Preview area — 9:16 aspect ratio */}
      <div
        className="relative w-full overflow-hidden bg-black"
        style={{ aspectRatio: "9 / 16", maxHeight: 280 }}
      >
        {preview && !imgError ? (
          <>
            {/* Loading skeleton */}
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <Loader2 className="w-5 h-5 text-primary/50 animate-spin" />
              </div>
            )}

            {/* Animated GIF */}
            <img
              src={preview.gifUrl}
              alt={`${styleMeta.label} preview`}
              className="w-full h-full object-cover"
              loading="lazy"
              style={{ opacity: imgLoaded ? 1 : 0 }}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />

            {/* Static effect overlays */}
            <div className="absolute inset-0 pointer-events-none">
              {effectOverlays.grain > 0 && (
                <StaticGrainOverlay intensity={effectOverlays.grain} />
              )}
              {effectOverlays.vignette > 0 && (
                <StaticVignetteOverlay intensity={effectOverlays.vignette} />
              )}
              {effectOverlays.letterbox > 0 && (
                <StaticLetterboxOverlay intensity={effectOverlays.letterbox} />
              )}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <ImageOff className="w-5 h-5 text-muted-foreground/40" />
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              Preview unavailable
            </span>
          </div>
        )}
      </div>

      {/* Info + stats + button */}
      <div className="px-4 pb-4 flex flex-col gap-3">
        {/* Style header */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "hsl(var(--primary) / 0.15)" }}
          >
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-mono font-semibold text-foreground">
              {styleMeta.label}
            </h3>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
              {styleMeta.description}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div
          className="grid grid-cols-3 gap-3 p-2.5 rounded-lg"
          style={{ background: "hsl(0 0% 6%)" }}
        >
          <div className="text-center">
            <div className="text-base font-mono font-bold text-foreground">
              {stats.cutCount}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              CUTS
            </div>
          </div>
          <div className="text-center">
            <div className="text-base font-mono font-bold text-foreground">
              {stats.effectCount}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              EFFECTS
            </div>
          </div>
          <div className="text-center">
            <div className="text-base font-mono font-bold text-foreground">
              {Math.round(stats.confidence * 100)}%
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              CONF
            </div>
          </div>
        </div>

        {/* Apply button */}
        <button
          onClick={onApply}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-mono font-semibold w-full justify-center transition-colors"
          style={{
            background: "hsl(var(--primary) / 0.15)",
            color: "hsl(var(--primary))",
            border: "1px solid hsl(var(--primary) / 0.3)",
          }}
        >
          <CheckCircle className="w-4 h-4" />
          USE THIS STYLE
        </button>
      </div>
    </div>
  );
}
