import { cn } from "@/lib/utils";

interface BeforeAfterToggleProps {
  showBefore: boolean;
  onChange: (showBefore: boolean) => void;
  compact?: boolean;
}

export function BeforeAfterToggle({ showBefore, onChange, compact }: BeforeAfterToggleProps) {
  return (
    <div className={cn("inline-flex rounded-full bg-muted p-0.5", compact ? "text-[10px]" : "text-xs")}>
      <button
        onClick={() => onChange(true)}
        className={cn(
          "px-3 py-1 rounded-full font-medium transition-default",
          showBefore ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
        )}
      >
        Before
      </button>
      <button
        onClick={() => onChange(false)}
        className={cn(
          "px-3 py-1 rounded-full font-medium transition-default",
          !showBefore ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
        )}
      >
        After
      </button>
    </div>
  );
}
