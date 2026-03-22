import { cn } from "@/lib/utils";
import { getColorGradeFilter, COLOR_GRADE_MAP } from "@/lib/colorGrades";
import { GrainOverlay } from "./GrainOverlay";
import type { ColorGrade } from "@/types";

interface ColorGradePreviewProps {
  imageUrl?: string;
  grade: ColorGrade;
  intensity: number; // 0.0 to 1.0
  showBefore: boolean;
  compact?: boolean;
}

export function ColorGradePreview({ imageUrl, grade, intensity, showBefore, compact }: ColorGradePreviewProps) {
  const filter = getColorGradeFilter(grade);
  const showGrain = grade === "bw_film_grain" && !showBefore;
  const topOpacity = showBefore ? 0 : intensity;
  const hasImage = !!imageUrl;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-[#0A0A0A]",
        compact ? "rounded-md" : "rounded-xl"
      )}
      style={{ aspectRatio: "16/9" }}
    >
      {/* Bottom layer: original (no filter) */}
      {hasImage ? (
        <img
          src={imageUrl}
          alt="Preview"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 30%, #0a0a0a 100%)" }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">Preview will use your footage</span>
          </div>
        </div>
      )}

      {/* Top layer: filtered, opacity = intensity */}
      {grade !== "none" && (
        <>
          {hasImage ? (
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                filter,
                opacity: topOpacity,
                transition: "opacity 150ms ease",
              }}
              draggable={false}
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 30%, #0a0a0a 100%)",
                filter,
                opacity: topOpacity,
                transition: "opacity 150ms ease",
              }}
            />
          )}
        </>
      )}

      {/* Grain overlay for bw_film_grain */}
      {showGrain && <GrainOverlay opacity={0.12 * intensity} />}
    </div>
  );
}
