/**
 * Web Audio API-based song analyzer.
 * Extracts energy curve, kick/snare transients, and section boundaries
 * from an audio file for use by the beat sync engine.
 */

import type { Section, SectionType } from "@/types";

export interface AudioAnalysisResult {
  bpm: number;
  duration: number;
  beats: number[];
  energy_curve: number[];        // normalized 0–1, one value per analysis window
  kick_timestamps: number[];     // low-frequency transient hits
  snare_timestamps: number[];    // mid/high-frequency transient hits
  drop_timestamps: number[];     // biggest energy jumps (section transitions)
  sections: Section[];
}

const WINDOW_SIZE = 2048;
const HOP_SIZE = 1024;

/** Decode an audio file (Blob or File) into an AudioBuffer */
async function decodeAudio(file: Blob): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const arrayBuffer = await file.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

// ── BPM Auto-Detection via Onset Interval Histogram ──

/**
 * Detect BPM from an AudioBuffer using onset detection + interval clustering.
 * Returns the most likely BPM in the 60–200 range.
 */
export function detectBpmFromBuffer(buffer: AudioBuffer): number {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const hopSize = 512;

  // 1. Compute energy curve at high resolution
  const energyCurve: number[] = [];
  for (let i = 0; i + hopSize <= samples.length; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < hopSize; j++) {
      sum += samples[i + j] * samples[i + j];
    }
    energyCurve.push(Math.sqrt(sum / hopSize));
  }

  // Normalize
  const maxE = Math.max(...energyCurve, 0.001);
  const normEnergy = energyCurve.map(v => v / maxE);

  // 2. Onset detection — find peaks above local average
  const windowLen = 8;
  const threshold = 1.4;
  const minGapFrames = Math.floor(sampleRate * 0.06 / hopSize); // min 60ms between onsets
  const onsets: number[] = [];
  let lastOnset = -minGapFrames;

  for (let i = windowLen; i < normEnergy.length; i++) {
    const localAvg = normEnergy.slice(i - windowLen, i).reduce((a, b) => a + b, 0) / windowLen;
    if (normEnergy[i] > localAvg * threshold && normEnergy[i] > 0.15 && i - lastOnset >= minGapFrames) {
      onsets.push((i * hopSize) / sampleRate);
      lastOnset = i;
    }
  }

  if (onsets.length < 4) return 120; // fallback

  // 3. Build inter-onset interval histogram
  const iois: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const ioi = onsets[i] - onsets[i - 1];
    if (ioi >= 0.2 && ioi <= 2.0) { // 30–300 BPM range
      iois.push(ioi);
    }
  }

  if (iois.length < 3) return 120;

  // 4. Cluster into 10ms bins and find dominant interval
  const binSize = 0.01;
  const histogram = new Map<number, number>();
  for (const ioi of iois) {
    const bin = Math.round(ioi / binSize);
    histogram.set(bin, (histogram.get(bin) || 0) + 1);
  }

  // Smooth histogram (± 2 bins)
  const smoothed = new Map<number, number>();
  for (const [bin, count] of histogram) {
    let total = count;
    for (let d = 1; d <= 2; d++) {
      total += (histogram.get(bin - d) || 0) * (1 - d * 0.3);
      total += (histogram.get(bin + d) || 0) * (1 - d * 0.3);
    }
    smoothed.set(bin, total);
  }

  let peakBin = 0;
  let peakCount = 0;
  for (const [bin, count] of smoothed) {
    if (count > peakCount) {
      peakCount = count;
      peakBin = bin;
    }
  }

  const dominantIOI = peakBin * binSize;
  if (dominantIOI <= 0) return 120;

  let bpm = Math.round(60 / dominantIOI);

  // 5. Normalize to 60–200 BPM range
  while (bpm > 200) bpm = Math.round(bpm / 2);
  while (bpm < 60) bpm *= 2;

  return bpm;
}

// ── Audio Cross-Correlation for Multicam Sync ──

/**
 * Compute a low-resolution energy envelope (~10 values/sec) from raw samples.
 * Used for fast cross-correlation between song and performance clips.
 */
