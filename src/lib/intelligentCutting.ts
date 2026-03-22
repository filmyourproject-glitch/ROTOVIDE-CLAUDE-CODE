/**
 * Intelligent Cutting Engine
 * 
 * Free tier: Uniform beat-based cuts (every 4 beats)
 * Pro tier: Section-aware dynamic cutting that adapts to energy levels
 */

import type { Section, SectionType } from "@/types";

export interface CutPoint {
  time: number;
  type: 'beat' | 'energy' | 'section_boundary';
  intensity: number; // 0-1
  sectionType: SectionType;
}

/** Section-based cutting strategies */
const SECTION_BEATS_PER_CUT: Record<string, number> = {
  intro: 16,   // ~8s at 120 BPM — slow build
  verse: 8,    // ~4s — moderate
  chorus: 4,   // ~2s — faster
  bridge: 6,   // ~3s — moderate-slow
  outro: 12,   // ~6s — wind down
};

/**
 * Free tier: Simple uniform cuts every N beats
 */
export function computeUniformCuts(
  bpm: number,
  durationSeconds: number,
  beatsPerCut: number = 4,
): CutPoint[] {
  const beatInterval = 60 / bpm;
  const cutInterval = beatInterval * beatsPerCut;
  const cuts: CutPoint[] = [];

  for (let t = cutInterval; t < durationSeconds; t += cutInterval) {
    cuts.push({
      time: parseFloat(t.toFixed(3)),
      type: 'beat',
      intensity: 0.5,
      sectionType: 'verse',
    });
  }

  return cuts;
}

/**
 * Pro tier: Section-aware intelligent cutting
 * Varies cut frequency based on detected song sections and energy
 */
export function computeIntelligentCuts(
  bpm: number,
  durationSeconds: number,
  sections: Section[],
  energyCurve?: number[],
  kickTimestamps?: number[],
  dropTimestamps?: number[],
): CutPoint[] {
  const beatInterval = 60 / bpm;
  const cuts: CutPoint[] = [];

  // If no sections detected, fall back to uniform
  if (!sections.length) {
    return computeUniformCuts(bpm, durationSeconds, 4);
  }

  // Helper: find nearest kick within tolerance
  const findNearestKick = (time: number, tolerance: number): number | null => {
    if (!kickTimestamps?.length) return null;
    let best: number | null = null;
    let bestDist = tolerance;
    for (const kick of kickTimestamps) {
      const dist = Math.abs(kick - time);
      if (dist < bestDist) {
        bestDist = dist;
        best = kick;
      }
      // Early exit — kicks are sorted, if we've passed tolerance we're done
      if (kick > time + tolerance) break;
    }
    return best;
  };

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const baseBeatsPerCut = SECTION_BEATS_PER_CUT[section.type] || 8;
    const cutInterval = beatInterval * baseBeatsPerCut;

    // Detect if this section has a "drop" moment (high energy spike)
    const hasDropEnergy = section.energy_avg > 0.85;
    const effectiveInterval = hasDropEnergy
      ? cutInterval * 0.5 // Double the cut rate during high-energy moments
      : cutInterval;

    // First section always starts a cut at time 0
    let t = sIdx === 0 ? 0 : section.start + effectiveInterval;
    while (t < section.end) {
      // Snap to nearest beat
      let snappedTime = Math.round(t / beatInterval) * beatInterval;

      // PREFER a kick timestamp over the beat-math position if within 0.1s
      const nearestKick = findNearestKick(snappedTime, 0.1);
      if (nearestKick !== null) {
        snappedTime = nearestKick;
      }

      if (snappedTime > section.start && snappedTime < section.end) {
        // Check energy at this point if we have a curve
        let localEnergy = section.energy_avg;
        if (energyCurve && energyCurve.length > 0) {
          const idx = Math.floor((snappedTime / durationSeconds) * energyCurve.length);
          localEnergy = energyCurve[Math.min(idx, energyCurve.length - 1)] ?? section.energy_avg;
        }

        cuts.push({
          time: parseFloat(snappedTime.toFixed(3)),
          type: localEnergy > 0.8 ? 'energy' : 'beat',
          intensity: localEnergy,
          sectionType: section.type,
        });
      }
      t += effectiveInterval;
    }
  }

  // Force cuts at every drop timestamp (these are the hardest moments)
  if (dropTimestamps?.length) {
    for (const drop of dropTimestamps) {
      if (drop >= 0 && drop < durationSeconds) {
        // Find which section this drop belongs to
        const section = sections.find(s => drop >= s.start && drop < s.end);
        cuts.push({
          time: parseFloat(drop.toFixed(3)),
          type: 'energy',
          intensity: 1.0,
          sectionType: section?.type || 'chorus',
        });
      }
    }
  }

  // Deduplicate cuts that are too close together (< 0.5 beat)
  const minGap = beatInterval * 0.5;
  const deduped = cuts
    .sort((a, b) => a.time - b.time)
    .filter((cut, i, arr) => i === 0 || cut.time - arr[i - 1].time >= minGap);

  return deduped;
}

/**
 * Live Switcher — selects the next camera on each cut.
 * Every clip is its own camera source. The engine cycles through
 * all sources like a broadcast switcher.
 * 
 * Rules:
 * 1. Never cut to the same camera twice in a row
 * 2. Performance clips are ~75-80% of all cuts
 * 3. B-roll inserted ~1 out of every 4-6 performance cuts
 * 4. Never two B-roll cuts back to back
 * 5. Never B-roll as first or last clip
 * 6. B-roll cooldown of 4 cuts after each B-roll use
 * 7. Chorus (intensity > 0.7): performance only, no B-roll
 * 8. Verse: moderate switching, B-roll eligible
 * 9. Intro/Outro: performance only, slower pace
 * 10. Performance cycling is round-robin across ALL clips
 */
export function selectNextClip(
  lastClipId: string | null,
  cutIndex: number,
  sectionType: string,
  intensity: number,
  performanceClips: Array<{ id: string }>,
  brollClips: Array<{ id: string }>,
  brollCooldown: number,
  perfRobinIdx: number,
  brollRobinIdx: number,
): { clip: { id: string }; isBroll: boolean; newBrollCooldown: number; newPerfIdx: number; newBrollIdx: number } {
  const newCooldown = Math.max(0, brollCooldown - 1);

  // Determine B-roll eligibility
  const brollEligible =
    brollClips.length > 0 &&
    newCooldown === 0 &&
    cutIndex > 0 && // never first clip
    sectionType === 'verse' &&
    intensity < 0.7;

  let useBroll = false;
  if (brollEligible) {
    // ~20% chance to use B-roll
    useBroll = Math.random() < 0.2;
  }

  if (useBroll) {
    // Select B-roll via round-robin, skip lastClipId
    let idx = brollRobinIdx % brollClips.length;
    if (brollClips[idx].id === lastClipId && brollClips.length > 1) {
      idx = (idx + 1) % brollClips.length;
    }
    return {
      clip: brollClips[idx],
      isBroll: true,
      newBrollCooldown: 4,
      newPerfIdx: perfRobinIdx,
      newBrollIdx: idx + 1,
    };
  }

  // Select performance clip via round-robin, skip lastClipId
  let idx = perfRobinIdx % performanceClips.length;
  if (performanceClips[idx].id === lastClipId && performanceClips.length > 1) {
    idx = (idx + 1) % performanceClips.length;
  }
  return {
    clip: performanceClips[idx],
    isBroll: false,
    newBrollCooldown: newCooldown,
    newPerfIdx: idx + 1,
    newBrollIdx: brollRobinIdx,
  };
}
