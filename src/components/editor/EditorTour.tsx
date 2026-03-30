import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TourStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const STEPS: TourStep[] = [
  {
    target: "[data-tour='timeline']",
    title: "Beat Sync",
    description: "Your footage syncs to the beat automatically. Every cut lands on a beat.",
    position: "top",
  },
  {
    target: "[data-tour='clips']",
    title: "Camera Angles",
    description: "Click to switch between angles. Multi-cam footage is auto-distributed.",
    position: "left",
  },
  {
    target: "[data-tour='director-chat']",
    title: "Director Chat",
    description: "Ask the AI to refine your edit in plain English. No timeline needed.",
    position: "bottom",
  },
  {
    target: "[data-tour='color-grade']",
    title: "Color Grade",
    description: "Cinematic LUTs to style your video. Preview each look live.",
    position: "left",
  },
  {
    target: "[data-tour='timeline']",
    title: "Timeline",
    description: "Fine-tune cuts on the beat. Drag clips, split, and trim.",
    position: "top",
  },
  {
    target: "[data-tour='export']",
    title: "Export",
    description: "Render in HD or 4K. Pro users get no watermark.",
    position: "bottom",
  },
];

interface EditorTourProps {
  open: boolean;
  onComplete: () => void;
}

export function EditorTour({ open, onComplete }: EditorTourProps) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const updateTarget = useCallback(() => {
    if (!open) return;
    const el = document.querySelector(STEPS[step]?.target);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step, open]);

  useEffect(() => {
    updateTarget();
    window.addEventListener("resize", updateTarget);
    return () => window.removeEventListener("resize", updateTarget);
  }, [updateTarget]);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Calculate tooltip position
  let tooltipStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 60,
    maxWidth: 300,
  };

  if (targetRect) {
    const gap = 12;
    switch (current.position) {
      case "top":
        tooltipStyle.left = targetRect.left + targetRect.width / 2 - 150;
        tooltipStyle.bottom = window.innerHeight - targetRect.top + gap;
        break;
      case "bottom":
        tooltipStyle.left = targetRect.left + targetRect.width / 2 - 150;
        tooltipStyle.top = targetRect.bottom + gap;
        break;
      case "left":
        tooltipStyle.right = window.innerWidth - targetRect.left + gap;
        tooltipStyle.top = targetRect.top + targetRect.height / 2 - 50;
        break;
      case "right":
        tooltipStyle.left = targetRect.right + gap;
        tooltipStyle.top = targetRect.top + targetRect.height / 2 - 50;
        break;
    }
  } else {
    tooltipStyle.left = "50%";
    tooltipStyle.top = "50%";
    tooltipStyle.transform = "translate(-50%, -50%)";
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(8,8,8,0.6)" }}
        onClick={onComplete}
      />

      {/* Highlight ring */}
      {targetRect && (
        <div
          className="fixed z-50 rounded-lg pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            border: "2px solid #E8FF47",
            boxShadow: "0 0 0 9999px rgba(8,8,8,0.6)",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="rounded-xl p-5"
        style={{
          ...tooltipStyle,
          background: "#131313",
          border: "1px solid rgba(232,255,71,0.15)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Step counter */}
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-xs font-mono tracking-widest"
            style={{ color: "#E8FF47" }}
          >
            {step + 1}/{STEPS.length}
          </span>
          <button
            onClick={onComplete}
            className="p-1 rounded hover:bg-foreground/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" style={{ color: "rgba(242,237,228,0.4)" }} />
          </button>
        </div>

        {/* Content */}
        <h4
          className="text-base font-bold mb-1"
          style={{ fontFamily: "'Bebas Neue', cursive", letterSpacing: 1.5, color: "#F2EDE4" }}
        >
          {current.title}
        </h4>
        <p className="text-sm mb-4" style={{ color: "rgba(242,237,228,0.6)", lineHeight: 1.5 }}>
          {current.description}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="w-3 h-3" />
            Back
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (isLast) onComplete();
              else setStep((s) => s + 1);
            }}
            className="gap-1 text-xs"
            style={{ background: "#E8FF47", color: "#080808" }}
          >
            {isLast ? "Done" : "Next"}
            {!isLast && <ChevronRight className="w-3 h-3" />}
          </Button>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 mt-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: i <= step ? "#E8FF47" : "rgba(242,237,228,0.15)",
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
