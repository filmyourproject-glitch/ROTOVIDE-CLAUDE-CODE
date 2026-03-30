import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AIToggle {
  id: string;
  label: string;
  defaultOn: boolean;
}

const AI_TOGGLES: AIToggle[] = [
  { id: "beat_sync", label: "Beat-sync cuts", defaultOn: true },
  { id: "face_tracking", label: "Face tracking (9:16)", defaultOn: true },
  { id: "auto_broll", label: "Auto B-Roll on drops", defaultOn: false },
  { id: "lyric_captions", label: "Lyric captions", defaultOn: false },
  { id: "energy_cutting", label: "Energy-aware cutting", defaultOn: false },
  { id: "auto_transitions", label: "Auto transitions", defaultOn: true },
];

interface Props {
  onRegenerate?: (toggles: Record<string, boolean>) => void;
  regenerating?: boolean;
}

export function AIDirectorPanel({ onRegenerate, regenerating }: Props) {
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(AI_TOGGLES.map((t) => [t.id, t.defaultOn]))
  );

  const handleToggle = (id: string) => {
    setToggles((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4" style={{ color: "#E8FF47" }} />
        <span
          className="text-xs font-mono tracking-widest uppercase"
          style={{ color: "#E8FF47" }}
        >
          AI Director
        </span>
      </div>

      {/* Toggles */}
      {AI_TOGGLES.map((toggle) => (
        <button
          key={toggle.id}
          onClick={() => handleToggle(toggle.id)}
          className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg transition-colors"
          style={{
            background: toggles[toggle.id]
              ? "rgba(232,255,71,0.04)"
              : "transparent",
            border: `1px solid ${toggles[toggle.id] ? "rgba(232,255,71,0.1)" : "rgba(242,237,228,0.04)"}`,
          }}
        >
          <span
            className="text-sm"
            style={{
              color: toggles[toggle.id]
                ? "rgba(242,237,228,0.9)"
                : "rgba(242,237,228,0.4)",
            }}
          >
            {toggle.label}
          </span>
          <div
            className="w-8 h-4 rounded-full flex items-center transition-colors"
            style={{
              background: toggles[toggle.id]
                ? "#E8FF47"
                : "rgba(242,237,228,0.12)",
              justifyContent: toggles[toggle.id] ? "flex-end" : "flex-start",
              padding: "2px",
            }}
          >
            <div
              className="w-3 h-3 rounded-full transition-all"
              style={{
                background: toggles[toggle.id] ? "#080808" : "rgba(242,237,228,0.4)",
              }}
            />
          </div>
        </button>
      ))}

      {/* Regenerate */}
      <Button
        className="w-full mt-4 gap-2"
        size="sm"
        disabled={regenerating}
        onClick={() => onRegenerate?.(toggles)}
        style={{ background: "rgba(232,255,71,0.08)", color: "#E8FF47", border: "1px solid rgba(232,255,71,0.15)" }}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
        {regenerating ? "Regenerating..." : "Regenerate Edit"}
      </Button>
    </div>
  );
}
