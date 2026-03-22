import { useMemo } from "react";
import type {
  LyricWord,
  CaptionStyle,
  CaptionSize,
  CaptionPosition,
} from "@/lib/lyricsEngine";
import {
  groupWordsIntoLines,
  getCurrentLineIndex,
  getActiveWordIndex,
  getCaptionFontSize,
  getCaptionPositionStyle,
} from "@/lib/lyricsEngine";

interface LyricsCaptionOverlayProps {
  words: LyricWord[];
  currentTime: number;
  visible: boolean;
  style: CaptionStyle;
  size?: CaptionSize;
  position?: CaptionPosition;
}

export function LyricsCaptionOverlay({
  words,
  currentTime,
  visible,
  style,
  size = "M",
  position = "bottom",
}: LyricsCaptionOverlayProps) {
  const lines = useMemo(() => groupWordsIntoLines(words), [words]);
  const currentLineIdx = getCurrentLineIndex(lines, currentTime);
  const fontSize = getCaptionFontSize(size);
  const positionStyle = getCaptionPositionStyle(position);

  if (!visible || words.length === 0 || currentLineIdx < 0) return null;

  const currentLine = lines[currentLineIdx];

  return (
    <div
      className="absolute left-0 right-0 z-30 pointer-events-none flex justify-center px-4"
      style={{
        ...positionStyle,
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          textAlign: "center",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize,
          lineHeight: 1.3,
          textShadow:
            style === "classic"
              ? "0 2px 8px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9)"
              : "0 1px 6px rgba(0,0,0,0.7)",
        }}
      >
        {style === "classic" && (
          <ClassicLine words={currentLine} currentTime={currentTime} />
        )}
        {style === "highlight" && (
          <HighlightLine words={currentLine} currentTime={currentTime} />
        )}
        {style === "karaoke" && (
          <KaraokeLine words={currentLine} currentTime={currentTime} />
        )}
      </div>
    </div>
  );
}

function ClassicLine({ words, currentTime }: { words: LyricWord[]; currentTime: number }) {
  const lineStart = words[0]?.start ?? 0;
  const lineEnd = words[words.length - 1]?.end ?? 0;
  const isActive = currentTime >= lineStart && currentTime <= lineEnd + 0.3;

  return (
    <span
      style={{
        color: "white",
        opacity: isActive ? 1 : 0,
        transition: "opacity 0.2s ease",
      }}
    >
      {words.map((w, i) => (
        <span key={i}>
          {w.word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

function HighlightLine({ words, currentTime }: { words: LyricWord[]; currentTime: number }) {
  const activeIdx = getActiveWordIndex(words, currentTime);

  return (
    <span>
      {words.map((w, i) => {
        const isCurrent = i === activeIdx && currentTime <= w.end + 0.1;
        const isPast = i < activeIdx || (i === activeIdx && currentTime > w.end + 0.1);
        const isFuture = i > activeIdx || activeIdx === -1;

        return (
          <span
            key={i}
            style={{
              color: isCurrent
                ? "hsl(72 100% 64%)"
                : isPast
                  ? "rgba(255,255,255,0.4)"
                  : isFuture
                    ? "rgba(255,255,255,0.4)"
                    : "white",
              transform: isCurrent ? "scale(1.05)" : "scale(1)",
              display: "inline-block",
              transition: "color 0.1s ease, transform 0.1s ease",
            }}
          >
            {w.word}
            {i < words.length - 1 ? "\u00A0" : ""}
          </span>
        );
      })}
    </span>
  );
}

function KaraokeLine({ words, currentTime }: { words: LyricWord[]; currentTime: number }) {
  return (
    <span>
      {words.map((w, i) => {
        // Calculate fill progress for current word
        let fillPct = 0;
        if (currentTime >= w.end) {
          fillPct = 100;
        } else if (currentTime >= w.start) {
          const duration = w.end - w.start;
          fillPct = duration > 0 ? ((currentTime - w.start) / duration) * 100 : 100;
        }

        return (
          <span
            key={i}
            style={{
              position: "relative",
              display: "inline-block",
              color: "white",
            }}
          >
            {/* Background text (white) */}
            <span style={{ visibility: "hidden" }}>
              {w.word}
              {i < words.length - 1 ? "\u00A0" : ""}
            </span>
            {/* White base layer */}
            <span
              style={{
                position: "absolute",
                inset: 0,
                color: "white",
              }}
            >
              {w.word}
              {i < words.length - 1 ? "\u00A0" : ""}
            </span>
            {/* Colored fill layer */}
            <span
              style={{
                position: "absolute",
                inset: 0,
                color: "hsl(72 100% 64%)",
                clipPath: `inset(0 ${100 - fillPct}% 0 0)`,
                transition: "clip-path 0.05s linear",
              }}
            >
              {w.word}
              {i < words.length - 1 ? "\u00A0" : ""}
            </span>
          </span>
        );
      })}
    </span>
  );
}
