// Palette generation (D22, D26): a hue rule around a base hue, a deliberate
// lightness spread, and chroma relative to the most each (L, h) allows in sRGB.
import { pickWeighted, type Rng } from '../design/random';
import { normalizeDegrees, shortestTurn } from '../math';
import { cuspLightness, maxChroma, oklchDistance } from './gamut';
import type { Oklch } from './types';

export type HarmonyRule = 'monochrome' | 'analogous' | 'complementary' | 'split-complementary' | 'triadic' | 'tetradic';
export type PaletteMood = 'natural' | 'vivid' | 'muted' | 'earthy' | 'pastel' | 'neon';
/** Value key: where the palette sits on the lightness scale. */
export type ValueKey = 'high' | 'full' | 'low';

export interface PaletteOptions {
  /** Random (weighted) when omitted. */
  rule?: HarmonyRule;
  /** Default 'any': weighted toward 'natural', the photogradient-like look. */
  mood?: PaletteMood | 'any';
  /** Hue (degrees) the rule is built around; random when omitted. */
  baseHue?: number;
  /** Default 'full' (the whole lightness range); 'any' picks one, leaning full. */
  key?: ValueKey | 'any';
}

/** What a palette was built with, after 'any' and omitted options are resolved. */
export interface PaletteInfo {
  rule: HarmonyRule;
  mood: PaletteMood;
  key: ValueKey;
}

export interface GeneratedPalette extends PaletteInfo {
  colors: Oklch[];
}

export const HARMONY_RULES: readonly HarmonyRule[] = [
  'monochrome',
  'analogous',
  'complementary',
  'split-complementary',
  'triadic',
  'tetradic',
];

/** How an omitted rule resolves. */
const RULE_WEIGHTS: Record<HarmonyRule, number> = {
  monochrome: 0.1,
  analogous: 0.3,
  complementary: 0.18,
  'split-complementary': 0.16,
  triadic: 0.13,
  tetradic: 0.13,
};

export const PALETTE_MOODS: readonly PaletteMood[] = ['natural', 'vivid', 'muted', 'earthy', 'pastel', 'neon'];

/**
 * How mood 'any' resolves (sums to 1): mostly natural, the photogradient-like look.
 * Pastel comes up now and then, neon rarely: it is loud (user, 2026-10-08, D64).
 */
const MOOD_WEIGHTS: Record<PaletteMood, number> = {
  natural: 0.38,
  vivid: 0.17,
  muted: 0.16,
  earthy: 0.12,
  pastel: 0.15,
  neon: 0.02,
};

/** How key 'any' resolves: mostly full, so shuffles keep their range. */
const KEY_WEIGHTS: Record<ValueKey, number> = { high: 0.15, low: 0.15, full: 0.7 };

/** Lightness band of the high and low keys; full uses the mood's band. */
export const KEY_BANDS: Record<Exclude<ValueKey, 'full'>, [number, number]> = {
  high: [0.7, 0.96],
  low: [0.12, 0.55],
};

/** Chroma ceiling in the high key: light colors near their cusp read as neon candy. */
const HIGH_KEY_MAX_CHROMA = 0.13;

/** Minimum lightness span for non-monochrome palettes of 3+ colors; narrow bands need less (minLSpan). */
export const MIN_L_SPAN = 0.25;

interface MoodTuning {
  /** Chroma as a fraction of the max in-gamut chroma at (L, h). */
  rel: [number, number];
  /**
   * With 4+ colors, only the base hue's colors and one accent keep `rel`; the
   * other rule hues get this calmer range (null = all keep `rel`). Several
   * hues at full chroma compete and read as garish.
   */
  support: [number, number] | null;
  /** Optional accent color with stronger relative chroma (probability, range). */
  accent: [number, [number, number]];
  /** Absolute chroma ceiling, keeps "natural" from reading as neon on high-gamut hues. */
  maxChroma: number;
  /** Usable lightness band. */
  l: [number, number];
  /** Probability of a near-neutral anchor (cream or deep near-black) when count >= 3. */
  anchor: number;
  /** Probability of giving lighter slots to hues whose gamut cusp is lighter (yellow light, blue dark). */
  cuspOrder: number;
  /** Turn yellows below their cusp toward amber, so they don't read olive (vivid moods). */
  avoidOlive?: boolean;
  /** All hues are compressed into this band, keeping their order and relative spacing (earthy). */
  hueBand?: [number, number];
  /** The anchor is always a near-black ground, even though the band doesn't reach dark (neon). */
  darkGround?: boolean;
}

