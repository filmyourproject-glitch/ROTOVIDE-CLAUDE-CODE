import { useState } from "react";
import {
  Sparkles,
  Palette,
  Captions,
  Upload,
  ArrowLeftRight,
  RectangleHorizontal,
  Music,
} from "lucide-react";

export type SidebarTool =
  | "ai_director"
  | "color_grade"
  | "captions"
  | "add_footage"
  | "transitions"
  | "aspect_ratio"
  | "replace_audio"
  | null;

interface EditorSidebarProps {
  activeTool: SidebarTool;
  onToolChange: (tool: SidebarTool) => void;
}

const tools: { id: SidebarTool; icon: React.ElementType; label: string; accent?: boolean }[] = [
  { id: "ai_director", icon: Sparkles, label: "AI Director", accent: true },
  { id: "color_grade", icon: Palette, label: "Color Grade" },
  { id: "captions", icon: Captions, label: "Captions" },
  { id: "add_footage", icon: Upload, label: "Add Footage" },
  { id: "transitions", icon: ArrowLeftRight, label: "Transitions" },
  { id: "aspect_ratio", icon: RectangleHorizontal, label: "Aspect Ratio" },
  { id: "replace_audio", icon: Music, label: "Replace Audio" },
];

export function EditorSidebar({ activeTool, onToolChange }: EditorSidebarProps) {
  return (
    <div
      className="hidden md:flex flex-col items-center gap-1 py-3 px-1 shrink-0"
      style={{
        width: 52,
        background: "#0a0a0a",
        borderLeft: "1px solid rgba(242,237,228,0.06)",
      }}
    >
      {tools.map(({ id, icon: Icon, label, accent }) => {
        const isActive = activeTool === id;
        return (
          <button
            key={id}
            onClick={() => onToolChange(isActive ? null : id)}
            className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-colors w-full"
            style={{
              background: isActive
                ? accent
                  ? "rgba(232,255,71,0.08)"
                  : "rgba(242,237,228,0.06)"
                : "transparent",
              color: isActive
                ? accent
                  ? "#E8FF47"
                  : "rgba(242,237,228,0.9)"
                : "rgba(242,237,228,0.35)",
            }}
            title={label}
          >
            <Icon className="w-4 h-4" />
            <span
              className="text-[8px] font-mono tracking-wider leading-tight text-center"
              style={{ maxWidth: 44 }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
