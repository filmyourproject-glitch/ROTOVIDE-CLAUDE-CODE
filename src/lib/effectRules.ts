// Effect rules have been stripped — all styles now use hard cuts only.
// Section-based intelligent cutting replaces style-based effects.

export type AudioEvent = 'kick' | 'snare' | 'drop' | 'breakdown_end' | 'breakdown' | 'chorus_start' | 'verse_start' | 'default';
export type EditStyle = 'raw_cut' | 'cinematic' | 'hype' | 'vibe';

/** All styles map to hard_cut — no transitions */
export const EFFECT_RULES: Record<EditStyle, Record<AudioEvent, string>> = {
  raw_cut:   { kick: 'hard_cut', snare: 'hard_cut', drop: 'hard_cut', breakdown_end: 'hard_cut', breakdown: 'hard_cut', chorus_start: 'hard_cut', verse_start: 'hard_cut', default: 'hard_cut' },
  cinematic: { kick: 'hard_cut', snare: 'hard_cut', drop: 'hard_cut', breakdown_end: 'hard_cut', breakdown: 'hard_cut', chorus_start: 'hard_cut', verse_start: 'hard_cut', default: 'hard_cut' },
  hype:      { kick: 'hard_cut', snare: 'hard_cut', drop: 'hard_cut', breakdown_end: 'hard_cut', breakdown: 'hard_cut', chorus_start: 'hard_cut', verse_start: 'hard_cut', default: 'hard_cut' },
  vibe:      { kick: 'hard_cut', snare: 'hard_cut', drop: 'hard_cut', breakdown_end: 'hard_cut', breakdown: 'hard_cut', chorus_start: 'hard_cut', verse_start: 'hard_cut', default: 'hard_cut' },
};

/** No persistent effects — clean video only */
export const STYLE_BASE_EFFECTS: Record<EditStyle, string[]> = {
  raw_cut: [],
  cinematic: [],
  hype: [],
  vibe: [],
};

/** Determine the audio event at a given timestamp */
export function getAudioEventAtTimestamp(
  timestamp: number,
  kickTimestamps: number[],
  snareTimestamps: number[],
  dropTimestamps: number[],
  breakdownSections: { start: number; end: number }[],
  sections: { type: string; start: number; end: number }[]
): AudioEvent {
  const tolerance = 0.1;
  if (dropTimestamps.some(t => Math.abs(t - timestamp) < tolerance)) return 'drop';
  if (kickTimestamps.some(t => Math.abs(t - timestamp) < tolerance)) return 'kick';
  if (snareTimestamps.some(t => Math.abs(t - timestamp) < tolerance)) return 'snare';
  if (breakdownSections.some(b => Math.abs(b.end - timestamp) < tolerance)) return 'breakdown_end';
  if (breakdownSections.some(b => timestamp >= b.start && timestamp < b.end)) return 'breakdown';
  const section = sections.find(s => timestamp >= s.start && timestamp < s.end);
  if (section?.type === 'chorus') return 'chorus_start';
  if (section?.type === 'verse') return 'verse_start';
  return 'default';
}
