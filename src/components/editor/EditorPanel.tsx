import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Scissors, Palette, Bot, Lock } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ColorGradePreview } from "@/components/color-grade/ColorGradePreview";
import { ColorGradeSwatches } from "@/components/color-grade/ColorGradeSwatches";
import { ColorGradeIntensitySlider } from "@/components/color-grade/ColorGradeIntensitySlider";
import { BeforeAfterToggle } from "@/components/color-grade/BeforeAfterToggle";
import { COLOR_GRADE_MAP } from "@/lib/colorGrades";
import type { StylePreset, ColorGrade, VideoFormat } from "@/types";

const tabs = [
  { id: "cuts", label: "Cuts", icon: Scissors },
  { id: "color", label: "Color", icon: Palette },
  { id: "ai", label: "AI", icon: Bot },
] as const;

type TabId = typeof tabs[number]["id"];

interface EditorPanelProps {
  stylePreset: StylePreset;
  colorGrade: ColorGrade;
  colorGradeIntensity: number;
  format: VideoFormat;
  trimStart: number | null;
  trimEnd: number | null;
  duration: number;
  isPro: boolean;
  onStyleChange: (style: StylePreset) => void;
  onColorGradeChange: (grade: ColorGrade) => void;
  onColorIntensityChange: (val: number) => void;
  onFormatChange: (format: VideoFormat) => void;
  onTrimChange: (start: number | null, end: number | null) => void;
  initialTab?: string;
}

export function EditorPanel({
  stylePreset, colorGrade, colorGradeIntensity, format, trimStart, trimEnd, duration,
  isPro, onStyleChange, onColorGradeChange, onColorIntensityChange, onFormatChange, onTrimChange,
  initialTab,
}: EditorPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>((initialTab as TabId) || "cuts");

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as TabId);
  }, [initialTab]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-default",
              activeTab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === "cuts" && (
          <CutsTab
            format={format}
            trimStart={trimStart}
            trimEnd={trimEnd}
            duration={duration}
            isPro={isPro}
            onFormatChange={onFormatChange}
            onTrimChange={onTrimChange}
          />
        )}
        {activeTab === "color" && (
          <ColorTab
            grade={colorGrade}
            intensity={colorGradeIntensity}
            isPro={isPro}
            onGradeChange={onColorGradeChange}
            onIntensityChange={onColorIntensityChange}
          />
        )}
        {activeTab === "ai" && (
          <AITab isPro={isPro} />
        )}
      </div>
    </div>
  );
}

