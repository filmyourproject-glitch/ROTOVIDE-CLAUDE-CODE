// Effects system has been removed.
// ROTOVIDE uses clean hard cuts only — no transitions, no animations.
// The product value is intelligent cutting and multicam, not flashy effects.

export type EffectType = 'hard_cut';

export const EFFECT_ICONS: Record<string, string> = {
  hard_cut: '✂',
};

export const EFFECT_LABELS: Record<string, string> = {
  hard_cut: 'Hard Cut',
};

export const ALL_EFFECT_TYPES: string[] = ['hard_cut'];
