import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useState, useRef, useCallback } from "react";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface TransportControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayToggle?: () => void;
  onSeek: (time: number) => void;
  isMobile: boolean;
  onFrameBack?: () => void;
  onFrameForward?: () => void;
}

export function TransportControls({
  currentTime,
  duration,
  isPlaying,
  onPlayToggle,
  onSeek,
  isMobile,
  onFrameBack,
  onFrameForward,
}: TransportControlsProps) {
  const [isSeekDragging, setIsSeekDragging] = useState(false);
  const [seekTooltipTime, setSeekTooltipTime] = useState<number | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const getSeekTime = useCallback((clientX: number) => {
    const bar = seekBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * duration;
  }, [duration]);

  const handleSeekDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsSeekDragging(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const time = getSeekTime(clientX);
    onSeek(time);
    setSeekTooltipTime(time);

    const getX = (ev: MouseEvent | TouchEvent) =>
      "touches" in ev ? ev.touches[0].clientX : ev.clientX;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const t = getSeekTime(getX(ev));
      onSeek(t);
      setSeekTooltipTime(t);
    };
    const onUp = () => {
      setIsSeekDragging(false);
      setSeekTooltipTime(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  }, [getSeekTime, onSeek]);

  return (
    <div style={{ flexShrink: 0, position: "relative", zIndex: 10 }} className="mt-1 space-y-2 px-1">
      {/* Seek bar */}
      <div
        ref={seekBarRef}
        className="relative cursor-pointer group"
        style={{ padding: isMobile ? "19px 0" : "8px 0" }}
        onMouseDown={handleSeekDown}
        onTouchStart={handleSeekDown}
      >
        <div className="h-1.5 rounded-full relative" style={{ background: "hsl(0 0% 20%)" }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${progressPct}%`, background: "hsl(72 100% 64%)" }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `${progressPct}%`,
            transform: `translate(-50%, -50%)`,
            width: 20, height: 20,
            background: "hsl(72 100% 64%)",
            boxShadow: isSeekDragging ? "0 0 8px hsl(72 100% 64% / 0.5)" : "none",
            transition: isSeekDragging ? "none" : "box-shadow 0.15s",
          }}
        />
        {seekTooltipTime !== null && (
          <div
            className="absolute pointer-events-none"
            style={{ left: `${(seekTooltipTime / duration) * 100}%`, top: -28, transform: "translateX(-50%)" }}
          >
            <div
              className="px-2 py-0.5 rounded text-[11px] whitespace-nowrap"
              style={{ background: "hsl(0 0% 10.2%)", color: "hsl(72 100% 64%)", fontFamily: "'Space Mono', monospace" }}
            >
              {formatTime(seekTooltipTime)} / {formatTime(duration)}
            </div>
          </div>
        )}
      </div>

      {/* Play/Pause + frame step + time display */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          {!isMobile && onFrameBack && (
            <button
              onClick={onFrameBack}
              className="text-foreground/60 hover:text-primary transition-default p-1"
              aria-label="Back 1 frame"
              title="Back 1 frame (,)"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onPlayToggle}
            className="text-foreground hover:text-primary transition-default p-1"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          {!isMobile && onFrameForward && (
            <button
              onClick={onFrameForward}
              className="text-foreground/60 hover:text-primary transition-default p-1"
              aria-label="Forward 1 frame"
              title="Forward 1 frame (.)"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span className="text-[11px] font-mono text-foreground/60 tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