/* ────── Cuts Tab ────── */
function CutsTab({ format, trimStart, trimEnd, duration, isPro, onFormatChange, onTrimChange }: {
  format: VideoFormat; trimStart: number | null; trimEnd: number | null; duration: number;
  isPro: boolean; onFormatChange: (f: VideoFormat) => void; onTrimChange: (s: number | null, e: number | null) => void;
}) {
  const [enableTrim, setEnableTrim] = useState(trimStart !== null);
  const formats: { value: VideoFormat; label: string; proOnly: boolean }[] = [
    { value: "9:16", label: "9:16 (TikTok/Reels)", proOnly: false },
    { value: "16:9", label: "16:9 (YouTube)", proOnly: false },
    { value: "both", label: "Both Formats", proOnly: true },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Output Format</Label>
        <div className="space-y-2">
          {formats.map((f) => (
            <button
              key={f.value}
              disabled={f.proOnly && !isPro}
              onClick={() => onFormatChange(f.value)}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-default flex items-center justify-between",
                format === f.value ? "bg-primary/15 text-foreground border border-primary/30" : "bg-muted/50 text-muted-foreground hover:text-foreground",
                f.proOnly && !isPro && "opacity-50 cursor-not-allowed"
              )}
            >
              {f.label}
              {f.proOnly && !isPro && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Trim</Label>
          <Switch
            checked={enableTrim}
            onCheckedChange={(v) => {
              setEnableTrim(v);
              if (!v) onTrimChange(null, null);
              else onTrimChange(0, duration);
            }}
          />
        </div>
        {enableTrim && (
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground">Start: {(trimStart ?? 0).toFixed(1)}s</span>
              <Slider
                value={[trimStart ?? 0]}
                min={0}
                max={duration}
                step={0.1}
                onValueChange={([v]) => onTrimChange(v, trimEnd)}
              />
            </div>
            <div>
              <span className="text-xs text-muted-foreground">End: {(trimEnd ?? duration).toFixed(1)}s</span>
              <Slider
                value={[trimEnd ?? duration]}
                min={0}
                max={duration}
                step={0.1}
                onValueChange={([v]) => onTrimChange(trimStart, v)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────── Color Tab ────── */
function ColorTab({ grade, intensity, isPro, onGradeChange, onIntensityChange }: {
  grade: ColorGrade; intensity: number; isPro: boolean;
  onGradeChange: (g: ColorGrade) => void; onIntensityChange: (v: number) => void;
}) {
  const [showBefore, setShowBefore] = useState(false);
  const gradeLabel = grade === "none" ? "No Grade" : COLOR_GRADE_MAP[grade].label;
  const intensityLabel = grade === "none" ? "Natural Color" : `${Math.round(intensity * 100)}%`;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Color Grade</Label>
          <BeforeAfterToggle showBefore={showBefore} onChange={setShowBefore} compact />
        </div>
        <ColorGradePreview
          grade={grade}
          intensity={intensity}
          showBefore={showBefore}
          compact
        />
        <p className="text-xs text-muted-foreground">
          {grade === "none" ? "Select a grade to preview it on your footage" : `${gradeLabel} · ${intensityLabel}`}
        </p>
      </div>

      <ColorGradeSwatches selected={grade} onSelect={onGradeChange} compact />

      {grade !== "none" && (
        <ColorGradeIntensitySlider
          intensity={Math.round(intensity * 100)}
          onChange={(v) => onIntensityChange(v / 100)}
          compact
        />
      )}

      {grade !== "none" && (
        <button
          onClick={() => { onGradeChange("none"); onIntensityChange(0.5); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-default"
        >
          Reset to No Grade
        </button>
      )}
    </div>
  );
}

/* ────── AI Tab ────── */
function AITab({ isPro }: { isPro: boolean }) {
  return (
    <div className="space-y-4">
      <Label className="text-xs text-muted-foreground uppercase tracking-wider block">AI Editing Intelligence</Label>

      <div className={cn("surface-card p-4 space-y-3")}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Beat-Synced Cuts</p>
            <p className="text-xs text-muted-foreground">Auto-cut to beat — clean hard cuts only</p>
          </div>
          <Switch defaultChecked disabled />
        </div>
      </div>

      <div className={cn("surface-card p-4 space-y-3", !isPro && "opacity-60")}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Section-Aware Cutting</p>
            <p className="text-xs text-muted-foreground">Faster cuts on chorus, slower on verses</p>
          </div>
          {!isPro ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Switch defaultChecked />}
        </div>
      </div>

      <div className={cn("surface-card p-4 space-y-3", !isPro && "opacity-60")}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Multi-Camera Distribution</p>
            <p className="text-xs text-muted-foreground">Auto-distribute angles across the timeline</p>
          </div>
          {!isPro ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Switch defaultChecked />}
        </div>
      </div>

      <div className={cn("surface-card p-4 space-y-3", !isPro && "opacity-60")}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Smart B-Roll Placement</p>
            <p className="text-xs text-muted-foreground">AI places B-roll during verses, never on hooks</p>
          </div>
          {!isPro ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Switch defaultChecked />}
        </div>
      </div>

      {!isPro && (
        <Button variant="outline" className="w-full text-sm" asChild>
          <a href="/app/billing">Upgrade to Pro to Unlock AI</a>
        </Button>
      )}
    </div>
  );
}
