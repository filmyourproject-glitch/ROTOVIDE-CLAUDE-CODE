export interface CaptionPreset {
  id: CaptionStyleExtended;
  name: string;
  description: string;
  accentColor: string;
  bgPreview: string;
}

export type CaptionStyleExtended =
  | "classic"
  | "highlight"
  | "karaoke"
  | "bounce"
  | "outline"
  | "glitch"
  | "drip"
  | "stack3d";

export const captionPresets: CaptionPreset[] = [
  {
    id: "classic",
    name: "Clean",
    description: "Simple white text, no effects",
    accentColor: "#ffffff",
    bgPreview: "rgba(255,255,255,0.08)",
  },
  {
    id: "highlight",
    name: "Neon Glow",
    description: "Current word glows yellow-green",
    accentColor: "#E8FF47",
    bgPreview: "rgba(232,255,71,0.08)",
  },
  {
    id: "karaoke",
    name: "Karaoke",
    description: "Word fills with color as it plays",
    accentColor: "#E8FF47",
    bgPreview: "rgba(232,255,71,0.06)",
  },
  {
    id: "bounce",
    name: "Bounce",
    description: "Words scale up on beat",
    accentColor: "#ff6b6b",
    bgPreview: "rgba(255,107,107,0.08)",
  },
  {
    id: "outline",
    name: "Outline",
    description: "White outline, transparent fill",
    accentColor: "rgba(255,255,255,0.8)",
    bgPreview: "rgba(255,255,255,0.04)",
  },
  {
    id: "glitch",
    name: "Glitch",
    description: "RGB split distortion effect",
    accentColor: "#00ffff",
    bgPreview: "rgba(0,255,255,0.06)",
  },
  {
    id: "drip",
    name: "Drip",
    description: "Melting text with gravity",
    accentColor: "#ff47e8",
    bgPreview: "rgba(255,71,232,0.06)",
  },
  {
    id: "stack3d",
    name: "3D Stack",
    description: "Layered shadow depth effect",
    accentColor: "#ffd700",
    bgPreview: "rgba(255,215,0,0.08)",
  },
];
