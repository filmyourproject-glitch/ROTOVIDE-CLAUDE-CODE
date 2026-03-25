import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const isMac =
  typeof navigator !== "undefined" && navigator.platform.includes("Mac");
const MOD = isMac ? "⌘" : "Ctrl";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Playback",
    shortcuts: [
      { keys: ["Space"], description: "Play / Pause" },
      { keys: [","], description: "Back 1 frame" },
      { keys: ["."], description: "Forward 1 frame" },
      { keys: ["J"], description: "Back 2 seconds" },
      { keys: ["K"], description: "Play / Pause" },
      { keys: ["L"], description: "Forward 2 seconds" },
      { keys: ["←"], description: "Back 1 second" },
      { keys: ["→"], description: "Forward 1 second" },
      { keys: ["Shift", "←"], description: "Back 5 seconds" },
      { keys: ["Shift", "→"], description: "Forward 5 seconds" },
    ],
  },
  {
    title: "Tools",
    shortcuts: [
      { keys: ["V"], description: "Select tool" },
      { keys: ["S"], description: "Split tool" },
      { keys: ["T"], description: "Trim tool" },
    ],
  },
  {
    title: "Edit",
    shortcuts: [
      { keys: [MOD, "Z"], description: "Undo" },
      { keys: [MOD, "Shift", "Z"], description: "Redo" },
      { keys: [MOD, "S"], description: "Split at playhead" },
      { keys: [MOD, "D"], description: "Duplicate clip" },
      { keys: ["Delete"], description: "Delete selected clip" },
      { keys: ["Esc"], description: "Deselect" },
    ],
  },
  {
    title: "Help",
    shortcuts: [{ keys: ["?"], description: "Show this dialog" }],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        style={{
          background: "hsl(0 0% 5.1%)",
          border: "1px solid hsl(var(--border))",
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-mono text-sm tracking-wider text-foreground">
            KEYBOARD SHORTCUTS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((s) => (
                  <div
                    key={s.description}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs text-foreground/80">
                      {s.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded text-[10px] font-mono font-medium"
                          style={{
                            background: "hsl(0 0% 12%)",
                            color: "hsl(var(--primary))",
                            border: "1px solid hsl(0 0% 18%)",
                            boxShadow: "0 1px 0 hsl(0 0% 8%)",
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
