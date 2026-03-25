import { useState, useEffect } from "react";
import { Loader2, X, Sparkles, Zap, Film, CloudMoon, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { getManifestStats } from "@/lib/manifestInterpreter";
import type { EditManifest } from "@/lib/editManifest";
import type { Section, TimelineClip } from "@/types";

type StyleKey = "high_energy" | "cinematic" | "slow_mood";

const STYLE_META: Record<StyleKey, { label: string; description: string; icon: typeof Zap }> = {
  high_energy: {
    label: "HIGH ENERGY",
    description: "Hard cuts every 1-2 beats. Flash effects, camera shake, speed ramps.",
    icon: Zap,
  },
  cinematic: {
    label: "CINEMATIC",
    description: "Slow cuts every 8-16 beats. Dissolves, letterboxing, warm grade.",
    icon: Film,
  },
  slow_mood: {
    label: "SLOW MOOD",
    description: "Minimal cuts every 16+ beats. Desaturated, heavy vignette, moody grain.",
    icon: CloudMoon,
  },
};

const STYLE_ORDER: StyleKey[] = ["high_energy", "cinematic", "slow_mood"];

interface StyleComparisonPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  bpm: number;
  songDuration: number;
  sections: Section[];
  clips: TimelineClip[];
  beats: number[];
  onApplyManifest: (manifest: EditManifest) => void;
}

export function StyleComparisonPanel({
  open,
  onClose,
  projectId,
  bpm,
  songDuration,
  sections,
  clips,
  beats,
  onApplyManifest,
}: StyleComparisonPanelProps) {
  const [loading, setLoading] = useState(false);
  const [manifests, setManifests] = useState<Partial<Record<StyleKey, EditManifest>> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<StyleKey, string>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Reset state on open
    setManifests(null);
    setErrors(null);
    setError(null);
    generateStyles();
  }, [open]);

  const generateStyles = async () => {
    setLoading(true);
    try {
      const perfCount = clips.filter((c) => c.type === "performance").length;
      const brollCount = clips.filter((c) => c.type === "broll").length;

      // Build media_resources from clips
      const seen = new Set<string>();
      const mediaResources: { id: string; type: string; duration: number }[] = [];
      for (const c of clips) {
        if (!seen.has(c.clip_id)) {
          seen.add(c.clip_id);
          mediaResources.push({
            id: c.clip_id,
            type: c.type,
            duration: c.end - c.start,
          });
        }
      }

      const { data, error: fnError } = await supabase.functions.invoke("parallel-edit-gen", {
        body: {
          project_id: projectId,
          bpm,
          songDuration,
          sections,
          performanceClipCount: perfCount,
          brollClipCount: brollCount,
          beatTimestamps: beats,
          media_resources: mediaResources,
        },
      });

      if (fnError) {
        setError("Failed to generate styles. Try again.");
        return;
      }

      if (data?.manifests) {
        setManifests(data.manifests as Partial<Record<StyleKey, EditManifest>>);
      }
      if (data?.errors) {
        setErrors(data.errors as Partial<Record<StyleKey, string>>);
      }
      if (!data?.manifests || Object.keys(data.manifests).length === 0) {
        setError("No styles generated. Try again.");
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        className="absolute right-0 top-0 bottom-0 flex flex-col"
        style={{ width: 400, background: "hsl(0 0% 5.1%)", borderLeft: "1px solid hsl(var(--border))" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono font-semibold text-foreground">STYLE COMPARISON</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground font-mono">
                Generating 3 style variants...
              </p>
              <div className="flex gap-2 mt-2">
                {STYLE_ORDER.map((style) => (
                  <div
                    key={style}
                    className="px-2 py-1 rounded text-[10px] font-mono"
                    style={{ background: "hsl(0 0% 10.2%)", color: "hsl(var(--muted-foreground))" }}
                  >
                    {STYLE_META[style].label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-sm text-destructive font-mono text-center">{error}</p>
              <button
                onClick={generateStyles}
                className="px-4 py-2 rounded text-xs font-mono transition-colors"
                style={{
                  background: "hsl(var(--primary) / 0.15)",
                  color: "hsl(var(--primary))",
                  border: "1px solid hsl(var(--primary) / 0.3)",
                }}
              >
                RETRY
              </button>
            </div>
          )}

          {manifests && !loading && (
            <Carousel className="w-full" opts={{ align: "center", loop: true }}>
              <CarouselContent>
                {STYLE_ORDER.map((style) => {
                  const manifest = manifests[style] as EditManifest | undefined;
                  const styleError = errors?.[style];
                  const meta = STYLE_META[style];
                  const Icon = meta.icon;

                  if (!manifest) {
                    return (
                      <CarouselItem key={style}>
                        <div
                          className="rounded-xl p-5 flex flex-col items-center gap-3"
                          style={{ background: "hsl(0 0% 8%)", border: "1px solid hsl(var(--border))" }}
                        >
                          <Icon className="w-6 h-6 text-muted-foreground" />
                          <span className="text-sm font-mono font-semibold text-muted-foreground">
                            {meta.label}
                          </span>
                          <p className="text-xs text-destructive font-mono text-center">
                            {styleError || "Failed to generate"}
                          </p>
                        </div>
                      </CarouselItem>
                    );
                  }

                  const stats = getManifestStats(manifest);

                  return (
                    <CarouselItem key={style}>
                      <div
                        className="rounded-xl p-5 flex flex-col gap-4"
                        style={{ background: "hsl(0 0% 8%)", border: "1px solid hsl(var(--border))" }}
                      >
                        {/* Style header */}
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ background: "hsl(var(--primary) / 0.15)" }}
                          >
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-sm font-mono font-semibold text-foreground">
                              {meta.label}
                            </h3>
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              {meta.description}
                            </p>
                          </div>
                        </div>

                        {/* Stats grid */}
                        <div
                          className="grid grid-cols-3 gap-3 p-3 rounded-lg"
                          style={{ background: "hsl(0 0% 6%)" }}
                        >
                          <div className="text-center">
                            <div className="text-lg font-mono font-bold text-foreground">
                              {stats.cutCount}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">CUTS</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-mono font-bold text-foreground">
                              {stats.effectCount}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">EFFECTS</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-mono font-bold text-foreground">
                              {Math.round(stats.confidence * 100)}%
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">CONF</div>
                          </div>
                        </div>

                        {/* Apply button */}
                        <button
                          onClick={() => onApplyManifest(manifest)}
                          className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-mono font-semibold w-full justify-center transition-colors"
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
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              <CarouselPrevious
                className="left-1 bg-background/80 border-border"
              />
              <CarouselNext
                className="right-1 bg-background/80 border-border"
              />
            </Carousel>
          )}
        </div>

        {/* Footer hint */}
        {manifests && !loading && (
          <div className="px-4 py-3 border-t border-border shrink-0">
            <p className="text-[10px] text-muted-foreground font-mono text-center">
              Swipe or use arrows to compare styles
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