export function computeEnergyEnvelope(
  samples: Float32Array,
  sampleRate: number,
  resolution: number = 10,
): Float32Array {
  const hopSamples = Math.floor(sampleRate / resolution);
  const length = Math.floor(samples.length / hopSamples);
  const envelope = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    let sum = 0;
    const start = i * hopSamples;
    const end = Math.min(start + hopSamples, samples.length);
    for (let j = start; j < end; j++) {
      sum += samples[j] * samples[j];
    }
    envelope[i] = Math.sqrt(sum / (end - start));
  }

  // Normalize 0–1
  let max = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > max) max = envelope[i];
  }
  if (max < 0.001) max = 0.001;
  for (let i = 0; i < envelope.length; i++) {
    envelope[i] /= max;
  }

  return envelope;
}

/**
 * Find the time offset (in seconds) where a clip's audio best matches the song.
 * Uses normalized cross-correlation on energy envelopes.
 *
 * @param songSamples - mono samples of the full song
 * @param clipSamples - mono samples of the performance clip (or first N seconds)
 * @param sampleRate  - shared sample rate
 * @param windowSec   - how many seconds of the clip to use for matching (default 15)
 * @returns offset in seconds (where in the song the clip audio starts)
 */
export function findClipOffset_legacy(
  songSamples: Float32Array,
  clipSamples: Float32Array,
  sampleRate: number,
  windowSec: number = 15,
): { offsetSeconds: number; confidence: number } {
  // 50 Hz envelope → 20ms precision (was 10 Hz / 100ms — far too coarse for lip sync)
  const resolution = 50;

  const songEnv = computeEnergyEnvelope(songSamples, sampleRate, resolution);

  // Use only the first `windowSec` of the clip for matching
  const clipWindowSamples = Math.min(clipSamples.length, windowSec * sampleRate);
  const clipWindow = clipSamples.subarray(0, clipWindowSamples);
  const clipEnv = computeEnergyEnvelope(clipWindow, sampleRate, resolution);

  if (clipEnv.length < 5 || songEnv.length < clipEnv.length) {
    return { offsetSeconds: 0, confidence: 0 };
  }

  const maxLag = songEnv.length - clipEnv.length;
  let bestLag = 0;
  let bestCorr = -Infinity;
  let secondBestCorr = -Infinity;

  // Normalized cross-correlation
  // Pre-compute clip stats
  let clipSum = 0;
  let clipSumSq = 0;
  for (let i = 0; i < clipEnv.length; i++) {
    clipSum += clipEnv[i];
    clipSumSq += clipEnv[i] * clipEnv[i];
  }
  const clipMean = clipSum / clipEnv.length;
  const clipStd = Math.sqrt(clipSumSq / clipEnv.length - clipMean * clipMean);

  if (clipStd < 0.01) {
    return { offsetSeconds: 0, confidence: 0 };
  }

  // Store correlation values around best for parabolic interpolation
  const corrValues = new Float32Array(maxLag + 1);

  for (let lag = 0; lag <= maxLag; lag++) {
    let songSum = 0;
    let songSumSq = 0;
    let crossSum = 0;

    for (let i = 0; i < clipEnv.length; i++) {
      const sv = songEnv[lag + i];
      songSum += sv;
      songSumSq += sv * sv;
      crossSum += sv * clipEnv[i];
    }

    const songMean = songSum / clipEnv.length;
    const songStd = Math.sqrt(songSumSq / clipEnv.length - songMean * songMean);

    if (songStd < 0.01) {
      corrValues[lag] = -1;
      continue;
    }

    const ncc = (crossSum / clipEnv.length - songMean * clipMean) / (songStd * clipStd);
    corrValues[lag] = ncc;

    if (ncc > bestCorr) {
      secondBestCorr = bestCorr;
      bestCorr = ncc;
      bestLag = lag;
    } else if (ncc > secondBestCorr) {
      secondBestCorr = ncc;
    }
  }

  // Parabolic interpolation for sub-bin accuracy (~1ms precision)
  let refinedLag = bestLag;
  if (bestLag > 0 && bestLag < maxLag) {
    const yPrev = corrValues[bestLag - 1];
    const yCurr = corrValues[bestLag];
    const yNext = corrValues[bestLag + 1];
    const denom = 2 * (2 * yCurr - yPrev - yNext);
    if (Math.abs(denom) > 1e-10) {
      refinedLag = bestLag + (yPrev - yNext) / denom;
    }
  }

  const offsetSeconds = refinedLag / resolution;
  // Confidence: how much better the best match is than second best
  const confidence = bestCorr > 0 ? Math.min(1, (bestCorr - Math.max(secondBestCorr, 0)) * 5) : 0;

  if (import.meta.env.DEV) console.log(`[XCorr-legacy] bestLag=${bestLag} refinedLag=${refinedLag.toFixed(2)} offset=${offsetSeconds.toFixed(3)}s corr=${bestCorr.toFixed(4)} conf=${(confidence * 100).toFixed(1)}%`);

  return { offsetSeconds, confidence };
}