export const MOOD_TUNING: Record<PaletteMood, MoodTuning> = {
  natural: {
    rel: [0.2, 0.45],
    support: null,
    accent: [0.5, [0.45, 0.72]],
    maxChroma: 0.15,
    l: [0.24, 0.95],
    anchor: 0.45,
    cuspOrder: 0.6,
  },
  vivid: {
    rel: [0.66, 0.94],
    support: [0.3, 0.55],
    accent: [0, [0, 0]],
    maxChroma: 0.4,
    l: [0.3, 0.9],
    anchor: 0.25,
    cuspOrder: 0.8,
    avoidOlive: true,
  },
  /** Desaturated, with a soft grey cast: faded film, Scandinavian rooms. */
  muted: {
    rel: [0.12, 0.26],
    support: null,
    accent: [0.3, [0.26, 0.38]],
    maxChroma: 0.06,
    l: [0.3, 0.9],
    anchor: 0.5,
    cuspOrder: 0.5,
  },
  /** Ochre, terracotta, olive and clay: hues pulled into the warm earth band. */
  earthy: {
    rel: [0.3, 0.55],
    support: null,
    accent: [0.3, [0.5, 0.7]],
    maxChroma: 0.12,
    l: [0.22, 0.88],
    anchor: 0.5,
    cuspOrder: 0.5,
    hueBand: [25, 115],
  },
  /** Light and softly colored. */
  pastel: {
    rel: [0.4, 0.7],
    support: null,
    accent: [0.3, [0.65, 0.85]],
    maxChroma: 0.12,
    l: [0.68, 0.96],
    anchor: 0.4,
    cuspOrder: 0.7,
  },
  /** Bright colors at as much chroma as sRGB allows, glowing on a near-black ground. */
  neon: {
    rel: [0.88, 1],
    support: [0.7, 0.9],
    accent: [0, [0, 0]],
    maxChroma: 0.4,
    l: [0.55, 0.9],
    anchor: 0.9,
    cuspOrder: 0.9,
    avoidOlive: true,
    darkGround: true,
  },
};

/** Planned chroma stays this far inside the gamut edge. */
const GAMUT_MARGIN = 0.985;
/** Each color's hue wanders this far (±degrees) from its rule hue. */
const HUE_JITTER = 8;
/** After cusp ordering, probability of swapping one neighbouring pair, so it isn't always strict. */
const CUSP_ORDER_SWAP = 0.3;
/** Near-neutral anchors: a cream/off-white in place of the lightest color, or a deep near-black in place of the darkest. */
const LIGHT_ANCHOR = { share: 0.6, l: [0.93, 0.975], h: [70, 100], c: [0.012, 0.035] } as const;
const DARK_ANCHOR = { l: [0.17, 0.26], c: [0.01, 0.04] } as const;
/** A cream anchor needs a band reaching this light; a near-black one a band reaching this dark. */
const LIGHT_ANCHOR_MIN_BAND_TOP = 0.85;
const DARK_ANCHOR_MAX_BAND_BOTTOM = 0.3;
/** Yellow-greens at high chroma read as acid; their chroma is capped at this fraction of max. */
const ACID_HUES: [number, number] = [100, 140];
const ACID_REL = 0.55;
/** Whole palettes tried before settling for the best spaced one. */
const PALETTE_ATTEMPTS = 16;
/** Per color: nudges tried when it lands too close to an earlier one, each reaching NUDGE_STEP further in lightness. */
const NUDGE_ATTEMPTS = 24;
const NUDGE_STEP = 0.04;

/** Minimum pairwise ΔE_OK; relaxed for large palettes (mesh with many points). */
export function minPaletteDeltaE(count: number): number {
  return count <= 6 ? 0.08 : 0.08 * Math.sqrt(6 / count);
}

