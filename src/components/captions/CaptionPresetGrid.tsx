import { captionPresets, type CaptionStyleExtended } from "@/lib/captionPresets";
import { CaptionPresetCard } from "./CaptionPresetCard";

interface CaptionPresetGridProps {
  selected: CaptionStyleExtended;
  onChange: (style: CaptionStyleExtended) => void;
}

export function CaptionPresetGrid({ selected, onChange }: CaptionPresetGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {captionPresets.map((preset) => (
        <CaptionPresetCard
          key={preset.id}
          preset={preset}
          selected={selected === preset.id}
          onClick={() => onChange(preset.id)}
        />
      ))}
    </div>
  );
}
