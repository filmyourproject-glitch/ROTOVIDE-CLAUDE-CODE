import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

interface ColorGradeIntensitySliderProps {
  intensity: number; // 0–100
  onChange: (val: number) => void;
  compact?: boolean;
}

const QUICK_PICKS = [
  { label: "Subtle", short: "30%", value: 30 },
  { label: "Balanced", short: "50%", value: 50 },
  { label: "Full", short: "80%", value: 80 },
];

export function ColorGradeIntensitySlider({ intensity, onChange, compact }: ColorGradeIntensitySliderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Grade Intensity</span>
        <span className="text-sm text-muted-foreground font-mono">{intensity}%</span>
      </div>

      <Slider
        value={[intensity]}
        min={0}
        max={100}
        step={1}
        onValueChange={([v]) => onChange(v)}
      />

      <div className="flex gap-2">
        {QUICK_PICKS.map((p) => {
          const isActive = Math.abs(intensity - p.value) <= 5;
          return (
            <button
              key={p.value}
              onClick={() => onChange(p.value)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-default",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {compact ? p.short : `${p.label} · ${p.value}%`}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {compact ? "30–70% preserves skin tones" : "Keep between 30–70% to preserve natural skin tones"}
      </p>
    </div>
  );
}