/**
 * Find the time offset (in seconds) where a clip's audio best matches the song.
 * Works directly on raw PCM samples — downsamples to 4kHz internally for speed,
 * then uses normalized cross-correlation with parabolic interpolation.
 */
export function findClipOffset(
  songSamples: Float32Array,
  clipSamples: Float32Array,
  sampleRate: number,
  windowSec: number = 15,
): { offsetSeconds: number; confidence: number } {

  const windowSamples = Math.min(
    clipSamples.length,
    Math.floor(3 * sampleRate)
  );
  const clipWindow = clipSamples.subarray(0, windowSamples);

  const songSearchSamples = Math.min(
    songSamples.length,
    Math.floor(30 * sampleRate)
  );

  const targetRate = 400;
  const ratio = sampleRate / targetRate;

  const downsample = (samples: Float32Array): Float32Array => {
    const out = new Float32Array(Math.floor(samples.length / ratio));
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      const start = Math.floor(i * ratio);
      const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
      for (let j = start; j < end; j++) sum += samples[j];
      out[i] = sum / (end - start);
    }
    return out;
  };

  const songDown = downsample(songSamples.subarray(0, songSearchSamples));
  const clipDown = downsample(clipWindow);

  const normalize = (samples: Float32Array): Float32Array => {
    let mean = 0;
    for (let i = 0; i < samples.length; i++) mean += samples[i];
    mean /= samples.length;
    let std = 0;
    for (let i = 0; i < samples.length; i++) {
      std += (samples[i] - mean) ** 2;
    }
    std = Math.sqrt(std / samples.length);
    if (std < 1e-6) return samples;
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      out[i] = (samples[i] - mean) / std;
    }
    return out;
  };

  const songNorm = normalize(songDown);
  const clipNorm = normalize(clipDown);

  if (clipNorm.length < 100 || songNorm.length < clipNorm.length) {
    return { offsetSeconds: 0, confidence: 0 };
  }

  const maxLag = songNorm.length - clipNorm.length;
  let bestLag = 0;
  let bestCorr = -Infinity;
  let secondBestCorr = -Infinity;

  console.time("xcorr");
  for (let lag = 0; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < clipNorm.length; i++) {
      corr += songNorm[lag + i] * clipNorm[i];
    }
    corr /= clipNorm.length;

    if (corr > bestCorr) {
      secondBestCorr = bestCorr;
      bestCorr = corr;
      bestLag = lag;
    } else if (corr > secondBestCorr) {
      secondBestCorr = corr;
    }
  }
  console.timeEnd("xcorr");

  let refinedLag = bestLag;
  if (bestLag > 0 && bestLag < maxLag) {
    const yPrev = (() => {
      let c = 0;
      for (let i = 0; i < clipNorm.length; i++) {
        c += songNorm[bestLag - 1 + i] * clipNorm[i];
      }
      return c / clipNorm.length;
    })();
    const yNext = (() => {
      let c = 0;
      for (let i = 0; i < clipNorm.length; i++) {
        c += songNorm[bestLag + 1 + i] * clipNorm[i];
      }
      return c / clipNorm.length;
    })();
    const denom = 2 * (2 * bestCorr - yPrev - yNext);
    if (Math.abs(denom) > 1e-10) {
      refinedLag = bestLag + (yPrev - yNext) / denom;
    }
  }

  const offsetSeconds = refinedLag / targetRate;
  const confidence = bestCorr > 0
    ? Math.min(1, (bestCorr - Math.max(secondBestCorr, 0)) * 10)
    : 0;

  if (import.meta.env.DEV) console.log(`[XCorr] offset=${offsetSeconds.toFixed(3)}s corr=${bestCorr.toFixed(4)} conf=${(confidence * 100).toFixed(1)}%`);

  return { offsetSeconds, confidence };
}

