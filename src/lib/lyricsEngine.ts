/**
 * Lyrics Engine — helpers for word-level caption display
 */

export interface LyricWord {
  word: string;
  start: number;
  end: number;
}

export interface LyricsData {
  words: LyricWord[];
  generated_at: string;
}

export type CaptionStyle = "classic" | "highlight" | "karaoke";
export type CaptionSize = "S" | "M" | "L";
export type CaptionPosition = "top" | "middle" | "bottom";

const WORDS_PER_LINE = 4;

/** Group words into lines of N words */
export function groupWordsIntoLines(words: LyricWord[], perLine = WORDS_PER_LINE): LyricWord[][] {
  const lines: LyricWord[][] = [];
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine));
  }
  return lines;
}

/** Find the current line index for a given time */
export function getCurrentLineIndex(lines: LyricWord[][], currentTime: number): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.length > 0 && currentTime >= line[0].start - 0.15) {
      // Check if we're within or just past this line
      const lineEnd = line[line.length - 1].end;
      if (currentTime <= lineEnd + 0.3) return i;
      // If past end, check if next line hasn't started yet
      if (i < lines.length - 1) {
        const nextLine = lines[i + 1];
        if (nextLine.length > 0 && currentTime < nextLine[0].start - 0.15) {
          return i; // Still showing current line in gap
        }
      }
    }
  }
  // Before any lyrics or after all
  return -1;
}

/** Get the active word index within the current time */
export function getActiveWordIndex(words: LyricWord[], currentTime: number): number {
  for (let i = words.length - 1; i >= 0; i--) {
    if (currentTime >= words[i].start) return i;
  }
  return -1;
}

/** Get font size in pixels for caption size */
export function getCaptionFontSize(size: CaptionSize): number {
  switch (size) {
    case "S": return 18;
    case "M": return 22;
    case "L": return 28;
  }
}

/** Get CSS position value for caption position */
export function getCaptionPositionStyle(position: CaptionPosition): React.CSSProperties {
  switch (position) {
    case "top": return { top: "15%", bottom: "auto" };
    case "middle": return { top: "50%", bottom: "auto", transform: "translateY(-50%)" };
    case "bottom": return { bottom: "20%", top: "auto" };
  }
}