/** Lightness band a palette is planned in: the key's, or on full the mood's. */
export function lightnessBand(mood: PaletteMood, key: ValueKey): [number, number] {
  return key === 'full' ? MOOD_TUNING[mood].l : KEY_BANDS[key];
}

/** Lightness span a palette must reach: MIN_L_SPAN, or half the band where the band is narrower. */
export function minLSpan(band: readonly [number, number]): number {
  return Math.min(MIN_L_SPAN, 0.5 * (band[1] - band[0]));
}

/** Everything a palette is built from, resolved once. */
interface PaletteSpec extends PaletteInfo {
  count: number;
  baseHue: number | undefined;
  tuning: MoodTuning;
  /** Lightness band of the key. */
  band: [number, number];
  /** Absolute chroma ceiling of the mood and key. */
  chromaCap: number;
  minDeltaE: number;
}

/** A planned color before it is realized: lightness, hue and relative chroma. */
interface Slot {
  l: number;
  h: number;
  rel: number;
  anchor?: 'light' | 'dark';
}

/**
 * A palette of `count` colors (at least 1), and the rule, mood and key it
 * resolved to. Colors are in sRGB, at least minPaletteDeltaE apart, and span
 * at least minLSpan in lightness unless the rule is monochrome; if no attempt
 * meets both, the closest one is returned.
 */
export function generatePalette(rng: Rng, count: number, opts: PaletteOptions = {}): GeneratedPalette {
  const spec = resolveSpec(rng, Math.max(1, Math.floor(count)), opts);
  const info: PaletteInfo = { rule: spec.rule, mood: spec.mood, key: spec.key };
  const needSpan = spec.rule !== 'monochrome' && spec.count >= 3 ? minLSpan(spec.band) : 0;
  let best: Oklch[] = [];
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < PALETTE_ATTEMPTS; attempt++) {
    const colors = buildPalette(rng, spec);
    const spacing = spec.count > 1 ? minDistance(colors) : Infinity;
    const span = lightnessSpan(colors);
    if (spacing >= spec.minDeltaE && span >= needSpan) return { ...info, colors };
    const score = Math.min(spacing - spec.minDeltaE, span - needSpan);
    if (score > bestScore) {
      best = colors;
      bestScore = score;
    }
  }
  return { ...info, colors: best };
}

function resolveSpec(rng: Rng, count: number, opts: PaletteOptions): PaletteSpec {
  // Drawn either way, so fixing an option doesn't shift the rest of the
  // sequence: the same seed with only the mood changed gives the same
  // palette in the new mood, and changing it back gives the original.
  const randomRule = pickWeighted(rng, RULE_WEIGHTS);
  const randomMood = pickWeighted(rng, MOOD_WEIGHTS);
  const randomKey = pickWeighted(rng, KEY_WEIGHTS);
  const rule = opts.rule ?? randomRule;
  const mood = !opts.mood || opts.mood === 'any' ? randomMood : opts.mood;
  const key = opts.key === 'any' ? randomKey : (opts.key ?? 'full');
  const baseHue =
    opts.baseHue !== undefined && Number.isFinite(opts.baseHue) ? normalizeDegrees(opts.baseHue) : undefined;
  const tuning = MOOD_TUNING[mood];
  return {
    rule,
    mood,
    key,
    count,
    baseHue,
    tuning,
    band: lightnessBand(mood, key),
    chromaCap: key === 'high' ? Math.min(tuning.maxChroma, HIGH_KEY_MAX_CHROMA) : tuning.maxChroma,
    minDeltaE: minPaletteDeltaE(count),
  };
}