/** Compute RMS energy for each hop window */
function computeEnergyCurve(samples: Float32Array, hopSize: number, windowSize: number): number[] {
  const curve: number[] = [];
  for (let i = 0; i + windowSize <= samples.length; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      sum += samples[i + j] * samples[i + j];
    }
    curve.push(Math.sqrt(sum / windowSize));
  }
  // Normalize to 0–1
  const max = Math.max(...curve, 0.001);
  return curve.map(v => v / max);
}

/** Detect transients using spectral flux in low and mid/high bands */
function detectTransients(
  buffer: AudioBuffer,
  energyCurve: number[],
  hopSize: number,
  sampleRate: number,
): { kicks: number[]; snares: number[] } {
  const samples = buffer.getChannelData(0);
  const kicks: number[] = [];
  const snares: number[] = [];

  // Simple onset detection: look for energy spikes above local average
  const windowLen = 8; // ~8 hops for local average
  const kickThreshold = 1.6;
  const snareThreshold = 1.4;
  const minGapSamples = Math.floor(sampleRate * 0.08 / hopSize); // min 80ms between hits

  // Compute spectral energy in low (kick: 40-150Hz) and mid (snare: 150-5000Hz) bands
  const fftSize = 1024;
  const binHz = sampleRate / fftSize;
  const lowBinStart = Math.floor(40 / binHz);
  const lowBinEnd = Math.floor(150 / binHz);
  const midBinStart = Math.floor(150 / binHz);
  const midBinEnd = Math.floor(5000 / binHz);

  const lowEnergy: number[] = [];
  const midEnergy: number[] = [];

  for (let i = 0; i + fftSize <= samples.length; i += hopSize) {
    const frame = samples.slice(i, i + fftSize);
    // Apply Hann window
    const windowed = new Float32Array(fftSize);
    for (let j = 0; j < fftSize; j++) {
      windowed[j] = frame[j] * (0.5 - 0.5 * Math.cos((2 * Math.PI * j) / fftSize));
    }

    // Simple DFT magnitude for the bands we care about (not full FFT for perf)
    let lowSum = 0;
    let midSum = 0;
    for (let k = lowBinStart; k <= Math.min(lowBinEnd, fftSize / 2); k++) {
      let re = 0, im = 0;
      for (let n = 0; n < fftSize; n++) {
        const angle = (2 * Math.PI * k * n) / fftSize;
        re += windowed[n] * Math.cos(angle);
        im -= windowed[n] * Math.sin(angle);
      }
      lowSum += Math.sqrt(re * re + im * im);
    }
    for (let k = midBinStart; k <= Math.min(midBinEnd, fftSize / 2); k++) {
      let re = 0, im = 0;
      for (let n = 0; n < fftSize; n++) {
        const angle = (2 * Math.PI * k * n) / fftSize;
        re += windowed[n] * Math.cos(angle);
        im -= windowed[n] * Math.sin(angle);
      }
      midSum += Math.sqrt(re * re + im * im);
    }
    lowEnergy.push(lowSum);
    midEnergy.push(midSum);
  }

  // Normalize
  const maxLow = Math.max(...lowEnergy, 0.001);
  const maxMid = Math.max(...midEnergy, 0.001);
  const normLow = lowEnergy.map(v => v / maxLow);
  const normMid = midEnergy.map(v => v / maxMid);

  // Onset detection on each band
  let lastKick = -minGapSamples;
  let lastSnare = -minGapSamples;

  for (let i = windowLen; i < normLow.length; i++) {
    const localAvgLow = normLow.slice(i - windowLen, i).reduce((a, b) => a + b, 0) / windowLen;
    const localAvgMid = normMid.slice(i - windowLen, i).reduce((a, b) => a + b, 0) / windowLen;

    const time = (i * hopSize) / sampleRate;

    if (normLow[i] > localAvgLow * kickThreshold && normLow[i] > 0.3 && i - lastKick >= minGapSamples) {
      kicks.push(parseFloat(time.toFixed(3)));
      lastKick = i;
    }

    if (normMid[i] > localAvgMid * snareThreshold && normMid[i] > 0.25 && i - lastSnare >= minGapSamples) {
      snares.push(parseFloat(time.toFixed(3)));
      lastSnare = i;
    }
  }

  return { kicks, snares };
}

