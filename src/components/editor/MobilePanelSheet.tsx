import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Scissors, Palette, Bot, X } from "lucide-react";

type TabId = "cuts" | "color" | "ai";

const tabs = [
  { id: "cuts" as TabId, label: "Cuts", icon: Scissors },
  { id: "color" as TabId, label: "Color", icon: Palette },
  { id: "ai" as TabId, label: "AI", icon: Bot },
];

interface MobilePanelSheetProps {
  activeTab: TabId | null;
  onTabChange: (tab: TabId | null) => void;
  children: React.ReactNode;
}

export function MobilePanelSheet({ activeTab, onTabChange, children }: MobilePanelSheetProps) {
  const isOpen = activeTab !== null;
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTabChange(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onTabChange]);

  const handleDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY;
    isDragging.current = true;
    setDragOffset(0);
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging.current) return;
    const delta = clientY - dragStartY.current;
    setDragOffset(Math.max(0, delta));
  }, []);

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
    if (dragOffset > 80) {
      onTabChange(null);
    }
    setDragOffset(0);
  }, [dragOffset, onTabChange]);

  return (
    <>
      {/* Fixed bottom tab bar — always visible on mobile */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-card"
        style={{ height: 52, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(activeTab === t.id ? null : t.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
              activeTab === t.id
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <t.icon className="w-5 h-5" />
            <span
              className="text-[9px] uppercase tracking-wider"
              style={{ fontFamily: "'Space Mono', monospace" }}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => onTabChange(null)}
        />
      )}

      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "fixed left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
        style={{
          bottom: 52 + (typeof CSS !== "undefined" ? 0 : 0), // above tab bar
          maxHeight: "60vh",
          transform: isOpen
            ? `translateY(${dragOffset}px)`
            : "translateY(100%)",
          transition: isDragging.current ? "none" : "transform 300ms ease-out",
        }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-center py-2 cursor-grab active:cursor-grabbing touch-none"
          onMouseDown={(e) => handleDragStart(e.clientY)}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
          onMouseMove={(e) => handleDragMove(e.clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
          onMouseUp={handleDragEnd}
          onTouchEnd={handleDragEnd}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Close button */}
        <button
          onClick={() => onTabChange(null)}
          className="absolute top-2 right-3 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Panel content */}
        <div className="overflow-y-auto px-1" style={{ maxHeight: "calc(60vh - 40px)" }}>
          {children}
        </div>
      </div>
    </>
  );
}

export type { TabId };
