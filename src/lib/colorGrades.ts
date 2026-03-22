import type { ColorGrade } from "@/types";

export interface ColorGradePreset {
  label: string;
  category: "cinematic" | "film" | "bw";
  filter: string;
}

export const COLOR_GRADE_MAP: Record<ColorGrade, ColorGradePreset> = {
  none: { label: "None", category: "cinematic", filter: "none" },
  cinematic_cool: {
    label: "Cool",
    category: "cinematic",
    filter: "saturate(0.75) hue-rotate(10deg) brightness(0.97)",
  },
  cinematic_warm: {
    label: "Warm",
    category: "cinematic",
    filter: "saturate(0.85) sepia(0.15) brightness(1.02)",
  },
  golden_hour: {
    label: "Golden Hour",
    category: "cinematic",
    filter: "saturate(1.1) sepia(0.25) brightness(1.05) hue-rotate(-5deg)",
  },
  midnight_blue: {
    label: "Midnight",
    category: "cinematic",
    filter: "saturate(0.7) hue-rotate(195deg) brightness(0.9)",
  },
  muted_earth: {
    label: "Earth",
    category: "cinematic",
    filter: "saturate(0.6) sepia(0.1) brightness(0.98)",
  },
  film_kodak: {
    label: "Kodak",
    category: "film",
    filter: "saturate(1.05) sepia(0.2) contrast(1.05) brightness(1.02)",
  },
  film_fuji: {
    label: "Fuji",
    category: "film",
    filter: "saturate(0.9) hue-rotate(5deg) contrast(1.02)",
  },
  film_portra: {
    label: "Portra",
    category: "film",
    filter: "saturate(0.85) sepia(0.15) brightness(1.04)",
  },
  film_expired: {
    label: "Expired",
    category: "film",
    filter: "saturate(0.5) sepia(0.3) brightness(1.08) contrast(0.9)",
  },
  bw_clean: {
    label: "Clean B&W",
    category: "bw",
    filter: "grayscale(1) brightness(1.02)",
  },
  bw_contrast: {
    label: "Contrast B&W",
    category: "bw",
    filter: "grayscale(1) contrast(1.3) brightness(0.95)",
  },
  bw_film_grain: {
    label: "Grain B&W",
    category: "bw",
    filter: "grayscale(1) contrast(1.1) brightness(0.98)",
  },
  bw_faded: {
    label: "Faded B&W",
    category: "bw",
    filter: "grayscale(1) contrast(0.85) brightness(1.1)",
  },
};

/** Swatch gradient CSS for each grade */
export const SWATCH_GRADIENTS: Record<ColorGrade, string> = {
  none: "linear-gradient(135deg, #1a1a1a, #4a4a4a, #8a8a8a)",
  cinematic_cool: "linear-gradient(135deg, #1a2a4a, #2d4a6b, #4a6b8a)",
  cinematic_warm: "linear-gradient(135deg, #3d2b1f, #6b4a2d, #8a6b4a)",
  golden_hour: "linear-gradient(135deg, #4a3000, #8a5a00, #c4850a)",
  midnight_blue: "linear-gradient(135deg, #0a0a2a, #0a1a4a, #1a2a6b)",
  muted_earth: "linear-gradient(135deg, #2a2418, #4a3d2a, #6b5a3d)",
  film_kodak: "linear-gradient(135deg, #3d2010, #6b3a1a, #8a5a2a)",
  film_fuji: "linear-gradient(135deg, #1a2a1a, #2a3d2a, #3d5a3d)",
  film_portra: "linear-gradient(135deg, #3d2a1a, #6b4a2a, #8a6a4a)",
  film_expired: "linear-gradient(135deg, #2a1a0a, #4a3a1a, #6b5a2a)",
  bw_clean: "linear-gradient(135deg, #1a1a1a, #4a4a4a, #8a8a8a)",
  bw_contrast: "linear-gradient(135deg, #000000, #2a2a2a, #ffffff)",
  bw_film_grain: "linear-gradient(135deg, #0a0a0a, #3a3a3a, #7a7a7a)",
  bw_faded: "linear-gradient(135deg, #2a2a2a, #5a5a5a, #9a9a9a)",
};

/**
 * Returns the CSS filter string for a grade.
 * Intensity is handled via opacity blending (two-layer technique), not filter interpolation.
 */
export function getColorGradeFilter(grade: ColorGrade, _intensity?: number): string {
  if (grade === "none") return "none";
  const preset = COLOR_GRADE_MAP[grade];
  if (!preset || preset.filter === "none") return "none";
  return preset.filter;
}