/** Find the biggest energy jumps — these are likely drops/section transitions */
function findDropTimestamps(
  energyCurve: number[],
  hopSize: number,
  sampleRate: number,
  maxDrops: number = 4,
): number[] {
  const smoothWindow = 16;
  // Smooth the energy curve
  const smoothed = energyCurve.map((_, i) => {
    const start = Math.max(0, i - smoothWindow);
    const end = Math.min(energyCurve.length, i + smoothWindow);
    return energyCurve.slice(start, end).reduce((a, b) => a + b, 0) / (end - start);
  });

  // Find largest positive jumps
  const jumps: { index: number; magnitude: number }[] = [];
  for (let i = 1; i < smoothed.length; i++) {
    const diff = smoothed[i] - smoothed[i - 1];
    if (diff > 0.1) {
      jumps.push({ index: i, magnitude: diff });
    }
  }

  jumps.sort((a, b) => b.magnitude - a.magnitude);

  // Deduplicate (min 5s apart)
  const minGap = Math.floor(5 * sampleRate / hopSize);
  const drops: number[] = [];
  for (const j of jumps) {
    if (drops.length >= maxDrops) break;
    const time = (j.index * hopSize) / sampleRate;
    if (drops.every(d => Math.abs(d - time) > 5)) {
      drops.push(parseFloat(time.toFixed(3)));
    }
  }

  return drops.sort((a, b) => a - b);
}

/** Estimate song sections from energy curve using a simple clustering approach */
function estimateSections(
  energyCurve: number[],
  hopSize: number,
  sampleRate: number,
  duration: number,
): Section[] {
  if (energyCurve.length === 0) return [];

  // Smooth energy into ~1s windows
  const windowSec = 1;
  const hopsPerSec = sampleRate / hopSize;
  const chunkSize = Math.max(1, Math.round(hopsPerSec * windowSec));
  const smoothed: number[] = [];
  for (let i = 0; i < energyCurve.length; i += chunkSize) {
    const chunk = energyCurve.slice(i, i + chunkSize);
    smoothed.push(chunk.reduce((a, b) => a + b, 0) / chunk.length);
  }

  // Classify each second as low/mid/high energy
  const sorted = [...smoothed].sort((a, b) => a - b);
  const lowThresh = sorted[Math.floor(sorted.length * 0.33)] || 0.3;
  const highThresh = sorted[Math.floor(sorted.length * 0.66)] || 0.6;

  type EnergyLevel = "low" | "mid" | "high";
  const levels: EnergyLevel[] = smoothed.map(v =>
    v < lowThresh ? "low" : v > highThresh ? "high" : "mid"
  );

  // Merge consecutive same-level segments into sections
  const rawSections: { level: EnergyLevel; start: number; end: number; energy_avg: number }[] = [];
  let current = levels[0];
  let segStart = 0;

  for (let i = 1; i <= levels.length; i++) {
    if (i === levels.length || levels[i] !== current) {
      const startSec = segStart * windowSec;
      const endSec = Math.min(i * windowSec, duration);
      const segEnergy = smoothed.slice(segStart, i);
      const avg = segEnergy.reduce((a, b) => a + b, 0) / segEnergy.length;
      rawSections.push({ level: current, start: startSec, end: endSec, energy_avg: parseFloat(avg.toFixed(3)) });
      if (i < levels.length) {
        current = levels[i];
        segStart = i;
      }
    }
  }

  // Merge very short sections (<3s) into neighbors
  const merged = rawSections.filter(s => s.end - s.start >= 3);
  if (merged.length === 0 && rawSections.length > 0) merged.push(rawSections[0]);

  // Fill gaps
  for (let i = 1; i < merged.length; i++) {
    if (merged[i].start > merged[i - 1].end) {
      merged[i - 1].end = merged[i].start;
    }
  }
  if (merged.length > 0) {
    merged[0].start = 0;
    merged[merged.length - 1].end = duration;
  }

  // Map energy levels to section types
  const mapType = (level: EnergyLevel, idx: number, total: number): SectionType => {
    if (idx === 0 && level !== "high") return "intro";
    if (idx === total - 1 && level !== "high") return "outro";
    if (level === "high") return "chorus";
    if (level === "mid") return "verse";
    return idx < total / 2 ? "verse" : "bridge";
  };

  // Alternate verse numbering to avoid back-to-back same type
  let verseCount = 0;
  let chorusCount = 0;

  return merged.map((s, i) => {
    const type = mapType(s.level, i, merged.length);
    if (type === "verse") verseCount++;
    if (type === "chorus") chorusCount++;
    return {
      type,
      start: parseFloat(s.start.toFixed(3)),
      end: parseFloat(s.end.toFixed(3)),
      energy_avg: s.energy_avg,
    };
  });
}

