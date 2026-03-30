import { useMemo } from "react";
import {
  groupWordsIntoLines,
  getCurrentLineIndex,
  getActiveWordIndex,
  getCaptionFontSize,
  getCaptionPositionStyle,
  type LyricWord,
  type CaptionStyle,
  type CaptionSize,
  type CaptionPosition,
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
        {style === "bounce" && (
          <BounceLine words={currentLine} currentTime={currentTime} />
        )}
        {style === "outline" && (
          <OutlineLine words={currentLine} currentTime={currentTime} />
        )}
        {style === "glitch" && (
          <GlitchLine words={currentLine} currentTime={currentTime} />
        )}
        {style === "drip" && (
          <DripLine words={currentLine} currentTime={currentTime} />
        )}
        {style === "stack3d" && (
          <Stack3DLine words={currentLine} currentTime={currentTime} />
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

/* ── Bounce: words scale up on beat ── */
function BounceLine({ words, currentTime }: { words: LyricWord[]; currentTime: number }) {
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
      {words.map((w, i) => {
        const isActive = currentTime >= w.start && currentTime <= w.end;
        const progress = isActive ? (currentTime - w.start) / (w.end - w.start) : 0;
        const scale = isActive ? 1 + 0.3 * Math.sin(progress * Math.PI) : 1;
        return (
          <span key={i} style={{ display: "inline-block", color: isActive ? "#ff6b6b" : "white", transform: `scale(${scale})`, transition: "transform 0.08s ease-out, color 0.1s" }}>
            {w.word}
          </span>
        );
      })}
    </span>
  );
}

/* ── Outline: stroke only, fills on active ── */
function OutlineLine({ words, currentTime }: { words: LyricWord[]; currentTime: number }) {
  return (
    <span style={{ display: "inline" }}>
      {words.map((w, i) => {
        const isActive = currentTime >= w.start && currentTime <= w.end;
        return (
          <span key={i} style={{ WebkitTextStroke: "1px rgba(255,255,255,0.8)", WebkitTextFillColor: isActive ? "white" : "transparent", transition: "all 0.15s ease" }}>
            {w.word}{i < words.length - 1 ? "\u00A0" : ""}
          </span>
        );
      })}
    </span>
  );
}

/* ── Glitch: RGB split distortion ── */
function GlitchLine({ words, currentTime }: { words: LyricWord[]; currentTime: number }) {
  const lineStart = words[0]?.start ?? 0;
  const lineEnd = words[words.length - 1]?.end ?? 0;
  const isActive = currentTime >= lineStart && currentTime <= lineEnd + 0.3;
  const text = words.map((w) => w.word).join(" ");
  return (
    <span style={{ position: "relative", display: "inline-block", opacity: isActive ? 1 : 0, transition: "opacity 0.2s" }}>
      <span style={{ position: "absolute", left: isActive ? -2 : 0, top: isActive ? 1 : 0, color: "rgba(255,0,0,0.7)", transition: "left 0.05s, top 0.05s" }}>{text}</span>
      <span style={{ position: "absolute", left: isActive ? 2 : 0, top: isActive ? -1 : 0, color: "rgba(0,255,255,0.7)", transition: "left 0.05s, top 0.05s" }}>{text}</span>
      <span style={{ position: "relative", color: "white" }}>{text}</span>
    </span>
  );
}

/* ── Drip: melting text with pink glow ── */
function DripLine({ words, currentTime }: { words: LyricWord[]; currentTime: number }) {
  return (
    <span style={{ display: "inline" }}>
      {words.map((w, i) => {
        const isActive = currentTime >= w.start && currentTime <= w.end;
        const isPast = currentTime > w.end;
        return (
          <span key={i} style={{
            color: isActive ? "#ff47e8" : isPast ? "rgba(255,71,232,0.4)" : "rgba(255,255,255,0.5)",
            textShadow: isActive ? "0 0 12px rgba(255,71,232,0.6), 0 4px 8px rgba(255,71,232,0.3)" : "none",
            transform: isActive ? "translateY(-2px)" : isPast ? "translateY(3px)" : "translateY(0)",
            display: "inline-block", transition: "all 0.15s ease", opacity: isPast ? 0.6 : 1,
          }}>
            {w.word}{i < words.length - 1 ? "\u00A0" : ""}
          </span>
        );
      })}
    </span>
  );
}

/* ── Stack3D: layered shadow depth with gold ── */
function Stack3DLine({ words, currentTime }: { words: LyricWord[]; currentTime: number }) {
  return (
    <span style={{ display: "inline" }}>
      {words.map((w, i) => {
        const isActive = currentTime >= w.start && currentTime <= w.end;
        return (
          <span key={i} style={{
            color: isActive ? "#ffd700" : "white",
            textShadow: isActive
              ? "1px 1px 0 #b8860b, 2px 2px 0 #996515, 3px 3px 0 #7a5010, 4px 4px 8px rgba(0,0,0,0.5)"
              : "1px 1px 0 rgba(255,255,255,0.15), 2px 2px 0 rgba(255,255,255,0.08), 3px 3px 6px rgba(0,0,0,0.4)",
            transition: "all 0.15s ease",
          }}>
            {w.word}{i < words.length - 1 ? "\u00A0" : ""}
          </span>
        );
      })}
    </span>
  );
}