/** One attempt: plan the slots, then realize them in order, nudging any that land too close to earlier ones. */
function buildPalette(rng: Rng, spec: PaletteSpec): Oklch[] {
  const { tuning: t, band } = spec;
  const colors: Oklch[] = [];
  for (const slot of planSlots(rng, spec)) {
    let best = slotColor(rng, slot, spec);
    let bestDistance = colors.length ? nearestDistance(best, colors) : Infinity;
    // Lightness first; after a third of the attempts chroma too, after two thirds hue.
    for (let attempt = 1; attempt <= NUDGE_ATTEMPTS && bestDistance < spec.minDeltaE; attempt++) {
      const reach = NUDGE_STEP * attempt;
      const trial: Slot = {
        ...slot,
        l: Math.min(band[1] + 0.02, Math.max(band[0] - 0.06, slot.l + rng.range(-reach, reach))),
        rel:
          attempt > NUDGE_ATTEMPTS / 3 && !slot.anchor
            ? rng.range(t.rel[0], Math.max(t.rel[1], t.accent[1][1]))
            : slot.rel,
        h: slot.h + (attempt > (2 * NUDGE_ATTEMPTS) / 3 ? rng.range(-15, 15) : 0),
      };
      const c = slotColor(rng, trial, spec);
      const d = nearestDistance(c, colors);
      if (d > bestDistance) {
        best = c;
        bestDistance = d;
      }
    }
    colors.push(best);
  }
  return colors;
}

/** Slots in ascending lightness. */
function planSlots(rng: Rng, spec: PaletteSpec): Slot[] {
  const { count, rule, tuning: t } = spec;
  const { hues, offsetCount } = planHues(rng, spec);
  const ls = planLightness(rng, count, rule === 'monochrome', spec.band);
  if (rule !== 'monochrome' && rng.next() < t.cuspOrder) {
    // Pair ascending lightness with ascending cusp lightness, so yellows sit
    // light and blues/purples dark instead of turning olive or washed out.
    hues.sort((a, b) => cuspLightness(a.h) - cuspLightness(b.h));
    if (count >= 3 && rng.next() < CUSP_ORDER_SWAP) {
      const i = rng.int(count - 1);
      [hues[i], hues[i + 1]] = [hues[i + 1], hues[i]];
    }
  }
  const slots: Slot[] = ls.map((l, i) => ({ l, h: hues[i].h, rel: rng.range(t.rel[0], t.rel[1]) }));
  if (t.support && count >= 4 && offsetCount > 1) {
    // Dominant + accent: one non-base color stays vivid, the rest step back.
    const others = slots.filter((_, i) => !hues[i].lead);
    const accent = rng.pick(others);
    for (const slot of others) if (slot !== accent) slot.rel = rng.range(t.support[0], t.support[1]);
  }
  if (count >= 2 && rng.next() < t.accent[0]) {
    rng.pick(slots).rel = rng.range(t.accent[1][0], t.accent[1][1]);
  }
  if (count >= 3 && rng.next() < t.anchor)
    placeAnchor(rng, slots, spec.band, t.darkGround ?? false, rule === 'monochrome');
  return slots;
}

/**
 * One hue per color: round-robin over the rule's hues so each appears, in
 * shuffled order. `lead` marks the base hue's colors.
 */
function planHues(rng: Rng, spec: PaletteSpec): { hues: { h: number; lead: boolean }[]; offsetCount: number } {
  // Drawn either way, so a base hue doesn't shift the rest of the sequence.
  const randomBase = rng.range(0, 360);
  const base = spec.baseHue ?? randomBase;
  const offsets = ruleOffsets(rng, spec.rule);
  const band = spec.tuning.hueBand;
  const hues = Array.from({ length: spec.count }, (_, i) => {
    const h = base + offsets[i % offsets.length] + rng.range(-HUE_JITTER, HUE_JITTER);
    return { h: band ? compressHue(h, band) : h, lead: i % offsets.length === 0 };
  });
  return { hues: shuffleInPlace(rng, hues), offsetCount: offsets.length };
}

function ruleOffsets(rng: Rng, rule: HarmonyRule): number[] {
  switch (rule) {
    case 'monochrome':
      return [0];
    case 'analogous': {
      const s = rng.range(22, 38);
      return [-s, 0, s];
    }
    case 'complementary':
      return [0, 180];
    case 'split-complementary': {
      const s = rng.range(25, 40);
      return [0, 180 - s, 180 + s];
    }
    case 'triadic':
      return [0, 120, 240];
    case 'tetradic': {
      // Rectangle (two complementary pairs); 90° gives the square.
      const s = rng.pick([60, 90]);
      return [0, s, 180, 180 + s];
    }
  }
}