/**
 * Main analysis function.
 * Takes an audio Blob (the song file) and BPM, returns full analysis data.
 */
export async function analyzeSong(
  audioBlob: Blob,
  bpm: number,
): Promise<AudioAnalysisResult> {
  const buffer = await decodeAudio(audioBlob);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;
  const samples = buffer.getChannelData(0);

  // 1. Energy curve
  const energyCurve = computeEnergyCurve(samples, HOP_SIZE, WINDOW_SIZE);

  // 2. Beat timestamps from BPM
  const beatInterval = 60 / bpm;
  const beats: number[] = [];
  let t = 0;
  while (t < duration) {
    beats.push(parseFloat(t.toFixed(3)));
    t += beatInterval;
  }

  // 3. Kick and snare detection
  const { kicks, snares } = detectTransients(buffer, energyCurve, HOP_SIZE, sampleRate);

  // 4. Drop detection
  const drop_timestamps = findDropTimestamps(energyCurve, HOP_SIZE, sampleRate);

  // 5. Section estimation
  const sections = estimateSections(energyCurve, HOP_SIZE, sampleRate, duration);

  return {
    bpm,
    duration,
    beats,
    energy_curve: energyCurve,
    kick_timestamps: kicks,
    snare_timestamps: snares,
    drop_timestamps,
    sections,
  };
}

/**
 * Analyze from an already-decoded AudioBuffer (avoids re-decoding).
 */
export function analyzeSongFromBuffer(
  buffer: AudioBuffer,
  bpm: number,
): AudioAnalysisResult {
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;
  const samples = buffer.getChannelData(0);

  const energyCurve = computeEnergyCurve(samples, HOP_SIZE, WINDOW_SIZE);

  const beatInterval = 60 / bpm;
  const beats: number[] = [];
  let t = 0;
  while (t < duration) {
    beats.push(parseFloat(t.toFixed(3)));
    t += beatInterval;
  }

  const { kicks, snares } = detectTransients(buffer, energyCurve, HOP_SIZE, sampleRate);
  const drop_timestamps = findDropTimestamps(energyCurve, HOP_SIZE, sampleRate);
  const sections = estimateSections(energyCurve, HOP_SIZE, sampleRate, duration);

  return {
    bpm,
    duration,
    beats,
    energy_curve: energyCurve,
    kick_timestamps: kicks,
    snare_timestamps: snares,
    drop_timestamps,
    sections,
  };
}

/**
 * Compute a "Banger Score" — finds the best 45-second window to post.
 *
 * Scoring (per window):
 *  - 40% average energy in the window
 *  - 40% contains chorus or drop section
 *  - 20% BPM density (beats per second in window)
 *
 * Returns the highest-scoring window clamped to nearest beat boundaries.
 */
