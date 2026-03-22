import { cn } from "@/lib/utils";
import { COLOR_GRADE_MAP, SWATCH_GRADIENTS } from "@/lib/colorGrades";
import type { ColorGrade } from "@/types";

interface ColorGradeSwatchesProps {
  selected: ColorGrade;
  onSelect: (grade: ColorGrade) => void;
  compact?: boolean;
}

const CATEGORIES = [
  { key: "cinematic" as const, label: "Cinematic" },
  { key: "film" as const, label: "Film" },
  { key: "bw" as const, label: "Black & White" },
] as const;

export function ColorGradeSwatches({ selected, onSelect, compact }: ColorGradeSwatchesProps) {
  const size = compact ? "w-16 h-16" : "w-20 h-20";
  const textSize = compact ? "text-[9px]" : "text-[10px]";

  return (
    <div className="space-y-4">
      {CATEGORIES.map((cat) => {
        const grades = Object.entries(COLOR_GRADE_MAP).filter(
          ([key, val]) => val.category === cat.key && key !== "none"
        );
        // Prepend "none" swatch to first category
        const items = cat.key === "cinematic"
          ? [["none", COLOR_GRADE_MAP.none] as const, ...grades]
          : grades;

        return (
          <div key={cat.key}>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{cat.label}</p>
            <div className="flex gap-2.5 overflow-x-auto pb-2 w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
              {items.map(([key, preset]) => {
                const isSelected = selected === key;
                return (
                  <button
                    key={key}
                    onClick={() => onSelect(key as ColorGrade)}
                    className="flex-shrink-0 space-y-1 group"
                  >
                    <div
                      className={cn(
                        size,
                        "rounded-lg transition-all duration-150",
                        isSelected
                          ? "ring-2 ring-primary shadow-[0_0_0_3px_rgba(124,58,237,0.4)]"
                          : "hover:scale-105"
                      )}
                      style={{ background: SWATCH_GRADIENTS[key as ColorGrade] }}
                    />
                    <p className={cn(
                      textSize,
                      "text-center truncate max-w-[80px]",
                      isSelected ? "text-primary font-medium" : "text-muted-foreground"
                    )}>
                      {key === "none" ? "None" : preset.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
