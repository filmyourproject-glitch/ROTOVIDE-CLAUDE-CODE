import { cn } from "@/lib/utils";
import {
  MousePointer2,
  Scissors,
  GripHorizontal,
  Copy,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";

export type EditTool = "select" | "split" | "trim";

interface ToolDef {
  id: string;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  isTool?: boolean; // true = SELECT/SPLIT/TRIM (mutually exclusive)
  action?: string;  // action tools: duplicate, delete, undo, redo
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "SELECT", shortcut: "V", icon: <MousePointer2 className="w-4 h-4" />, isTool: true },
  { id: "split", label: "SPLIT", shortcut: "S", icon: <Scissors className="w-4 h-4" />, isTool: true },
  { id: "trim", label: "TRIM", shortcut: "T", icon: <GripHorizontal className="w-4 h-4" />, isTool: true },
  { id: "duplicate", label: "DUPE", shortcut: "⌘D", icon: <Copy className="w-4 h-4" />, action: "duplicate" },
  { id: "delete", label: "DELETE", shortcut: "⌫", icon: <Trash2 className="w-4 h-4" />, action: "delete" },
  { id: "undo", label: "UNDO", shortcut: "⌘Z", icon: <Undo2 className="w-4 h-4" />, action: "undo" },
  { id: "redo", label: "REDO", shortcut: "⌘Y", icon: <Redo2 className="w-4 h-4" />, action: "redo" },
];

// Reorder for mobile: SELECT, SPLIT, UNDO, REDO first
const MOBILE_ORDER = ["select", "split", "undo", "redo", "trim", "duplicate", "delete"];

interface EditingToolbarProps {
  activeTool: EditTool;
  onToolChange: (tool: EditTool) => void;
  onAction: (action: "duplicate" | "delete" | "undo" | "redo") => void;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  isMobile: boolean;
}

export function EditingToolbar({
  activeTool,
  onToolChange,
  onAction,
  canUndo,
  canRedo,
  hasSelection,
  isMobile,
}: EditingToolbarProps) {
  const orderedTools = isMobile
    ? MOBILE_ORDER.map(id => TOOLS.find(t => t.id === id)!)
    : TOOLS;

  const isNarrow = typeof window !== "undefined" && window.innerWidth < 375;

  return (
    <div className="w-full">
      <div
        className={cn(
          "flex items-center bg-card border-b border-border overflow-x-auto",
          isMobile ? "h-12 gap-0.5 px-1" : "h-10 gap-1 px-2",
        )}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <style>{`.editing-toolbar-scroll::-webkit-scrollbar { display: none; }`}</style>
        {orderedTools.map((tool) => {
          const isModeButton = tool.isTool;
          const isActive = isModeButton && activeTool === tool.id;
          const isDisabled =
            (tool.id === "undo" && !canUndo) ||
            (tool.id === "redo" && !canRedo) ||
            (tool.id === "duplicate" && !hasSelection) ||
            (tool.id === "delete" && !hasSelection);

          return (
            <button
              key={tool.id}
              onClick={() => {
                if (isModeButton) {
                  onToolChange(tool.id as EditTool);
                } else if (tool.action) {
                  onAction(tool.action as "duplicate" | "delete" | "undo" | "redo");
                }
              }}
              disabled={isDisabled}
              className={cn(
                "flex flex-col items-center justify-center shrink-0 transition-all duration-150 rounded",
                isMobile ? "min-w-[44px] min-h-[44px] px-2" : "min-w-[40px] min-h-[36px] px-2.5",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
                isDisabled && "opacity-30 pointer-events-none",
              )}
            >
              <div className="relative">
                {tool.icon}
                {/* Active underline */}
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary rounded-full" />
                )}
              </div>
              {/* Label — hidden on narrow mobile */}
              {!(isMobile && isNarrow) && (
                <span
                  className="text-[9px] mt-0.5 leading-none"
                  style={{ fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}
                >
                  {tool.label}
                </span>
              )}
              {/* Shortcut badge — desktop only */}
              {!isMobile && (
                <span
                  className="text-[8px] text-muted-foreground/50 leading-none"
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  {tool.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active tool mode pill on mobile */}
      {isMobile && activeTool !== "select" && (
        <div className="flex justify-center py-1">
          <span
            className="text-[9px] text-primary bg-primary/10 px-3 py-0.5 rounded-full uppercase"
            style={{ fontFamily: "'Space Mono', monospace", letterSpacing: 2 }}
          >
            {activeTool} MODE
          </span>
        </div>
      )}
    </div>
  );
}
