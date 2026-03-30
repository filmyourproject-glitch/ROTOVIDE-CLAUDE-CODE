import type { CaptionPreset } from "@/lib/captionPresets";

interface CaptionPresetCardProps {
  preset: CaptionPreset;
  selected: boolean;
  onClick: () => void;
}

export function CaptionPresetCard({ preset, selected, onClick }: CaptionPresetCardProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl p-4 text-left transition-all duration-200"
      style={{
        background: selected ? preset.bgPreview : "rgba(242,237,228,0.03)",
        border: `1.5px solid ${selected ? preset.accentColor : "rgba(242,237,228,0.06)"}`,
        transform: selected ? "scale(1.02)" : "scale(1)",
      }}
    >
      {/* Preview text */}
      <div
        className="mb-3 text-center py-3 rounded-lg"
        style={{ background: "rgba(0,0,0,0.4)" }}
      >
        <span
          className="text-lg font-bold"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            color: preset.accentColor,
            textShadow:
              preset.id === "glow" || preset.id === "highlight"
                ? `0 0 12px ${preset.accentColor}40`
                : preset.id === "outline"
                  ? "none"
                  : `0 2px 4px rgba(0,0,0,0.5)`,
            WebkitTextStroke:
              preset.id === "outline" ? `1px ${preset.accentColor}` : undefined,
            WebkitTextFillColor:
              preset.id === "outline" ? "transparent" : undefined,
          }}
        >
          LYRICS
        </span>
      </div>

      {/* Name & description */}
      <p
        className="text-sm font-semibold mb-0.5"
        style={{ color: selected ? preset.accentColor : "rgba(242,237,228,0.9)" }}
      >
        {preset.name}
      </p>
      <p className="text-xs" style={{ color: "rgba(242,237,228,0.4)" }}>
        {preset.description}
      </p>
    </button>
  );
}