export function computeBangerScore(
  energyCurve: number[],
  sections: Section[],
  bpm: number,
  durationSeconds: number,
  windowSec: number = 45,
): { startTime: number; endTime: number; score: number; sectionLabel: string } {
  if (energyCurve.length === 0 || durationSeconds <= 0) {
    return { startTime: 0, endTime: Math.min(windowSec, durationSeconds), score: 0, sectionLabel: "" };
  }

  const beatInterval = 60 / Math.max(bpm, 1);
  const hopsPerSec = energyCurve.length / durationSeconds;
  const windowHops = Math.floor(windowSec * hopsPerSec);
  const stepHops = Math.max(1, Math.floor(hopsPerSec)); // slide by ~1 second

  let bestScore = -1;
  let bestStart = 0;
  let bestEnd = Math.min(windowSec, durationSeconds);
  let bestSectionLabel = "";

  for (let i = 0; i + windowHops <= energyCurve.length; i += stepHops) {
    const startSec = (i / energyCurve.length) * durationSeconds;
    const endSec = Math.min(startSec + windowSec, durationSeconds);

    // 1. Average energy (40%)
    let energySum = 0;
    for (let j = i; j < i + windowHops && j < energyCurve.length; j++) {
      energySum += energyCurve[j];
    }
    const avgEnergy = energySum / windowHops;

    // 2. Contains chorus/drop (40%)
    let hasChorus = false;
    const hasDrop = false;
    const overlappingSections: string[] = [];
    for (const s of sections) {
      if (s.start < endSec && s.end > startSec) {
        overlappingSections.push(s.type.toUpperCase());
        if (s.type === "chorus") hasChorus = true;
      }
    }
    const sectionScore = hasChorus ? 1.0 : hasDrop ? 0.8 : 0.3;

    // 3. BPM density — beats per second in window (20%)
    const beatsInWindow = Math.floor((endSec - startSec) / beatInterval);
    const bpmDensity = Math.min(1, beatsInWindow / (windowSec * 3)); // normalize

    const totalScore = avgEnergy * 0.4 + sectionScore * 0.4 + bpmDensity * 0.2;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestStart = startSec;
      bestEnd = endSec;
      bestSectionLabel = [...new Set(overlappingSections)].join(" ");
    }
  }

  // Clamp to nearest beat boundaries
  bestStart = Math.floor(bestStart / beatInterval) * beatInterval;
  bestEnd = Math.ceil(bestEnd / beatInterval) * beatInterval;
  bestEnd = Math.min(bestEnd, durationSeconds);

  // Normalize score to 0-100
  const normalizedScore = Math.round(Math.min(100, bestScore * 100));

  return {
    startTime: parseFloat(bestStart.toFixed(3)),
    endTime: parseFloat(bestEnd.toFixed(3)),
    score: normalizedScore,
    sectionLabel: bestSectionLabel || "MIXED",
  };
}

/**
 * Lightweight version that skips the expensive DFT-based transient detection.
 * Uses energy curve only. Good for quick previews.
 */
export async function analyzeSongFast(
  audioBlob: Blob,
  bpm: number,
): Promise<AudioAnalysisResult> {
  const buffer = await decodeAudio(audioBlob);
  const duration = buffer.duration;
  const samples = buffer.getChannelData(0);

  const energyCurve = computeEnergyCurve(samples, HOP_SIZE * 2, WINDOW_SIZE);

  const beatInterval = 60 / bpm;
  const beats: number[] = [];
  let t = 0;
  while (t < duration) {
    beats.push(parseFloat(t.toFixed(3)));
    t += beatInterval;
  }

  const drop_timestamps = findDropTimestamps(energyCurve, HOP_SIZE * 2, buffer.sampleRate);
  const sections = estimateSections(energyCurve, HOP_SIZE * 2, buffer.sampleRate, duration);

  return {
    bpm,
    duration,
    beats,
    energy_curve: energyCurve,
    kick_timestamps: [],
    snare_timestamps: [],
    drop_timestamps,
    sections,
  };
}
