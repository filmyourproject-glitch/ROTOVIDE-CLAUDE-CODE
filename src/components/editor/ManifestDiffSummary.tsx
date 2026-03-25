// ManifestDiffSummary: compact diff comparing current timeline vs proposed manifest

import type { EditManifest } from "@/lib/editManifest";
import type { TimelineClip, Section } from "@/types";
import { convertManifestToTimeline, getManifestStats } from "@/lib/manifestInterpreter";

interface ManifestDiffSummaryProps {
  currentClips: TimelineClip[];
  manifest: EditManifest;
  sections: Section[];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function diffLabel(before: number, after: number): string {
  const delta = after - before;
  if (delta === 0) return `${after}`;
  const sign = delta > 0 ? "+" : "";
  return `${before} → ${after} (${sign}${delta})`;
}

export function ManifestDiffSummary({
  currentClips,
  manifest,
  sections,
}: ManifestDiffSummaryProps) {
  const proposed = convertManifestToTimeline(manifest, currentClips);
  const stats = getManifestStats(manifest);

  const currentPerf = currentClips.filter((c) => c.type === "performance").length;
  const currentBroll = currentClips.filter((c) => c.type === "broll").length;
  const currentEffects = currentClips.reduce(
    (sum, c) => sum + (c.effects?.length ?? 0),
    0
  );

  const proposedPerf = proposed.filter((c) => c.type === "performance").length;
  const proposedBroll = proposed.filter((c) => c.type === "broll").length;

  // Section coverage: how many sections have clips
  const sectionsCovered = sections.filter((sec) =>
    proposed.some((c) => c.start < sec.end && c.end > sec.start)
  ).length;

  return (
    <div
      className="mt-2 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed space-y-0.5"
      style={{
        background: "hsl(0 0% 7%)",
        border: "1px solid hsl(0 0% 15%)",
        fontFamily: "'Space Mono', monospace",
      }}
    >
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground mb-1.5">
        PREVIEW
      </p>
      <div className="space-y-0.5">
        <Row label="Clips" value={diffLabel(currentClips.length, proposed.length)} />
        <Row label="Performance" value={diffLabel(currentPerf, proposedPerf)} />
        <Row label="B-roll" value={diffLabel(currentBroll, proposedBroll)} />
        <Row label="Effects" value={diffLabel(currentEffects, stats.effectCount)} />
        <Row label="Duration" value={formatDuration(stats.duration)} />
        {sections.length > 0 && (
          <Row
            label="Sections"
            value={`${sectionsCovered}/${sections.length} covered`}
          />
        )}
        <Row
          label="Confidence"
          value={`${Math.round(stats.confidence * 100)}%`}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