/** Evenly stepped lightness across a random span inside the band, interior steps jittered. */
function planLightness(rng: Rng, count: number, mono: boolean, band: [number, number]): number[] {
  if (count === 1) return [rng.range(band[0] + 0.1, band[1] - 0.1)];
  const width = band[1] - band[0];
  const minSpan = count === 2 ? 0.2 : MIN_L_SPAN + 0.05;
  const span = Math.min(width, mono ? rng.range(0.45, 0.65) : rng.range(minSpan, Math.max(minSpan, 0.6)));
  const lo = band[0] + rng.next() * (width - span);
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const jitter = i === 0 || i === count - 1 ? 0 : rng.range(-0.3, 0.3) * step;
    return lo + i * step + jitter;
  });
}

/**
 * Map the whole hue circle into `band`, continuously: the band's middle stays,
 * and hues further from it land proportionally closer to the band's edges.
 */
function compressHue(h: number, [lo, hi]: [number, number]): number {
  const mid = (lo + hi) / 2;
  return mid + (shortestTurn(mid, h) * (hi - lo)) / 360;
}

/** Turn the lightest or darkest slot into a near-neutral, whichever the band reaches; `keepHue` tints a cream with its slot's hue. */
function placeAnchor(
  rng: Rng,
  slots: Slot[],
  band: readonly [number, number],
  darkGround: boolean,
  keepHue: boolean,
): void {
  const light = rng.next() < LIGHT_ANCHOR.share;
  const lightFits = !darkGround && band[1] >= LIGHT_ANCHOR_MIN_BAND_TOP;
  const darkFits = darkGround || band[0] <= DARK_ANCHOR_MAX_BAND_BOTTOM;
  if (lightFits && (light || !darkFits)) {
    const s = slots[slots.length - 1];
    s.anchor = 'light';
    s.l = rng.range(...LIGHT_ANCHOR.l);
    // Drawn either way, so the rest of the palette stays the same for a given seed.
    const h = rng.range(...LIGHT_ANCHOR.h);
    if (!keepHue) s.h = h;
  } else {
    const s = slots[0];
    s.anchor = 'dark';
    s.l = rng.range(...DARK_ANCHOR.l);
  }
}

function slotColor(rng: Rng, slot: Slot, spec: PaletteSpec): Oklch {
  if (slot.anchor) {
    const [lo, hi] = slot.anchor === 'light' ? LIGHT_ANCHOR.c : DARK_ANCHOR.c;
    const c = rng.range(lo, hi);
    return [slot.l, Math.min(c, maxChroma(slot.l, slot.h) * GAMUT_MARGIN), normalizeDegrees(slot.h)];
  }
  const h = spec.tuning.avoidOlive ? avoidOlive(slot.l, slot.h) : normalizeDegrees(slot.h);
  const rel = h >= ACID_HUES[0] && h <= ACID_HUES[1] ? Math.min(slot.rel, ACID_REL) : slot.rel;
  const c = Math.min(rel * maxChroma(slot.l, h), spec.chromaCap) * GAMUT_MARGIN;
  return [slot.l, c, h];
}

/** Vivid yellows below their cusp read as olive; rotate them toward amber instead. */
function avoidOlive(l: number, h: number): number {
  const n = normalizeDegrees(h);
  if (n < 75 || n > 125 || l >= 0.8) return n;
  return n - Math.min(1, (0.8 - l) / 0.25) * (n - 60) * 0.7;
}

function shuffleInPlace<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function nearestDistance(c: Oklch, others: Oklch[]): number {
  return Math.min(...others.map((o) => oklchDistance(o, c)));
}

function minDistance(colors: Oklch[]): number {
  let m = Infinity;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) m = Math.min(m, oklchDistance(colors[i], colors[j]));
  }
  return m;
}

function lightnessSpan(colors: Oklch[]): number {
  const ls = colors.map((c) => c[0]);
  return Math.max(...ls) - Math.min(...ls);
}
